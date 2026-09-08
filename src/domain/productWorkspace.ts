import {
  deliverableRecords, queryAsOf, recordStatusAt, releaseById,
  type AsOfQuery, type AsOfRefusal, type Corpus, type CorpusRecord, type CorpusRelease,
  type RecordStatus, type RightsSchedule,
} from './corpus';

export const PRODUCT_DESKS = {
  LANDSHARK: { href: '/landshark', title: 'Landshark', activity: 'Parcel inquiry', primaryPredicate: 'area.cadastral', boundary: 'Cadastral area is not buildable area. A published centroid is not a parcel boundary; a withdrawn entitlement record is not a refused application.' },
  TRADEWIND: { href: '/tradewind', title: 'Tradewind', activity: 'Market inquiry', primaryPredicate: 'price.settlement', boundary: 'Published settlements and stated exposures are not current quotes, valuations or trading instructions. No orders or principal-capital operations are available here.' },
} as const;
export type ProductDeskDomain = keyof typeof PRODUCT_DESKS;
export type WorkspaceParams = Record<string, string | string[] | undefined>;
export type WorkspaceRecord = { record: CorpusRecord; status: RecordStatus; rights: RightsSchedule };
export interface WorkspaceReading {
  releaseId: string;
  query: AsOfQuery;
  boundedBy: 'CORPUS_KNOWLEDGE_TIME' | 'SOURCE_TIME';
  answer: WorkspaceRecord | null;
  refusal: { code: AsOfRefusal['code']; reason: string } | null;
}
export interface ProductWorkspace {
  schema: 'notations.product-inquiry.v1';
  fixtureOnly: boolean;
  domain: ProductDeskDomain;
  corpus: { corpusId: string; title: string; description: string };
  releases: Array<Pick<CorpusRelease, 'releaseId' | 'knownAt' | 'status'>>;
  release: Pick<CorpusRelease, 'releaseId' | 'knownAt' | 'releaseDigest' | 'coverage'>;
  records: WorkspaceRecord[];
  withheld: number;
  reading: WorkspaceReading | null;
  previous: WorkspaceReading | null;
  comparison: 'SAME_RECORD' | 'DIFFERENT_RECORD' | 'UNRESOLVED' | 'NO_PREVIOUS_RELEASE';
}
export class ProductWorkspaceError extends Error {
  constructor(readonly code: 'INVALID_QUERY' | 'CORPUS_NOT_AVAILABLE' | 'RELEASE_NOT_AVAILABLE' | 'RECORD_NOT_AVAILABLE') {
    super(code);
  }
}

/** Shared input contract for the HTML desk and its JSON interface. */
export function workspaceParam(params: WorkspaceParams, key: string): string | undefined {
  const value = params[key];
  if (Array.isArray(value) || (value !== undefined && (!value.trim() || value.length > 256 || /[\u0000-\u001f\u007f]/.test(value)))) throw new ProductWorkspaceError('INVALID_QUERY');
  return value;
}

function instant(value: string): string {
  const parts = /^(\d{4}-\d\d-\d\dT\d\d:\d\d)(?::(\d\d)(?:\.(\d{1,3}))?)?Z?$/.exec(value);
  if (!parts) throw new ProductWorkspaceError('INVALID_QUERY');
  const utc = `${parts[1]}:${parts[2] ?? '00'}.${(parts[3] ?? '').padEnd(3, '0')}Z`;
  if (!Number.isFinite(Date.parse(utc))) throw new ProductWorkspaceError('INVALID_QUERY');
  const normalized = new Date(utc).toISOString();
  if (normalized !== utc) throw new ProductWorkspaceError('INVALID_QUERY');
  return normalized;
}

const REFUSALS: Record<AsOfRefusal['code'], string> = {
  NO_RECORD: 'No answer is available for this subject, field and knowledge time in this release. This does not establish that the physical subject or condition is absent.',
  NO_IDENTITY_LINK: 'The required identity link is not available. Similarity does not establish identity.',
  RETRACTED: 'Support for the requested record was withdrawn by this knowledge time. This is not an adverse finding about the subject.',
  OUTSIDE_VALIDITY: 'No returned record describes this world time. Choose a time inside a stated validity interval.',
  NOT_DELIVERABLE: 'This view cannot deliver the answer under its source-use and visibility rules. Restricted values and identities are not returned.',
  QUESTION_NOT_ANSWERABLE: 'The corpus does not carry the source-publication clock required by this question. Ask what this system held instead.',
};

/** Only delivered records cross the desk boundary; never pass a raw Corpus to a client. */
function viewAt(corpus: Corpus, release: CorpusRelease, at: string) {
  const delivered = deliverableRecords(corpus, release, 'COUNTERPARTY_SHARED');
  const readable = delivered.records.filter((record) => Date.parse(record.knownAt) <= Date.parse(at));
  const ids = new Set(readable.map((record) => record.recordId));
  const retractions = new Set(corpus.retractions.filter((event) =>
    (event.visibility === 'PUBLIC_RULING' || event.visibility === 'COUNTERPARTY_SHARED') &&
    Date.parse(event.issuedAt) <= Date.parse(at) && event.affectedRecordIds.some((id) => ids.has(id)),
  ).map((event) => event.retractionId));
  const rows = readable.map((original): WorkspaceRecord => {
    const record = { ...original };
    // Keep a hidden or later history target out of both JSON and record cards.
    if (!ids.has(record.supersedesRecordId ?? '')) delete record.supersedesRecordId;
    if (!ids.has(record.supersededByRecordId ?? '')) delete record.supersededByRecordId;
    if (!retractions.has(record.retractedByRetractionId ?? '')) delete record.retractedByRetractionId;
    return { record, status: recordStatusAt(corpus, original, at), rights: release.sources.find((s) => s.sourceId === original.provenance.sourceId)! };
  });
  return { rows, ids, withheld: delivered.withheldByRights + delivered.withheldByVisibility };
}

