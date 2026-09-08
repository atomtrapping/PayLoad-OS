import { z } from 'zod';
import type { AdmissionCandidate, AdmissionRuling, AdmittedRow } from '@/domain/admission';
import { admit, admittedRow } from '@/domain/admission';
import type { CorpusRecord } from '@/domain/corpus';
import { canonicalJson } from '@/fixtures/digest';
import type { records } from './schema';

export type StoredRecord = typeof records.$inferSelect;
export const ADMISSION_STORAGE_SCHEMA = 'notations.admission-storage.v1';

/** Stable comparison of stored JSON. Non-finite values must never become null silently. */
export function storageJson(value: unknown): string {
  const encoded = JSON.stringify(value, (_key, item: unknown) => {
    if (typeof item === 'number' && !Number.isFinite(item)) throw new Error('ADMISSION_NONFINITE_VALUE');
    return item;
  });
  if (encoded === undefined) throw new Error('ADMISSION_INVALID_DOCUMENT');
  return canonicalJson(JSON.parse(encoded));
}

export function timestamp(value: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}(?::?\d{2})?)$/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error('ADMISSION_INVALID_TIMESTAMP');
  }
  const iso = value.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00').replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  if (!z.iso.datetime({ offset: true }).safeParse(iso).success) throw new Error('ADMISSION_INVALID_TIMESTAMP');
  return new Date(value).toISOString();
}

const text = z.string().min(1);
const time = text.refine((value) => { try { timestamp(value); return true; } catch { return false; } });
/** Coordinate bounds, declared once so the three geometry shapes cannot drift apart. */
const LONGITUDE = z.number().min(-180).max(180);
const LATITUDE = z.number().min(-90).max(90);
const UNCERTAINTY_M = z.number().nonnegative().optional();

const recordSchema = z.object({
  recordId: text, canonicalId: text, firstReleaseId: text,
  subjectId: text, subjectCanonicalId: text, subjectType: text, predicate: text, title: text,
  value: z.union([text, z.number().finite()]), unit: text.optional(), basis: text.optional(),
  uncertainty: z.object({ low: z.number().finite().optional(), high: z.number().finite().optional(), semantics: text, method: text.optional() }).strict().optional(),
  validFrom: time, validTo: time.optional(), knownAt: time, observedAt: time.optional(),
  evidenceClass: z.object({ claimStrength: z.enum(['reported', 'estimated', 'representative', 'derived']), productionClass: z.enum(['asserted', 'computed', 'derived', 'measured', 'unclassified']), interest: z.enum(['disinterested', 'unknown', 'self_reported', 'negotiating_position']) }).strict(),
  provenance: z.object({ sourceId: text, artifactId: text.optional(), contentHash: text.optional(), contentDigest: text.optional(), storageKey: text.optional(), receiptId: text.optional(), producerId: text.optional(), transformId: text.optional() }).strict(),
  // The record contract carries three shapes, not one. A schema that admitted
  // only POINT would reject a cadastral ring the corpus already holds, and
  // rejecting a valid record at the storage boundary is a loss disguised as a
  // check. Whether a shape encloses anything is spatialKey's question, refused
  // there as DEGENERATE_BOUNDARY; this schema fixes the field grammar and the
  // coordinate ranges, and leaves that judgement where it already lives.
  geometry: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('POINT'), datum: z.literal('WGS84'), longitude: LONGITUDE, latitude: LATITUDE, horizontalUncertaintyM: UNCERTAINTY_M }).strict(),
    z.object({ kind: z.literal('POLYGON'), datum: z.literal('WGS84'), ring: z.array(z.object({ longitude: LONGITUDE, latitude: LATITUDE }).strict()), horizontalUncertaintyM: UNCERTAINTY_M }).strict(),
    z.object({ kind: z.literal('EXTENT'), datum: z.literal('WGS84'), west: LONGITUDE, south: LATITUDE, east: LONGITUDE, north: LATITUDE, horizontalUncertaintyM: UNCERTAINTY_M }).strict(),
  ]).optional(),
  visibility: z.enum(['PRIVATE_PREFLIGHT', 'COUNTERPARTY_SHARED', 'PUBLIC_RULING', 'DELAYED_AGGREGATE', 'INTERNAL_ONLY']),
  supersedesRecordId: text.optional(), supersededByRecordId: text.optional(), retractedByRetractionId: text.optional(),
}).strict();

export interface AdmissionStorageDocument {
  schema: typeof ADMISSION_STORAGE_SCHEMA;
  corpusId: string;
  releaseId: string;
  candidate: AdmissionCandidate;
  ruling: AdmissionRuling;
  row: AdmittedRow;
  /** A separately declared complete presentation record; admission alone cannot supply its missing fields. */
  releaseRecord: CorpusRecord | null;
}

