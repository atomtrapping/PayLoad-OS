/**
 * A bounded extract with a manifest that states what it is.
 *
 * The closed-catalog posture sells lists, slices and sets rather than access:
 * the factory stays inside, and what leaves is a file with a manifest. That
 * makes the manifest the product's whole surface — the only thing a buyer reads
 * before paying and the only thing an auditor reads afterwards — so every claim
 * on it has to be derived from the records it describes rather than written
 * beside them.
 *
 * WHAT A MANIFEST MAY NOT ASSERT
 *
 * Three things, each with a precedent already in this codebase.
 *
 * A caller's grade or an aggregate admitted count cannot establish the status
 * of these records. Export needs a separate trusted verifier that reopens their
 * exact admission history and verifies current source/recipient permission.
 * No production verifier is wired; the existing caller remains a preview.
 *
 * It may not quote a correction rate off a handful of events. `RATE_GATE` in
 * `collateralVehicle.ts` already holds that line for exposure, and the reason
 * is the same here: a frequency needs a denominator, and a rate computed from
 * twenty-one records would be multiplied by a real portfolio by someone who did
 * not read the sentence next to it. Counts are reported; the rate is refused
 * with the threshold that would open it.
 *
 * And it may not describe coverage as completeness. A slice states which
 * predicates it carries and how many records of each; it does not state that
 * those are all the records that exist in the world, because nothing here knows
 * that. Coverage is a fact about the extract, and completeness is a claim about
 * reality.
 */
import { z } from 'zod';
import type { Corpus, CorpusRecord, CorpusRelease, Retraction } from './corpus';
import type { AdmittedCount } from './compression';
import type { ISODateTime } from './types';
import { authorizeCatalogExport, catalogDigest, refusedCatalogAuthorization, type CatalogAuthorization, type CatalogVerifier } from './catalogAuthorization';

export const SLICE_METHOD = 'notationsos.catalog-slice.v2';

/**
 * How the records in a slice got there.
 *
 * DEMONSTRATION is the committed fixtures, seeded so the pages have something
 * to show; ADMITTED is a row that crossed the gate. UNKNOWN is a caller that
 * could not check, which is a different answer from either and is not a pass.
 */
export type AdmissionGrade = 'ADMITTED' | 'DEMONSTRATION' | 'UNKNOWN';

export type SaleReadiness = 'SELLABLE' | 'NOT_FOR_SALE';

/** The smallest sample worth computing a correction frequency over. */
export const CORRECTION_RATE_GATE = Object.freeze({
  minimumRecords: 500,
  minimumCorrections: 30,
  why: 'A frequency needs a denominator. Two corrections over twenty-one records is an anecdote, and a rate from it would be multiplied by a real portfolio by someone who did not read this sentence. The thresholds are a floor for the sample being worth arithmetic at all, not a claim the rate is trustworthy at thirty.',
});

export interface SliceSpec {
  sliceId: string;
  title: string;
  /** The customer question this extract answers. A slice without one is a file. */
  question: string;
  releaseId: string;
  /** Bounds. Absent means the slice does not bound on that axis, which the manifest states rather than implies. */
  subjectTypes?: readonly string[];
  predicates?: readonly string[];
}

export interface CoverageEntry {
  predicate: string;
  records: number;
  subjects: number;
}

export interface EvidenceEntry {
  productionClass: string;
  claimStrength: string;
  interest: string;
  records: number;
}

export interface CorrectionSummary {
  corrections: number;
  withdrawals: number;
  affectedRecords: number;
  /** Refused below the gate. A count is a fact; a rate over this sample would not be. */
  ratePerRecord: number | 'NOT_PRICEABLE';
  because: string;
}

