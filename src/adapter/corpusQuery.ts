/** Bounded internal read contracts. Pagination does not establish release authority. */
import { z } from 'zod';
import type { Domain, VisibilityClass } from '@/domain/types';
import { deliverableRecords, recordStatusAt, type Corpus, type CorpusRecord, type CorpusRelease, type RecordStatus } from '@/domain/corpus';

export const CORPUS_READ_LIMITS = Object.freeze({ catalog: 256, records: 10_000, releases: 1_000, retractions: 10_000, page: 200 });
export const CONSISTENT_CORPUS_READ = Object.freeze({ isolationLevel: 'repeatable read' as const, accessMode: 'read only' as const });
const identifier = z.string().min(1).max(256).regex(/^[^\u0000-\u001f\u007f]+$/);
const instant = z.iso.datetime({ offset: true }).refine(value => Number.isFinite(Date.parse(value)));
const page = { limit: z.number().int().min(1).max(CORPUS_READ_LIMITS.page).default(100) };
const catalogSchema = z.object({ ...page, afterCorpusId: identifier.optional(), domain: z.enum(['CARAVAN', 'LANDSHARK', 'TRADEWIND']).optional() }).strict();
const recordSchema = z.object({ ...page, afterRecordId: identifier.optional(), subjectId: identifier.optional(), predicate: identifier.optional(), knownAt: instant.optional() }).strict();
export type CorpusCatalogQuery = z.input<typeof catalogSchema>;
export type CorpusRecordQuery = z.input<typeof recordSchema>;
export interface CorpusCatalogEntry { corpusId: string; title: string; description: string; domain: Domain }
export interface CorpusCatalogPage { schema: 'notations.corpus-catalog.v1'; entries: CorpusCatalogEntry[]; nextCursor: string | null }
export interface CorpusRecordPage {
  schema: 'notations.corpus-record-page.v1';
  /** A subsequent page request is a new read; this is not an Iceberg snapshot. */
  consistency: 'PER_REQUEST_ONLY';
  releaseId: string;
  releaseDigest: string;
  boundedBy: string;
  records: Array<{ record: CorpusRecord; status: RecordStatus }>;
  nextCursor: string | null;
}

export function parseCatalogQuery(input: CorpusCatalogQuery = {}) {
  const result = catalogSchema.safeParse(input);
  if (!result.success) throw new Error('CORPUS_QUERY_INVALID');
  return result.data;
}
export function parseRecordQuery(input: CorpusRecordQuery = {}) {
  const result = recordSchema.safeParse(input);
  if (!result.success) throw new Error('CORPUS_QUERY_INVALID');
  return result.data;
}
export function assertReadScope(value: string): void {
  if (!identifier.safeParse(value).success) throw new Error('CORPUS_QUERY_INVALID');
}
export function assertViewer(viewer: VisibilityClass): void {
  // Delayed aggregation needs its own temporal/access policy, not internal access.
  if (!['PUBLIC_RULING', 'COUNTERPARTY_SHARED', 'INTERNAL_ONLY', 'PRIVATE_PREFLIGHT'].includes(viewer)) throw new Error('CORPUS_QUERY_INVALID');
}
export function boundedRows<T>(rows: T[], maximum: number): T[] {
  if (rows.length > maximum) throw new Error('CORPUS_READ_LIMIT_EXCEEDED');
  return rows;
}
export function catalogPage(entries: CorpusCatalogEntry[], limit: number): CorpusCatalogPage {
  return { schema: 'notations.corpus-catalog.v1', entries: entries.slice(0, limit), nextCursor: entries.length > limit ? entries[limit - 1].corpusId : null };
}

/**
 * Keep all bounded history until after rights/status evaluation. Filtering SQL
 * to visible rows first could resurrect a superseded record. This compatibility
 * reader refuses oversized corpora; it is not a distributed analytical scan.
 */
export function releaseRecordPage(corpus: Corpus, release: CorpusRelease, viewer: VisibilityClass, input: CorpusRecordQuery = {}): CorpusRecordPage {
  assertViewer(viewer);
  boundedRows(corpus.records, CORPUS_READ_LIMITS.records);
  boundedRows(corpus.retractions, CORPUS_READ_LIMITS.retractions);
  const query = parseRecordQuery(input);
  const boundedBy = new Date(Math.min(Date.parse(query.knownAt ?? release.knownAt), Date.parse(release.knownAt))).toISOString();
  const readable = deliverableRecords(corpus, release, viewer).records.filter(record => Date.parse(record.knownAt) <= Date.parse(boundedBy));
  const readableIds = new Set(readable.map(record => record.recordId));
  const visible = new Set(viewer === 'PUBLIC_RULING' ? ['PUBLIC_RULING'] : viewer === 'COUNTERPARTY_SHARED' ? ['PUBLIC_RULING', 'COUNTERPARTY_SHARED'] : ['PUBLIC_RULING', 'COUNTERPARTY_SHARED', 'INTERNAL_ONLY', 'PRIVATE_PREFLIGHT']);
  const readableRetractions = new Set(corpus.retractions.filter(event => visible.has(event.visibility) && Date.parse(event.issuedAt) <= Date.parse(boundedBy)).map(event => event.retractionId));
  const selected = readable.filter(record => (!query.subjectId || record.subjectId === query.subjectId) && (!query.predicate || record.predicate === query.predicate) && (!query.afterRecordId || record.recordId > query.afterRecordId))
    .sort((a, b) => a.recordId < b.recordId ? -1 : a.recordId > b.recordId ? 1 : 0);
  const records = selected.slice(0, query.limit).map(record => {
    const safe = { ...record };
    if (!readableIds.has(safe.supersedesRecordId ?? '')) delete safe.supersedesRecordId;
    if (!readableIds.has(safe.supersededByRecordId ?? '')) delete safe.supersededByRecordId;
    if (!readableRetractions.has(safe.retractedByRetractionId ?? '')) delete safe.retractedByRetractionId;
    return { record: safe, status: recordStatusAt(corpus, record, boundedBy) };
  });
  return { schema: 'notations.corpus-record-page.v1', consistency: 'PER_REQUEST_ONLY', releaseId: release.releaseId, releaseDigest: release.releaseDigest, boundedBy, records,
    nextCursor: selected.length > query.limit ? records[records.length - 1].record.recordId : null };
}
