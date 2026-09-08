import { resolve } from 'node:path';
import { CENSUS_FIELDS } from '../acquisition/fmcsa';
import type { CensusCandidate } from '../acquisition/census-normalization';
import type { SourceRegistration } from '../data-os/contracts';
import { CensusCandidateBuildStore } from '../data-os/local-census-candidate-build';
import { byteDigest } from '../data-os/evidence-capture';
import { publishImmutableFile, readImmutableFile } from '../data-os/local-files';
import { encodeLocalRecord, exactFields, localJson, localRecordDigest } from '../data-os/local-record';
import { evaluateSourceUse } from '../data-os/source-policy';
import { parseISOInstant } from '../data-os/validation';
import { CENSUS_OBSERVATION_PRODUCT, CENSUS_PRODUCT_DIGEST } from './census-product';
import { CENSUS_COLUMN_DICTIONARY } from './census-dictionary';

const MAX = 4 * 1024 * 1024;
const hash = (value: unknown) => localRecordDigest(value, MAX);
const json = (value: unknown) => Buffer.from(`${localJson(value)}\n`, 'utf8');
const same = (left: unknown, right: unknown) => localJson(left) === localJson(right);
export class CensusPackageError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'CensusPackageError'; }
}
function fail(code: string): never { throw new CensusPackageError(code); }
function id(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(value)) fail('INVALID_PACKAGE_ID');
}
function instant(value: unknown): string {
  parseISOInstant(value, 'package time');
  if (typeof value !== 'string' || new Date(value).toISOString() !== value) fail('INVALID_PACKAGE_TIME');
  return value;
}
export interface ExactRef { id: string; digest: string }
function reference(value: unknown): asserts value is ExactRef {
  exactFields(value, ['id', 'digest']); id(value.id);
  if (typeof value.digest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(value.digest)) fail('INVALID_PACKAGE_REFERENCE');
}
export interface CensusPackageRequest {
  schema: 'notations.census-package-request.v1' | 'notations.census-package-request.v2'; packageId: string;
  build: ExactRef; previous?: ExactRef;
}
export function parseCensusPackageRequest(value: unknown): CensusPackageRequest {
  const request: unknown = JSON.parse(encodeLocalRecord(value, 8192).toString('utf8'));
  exactFields(request, ['schema', 'packageId', 'build'], ['previous']);
  if (request.schema !== 'notations.census-package-request.v1' && request.schema !== 'notations.census-package-request.v2') fail('INVALID_PACKAGE_REQUEST');
  id(request.packageId); reference(request.build);
  if (request.previous !== undefined) {
    reference(request.previous);
    if (request.previous.id === request.packageId) fail('PACKAGE_PREDECESSOR_CYCLE');
  }
  return request as unknown as CensusPackageRequest;
}
export interface ObservationChange {
  sourceRecordId: string; kind: 'ADDED_TO_SELECTION' | 'REMOVED_FROM_SELECTION' | 'FIELDS_CHANGED' | 'FIELDS_UNCHANGED';
  fields: Array<{ field: string; before: CensusCandidate['fields'][typeof CENSUS_FIELDS[number]]; after: CensusCandidate['fields'][typeof CENSUS_FIELDS[number]] }>;
}
export function compareCensusObservations(before: readonly CensusCandidate[], after: readonly CensusCandidate[]): ObservationChange[] {
  const old = new Map(before.map((row) => [row.identity.sourceRecordId, row]));
  const next = new Map(after.map((row) => [row.identity.sourceRecordId, row]));
  if (old.size !== before.length || next.size !== after.length) fail('DUPLICATE_OBSERVATION_IDENTITY');
  return [...new Set([...old.keys(), ...next.keys()])].sort().map((sourceRecordId) => {
    const a = old.get(sourceRecordId); const b = next.get(sourceRecordId);
    if (!a || !b) return { sourceRecordId, kind: a ? 'REMOVED_FROM_SELECTION' : 'ADDED_TO_SELECTION', fields: [] };
    const fields = CENSUS_FIELDS.filter((field) => !same(a.fields[field], b.fields[field]))
      .map((field) => ({ field, before: a.fields[field], after: b.fields[field] }));
    return { sourceRecordId, kind: fields.length ? 'FIELDS_CHANGED' : 'FIELDS_UNCHANGED', fields };
  });
}