function readAt(corpus: Corpus, release: CorpusRelease, query: AsOfQuery): WorkspaceReading {
  // Evaluate against full history so a withheld replacement cannot resurrect
  // an older claim. Redact only after evaluation, not by changing its evidence.
  const answer = queryAsOf(corpus, release, query, { enforceRights: true, viewer: 'COUNTERPARTY_SHARED' });
  const view = viewAt(corpus, release, answer.query.knownAt);
  const row = answer.record ? view.rows.find((candidate) => candidate.record.recordId === answer.record!.recordId) : undefined;
  const linkAllowed = !answer.identityLink || view.ids.has(answer.identityLink.recordId);
  const refusal = answer.record && (!row || !linkAllowed) ? 'NOT_DELIVERABLE' : answer.refusal?.code;
  return {
    releaseId: release.releaseId, query: answer.query, boundedBy: answer.boundedBy,
    answer: !refusal && row && linkAllowed ? row : null,
    refusal: refusal ? { code: refusal, reason: REFUSALS[refusal] } : null,
  };
}

export function buildProductWorkspace(corpus: Corpus, domain: ProductDeskDomain, params: WorkspaceParams): ProductWorkspace {
  if (corpus.domain !== domain) throw new ProductWorkspaceError('CORPUS_NOT_AVAILABLE');
  const releaseId = workspaceParam(params, 'release');
  const release = releaseId ? releaseById(corpus, releaseId) : corpus.releases.find((r) => r.status === 'CURRENT');
  if (!release) throw new ProductWorkspaceError('RELEASE_NOT_AVAILABLE');
  const view = viewAt(corpus, release, release.knownAt);
  const selectedId = workspaceParam(params, 'record');
  const selected = selectedId ? view.rows.find((row) => row.record.recordId === selectedId) : undefined;
  if (selectedId && !selected) throw new ProductWorkspaceError('RECORD_NOT_AVAILABLE');
  const ordered = [...view.rows].sort((a, b) => Date.parse(b.record.knownAt) - Date.parse(a.record.knownAt) || a.record.recordId.localeCompare(b.record.recordId));
  const seed = selected?.record ?? ordered.find((r) => r.record.predicate === PRODUCT_DESKS[domain].primaryPredicate && r.status === 'CURRENT')?.record ?? ordered[0]?.record;
  const question = workspaceParam(params, 'question') ?? 'WHAT_WE_HELD';
  if (question !== 'WHAT_WE_HELD' && question !== 'WHAT_THE_SOURCE_KNEW') throw new ProductWorkspaceError('INVALID_QUERY');
  // Validate supplied clocks even when no record is available to seed a query.
  const validAt = workspaceParam(params, 'validAt');
  const knownAt = workspaceParam(params, 'knownAt');
  const valid = validAt ? instant(validAt) : seed?.validFrom;
  const known = knownAt ? instant(knownAt) : release.knownAt;
  const subject = workspaceParam(params, 'subject') ?? seed?.subjectId;
  const predicate = workspaceParam(params, 'predicate') ?? seed?.predicate;
  const query = subject && predicate && valid ? { subjectId: subject, predicate, validAt: valid, knownAt: known, question } as AsOfQuery : null;
  const releases = [...corpus.releases].sort((a, b) => Date.parse(b.knownAt) - Date.parse(a.knownAt));
  const earlier = releases.find((r) => Date.parse(r.knownAt) < Date.parse(release.knownAt));
  const reading = query ? readAt(corpus, release, query) : null;
  // Compare at one world time. Never show an older source value through the
  // newer release's permission, or mistake a new release for a changed value.
  const previous = query && earlier ? readAt(corpus, earlier, { ...query, knownAt: Date.parse(known) < Date.parse(earlier.knownAt) ? known : earlier.knownAt }) : null;
  return {
    schema: 'notations.product-inquiry.v1', fixtureOnly: corpus.fixture_only, domain,
    corpus: { corpusId: corpus.corpusId, title: corpus.title, description: corpus.description },
    releases: releases.map(({ releaseId, knownAt, status }) => ({ releaseId, knownAt, status })),
    release: { releaseId: release.releaseId, knownAt: release.knownAt, releaseDigest: release.releaseDigest, coverage: release.coverage },
    records: ordered, withheld: view.withheld, reading, previous,
    comparison: !earlier ? 'NO_PREVIOUS_RELEASE' : !reading?.answer || !previous?.answer ? 'UNRESOLVED' : reading.answer.record.recordId === previous.answer.record.recordId ? 'SAME_RECORD' : 'DIFFERENT_RECORD',
  };
}

export function productReadingLink(domain: ProductDeskDomain, releaseId: string, record: CorpusRecord): string {
  return `${PRODUCT_DESKS[domain].href}?${new URLSearchParams({ release: releaseId, record: record.recordId, subject: record.subjectId, predicate: record.predicate, validAt: record.validFrom, question: 'WHAT_WE_HELD' })}`;
}
