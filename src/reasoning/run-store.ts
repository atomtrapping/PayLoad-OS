import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { z } from 'zod';
import { publishImmutableFile, readImmutableFile } from '../data-os/local-files';
import { rejectDuplicateJsonKeys } from '../data-os/json-keys';
import { answerSchema, digest, parseReasoningRequest, REASONING_INSTRUCTIONS } from './contracts';
import { ReasoningError, SAKANA_MODELS, sakanaConfig, type ReasoningEnvironment } from './config';
import { reasonWithSakana, sakanaRequestBody } from './sakana';

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/);
const hash = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const runIdSchema = z.string().regex(/^[a-f0-9]{64}$/);
const instant = z.iso.datetime({ offset: true });
const task = z.enum(['EVIDENCE_SUMMARY', 'COMMERCIAL_REVIEW', 'EXTRACTION_PLAN']);
const classification = z.enum(['SYNTHETIC', 'PUBLIC']);
const unique = <T>(values: T[]) => new Set(values).size === values.length;
export const reasoningRunPolicySchema = z.strictObject({
  schema: z.literal('notation.reasoning-run-policy.v1'), id,
  model: z.enum(SAKANA_MODELS), reviewRef: z.string().trim().min(1).max(500),
  timeoutMs: z.number().int().min(1).max(120000), maxOutputTokens: z.number().int().min(1).max(2048),
  expiresAt: instant, allowedTasks: z.array(task).min(1).max(3).refine(unique),
  allowedClassifications: z.array(classification).min(1).max(2).refine(unique),
  maxSourceAgeHours: z.number().int().min(1).max(8760),
});
export type ReasoningRunPolicy = z.infer<typeof reasoningRunPolicySchema>;
const preparedSchema = z.strictObject({ schema: z.literal('notation.reasoning-prepared.v1'),
  runId: runIdSchema, request: z.unknown(), policy: reasoningRunPolicySchema, instructions: z.string().min(1).max(10000),
  requestBody: z.string().min(1).max(65536) });
const attemptSchema = z.strictObject({ schema: z.literal('notation.reasoning-attempt.v1'), runId: runIdSchema,
  attemptId: z.uuid(), dispatchIntentAt: instant, inputDigest: hash, policyDigest: hash });
const candidateSchema = z.strictObject({
  schema: z.literal('notation.reasoning-candidate.v1'), requestId: id, status: z.literal('UNADMITTED'),
  reviewRequired: z.literal(true), provider: z.literal('sakana'), requestedModel: z.string().min(1).max(200),
  reportedModel: z.string().min(1).max(200).nullable(), providerResponseId: z.string().min(1).max(300),
  startedAt: instant, completedAt: instant, inputDigest: hash, requestBodyDigest: hash, responseDigest: hash,
  processingReviewRef: z.string().min(1).max(500), externalProcessingBasis: z.string().min(1).max(500),
  context: z.array(z.strictObject({ id, reference: z.string().min(1).max(500), knownAt: instant,
    standing: z.enum(['SYNTHETIC', 'OBSERVATION', 'UNADMITTED', 'ADMITTED', 'REFUSED']), contentDigest: hash })).min(1).max(32),
  answer: answerSchema, usage: z.record(z.string(), z.unknown()).nullable(),
  verification: z.literal('SCHEMA_AND_CITATION_MEMBERSHIP_ONLY'),
  authority: z.strictObject({ canAdmit: z.literal(false), canContact: z.literal(false), canSpend: z.literal(false), canDeliver: z.literal(false) }),
});
const resultSchema = z.strictObject({ schema: z.literal('notation.reasoning-result.v1'), runId: runIdSchema,
  attemptId: z.uuid(), candidateDigest: hash, candidate: candidateSchema });
const failureSchema = z.strictObject({ schema: z.literal('notation.reasoning-failure.v1'), runId: runIdSchema,
  attemptId: z.uuid(), recordedAt: instant, error: z.literal('REASONING_DISPATCH_UNCONFIRMED'), automaticRetry: z.literal(false) });