interface Intent { schema: 'notations.census-package-intent.v1'; request: CensusPackageRequest; createdAt: string; digest: string }
export interface CensusPackageRelease {
  schema: 'notations.census-package-release.v1' | 'notations.census-package-release.v2'; packageId: string; releasedAt: string;
  state: 'INTERNAL_QUALIFICATION_RELEASE'; canonicalAdmission: false; customerDistributionPermitted: false;
  product: { id: string; version: string; digest: string }; build: ExactRef; previous: ExactRef | null;
  intentDigest: string; recordCount: number; recordsDigest: string;
  artifacts: Array<{ name: string; digest: string; bytes: number }>;
  acceptance: { profileId: string; state: 'ACCEPTED_FOR_INTERNAL_QUALIFICATION'; sourceDecisions: ReturnType<typeof evaluateSourceUse>[] };
  digest: string;
}
interface Bundle { release: CensusPackageRelease; artifacts: Map<string, Buffer> }
interface Dependency { candidate: CensusCandidate; registration: SourceRegistration }
const directory = (packageId: string) => ['boutique-packages', byteDigest(Buffer.from(packageId)).slice(7)];
const path = (packageId: string, name: string) => [...directory(packageId), name];
const TERMS = [
  'INTERNAL SOURCE QUALIFICATION ONLY — NOT A CUSTOMER DELIVERY',
  'Source: FMCSA Company Census. Provider redistribution permission is unresolved in the retained source policy.',
  'The operator declaration permits internal source qualification, not unrestricted internal commercial use, sale or redistribution.',
  'Candidate observations remain canonically unadmitted. Product-profile acceptance concerns the faithful packaging of reported observations, not their truth.',
  'No independent validation or commercial pilot is claimed. Preserve attribution and do not supply this package to customers.',
  'Spreadsheet safety: CSV source text beginning with formula/control characters is apostrophe-prefixed; records.jsonl preserves original values exactly.',
].join('\n') + '\n';

/** All files are internal derivation artifacts. No file path comes from a request. */
export class CensusPackageStore {
  readonly root: string;
  readonly builds: CensusCandidateBuildStore;
  constructor(root: string) { this.root = resolve(root); this.builds = new CensusCandidateBuildStore(this.root); }

  private dependencies(request: CensusPackageRequest): { dependencies: Dependency[]; builtAt: string } {
    const build = this.builds.inspect(request.build.id);
    if (!build || build.digest !== request.build.digest) fail('PACKAGE_BUILD_REFERENCE_MISMATCH');
    const dependencies = build.members.map((member) => {
      const normalization = this.builds.normalizations.inspect(member.normalization.id);
      if (!normalization?.candidate || normalization.digest !== member.normalization.digest
        || normalization.candidate.digest !== member.candidate.digest) fail('PACKAGE_CANDIDATE_REFERENCE_MISMATCH');
      const candidate = normalization.candidate;
      const acquisition = this.builds.normalizations.intake.inspect(candidate.provenance.acquisition.id);
      if (!acquisition || acquisition.digest !== candidate.provenance.acquisition.digest) fail('PACKAGE_ACQUISITION_REFERENCE_MISMATCH');
      return { candidate, registration: acquisition.request.manifest.sourceRegistration };
    }).sort((a, b) => a.candidate.identity.sourceRecordId < b.candidate.identity.sourceRecordId ? -1 : 1);
    if (!dependencies.length || dependencies.length > CENSUS_OBSERVATION_PRODUCT.scope.maximumRecords) fail('PACKAGE_MEMBER_BOUND');
    return { dependencies, builtAt: build.builtAt };
  }

  private permission(dependencies: Dependency[], at: string) {
    return dependencies.map(({ candidate, registration }) => {
      const decision = evaluateSourceUse(registration, { requestId: `${candidate.candidateId}:package`, registrationId: registration.registrationId,
        operation: 'DERIVE', audience: 'INTERNAL', purpose: 'source-qualification', requestedAt: at });
      if (decision.state !== 'ALLOWED') fail('PACKAGE_DERIVATION_NOT_ALLOWED');
      return decision;
    });
  }

  private fresh(dependencies: Dependency[], at: string): void {
    for (const { candidate } of dependencies) {
      const age = Date.parse(at) - Date.parse(candidate.temporal.capturedAt);
      if (age < 0 || age > CENSUS_OBSERVATION_PRODUCT.freshness.maximumCaptureAgeDays * 86_400_000) fail('PACKAGE_CAPTURE_TOO_OLD');
    }
  }