function assertEqual(left: unknown, right: unknown): void {
  if (storageJson(left) !== storageJson(right)) throw new Error('ADMISSION_RECORD_BINDING_MISMATCH');
}

/** Validate supplied projection metadata against the admitted assertion, without inventing any. */
export function bindReleaseRecord(record: unknown, candidate: AdmissionCandidate, row: AdmittedRow, releaseId: string): CorpusRecord {
  const parsed = recordSchema.safeParse(record);
  if (!parsed.success) throw new Error('ADMISSION_RELEASE_RECORD_INVALID');
  const value = parsed.data;
  assertEqual([value.recordId, value.subjectId, value.subjectCanonicalId, value.predicate, value.value, value.unit ?? null, value.basis ?? null],
    [row.recordId, row.subjectId, row.subjectCanonicalId, row.predicate, row.value, row.unit, row.basis]);
  assertEqual([timestamp(value.validFrom), value.validTo ? timestamp(value.validTo) : null, timestamp(value.knownAt)],
    [timestamp(row.validFrom), row.validTo ? timestamp(row.validTo) : null, timestamp(row.knownAt)]);
  assertEqual(value.firstReleaseId, releaseId);
  assertEqual(value.evidenceClass, candidate.evidenceClass);
  assertEqual(value.provenance.contentDigest, candidate.provenance.artifactDigest);
  // Canonicalize only the new presentation document. The stored candidate
  // keeps the exact source/operator spelling; existing demonstration bytes
  // and historical release commitments are never rewritten.
  return { ...value, validFrom: timestamp(value.validFrom), knownAt: timestamp(value.knownAt),
    ...(value.validTo ? { validTo: timestamp(value.validTo) } : {}),
    ...(value.observedAt ? { observedAt: timestamp(value.observedAt) } : {}) };
}

/** Validate a database row before it can enter the corpus read interface. */
export function hydrateCorpusRecord(stored: StoredRecord): CorpusRecord {
  if (!stored.data || typeof stored.data !== 'object' || Array.isArray(stored.data)) throw new Error('CORPUS_RECORD_INVALID_DOCUMENT');
  const data = stored.data as Record<string, unknown>;
  let record: CorpusRecord;
  if (stored.provenance === 'DEMONSTRATION') {
    const parsed = recordSchema.safeParse(data);
    if (!parsed.success) throw new Error('CORPUS_DEMONSTRATION_RECORD_INVALID');
    record = parsed.data;
  } else {
    // Legacy partial documents remain in storage. They cannot be silently cast
    // to a record, dropped from the feed, or repaired with invented metadata.
    if (data.schema !== ADMISSION_STORAGE_SCHEMA) throw new Error('CORPUS_ADMISSION_PROJECTION_UNAVAILABLE');
    const document = data as unknown as AdmissionStorageDocument;
    const ruling = admit(document.candidate, document.ruling.authority, document.ruling.ruledAt);
    assertEqual(ruling, document.ruling);
    const { row } = admittedRow(document.candidate, ruling);
    if (!row) throw new Error('CORPUS_ADMISSION_NOT_ADMITTED');
    assertEqual(row, document.row);
    if (document.releaseRecord === null || document.releaseRecord === undefined) throw new Error('CORPUS_ADMISSION_PROJECTION_UNAVAILABLE');
    assertEqual(document.corpusId, stored.corpusId);
    record = bindReleaseRecord(document.releaseRecord, document.candidate, row, document.releaseId);
    assertEqual([stored.provenance, stored.conditions, timestamp(stored.sourceTime), timestamp(stored.acquisitionTime)],
      [row.provenance, row.conditions, timestamp(row.sourceTime), timestamp(row.acquisitionTime)]);
    record.admission = { authority: row.admittedBy, ruledAt: row.ruledAt, outcome: row.outcome as 'ADMITTED' | 'ADMITTED_WITH_CONDITIONS', conditions: [...row.conditions], sourceTime: row.sourceTime, acquisitionTime: row.acquisitionTime, provenance: row.provenance };
  }
  assertEqual([stored.recordId, stored.subjectId, stored.predicate, timestamp(stored.validFrom), stored.validTo ? timestamp(stored.validTo) : null, timestamp(stored.knownAt)],
    [record.recordId, record.subjectId, record.predicate, timestamp(record.validFrom), record.validTo ? timestamp(record.validTo) : null, timestamp(record.knownAt)]);
  // The old demonstration seeder never populated this optional column.
  if (stored.subjectCanonicalId !== null || stored.provenance !== 'DEMONSTRATION') assertEqual(stored.subjectCanonicalId, record.subjectCanonicalId);
  return record;
}
