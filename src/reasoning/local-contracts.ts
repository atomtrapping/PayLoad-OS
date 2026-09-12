import { z } from 'zod';
import { localRecordDigest } from '../data-os/local-record';

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/);
const digest = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const ids = z.array(id);
const metadataText = z.string().trim().min(1).max(500).refine((value) =>
  Buffer.from(value, 'utf8').toString('utf8') === value && Array.from(value).some((char) =>
    char.trim() !== '' && ![0x85, 0x1c, 0x1d, 0x1e, 0x1f].includes(char.charCodeAt(0))));
const knownAt = z.iso.datetime({ offset: true }).max(64).regex(
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/,
).refine((value) => !value.startsWith('0000-'));
export const contextSearchSchema = z.strictObject({
  schema: z.literal('notation.sakana-context-search.v1'), requestId: id,
  classification: z.enum(['SYNTHETIC', 'PUBLIC', 'INTERNAL']),
  processingBasis: metadataText,
  requirements: z.array(z.strictObject({ id, weight: z.number().int().min(1).max(1000) })).min(1).max(32),
  sources: z.array(z.strictObject({
    id, reference: metadataText, contentDigest: digest, knownAt,
    standing: z.enum(['SYNTHETIC', 'OBSERVATION', 'UNADMITTED', 'ADMITTED', 'REFUSED', 'WITHDRAWN']),
    tokens: z.number().int().min(1).max(131072), coverage: ids.max(32),
  })).min(1).max(64),
  budget: z.strictObject({ maxTokens: z.number().int().min(1).max(32768),
    maxSources: z.number().int().min(1).max(16), iterations: z.number().int().min(1).max(128),
    seed: z.number().int().min(0).max(4294967295) }),
}).superRefine((value, ctx) => {
  const requirements = new Set(value.requirements.map((item) => item.id));
  if (requirements.size !== value.requirements.length || new Set(value.sources.map((item) => item.id)).size !== value.sources.length)
    ctx.addIssue({ code: 'custom', message: 'Duplicate source or requirement identity.' });
  for (const source of value.sources) {
    if (new Set(source.coverage).size !== source.coverage.length || source.coverage.some((key) => !requirements.has(key)))
      ctx.addIssue({ code: 'custom', message: 'Coverage must name unique supplied requirements.' });
    if (value.classification === 'SYNTHETIC' && source.standing !== 'SYNTHETIC')
      ctx.addIssue({ code: 'custom', message: 'Synthetic packets require synthetic source standing.' });
  }
});
export type ContextSearchRequest = z.infer<typeof contextSearchSchema>;

export class SakanaToolError extends Error {
  constructor(public readonly code: string) { super(code); }
}

export function parseContextSearch(input: unknown): ContextSearchRequest {
  try {
    const request = contextSearchSchema.parse(input);
    if (Buffer.byteLength(JSON.stringify(request)) > 65536) throw new Error();
    return request;
  } catch { throw new SakanaToolError('SAKANA_TOOLS_INPUT_INVALID'); }
}

/** Declared metadata coverage only; this does not establish factual support. */
export function evaluateContextSelection(request: ContextSearchRequest, selection: readonly string[]) {
  if (new Set(selection).size !== selection.length || selection.length > request.budget.maxSources)
    throw new SakanaToolError('SAKANA_TOOLS_SELECTION_INVALID');
  const covered = new Set<string>(); let tokenCount = 0;
  for (const key of selection) {
    const source = request.sources.find((item) => item.id === key);
    if (!source || source.standing === 'REFUSED' || source.standing === 'WITHDRAWN')
      throw new SakanaToolError('SAKANA_TOOLS_SELECTION_INVALID');
    tokenCount += source.tokens;
    source.coverage.forEach((item) => covered.add(item));
  }
  if (tokenCount > request.budget.maxTokens) throw new SakanaToolError('SAKANA_TOOLS_SELECTION_INVALID');
  const coveredWeight = request.requirements.reduce((sum, item) => sum + (covered.has(item.id) ? item.weight : 0), 0);
  const totalWeight = request.requirements.reduce((sum, item) => sum + item.weight, 0);
  return { selectedSourceIds: [...selection].sort(), coveredRequirementIds: [...covered].sort(),
    coveredWeight, totalWeight, tokenCount, score: coveredWeight / totalWeight };
}