  private compile(intent: Intent): Bundle {
    const { request, createdAt } = intent;
    const { dependencies, builtAt } = this.dependencies(request);
    if (createdAt < builtAt) fail('PACKAGE_BEFORE_BUILD');
    const decisions = this.permission(dependencies, createdAt);
    this.fresh(dependencies, createdAt);
    const records = dependencies.map(({ candidate }) => candidate);
    for (const record of records) {
      if (record.fields.dot_number.presence !== 'PRESENT' || record.fields.dot_number.value !== record.identity.sourceRecordId) fail('PACKAGE_SOURCE_IDENTITY_INVALID');
    }
    let prior: CensusCandidate[] = [];
    if (request.previous) {
      // Readback of a predecessor is bounded and does not recursively follow its history.
      const previous = this.readStored(request.previous.id);
      if (!previous || previous.release.digest !== request.previous.digest) fail('PACKAGE_PREVIOUS_REFERENCE_MISMATCH');
      if (previous.release.releasedAt >= createdAt) fail('PACKAGE_PREVIOUS_NOT_EARLIER');
      const priorDependencies = this.dependencies(previous.intent.request).dependencies;
      this.permission(priorDependencies, createdAt);
      prior = priorDependencies.map(({ candidate }) => candidate);
    }
    const missing = Object.fromEntries(CENSUS_FIELDS.map((field) => [field, {
      present: records.filter((row) => row.fields[field].presence === 'PRESENT').length,
      explicitNull: records.filter((row) => row.fields[field].presence === 'EXPLICIT_NULL').length,
      omitted: records.filter((row) => row.fields[field].presence === 'OMITTED').length,
    }]));
    const quality = {
      profile: CENSUS_OBSERVATION_PRODUCT.acceptance, productDigest: CENSUS_PRODUCT_DIGEST,
      recordCount: records.length, sourceScopedIdentityUnique: new Set(records.map((row) => row.identity.sourceRecordId)).size === records.length,
      missingness: missing, maximumCaptureAgeDays: 7, validTime: 'UNOBSERVED',
      captureRange: { from: [...records.map((row) => row.temporal.capturedAt)].sort()[0], to: [...records.map((row) => row.temporal.capturedAt)].sort().at(-1) },
      worldCompleteness: 'NOT_ESTABLISHED', independentAccuracy: 'NOT_VERIFIED',
    };
    if (!quality.sourceScopedIdentityUnique) fail('DUPLICATE_OBSERVATION_IDENTITY');
    const csvCell = (value: string) => `"${(/^[\s]*[=+\-@\t\r\n]/.test(value) ? `'${value}` : value).replaceAll('"', '""')}"`;
    const headers = ['source_record_id', 'captured_at', 'known_at', 'valid_time_state', ...CENSUS_FIELDS.flatMap((field) =>
      ['raw', 'presence', 'value', 'unit', 'interpretation'].map((part) => `${field}.${part}`))];
    const csv = [headers.map(csvCell).join(','), ...records.map((row) => [row.identity.sourceRecordId, row.temporal.capturedAt, row.knownAt, row.validTime.state,
      ...CENSUS_FIELDS.flatMap((field) => [row.fields[field].raw, row.fields[field].presence, row.fields[field].value, row.fields[field].unit, row.fields[field].interpretation]
        .map((value) => value === null ? '' : String(value)))].map(csvCell).join(','))].join('\r\n') + '\r\n';
    const changes = { classification: request.previous ? 'OBSERVATION_UPDATE' : 'INITIAL_SELECTION', previous: request.previous ?? null,
      correctionsDeclared: false, supersedesPhysicalState: false,
      meaning: 'Selection removal is not nonexistence; changed source fields are not automatically corrections. Capture-time-only changes are separately visible in record provenance.',
      records: compareCensusObservations(prior, records) };
    const artifacts = new Map<string, Buffer>([
      ['records.jsonl', Buffer.from(records.map((record) => localJson(record)).join('\n') + '\n')],
      ['records.csv', Buffer.from(csv)], ['dictionary.json', json(request.schema === 'notations.census-package-request.v2' ? CENSUS_COLUMN_DICTIONARY : CENSUS_OBSERVATION_PRODUCT)],
      ['quality.json', json(quality)], ['changes.json', json(changes)], ['terms.txt', Buffer.from(TERMS)],
    ]);
    const body = {
      schema: request.schema === 'notations.census-package-request.v2' ? 'notations.census-package-release.v2' as const : 'notations.census-package-release.v1' as const,
      packageId: request.packageId, releasedAt: createdAt,
      state: 'INTERNAL_QUALIFICATION_RELEASE' as const, canonicalAdmission: false as const, customerDistributionPermitted: false as const,
      product: { id: CENSUS_OBSERVATION_PRODUCT.productId, version: CENSUS_OBSERVATION_PRODUCT.version, digest: CENSUS_PRODUCT_DIGEST },
      build: request.build, previous: request.previous ?? null, intentDigest: intent.digest,
      recordCount: records.length, recordsDigest: byteDigest(artifacts.get('records.jsonl')!),
      artifacts: [...artifacts].map(([name, bytes]) => ({ name, digest: byteDigest(bytes), bytes: bytes.length })),
      acceptance: { profileId: CENSUS_OBSERVATION_PRODUCT.acceptance.profileId, state: 'ACCEPTED_FOR_INTERNAL_QUALIFICATION' as const, sourceDecisions: decisions },
    };
    return { release: { ...body, digest: hash(body) }, artifacts };
  }

  private readIntent(packageId: string): Intent | undefined {
    const bytes = readImmutableFile(this.root, path(packageId, 'intent.json'), 16384);
    if (!bytes) return undefined;
    const value = JSON.parse(bytes.toString('utf8'));
    exactFields(value, ['schema', 'request', 'createdAt', 'digest']);
    const request = parseCensusPackageRequest(value.request);
    if (value.schema !== 'notations.census-package-intent.v1' || request.packageId !== packageId) fail('PACKAGE_HISTORY_INVALID');
    const body = { schema: value.schema, request, createdAt: instant(value.createdAt) };
    if (value.digest !== hash(body) || !bytes.equals(json({ ...body, digest: value.digest }))) fail('PACKAGE_HISTORY_INVALID');
    return value as unknown as Intent;
  }

  private readStored(packageId: string): { intent: Intent; release: CensusPackageRelease } | undefined {
    id(packageId);
    const bytes = readImmutableFile(this.root, path(packageId, 'release.json'), MAX);
    if (!bytes) return undefined;
    const intent = this.readIntent(packageId);
    if (!intent) fail('PACKAGE_HISTORY_INVALID');
    const release = JSON.parse(bytes.toString('utf8')) as CensusPackageRelease;
    const { digest, ...body } = release;
    if (digest !== hash(body) || !bytes.equals(json(release)) || release.intentDigest !== intent.digest || release.packageId !== packageId
      || release.product?.digest !== CENSUS_PRODUCT_DIGEST || !same(release.build, intent.request.build)
      || !Array.isArray(release.artifacts) || release.artifacts.length !== CENSUS_OBSERVATION_PRODUCT.formats.length) fail('PACKAGE_HISTORY_INVALID');
    for (const artifact of release.artifacts) {
      if (!(CENSUS_OBSERVATION_PRODUCT.formats as readonly string[]).includes(artifact.name)) fail('PACKAGE_HISTORY_INVALID');
      const stored = readImmutableFile(this.root, path(packageId, artifact.name), MAX);
      if (!stored || stored.length !== artifact.bytes || byteDigest(stored) !== artifact.digest) fail('PACKAGE_ARTIFACT_INVALID');
    }
    return { intent, release };
  }

  private inspectChain(packageId: string, maximum: number): CensusPackageRelease | undefined {
    let cursor: string | undefined = packageId;
    let first: CensusPackageRelease | undefined;
    const seen = new Set<string>();
    while (cursor !== undefined) {
      if (seen.has(cursor) || seen.size >= maximum) fail('PACKAGE_HISTORY_BOUND');
      seen.add(cursor);
      const stored = this.readStored(cursor);
      if (!stored) { if (!first) return undefined; fail('PACKAGE_PREVIOUS_REFERENCE_MISMATCH'); }
      const rebuilt = this.compile(stored.intent);
      if (!same(rebuilt.release, stored.release)) fail('PACKAGE_RECOMPUTATION_MISMATCH');
      for (const [name, bytes] of rebuilt.artifacts) {
        if (!readImmutableFile(this.root, path(cursor, name), MAX)?.equals(bytes)) fail('PACKAGE_ARTIFACT_INVALID');
      }
      first ??= stored.release;
      cursor = stored.intent.request.previous?.id;
    }
    return first;
  }

  inspect(packageId: string): CensusPackageRelease | undefined { return this.inspectChain(packageId, 32); }

  build(value: unknown, now = new Date().toISOString()): { status: 'CREATED' | 'EXISTING'; release: CensusPackageRelease } {
    const request = parseCensusPackageRequest(value); const at = instant(now);
    const existing = this.inspect(request.packageId);
    if (existing) {
      if (!same(this.readIntent(request.packageId)!.request, request)) fail('PACKAGE_REQUEST_CONFLICT');
      return { status: 'EXISTING', release: existing };
    }
    let intent = this.readIntent(request.packageId);
    if (intent && !same(intent.request, request)) fail('PACKAGE_REQUEST_CONFLICT');
    const currentDependencies = this.dependencies(request).dependencies;
    this.permission(currentDependencies, at);
    this.fresh(currentDependencies, at);
    if (request.previous) {
      const previous = this.inspectChain(request.previous.id, 31);
      if (!previous || previous.digest !== request.previous.digest) fail('PACKAGE_PREVIOUS_REFERENCE_MISMATCH');
      // Comparing fields derives from the preceding vintage too. Resuming an
      // unfinished package requires current permission for those inputs, but
      // historical observations need not satisfy the new-capture age limit.
      const previousIntent = this.readIntent(previous.packageId)!;
      this.permission(this.dependencies(previousIntent.request).dependencies, at);
    }
    if (!intent) {
      const body = { schema: 'notations.census-package-intent.v1' as const, request, createdAt: at };
      const proposed = { ...body, digest: hash(body) };
      // Validate before retaining an intent, and recover a concurrent identical request at its original clock.
      this.compile(proposed);
      try { publishImmutableFile(this.root, path(request.packageId, 'intent.json'), json(proposed), 16384); }
      catch {
        const winner = this.readIntent(request.packageId);
        if (!winner || !same(winner.request, request)) fail('PACKAGE_REQUEST_CONFLICT');
      }
      intent = this.readIntent(request.packageId);
    }
    if (!intent) fail('PACKAGE_SAVE_UNCONFIRMED');
    const bundle = this.compile(intent);
    for (const [name, bytes] of bundle.artifacts) publishImmutableFile(this.root, path(request.packageId, name), bytes, MAX);
    const status = publishImmutableFile(this.root, path(request.packageId, 'release.json'), json(bundle.release), MAX);
    const release = this.inspect(request.packageId);
    if (!release || release.digest !== bundle.release.digest) fail('PACKAGE_SAVE_UNCONFIRMED');
    return { status, release };
  }

  /** Records a refused customer-export attempt; it never emits data or grants a new purpose. */
  requestCustomerDelivery(value: unknown, now = new Date().toISOString()) {
    const input: unknown = JSON.parse(encodeLocalRecord(value, 8192).toString('utf8'));
    exactFields(input, ['schema', 'deliveryId', 'release', 'recipientId', 'purpose']);
    if (input.schema !== 'notations.census-delivery-request.v1') fail('INVALID_DELIVERY_REQUEST');
    id(input.deliveryId); id(input.recipientId); reference(input.release);
    if (typeof input.purpose !== 'string' || !/^[A-Za-z0-9._-]{1,100}$/.test(input.purpose)) fail('INVALID_DELIVERY_PURPOSE');
    const currentAt = instant(now); const release = this.inspect(input.release.id);
    if (!release || release.digest !== input.release.digest) fail('PACKAGE_DELIVERY_REFERENCE_MISMATCH');
    const receiptPath = ['boutique-delivery-attempts', `${byteDigest(Buffer.from(input.deliveryId)).slice(7)}.json`];
    const existingBytes = readImmutableFile(this.root, receiptPath, MAX);
    let at = currentAt;
    if (existingBytes) {
      const existing: unknown = JSON.parse(existingBytes.toString('utf8'));
      exactFields(existing, ['schema', 'request', 'requestedAt', 'state', 'reasons', 'decisions', 'dataEmitted', 'customerDelivered', 'digest']);
      if (!same(existing.request, input)) fail('DELIVERY_REQUEST_CONFLICT');
      at = instant(existing.requestedAt);
    }
    if (at < release.releasedAt) fail('DELIVERY_BEFORE_RELEASE');
    const intent = this.readIntent(release.packageId)!;
    const decisions = this.dependencies(intent.request).dependencies.map(({ candidate, registration }) =>
      evaluateSourceUse(registration, { requestId: `${input.deliveryId}:${candidate.identity.sourceRecordId}`, registrationId: registration.registrationId,
        operation: 'EXPORT', audience: 'CUSTOMER', purpose: input.purpose as string, requestedAt: at }));
    const body = { schema: 'notations.census-delivery-attempt.v1', request: input, requestedAt: at, state: 'REFUSED',
      reasons: ['PRODUCT_INTERNAL_QUALIFICATION_ONLY', 'CUSTOMER_DISTRIBUTION_NOT_AUTHORIZED'], decisions,
      dataEmitted: false, customerDelivered: false };
    const receipt = { ...body, digest: hash(body) };
    if (existingBytes && !existingBytes.equals(json(receipt))) fail('DELIVERY_HISTORY_INVALID');
    // A historical retry replays its original refusal. A fresh current decision needs a new ID.
    publishImmutableFile(this.root, receiptPath, json(receipt), MAX);
    return receipt;
  }
}