const MAX_FILE_BYTES = 768 * 1024;
const canonical = (value: unknown) => JSON.stringify(value);
const hashValue = (value: unknown) => digest(canonical(value));
const invalid = () => new ReasoningError('REASONING_RUN_INTEGRITY');
function clock(value: string): number {
  if (!instant.safeParse(value).success) throw new ReasoningError('REASONING_CLOCK_INVALID');
  return Date.parse(value);
}
function identity(request: unknown, policy: ReasoningRunPolicy, instructions: string, requestBody: string) {
  return hashValue({ schema: 'notation.reasoning-run-identity.v1', request, policy, instructions, requestBody }).slice(7);
}
function currentTimeAllowed(request: ReturnType<typeof parseReasoningRequest>, policy: ReasoningRunPolicy, now: number) {
  if (now >= clock(policy.expiresAt)) throw new ReasoningError('REASONING_POLICY_EXPIRED');
  if (request.sources.some((source) => clock(source.knownAt) > now || now - clock(source.knownAt) > policy.maxSourceAgeHours * 3600000))
    throw new ReasoningError('REASONING_SOURCE_TIME_INVALID');
}
function checkedCandidate(input: unknown, request: ReturnType<typeof parseReasoningRequest>, policy: ReasoningRunPolicy, requestBody: string) {
  const candidate = candidateSchema.parse(input);
  const context = request.sources.map(({ text, ...source }) => ({ ...source, contentDigest: digest(text) }));
  if (candidate.requestId !== request.requestId || candidate.inputDigest !== hashValue(request)
    || candidate.requestedModel !== policy.model || candidate.processingReviewRef !== policy.reviewRef
    || candidate.requestBodyDigest !== digest(requestBody)
    || candidate.externalProcessingBasis !== request.externalProcessingBasis || canonical(candidate.context) !== canonical(context)
    || candidate.answer.claims.some((claim) => !unique(claim.sourceIds) || claim.sourceIds.some((id) => !request.sources.some((source) => source.id === id)))) throw invalid();
  return candidate;
}