export interface SliceManifest {
  schema: typeof SLICE_METHOD;
  sliceId: string;
  title: string;
  question: string;
  release: { releaseId: string; knowledgeCutoff: ISODateTime; declaredManifestCommitment: string; contentCommitment: string };
  /** Hash of complete selected records, sorted by record ID. */
  recordsCommitment: string;
  bounds: {
    subjectTypes: readonly string[] | 'UNBOUNDED';
    predicates: readonly string[] | 'UNBOUNDED';
  };
  recordCount: number;
  coverage: readonly CoverageEntry[];
  evidence: readonly EvidenceEntry[];
  corrections: CorrectionSummary;
  admissionGrade: AdmissionGrade;
  readiness: SaleReadiness;
  authorization: CatalogAuthorization;
  /** Over the manifest's own derived content, so a changed extract cannot reuse a manifest. */
  digest: string;
  because: string;
  loss: readonly string[];
}

/**
 * A cut that may be shipped. Its manifest is SELLABLE by construction — there
 * is no way to reach this shape with an unsellable one.
 */
export interface SliceCut {
  manifest: SliceManifest;
  records: readonly CorpusRecord[];
  /** Records the bounds excluded, counted so a reader knows the slice is a slice. */
  excluded: number;
}

/**
 * A slice that was described and not cut.
 *
 * The manifest is still here — a reader is entitled to see what the extract
 * would have been and why it is not one — and `records` is null, so there is
 * nothing to ship. `manifest` is null only when the release itself was not
 * found, which is a different failure: nothing was described because there was
 * nothing to describe.
 */
export interface SliceRefused {
  manifest: SliceManifest | null;
  records: null;
  because: string;
}

/**
 * Narrow on `records`.
 *
 * A discriminated union rather than a flag beside the payload, because
 * `admittedRow` already settled this shape one layer down: *a refusal never
 * yields a row, and no caller can obtain one by ignoring an outcome it did not
 * like.* Returning the records next to a manifest that says NOT_FOR_SALE would
 * leave exactly that door open — the readiness would be advice, and advice is
 * what a shipping script skips.
 */
export type SliceResult = SliceCut | SliceRefused;

const SLICE_LOSS = [
  'Coverage is a fact about this extract and not a claim about the world. It says which predicates are carried and how many records of each; it does not say those are all that exist.',
  'A manifest states what the records are, never that they are true. Every record still carries its own evidence class, and a slice of asserted values is a slice of assertions however many there are.',
  'The correction summary counts what this release has issued. It is not a forecast, and below the stated gate it is not a rate either.',
  'An extract has a vintage. A buyer holding it after the next release holds an answer that was correct as of its cutoff, which is what the cutoff is for.',
  'An unsellable slice is described and not cut. This manifest comes back so a reader can see what the extract would have been; the records do not, because a readiness a caller can decline to read is advice rather than a boundary.',
  'An aggregate admitted count and a caller grade establish no exact record admission. Export requires a trusted verifier over this membership, release, current source grants and recipient agreement. No production verifier is wired here.',
] as const;

function readinessOf(grade: AdmissionGrade, records: number, authorization: CatalogAuthorization): { readiness: SaleReadiness; because: string } {
  if (records === 0) {
    return { readiness: 'NOT_FOR_SALE', because: 'The bounds selected no records. An empty extract is not a product, and shipping one would sell a manifest describing nothing.' };
  }
  switch (grade) {
    case 'ADMITTED':
      return authorization.state === 'VERIFIED'
        ? { readiness: 'SELLABLE', because: `${records} exact records have verified admission and current export permission for the named recipient and use.` }
        : { readiness: 'NOT_FOR_SALE', because: `Export verification refused: ${authorization.reasons.join(', ')}.` };
    case 'DEMONSTRATION':
      return { readiness: 'NOT_FOR_SALE', because: `${records} ${records === 1 ? 'record' : 'records'}, all DEMONSTRATION. These were seeded so the pages have something to show; none crossed the admission gate, and selling them would be selling the demonstration as the corpus.` };
    case 'UNKNOWN':
      return { readiness: 'NOT_FOR_SALE', because: `${records} records of an unchecked grade; an unchecked grade is not an admitted one. Export verification: ${authorization.reasons.join(', ')}.` };
  }
}