const workerResultSchema = z.strictObject({
  schema: z.literal('notation.sakana-context-result.v1'), requestId: id,
  tool: z.strictObject({ name: z.literal('treequest'), version: z.literal('0.3.2'), algorithm: z.literal('ABMCTS-A') }),
  selectedSourceIds: ids.max(16), coveredRequirementIds: ids.max(32),
  coveredWeight: z.number().int().min(0).max(32000), totalWeight: z.number().int().min(1).max(32000),
  tokenCount: z.number().int().min(0).max(32768), searchIterations: z.number().int().min(1).max(128),
  trace: z.array(z.strictObject({ step: z.number().int().min(1).max(128), parentSourceIds: ids.max(16),
    selectedSourceIds: ids.max(16), score: z.number().min(0).max(1) })).min(1).max(128),
});

function sameIds(left: readonly string[], right: readonly string[]) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function compareIds(left: readonly string[], right: readonly string[]) {
  for (let index = 0; index < Math.min(left.length, right.length); index++) {
    if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
  }
  return left.length - right.length;
}

export function verifyContextSearchResult(request: ContextSearchRequest, input: unknown) {
  try {
    const result = workerResultSchema.parse(input);
    if (result.requestId !== request.requestId || result.trace.length !== request.budget.iterations ||
        result.searchIterations !== request.budget.iterations) throw new Error();
    const observed = new Map<string, ReturnType<typeof evaluateContextSelection>>();
    const generated = new Map<string, ReturnType<typeof evaluateContextSelection>>();
    observed.set('[]', evaluateContextSelection(request, []));
    for (let index = 0; index < result.trace.length; index++) {
      const trial = result.trace[index];
      const parent = evaluateContextSelection(request, trial.parentSourceIds);
      const selected = evaluateContextSelection(request, trial.selectedSourceIds);
      const canExtend = parent.selectedSourceIds.length < request.budget.maxSources && request.sources.some((source) =>
        source.standing !== 'REFUSED' && source.standing !== 'WITHDRAWN' && !parent.selectedSourceIds.includes(source.id) &&
        parent.tokenCount + source.tokens <= request.budget.maxTokens);
      if (trial.step !== index + 1 || !sameIds(parent.selectedSourceIds, trial.parentSourceIds) ||
          !sameIds(selected.selectedSourceIds, trial.selectedSourceIds) ||
          !observed.has(JSON.stringify(parent.selectedSourceIds)) ||
          parent.selectedSourceIds.some((key) => !selected.selectedSourceIds.includes(key)) ||
          (canExtend && selected.selectedSourceIds.length === parent.selectedSourceIds.length) ||
          selected.selectedSourceIds.length > parent.selectedSourceIds.length + 1 ||
          Math.abs(selected.score - trial.score) > 1e-12) throw new Error();
      observed.set(JSON.stringify(selected.selectedSourceIds), selected);
      generated.set(JSON.stringify(selected.selectedSourceIds), selected);
    }
    const selected = evaluateContextSelection(request, result.selectedSourceIds);
    if (!generated.has(JSON.stringify(selected.selectedSourceIds)) ||
        !sameIds(selected.selectedSourceIds, result.selectedSourceIds) ||
        !sameIds(selected.coveredRequirementIds, result.coveredRequirementIds) ||
        selected.coveredWeight !== result.coveredWeight || selected.totalWeight !== result.totalWeight ||
        selected.tokenCount !== result.tokenCount ||
        [...generated.values()].some((trial) => trial.score > selected.score ||
          (trial.score === selected.score && (trial.tokenCount < selected.tokenCount ||
            (trial.tokenCount === selected.tokenCount && compareIds(trial.selectedSourceIds, selected.selectedSourceIds) < 0)))))
      throw new Error();
    return result;
  } catch { throw new SakanaToolError('SAKANA_TOOLS_RESULT_INVALID'); }
}

export function contextSearchPreview(input: unknown) {
  const request = parseContextSearch(input);
  return { schema: 'notation.sakana-context-preview.v1', requestId: request.requestId,
    inputDigest: localRecordDigest(request, 65536), evaluator: 'weighted-declared-coverage/v1',
    tool: 'treequest', toolVersion: '0.3.2', budget: request.budget,
    eligibleSourceCount: request.sources.filter((item) => !['REFUSED', 'WITHDRAWN'].includes(item.standing)).length,
    externalRequestMade: false, modelCalls: 0, authority: 'PROPOSE_ONLY' } as const;
}
