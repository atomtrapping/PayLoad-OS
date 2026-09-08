/** Actual embedded PostgreSQL transactions; no host database, network or operator history. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';
import type { AdmissionCandidate } from '@/domain/admission';
import type { CorpusRecord } from '@/domain/corpus';
import { currentRelease } from '@/domain/corpus';
import { CARAVAN_CORPUS } from '@/fixtures/caravan/release';
import { recordPayload } from '@/adapter/feedShapes';
import { LiveCorpusSource } from '@/adapter/corpusSource';
import * as schema from './schema';
import { hydrateCorpusRecord, timestamp } from './recordStorage';

const database = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('./index', () => ({ get db() { return database.current; } }));
import { admitRecords } from './admitRecords';

let client: PGlite;
let db: ReturnType<typeof drizzle<typeof schema>>;
let scenario = 0;
const corpus = CARAVAN_CORPUS;
const release = currentRelease(corpus);
const baseRecord = corpus.records[0];
const AUTHORITY = 'test:internal-steward';
const RULED_AT = release.knownAt;

function projection(id = 'record-one'): CorpusRecord {
  return { ...structuredClone(baseRecord), recordId: id, canonicalId: `notation://record/test/${id}`, firstReleaseId: release.releaseId };
}

function candidate(record = projection(), change: Partial<AdmissionCandidate> = {}): AdmissionCandidate {
  return {
    candidateId: `candidate-${record.recordId}`, buildId: 'build-test', recordId: record.recordId,
    subjectCanonicalId: record.subjectCanonicalId,
    assertion: { subjectId: record.subjectId, predicate: record.predicate, value: record.value, unit: record.unit, basis: record.basis },
    origin: 'MEASURED', evidenceClass: record.evidenceClass,
    provenance: { artifactDigest: record.provenance.contentDigest!, capturedAt: record.knownAt },
    provenanceClass: 'LIVE_CAPTURE', sourceTime: record.knownAt,
    validFrom: record.validFrom, knownAt: record.knownAt, conditions: [], rightsDecision: 'PERMITTED', ...change,
  };
}

function request(candidates: AdmissionCandidate[] = [candidate()], releaseRecords: CorpusRecord[] | undefined = [projection()]) {
  return { corpusId: corpus.corpusId, releaseId: release.releaseId, authority: AUTHORITY, ruledAt: RULED_AT, candidates, releaseRecords };
}

beforeAll(async () => { client = new PGlite(); await client.waitReady; });
afterAll(async () => { await client?.close(); });
beforeEach(async () => {
  // Each case gets a new private, in-memory schema. Nothing is deleted and no
  // persistent or production database can be selected by this test.
  scenario += 1;
  await client.exec(`CREATE SCHEMA scenario_${scenario}; SET search_path TO scenario_${scenario};
    CREATE TABLE corpora (corpus_id text PRIMARY KEY, domain text NOT NULL, title text NOT NULL, description text NOT NULL, data jsonb NOT NULL);
    CREATE TABLE releases (release_id text PRIMARY KEY, corpus_id text NOT NULL REFERENCES corpora(corpus_id), status text NOT NULL, known_at timestamptz NOT NULL, data jsonb NOT NULL);
    CREATE TABLE records (record_id text PRIMARY KEY, corpus_id text NOT NULL REFERENCES corpora(corpus_id), subject_id text NOT NULL, predicate text NOT NULL, valid_from timestamptz NOT NULL, valid_to timestamptz, known_at timestamptz NOT NULL, source_time timestamptz NOT NULL, acquisition_time timestamptz NOT NULL, provenance text NOT NULL, subject_canonical_id text, conditions jsonb NOT NULL DEFAULT '[]', data jsonb NOT NULL);
    CREATE TABLE admission_ruling (ruling_id text PRIMARY KEY, candidate_id text NOT NULL, record_id text NOT NULL, outcome text NOT NULL, authority text NOT NULL, ruled_at timestamptz NOT NULL, data jsonb NOT NULL);
    CREATE TABLE record_ancestry (record_id text PRIMARY KEY, release_id text NOT NULL, candidate_id text NOT NULL, build_id text, ruled_at timestamptz NOT NULL, authority text NOT NULL);
    CREATE TABLE retractions (retraction_id text PRIMARY KEY, corpus_id text NOT NULL REFERENCES corpora(corpus_id), issued_at timestamptz NOT NULL, data jsonb NOT NULL);
  `);
  db = drizzle(client, { schema });
  database.current = db;
  const { records: _records, releases: _releases, retractions: _retractions, ...corpusData } = corpus;
  void _records; void _releases; void _retractions;
  await db.insert(schema.corpora).values({ corpusId: corpus.corpusId, domain: corpus.domain, title: corpus.title, description: corpus.description, data: corpusData });
  await db.insert(schema.releases).values({ releaseId: release.releaseId, corpusId: corpus.corpusId, status: release.status, knownAt: release.knownAt, data: { ...release, certification: { ...release.certification, status: 'CANDIDATE' } } });
});

describe('admission persistence through real SQL and the live corpus adapter', () => {
  it('reloads a complete admitted record and its evidence, clocks and conditions', async () => {
    const declared = candidate(projection(), { conditions: ['Internal review only.'] });
    const result = await admitRecords(request([declared]));
    expect(result.inserted).toEqual(['record-one']);
    expect(result.existing).toEqual([]);
    expect(result.refused).toEqual([]);
    const source = new LiveCorpusSource();
    const reloaded = await source.getCorpus(corpus.corpusId);
    expect(reloaded?.records).toHaveLength(1);
    const expected = projection();
    expect(reloaded!.records[0]).toMatchObject({ ...expected, validFrom: timestamp(expected.validFrom), knownAt: timestamp(expected.knownAt), ...(expected.observedAt ? { observedAt: timestamp(expected.observedAt) } : {}), admission: { conditions: ['Internal review only.'], outcome: 'ADMITTED_WITH_CONDITIONS', authority: AUTHORITY, sourceTime: declared.sourceTime, acquisitionTime: declared.provenance.capturedAt } });
    const served = await source.records(release.releaseId, 'COUNTERPARTY_SHARED');
    expect(served?.records[0].recordId).toBe('record-one');
    expect(recordPayload(served!.records[0]).admission?.conditions).toEqual(['Internal review only.']);
  });

  it('verifies identical retries without counting existing rows as new writes', async () => {
    await admitRecords(request());
    const before = await db.select().from(schema.records);
    const retry = await admitRecords(request());
    expect(retry.inserted).toEqual([]);
    expect(retry.existing).toEqual(['record-one']);
    expect(await db.select().from(schema.records)).toEqual(before);
    expect(await db.select().from(schema.admissionRulings)).toHaveLength(1);
    expect(await db.select().from(schema.recordAncestry)).toHaveLength(1);
  });

  it('refuses changed content under an existing identity and rolls back other writes', async () => {
    await admitRecords(request());
    const changed = { ...projection(), value: 9876 };
    const extra = projection('record-zero');
    await expect(admitRecords(request([candidate(extra), candidate(changed)], [extra, changed]))).rejects.toThrow('ADMISSION_WRITE_CONFLICT');
    const rows = await db.select().from(schema.records);
    expect(rows).toHaveLength(1);
    expect(hydrateCorpusRecord(rows[0]).value).toBe(projection().value);
    expect(await db.select().from(schema.admissionRulings)).toHaveLength(1);
    expect(await db.select().from(schema.recordAncestry)).toHaveLength(1);
  });

  it('refuses a different release binding under a retained record identity', async () => {
    await admitRecords(request());
    const otherRelease = { ...release, releaseId: 'release-two' };
    await db.insert(schema.releases).values({ releaseId: otherRelease.releaseId, corpusId: corpus.corpusId, status: 'CURRENT', knownAt: release.knownAt, data: otherRelease });
    await expect(admitRecords({ ...request(), releaseId: 'release-two', releaseRecords: [{ ...projection(), firstReleaseId: 'release-two' }] })).rejects.toThrow('ADMISSION_WRITE_CONFLICT');
    expect(await db.select().from(schema.recordAncestry)).toHaveLength(1);
  });

  it('retains refusal rulings without a canonical row or ancestry', async () => {
    const result = await admitRecords(request([candidate(projection(), { rightsDecision: 'UNDECIDED' })], []));
    expect(result.admitted).toEqual([]);
    expect(result.inserted).toEqual([]);
    expect(result.refused).toHaveLength(1);
    expect(await db.select().from(schema.records)).toEqual([]);
    expect(await db.select().from(schema.recordAncestry)).toEqual([]);
    expect(await db.select().from(schema.admissionRulings)).toHaveLength(1);
  });

  it('keeps admission evidence when projection metadata is absent and refuses to fabricate a feed record', async () => {
    const result = await admitRecords({ ...request(), releaseRecords: undefined });
    expect(result.inserted).toHaveLength(1);
    const [stored] = await db.select().from(schema.records);
    expect(stored.data).toMatchObject({ schema: 'notations.admission-storage.v1', candidate: { recordId: 'record-one' }, releaseRecord: null });
    await expect(new LiveCorpusSource().getCorpus(corpus.corpusId)).rejects.toThrow('CORPUS_ADMISSION_PROJECTION_UNAVAILABLE');
  });

  it('refuses unrelated or changed release projection values before inserting anything', async () => {
    await expect(admitRecords(request([candidate()], [{ ...projection(), value: 9876 }]))).rejects.toThrow('ADMISSION_RECORD_BINDING_MISMATCH');
    expect(await db.select().from(schema.records)).toEqual([]);
    expect(await db.select().from(schema.admissionRulings)).toEqual([]);
  });

  it('refuses an absent target release before writing rulings', async () => {
    await expect(admitRecords({ ...request(), releaseId: 'absent', releaseRecords: [{ ...projection(), firstReleaseId: 'absent' }] })).rejects.toThrow('ADMISSION_RELEASE_TARGET_MISMATCH');
    expect(await db.select().from(schema.admissionRulings)).toEqual([]);
  });

  it('does not backfill missing ancestry in damaged history', async () => {
    // Deliberately incomplete in-memory row, constructed as an integrity fixture.
    const c = candidate();
    await db.insert(schema.records).values({ recordId: c.recordId, corpusId: corpus.corpusId, subjectId: c.assertion!.subjectId!, predicate: c.assertion!.predicate!, validFrom: c.validFrom!, knownAt: c.knownAt!, sourceTime: c.sourceTime!, acquisitionTime: c.provenance.capturedAt!, provenance: 'LIVE_CAPTURE', subjectCanonicalId: c.subjectCanonicalId, conditions: [], data: { value: c.assertion!.value } });
    await expect(admitRecords(request())).rejects.toThrow('ADMISSION_WRITE_INCOMPLETE_HISTORY');
    expect(await db.select().from(schema.admissionRulings)).toEqual([]);
    expect(await db.select().from(schema.recordAncestry)).toEqual([]);
  });

  it('preserves the existing demonstration seeder shape without promoting it', async () => {
    await db.insert(schema.records).values({ recordId: baseRecord.recordId, corpusId: corpus.corpusId, subjectId: baseRecord.subjectId, predicate: baseRecord.predicate, validFrom: baseRecord.validFrom, validTo: baseRecord.validTo ?? null, knownAt: baseRecord.knownAt, sourceTime: baseRecord.knownAt, acquisitionTime: baseRecord.knownAt, provenance: 'DEMONSTRATION', data: baseRecord });
    const source = new LiveCorpusSource();
    const reloaded = await source.getCorpus(corpus.corpusId);
    expect(reloaded?.records).toEqual([baseRecord]);
    expect((await source.admittedRecords()).count).toBe(0);
    expect(recordPayload(baseRecord)).not.toHaveProperty('admission');
  });

  it('detects column/document disagreement on reload', async () => {
    await admitRecords(request());
    const [stored] = await db.select().from(schema.records);
    expect(() => hydrateCorpusRecord({ ...stored, predicate: 'different.claim' })).toThrow('ADMISSION_RECORD_BINDING_MISMATCH');
    expect(() => hydrateCorpusRecord({ ...stored, conditions: ['condition not in ruling'] })).toThrow('ADMISSION_RECORD_BINDING_MISMATCH');
  });

  it('refuses a ruling before the candidate became known, without retaining any part of the batch', async () => {
    const early = new Date(Date.parse(candidate().knownAt!) - 1).toISOString();
    await expect(admitRecords({ ...request(), ruledAt: early })).rejects.toThrow('ADMISSION_RULING_PRECEDES_EVIDENCE');
    expect(await db.select().from(schema.records)).toEqual([]);
    expect(await db.select().from(schema.admissionRulings)).toEqual([]);
    expect(await db.select().from(schema.recordAncestry)).toEqual([]);
  });

  it('refuses a ruling before capture even when the candidate would otherwise be refused', async () => {
    const futureCapture = new Date(Date.parse(RULED_AT) + 1).toISOString();
    const changed = candidate(projection(), { provenance: { artifactDigest: candidate().provenance.artifactDigest, capturedAt: futureCapture } });
    await expect(admitRecords(request([changed], []))).rejects.toThrow('ADMISSION_RULING_PRECEDES_EVIDENCE');
    expect(await db.select().from(schema.admissionRulings)).toEqual([]);
  });

  it('refuses an admission act later than the target release cutoff atomically', async () => {
    const late = new Date(Date.parse(release.knownAt) + 1).toISOString();
    await expect(admitRecords({ ...request(), ruledAt: late })).rejects.toThrow('ADMISSION_RULING_AFTER_RELEASE_CUTOFF');
    expect(await db.select().from(schema.records)).toEqual([]);
    expect(await db.select().from(schema.admissionRulings)).toEqual([]);
    expect(await db.select().from(schema.recordAncestry)).toEqual([]);
  });

  it.each(['CERTIFIED', 'WITHDRAWN'])('refuses new rows in a %s release', async (status) => {
    await db.update(schema.releases).set({ data: { ...release, certification: { ...release.certification, status } } }).where(eq(schema.releases.releaseId, release.releaseId));
    const before = await db.select().from(schema.releases);
    await expect(admitRecords(request())).rejects.toThrow('ADMISSION_RELEASE_SEALED');
    expect(await db.select().from(schema.releases)).toEqual(before);
    expect(await db.select().from(schema.records)).toEqual([]);
    expect(await db.select().from(schema.admissionRulings)).toEqual([]);
  });

  it('allows only exact readback of existing rows after the release is sealed', async () => {
    await admitRecords(request());
    await db.update(schema.releases).set({ data: release }).where(eq(schema.releases.releaseId, release.releaseId));
    const before = await db.select().from(schema.records);
    expect(await admitRecords(request())).toMatchObject({ inserted: [], existing: ['record-one'] });
    const extra = projection('record-two');
    await expect(admitRecords(request([candidate(extra)], [extra]))).rejects.toThrow('ADMISSION_RELEASE_SEALED');
    expect(await db.select().from(schema.records)).toEqual(before);
    expect(await db.select().from(schema.admissionRulings)).toHaveLength(1);
  });

  it('refuses a backdated insert into an open target that would change an older sealed release', async () => {
    const previousCutoff = new Date(Date.parse(release.knownAt) - 1000).toISOString();
    const sealed = { ...release, releaseId: 'earlier-sealed', knownAt: previousCutoff, status: 'SUPERSEDED' as const };
    await db.insert(schema.releases).values({ releaseId: sealed.releaseId, corpusId: corpus.corpusId, status: sealed.status, knownAt: sealed.knownAt, data: sealed });
    const sealedBefore = await db.select().from(schema.releases).where(eq(schema.releases.releaseId, sealed.releaseId));
    await expect(admitRecords(request())).rejects.toThrow('ADMISSION_WOULD_CHANGE_SEALED_RELEASE');
    expect(await db.select().from(schema.records)).toEqual([]);
    expect(await db.select().from(schema.admissionRulings)).toEqual([]);
    // A new knowledge stamp after the sealed cutoff has no effect on that vintage.
    const newer = { ...projection(), knownAt: release.knownAt };
    expect(await admitRecords(request([candidate(newer)], [newer]))).toMatchObject({ inserted: ['record-one'] });
    expect((await new LiveCorpusSource().records(sealed.releaseId, 'COUNTERPARTY_SHARED'))?.records).toEqual([]);
    expect(await db.select().from(schema.releases).where(eq(schema.releases.releaseId, sealed.releaseId))).toEqual(sealedBefore);
  });

  it('normalizes an offset-equivalent projection without losing a record at the UTC release cutoff', async () => {
    const offset = new Date(Date.parse(release.knownAt) - 4 * 60 * 60 * 1000).toISOString().replace('Z', '-04:00');
    const declared = { ...projection(), knownAt: offset };
    await admitRecords(request([candidate(declared)], [declared]));
    const loaded = await new LiveCorpusSource().records(release.releaseId, 'COUNTERPARTY_SHARED');
    expect(loaded?.records).toHaveLength(1);
    expect(loaded!.records[0].knownAt).toBe(timestamp(release.knownAt));
    const [stored] = await db.select().from(schema.records);
    expect(stored.data).toMatchObject({ candidate: { knownAt: offset }, releaseRecord: { knownAt: timestamp(release.knownAt) } });
  });
});