function summariseCorrections(retractions: readonly Retraction[], records: number, inSlice: ReadonlySet<string>): CorrectionSummary {
  const relevant = retractions.filter((entry) => entry.affectedRecordIds.some((id) => inSlice.has(id)));
  const corrections = relevant.filter((entry) => entry.kind === 'CORRECTION').length;
  const withdrawals = relevant.filter((entry) => entry.kind === 'WITHDRAWAL').length;
  const affectedRecords = new Set(relevant.flatMap((entry) => entry.affectedRecordIds.filter((id) => inSlice.has(id)))).size;
  const total = corrections + withdrawals;
  const priceable = records >= CORRECTION_RATE_GATE.minimumRecords && total >= CORRECTION_RATE_GATE.minimumCorrections;
  return {
    corrections, withdrawals, affectedRecords,
    ratePerRecord: priceable ? Number((total / records).toFixed(6)) : 'NOT_PRICEABLE',
    because: priceable
      ? `${total} retractions over ${records} records. Above the gate of ${CORRECTION_RATE_GATE.minimumRecords} records and ${CORRECTION_RATE_GATE.minimumCorrections} retractions, so a rate is arithmetic rather than an anecdote — and it is still a rate about this corpus's sources, not about a new one.`
      : `${total} ${total === 1 ? 'retraction' : 'retractions'} over ${records} ${records === 1 ? 'record' : 'records'}, below the gate of ${CORRECTION_RATE_GATE.minimumRecords} records and ${CORRECTION_RATE_GATE.minimumCorrections} retractions. ${CORRECTION_RATE_GATE.why}`,
  };
}

/**
 * Pure: build a bounded extract and the manifest that describes it.
 *
 * The legacy grade keeps preview callers compatible. No grade grants export;
 * an export service must verify these exact records and their delivery rights.
 */
type CatalogRelease = Omit<CorpusRelease, 'fixture_only'> & { fixture_only: boolean };
export type CatalogCorpus = Omit<Corpus, 'fixture_only' | 'releases'> & { fixture_only: boolean; releases: CatalogRelease[] };
export interface CatalogDelivery {
  context: unknown;
  verifier?: CatalogVerifier;
}

const specText = z.string().min(1).max(512).refine((s) => !!s.trim() && !/[\u0000-\u001f\u007f]/.test(s));
const bounds = z.array(specText).min(1).max(128).refine((values) => new Set(values).size === values.length).transform((values) => [...values].sort());
const specSchema = z.object({ sliceId: specText, title: specText, question: specText, releaseId: specText,
  subjectTypes: bounds.optional(), predicates: bounds.optional() }).strict();

/** JSON snapshots omit absent optional object fields, but reject lossy values. */
function snapshot(value: unknown, depth = 0): unknown {
  if (depth > 20) throw new Error('CATALOG_INPUT_TOO_DEEP');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return Array.from(value, (entry) => snapshot(entry, depth + 1));
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const result: Record<string, unknown> = {};
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') throw new Error('CATALOG_INPUT_NOT_JSON');
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
      if (!Object.hasOwn(descriptor, 'value')) throw new Error('CATALOG_INPUT_NOT_JSON');
      if (descriptor.value !== undefined) Object.defineProperty(result, key, { value: snapshot(descriptor.value, depth + 1), enumerable: true });
    }
    return result;
  }
  throw new Error('CATALOG_INPUT_NOT_JSON');
}

function time(value: string): number {
  if (typeof value !== 'string') throw new Error('CATALOG_TIME_INVALID');
  const at = Date.parse(value);
  if (!Number.isFinite(at)) throw new Error('CATALOG_TIME_INVALID');
  return at;
}
const byId = (left: { recordId: string }, right: { recordId: string }) => left.recordId < right.recordId ? -1 : left.recordId > right.recordId ? 1 : 0;

