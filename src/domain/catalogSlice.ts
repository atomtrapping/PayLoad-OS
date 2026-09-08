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
 * It may not assert that its records were admitted. A `Corpus` value carries no
 * admission status — that lives at the write boundary — so `buildSlice` takes
 * the grade as a required argument typed the same three ways
 * `compressionAvailable` takes its count. A caller with no store access says
 * UNKNOWN, and UNKNOWN is not a pass: an unchecked grade is not an admitted
 * one, exactly as an unreadable count is not a zero.
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
import { createHash } from 'node:crypto';
import { canonicalJson } from '@/fixtures/digest';
import type { Corpus, CorpusRecord, CorpusRelease, Retraction } from './corpus';
import { releaseRecords, releaseRetractions } from './corpus';
import type { AdmittedCount } from './compression';
import type { ISODateTime } from './types';

export const SLICE_METHOD = 'notationsos.catalog-slice.v1';

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
  release: { releaseId: string; knowledgeCutoff: ISODateTime };
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

/**
 * One canonicalization, and it is the corpus's.
 *
 * This used to be `JSON.stringify(value)` — key-order dependent. Two objects
 * with the same content, built by different code paths or by the same path
 * after a field was moved, digest differently. That is not a content address;
 * it is a hash of one serializer's traversal order. Six other modules already
 * hash through `canonicalJson`, which sorts keys recursively and drops
 * undefined, so a repository whose thesis is reproducibility was running two
 * digest disciplines at once.
 */
const digestOf = (value: unknown): string =>
  `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;

const SLICE_LOSS = [
  'Coverage is a fact about this extract and not a claim about the world. It says which predicates are carried and how many records of each; it does not say those are all that exist.',
  'A manifest states what the records are, never that they are true. Every record still carries its own evidence class, and a slice of asserted values is a slice of assertions however many there are.',
  'The correction summary counts what this release has issued. It is not a forecast, and below the stated gate it is not a rate either.',
  'An extract has a vintage. A buyer holding it after the next release holds an answer that was correct as of its cutoff, which is what the cutoff is for.',
  'An unsellable slice is described and not cut. This manifest comes back so a reader can see what the extract would have been; the records do not, because a readiness a caller can decline to read is advice rather than a boundary.',
] as const;

/** How a grade decides whether the extract may be sold, and why. */
function readinessOf(grade: AdmissionGrade, records: number): { readiness: SaleReadiness; because: string } {
  if (records === 0) {
    return { readiness: 'NOT_FOR_SALE', because: 'The bounds selected no records. An empty extract is not a product, and shipping one would sell a manifest describing nothing.' };
  }
  switch (grade) {
    case 'ADMITTED':
      return { readiness: 'SELLABLE', because: `${records} admitted ${records === 1 ? 'record' : 'records'}: each crossed the gate, and the manifest below is derived from them rather than written about them.` };
    case 'DEMONSTRATION':
      return { readiness: 'NOT_FOR_SALE', because: `${records} ${records === 1 ? 'record' : 'records'}, all DEMONSTRATION. These were seeded so the pages have something to show; none crossed the admission gate, and selling them would be selling the demonstration as the corpus.` };
    case 'UNKNOWN':
      return { readiness: 'NOT_FOR_SALE', because: `${records} ${records === 1 ? 'record' : 'records'} of an unchecked grade. Nothing here read the admission status, and an unchecked grade is not an admitted one — the same reason an unreadable count is not a zero.` };
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
 * The grade is required rather than defaulted, so a call site that gains store
 * access has to change the argument to compile — the same anti-rot device the
 * compression derivation uses, and for the same reason: a default would let a
 * page report a fact it never checked.
 */
export function buildSlice(corpus: Corpus, spec: SliceSpec, admissionGrade: AdmissionGrade): SliceResult {
  const release: CorpusRelease | undefined = corpus.releases.find((entry) => entry.releaseId === spec.releaseId);
  if (!release) {
    return { manifest: null, records: null, because: `No release ${spec.releaseId} in this corpus, so there is nothing to extract from. A slice names its release because an extract without one has no cutoff and therefore no vintage.` };
  }

  const all = releaseRecords(corpus, release);
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
  const evidence = [...evidenceCounts.values()].sort((a, b) => (b.records - a.records) || (a.productionClass < b.productionClass ? -1 : 1));

  const inSlice = new Set(records.map((record) => record.recordId));
  const corrections = summariseCorrections(releaseRetractions(corpus, release), records.length, inSlice);
  const { readiness, because } = readinessOf(admissionGrade, records.length);

  const body = {
    schema: SLICE_METHOD as typeof SLICE_METHOD,
    sliceId: spec.sliceId,
    title: spec.title,
    question: spec.question,
    release: { releaseId: release.releaseId, knowledgeCutoff: release.knownAt },
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
  };

  const manifest: SliceManifest = { ...body, digest: digestOf(body), because, loss: SLICE_LOSS };
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
  if (admitted === 'UNKNOWN') return 'UNKNOWN';
  return admitted > 0 ? 'ADMITTED' : 'DEMONSTRATION';
}

export const CATALOG_LOSS = [
  'A manifest is the product’s whole surface in a closed catalog, so every claim on it is derived from the records it describes. Nothing here is written beside them.',
  'The admission grade is required and three-valued. A caller that cannot read the store says UNKNOWN, and UNKNOWN does not sell: an unchecked grade is not an admitted one.',
  'A correction count is reported at every size; a correction rate is refused below a stated gate, because a frequency from a handful of events will be multiplied by a real portfolio by someone who did not read the caveat.',
  'Coverage is not completeness. The manifest says what the extract carries, never that the extract is everything there is.',
] as const;