/** Trusted local operator storage. A dispatch-intent file prevents repeat dispatch of the same immutable run. */
export class ReasoningRunStore {
  readonly root: string;
  constructor(root: string) {
    if (!root.trim()) throw new ReasoningError('REASONING_RUN_ROOT_REQUIRED');
    this.root = resolve(root);
  }
  private read<T>(runId: string, name: string, schema: z.ZodType<T>): T | undefined {
    runIdSchema.parse(runId);
    const bytes = readImmutableFile(this.root, [runId, name], MAX_FILE_BYTES);
    if (bytes === undefined) return undefined;
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      rejectDuplicateJsonKeys(text, invalid);
      const value = schema.parse(JSON.parse(text));
      if (canonical(value) !== text) throw invalid();
      return value;
    } catch { throw invalid(); }
  }
  private write(runId: string, name: string, value: unknown) {
    const bytes = Buffer.from(canonical(value));
    return publishImmutableFile(this.root, [runIdSchema.parse(runId), name], bytes, MAX_FILE_BYTES);
  }
  prepare(input: unknown, policyInput: unknown) {
    const request = parseReasoningRequest(input); const policy = reasoningRunPolicySchema.parse(policyInput);
    if (!policy.allowedTasks.includes(request.task) || !policy.allowedClassifications.includes(request.classification))
      throw new ReasoningError('REASONING_POLICY_SCOPE');
    const instructions = REASONING_INSTRUCTIONS;
    const requestBody = sakanaRequestBody(request, policy, instructions);
    const runId = identity(request, policy, instructions, requestBody);
    const prepared = { schema: 'notation.reasoning-prepared.v1' as const, runId, request, policy, instructions, requestBody };
    const disposition = this.write(runId, 'prepared.json', prepared);
    const inspected = this.inspect(runId);
    if (!inspected) throw invalid();
    return { disposition, ...inspected };
  }
  inspect(runId: string) {
    const raw = this.read(runId, 'prepared.json', preparedSchema);
    if (!raw) return null;
    const request = parseReasoningRequest(raw.request); const policy = raw.policy;
    if (raw.runId !== runId || canonical(request) !== canonical(raw.request) || identity(request, policy, raw.instructions, raw.requestBody) !== runId
      || !policy.allowedTasks.includes(request.task) || !policy.allowedClassifications.includes(request.classification)) throw invalid();
    const prepared = { ...raw, request };
    const attempt = this.read(runId, 'attempt.json', attemptSchema) ?? null;
    const result = this.read(runId, 'result.json', resultSchema) ?? null;
    const failure = this.read(runId, 'failure.json', failureSchema) ?? null;
    if ((result || failure) && !attempt || result && failure) throw invalid();
    if (attempt && (attempt.runId !== runId || attempt.inputDigest !== hashValue(request) || attempt.policyDigest !== hashValue(policy))) throw invalid();
    if (result) {
      checkedCandidate(result.candidate, request, policy, raw.requestBody);
      if (result.runId !== runId || result.attemptId !== attempt!.attemptId || result.candidateDigest !== hashValue(result.candidate)) throw invalid();
    }
    if (failure && (failure.runId !== runId || failure.attemptId !== attempt!.attemptId)) throw invalid();
    const nonMonotonic = Boolean(attempt && (result && (clock(result.candidate.startedAt) < clock(attempt.dispatchIntentAt)
      || clock(result.candidate.completedAt) < clock(result.candidate.startedAt)) || failure && clock(failure.recordedAt) < clock(attempt.dispatchIntentAt)));
    return { schema: 'notation.reasoning-run-inspection.v1' as const, runId,
      state: result ? 'COMPLETED' as const : attempt ? 'DISPATCH_UNCONFIRMED' as const : 'PREPARED' as const,
      prepared, attempt, result, failure, clockOrder: nonMonotonic ? 'NON_MONOTONIC' as const : 'NO_ROLLBACK_OBSERVED' as const,
      automaticRetry: false as const };
  }
  async dispatch(runId: string, options: {
    allowExternal: boolean; env?: ReasoningEnvironment; transport?: typeof fetch;
  }) {
    const original = this.inspect(runId);
    if (!original) throw new ReasoningError('REASONING_RUN_NOT_FOUND');
    // Historical readback is not another provider request and does not renew permissions.
    if (original.state === 'COMPLETED') return { historical: true, ...original };
    if (original.attempt) throw new ReasoningError('REASONING_DISPATCH_UNCONFIRMED');
    if (!options.allowExternal) throw new ReasoningError('REASONING_EXTERNAL_CALL_NOT_AUTHORIZED');
    const config = sakanaConfig(options.env);
    if (!config) throw new ReasoningError('REASONING_DISABLED');
    const { request, policy } = original.prepared;
    if (original.prepared.instructions !== REASONING_INSTRUCTIONS || original.prepared.requestBody !== sakanaRequestBody(request, policy))
      throw new ReasoningError('REASONING_INSTRUCTIONS_CHANGED');
    const expectedPolicy = { model: policy.model, timeoutMs: policy.timeoutMs, maxOutputTokens: policy.maxOutputTokens, reviewRef: policy.reviewRef };
    if (Object.entries(expectedPolicy).some(([key, value]) => config[key as keyof typeof config] !== value))
      throw new ReasoningError('REASONING_POLICY_CHANGED');
    const dispatchIntentAt = new Date().toISOString(); const now = clock(dispatchIntentAt);
    currentTimeAllowed(request, policy, now);
    const attempt = { schema: 'notation.reasoning-attempt.v1' as const, runId, attemptId: randomUUID(), dispatchIntentAt,
      inputDigest: hashValue(request), policyDigest: hashValue(policy) };
    // Unique nonce means exactly one process can win create-only publication for this run.
    try { this.write(runId, 'attempt.json', attempt); }
    catch {
      if (this.inspect(runId)?.attempt) throw new ReasoningError('REASONING_DISPATCH_UNCONFIRMED');
      throw invalid();
    }
    const claimed = this.inspect(runId);
    if (claimed?.attempt?.attemptId !== attempt.attemptId) throw invalid();
    try {
      // Storage can take long enough for permissions/freshness to expire. Recheck after durable claim.
      currentTimeAllowed(request, policy, Date.now());
      const candidate = checkedCandidate(await reasonWithSakana(request, { ...options, expectedPolicy }), request, policy, original.prepared.requestBody);
      this.write(runId, 'result.json', { schema: 'notation.reasoning-result.v1', runId,
        attemptId: attempt.attemptId, candidateDigest: hashValue(candidate), candidate });
      const completed = this.inspect(runId);
      if (completed?.state !== 'COMPLETED') throw invalid();
      return { historical: false, ...completed };
    } catch (error) {
      // An uncertain result publication may have succeeded; never append a contradictory failure.
      const latest = this.inspect(runId);
      if (latest?.state === 'COMPLETED') return { historical: false, ...latest };
      this.write(runId, 'failure.json', { schema: 'notation.reasoning-failure.v1', runId, attemptId: attempt.attemptId,
        recordedAt: new Date().toISOString(), error: 'REASONING_DISPATCH_UNCONFIRMED', automaticRetry: false });
      if (error instanceof ReasoningError) throw error;
      throw new ReasoningError('REASONING_DISPATCH_UNCONFIRMED');
    }
  }
}