export function buildSlice(corpusValue: CatalogCorpus, specValue: SliceSpec, requestedGrade: AdmissionGrade, delivery?: CatalogDelivery): SliceResult {
  try { return build(corpusValue, specValue, requestedGrade, delivery); }
  catch { return { manifest: null, records: null, because: 'INVALID_CATALOG_INPUT: the exact bounded extract could not be described; no records were cut.' }; }
}

function build(corpusValue: CatalogCorpus, specValue: SliceSpec, requestedGrade: AdmissionGrade, delivery?: CatalogDelivery): SliceResult {
  const spec = specSchema.parse(specValue);
  if (!['ADMITTED', 'DEMONSTRATION', 'UNKNOWN'].includes(requestedGrade)) throw new Error('INVALID_GRADE');
  const corpus = snapshot(corpusValue) as CatalogCorpus;
  catalogDigest(corpus); // Bound total finite JSON before constructing commitments or calling a service.
  if (!Array.isArray(corpus.records) || corpus.records.length > 50_000 || !Array.isArray(corpus.releases) ||
    new Set(corpus.records.map((r) => r.recordId)).size !== corpus.records.length ||
    new Set(corpus.releases.map((r) => r.releaseId)).size !== corpus.releases.length) throw new Error('AMBIGUOUS_MEMBERSHIP');
  const release = corpus.releases.find((entry) => entry.releaseId === spec.releaseId);
  if (!release) {
    return { manifest: null, records: null, because: `No release ${spec.releaseId} in this corpus, so there is nothing to extract from. A slice names its release because an extract without one has no cutoff and therefore no vintage.` };
  }

  if (release.corpusId !== corpus.corpusId || typeof release.fixture_only !== 'boolean' || typeof corpus.fixture_only !== 'boolean') throw new Error('INVALID_RELEASE_BINDING');
  const all = corpus.records.filter((r) => time(r.knownAt) <= time(release.knownAt)).sort(byId);
  const retractions = corpus.retractions.filter((r) => time(r.issuedAt) <= time(release.knownAt)).sort((a, b) => a.retractionId < b.retractionId ? -1 : a.retractionId > b.retractionId ? 1 : 0);
  const subjectTypes = spec.subjectTypes && spec.subjectTypes.length > 0 ? spec.subjectTypes : null;
  const predicates = spec.predicates && spec.predicates.length > 0 ? spec.predicates : null;
  const records = all.filter((record) =>
    (!subjectTypes || subjectTypes.includes(record.subjectType)) &&
    (!predicates || predicates.includes(record.predicate)));

  const byPredicate = new Map<string, CorpusRecord[]>();
  for (const record of records) {
    const bucket = byPredicate.get(record.predicate);
    if (bucket) bucket.push(record); else byPredicate.set(record.predicate, [record]);
  }
  const coverage: CoverageEntry[] = [...byPredicate.entries()]
    .map(([predicate, rows]) => ({ predicate, records: rows.length, subjects: new Set(rows.map((row) => row.subjectCanonicalId)).size }))
    .sort((a, b) => (b.records - a.records) || (a.predicate < b.predicate ? -1 : 1));

  const evidenceCounts = new Map<string, EvidenceEntry>();
  for (const record of records) {
    const klass = record.evidenceClass;
    const key = `${klass.productionClass}|${klass.claimStrength}|${klass.interest}`;
    const existing = evidenceCounts.get(key);
    if (existing) existing.records += 1;
    else evidenceCounts.set(key, { productionClass: klass.productionClass, claimStrength: klass.claimStrength, interest: klass.interest, records: 1 });
  }
  const evidence = [...evidenceCounts.values()].sort((a, b) => (b.records - a.records) ||
    (`${a.productionClass}|${a.claimStrength}|${a.interest}` < `${b.productionClass}|${b.claimStrength}|${b.interest}` ? -1 : 1));

  const inSlice = new Set(records.map((record) => record.recordId));
  const corrections = summariseCorrections(retractions, records.length, inSlice);
  const contentCommitment = catalogDigest({ corpusId: corpus.corpusId, release, records: all, retractions });
  const recordsCommitment = catalogDigest(records);
  const demonstration = corpus.fixture_only || release.fixture_only || requestedGrade === 'DEMONSTRATION';
  let authorization = refusedCatalogAuthorization('VERIFIER_UNAVAILABLE');
  if (demonstration) authorization = refusedCatalogAuthorization('DEMONSTRATION_NOT_EXPORTABLE');
  else if (!records.length) authorization = refusedCatalogAuthorization('EMPTY_SELECTION');
  else if (records.some((r) => !['COUNTERPARTY_SHARED', 'PUBLIC_RULING'].includes(r.visibility))) authorization = refusedCatalogAuthorization('RECORD_VISIBILITY_NOT_EXPORTABLE');
  else if (delivery) {
    const sourceIds = [...new Set(records.map((record) => record.provenance.sourceId))].sort();
    const sources = sourceIds.map((sourceId) => {
      const matches = release.sources.filter((source) => source.sourceId === sourceId);
      if (matches.length !== 1 || matches[0].canonicalId !== matches[0].registration.sourceId) throw new Error('INVALID_SOURCE_BINDING');
      return { sourceId, policyDigest: catalogDigest(matches[0].registration), registration: matches[0].registration };
    });
    authorization = authorizeCatalogExport({ sliceId: spec.sliceId, corpusId: corpus.corpusId, releaseId: release.releaseId,
      releaseCommitment: contentCommitment, recordsCommitment,
      records: records.map((r) => ({ recordId: r.recordId, recordDigest: catalogDigest(r), sourceId: r.provenance.sourceId })), sources,
    }, delivery.context, delivery.verifier);
  }
  const admissionGrade: AdmissionGrade = demonstration ? 'DEMONSTRATION' : authorization.state === 'VERIFIED' ? 'ADMITTED' : 'UNKNOWN';
  const { readiness, because } = readinessOf(admissionGrade, records.length, authorization);

  const body = {
    schema: SLICE_METHOD as typeof SLICE_METHOD,
    sliceId: spec.sliceId,
    title: spec.title,
    question: spec.question,
    release: { releaseId: release.releaseId, knowledgeCutoff: release.knownAt,
      declaredManifestCommitment: release.certification.manifestCommitment, contentCommitment },
    recordsCommitment,
    bounds: {
      subjectTypes: (subjectTypes ?? 'UNBOUNDED') as readonly string[] | 'UNBOUNDED',
      predicates: (predicates ?? 'UNBOUNDED') as readonly string[] | 'UNBOUNDED',
    },
    recordCount: records.length,
    coverage,
    evidence,
    corrections,
    admissionGrade,
    readiness,
    authorization,
  };

  const manifestContent = { ...body, because, loss: SLICE_LOSS };
  const manifest: SliceManifest = { ...manifestContent, digest: catalogDigest(manifestContent) };
  // The export boundary, made mechanical: an unsellable manifest yields no
  // records at all. The description survives so a reader can see what the
  // extract would have been; the bytes do not, so nothing downstream can ship
  // them by declining to read the readiness.
  if (manifest.readiness !== 'SELLABLE') {
    return { manifest, records: null, because: `Described and not cut. ${because}` };
  }
  return { manifest, records, excluded: all.length - records.length };
}

/** Convenience for a caller with no store access, which is every caller today. */
export function gradeFrom(admitted: AdmittedCount): AdmissionGrade {
  void admitted;
  return 'UNKNOWN';
}

export const CATALOG_LOSS = [
  'A manifest is the product’s whole surface in a closed catalog, so every claim on it is derived from the records it describes. Nothing here is written beside them.',
  'An aggregate count proves no individual record admission. UNKNOWN does not sell; a caller-supplied ADMITTED grade also stays a preview until exact current verification succeeds.',
  'A correction count is reported at every size; a correction rate is refused below a stated gate, because a frequency from a handful of events will be multiplied by a real portfolio by someone who did not read the caveat.',
  'Coverage is not completeness. The manifest says what the extract carries, never that the extract is everything there is.',
] as const;
