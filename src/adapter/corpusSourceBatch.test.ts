/** Batch readback uses actual SQL and the existing admission-aware hydration. */
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FIXTURE_CORPORA } from '@/fixtures';
import * as schema from '@/db/schema';
import type { Corpus } from '@/domain/corpus';
import { LiveCorpusSource } from './corpusSource';

const database = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@/db', () => ({ get db() { return database.current; } }));

let client: PGlite;
let db: ReturnType<typeof drizzle<typeof schema>>;
let scenario = 0;
const logQuery = vi.fn();
const source = new LiveCorpusSource();

beforeAll(async () => { client = new PGlite(); await client.waitReady; });
afterAll(async () => { await client?.close(); });
beforeEach(async () => {
  scenario += 1;
  await client.exec(`CREATE SCHEMA corpus_read_${scenario}; SET search_path TO corpus_read_${scenario};
    CREATE TABLE corpora (corpus_id text PRIMARY KEY, domain text NOT NULL, title text NOT NULL, description text NOT NULL, data jsonb NOT NULL);
    CREATE TABLE releases (release_id text PRIMARY KEY, corpus_id text NOT NULL REFERENCES corpora(corpus_id), status text NOT NULL, known_at timestamptz NOT NULL, data jsonb NOT NULL);
    CREATE TABLE records (record_id text PRIMARY KEY, corpus_id text NOT NULL REFERENCES corpora(corpus_id), subject_id text NOT NULL, predicate text NOT NULL, valid_from timestamptz NOT NULL, valid_to timestamptz, known_at timestamptz NOT NULL, source_time timestamptz NOT NULL, acquisition_time timestamptz NOT NULL, provenance text NOT NULL, subject_canonical_id text, conditions jsonb NOT NULL DEFAULT '[]', data jsonb NOT NULL);
    CREATE TABLE retractions (retraction_id text PRIMARY KEY, corpus_id text NOT NULL REFERENCES corpora(corpus_id), issued_at timestamptz NOT NULL, data jsonb NOT NULL);
  `);
  db = drizzle(client, { schema, logger: { logQuery } });
  database.current = db;
  logQuery.mockClear();
});

async function seed(corpus: Corpus) {
  await db.insert(schema.corpora).values({ corpusId: corpus.corpusId, domain: corpus.domain, title: corpus.title, description: corpus.description, data: corpus });
  if (corpus.releases.length) await db.insert(schema.releases).values(corpus.releases.map((release) => ({
    releaseId: release.releaseId, corpusId: corpus.corpusId, status: release.status, knownAt: release.knownAt, data: release,
  })));
  if (corpus.records.length) await db.insert(schema.records).values(corpus.records.map((record) => ({
    recordId: record.recordId, corpusId: corpus.corpusId, subjectId: record.subjectId, predicate: record.predicate,
    validFrom: record.validFrom, validTo: record.validTo, knownAt: record.knownAt, sourceTime: record.knownAt,
    acquisitionTime: record.knownAt, provenance: 'DEMONSTRATION', data: record,
  })));
  if (corpus.retractions.length) await db.insert(schema.retractions).values(corpus.retractions.map((retraction) => ({
    retractionId: retraction.retractionId, corpusId: corpus.corpusId, issuedAt: retraction.issuedAt, data: retraction,
  })));
}

describe('live corpus batch reads', () => {
  it('reads an empty catalog once without inferring an admitted count', async () => {
    expect(await source.listCorpora()).toEqual([]);
    expect(logQuery).toHaveBeenCalledTimes(1);
  });

  it('reconstructs every corpus in four reads without cross-domain membership leakage', async () => {
    for (const corpus of FIXTURE_CORPORA) await seed(corpus);
    logQuery.mockClear();
    const listed = await source.listCorpora();
    expect(listed).toHaveLength(FIXTURE_CORPORA.length);
    expect(logQuery).toHaveBeenCalledTimes(4);
    expect(logQuery.mock.calls.every(([query]) => /^select /i.test(query))).toBe(true);
    for (const corpus of listed) {
      expect(corpus).toEqual(await source.getCorpus(corpus.corpusId));
      const original = FIXTURE_CORPORA.find((entry) => entry.corpusId === corpus.corpusId)!;
      // Neither database path promises fixture-array insertion order.
      const byId = (a: { recordId: string }, b: { recordId: string }) => a.recordId.localeCompare(b.recordId);
      expect([...corpus.records].sort(byId)).toEqual([...original.records].sort(byId));
      expect(corpus.retractions).toEqual(original.retractions);
      expect(corpus.releases).toEqual([...original.releases].sort((a, b) => a.knownAt < b.knownAt ? -1 : 1));
      expect(await source.listReleases(corpus.corpusId)).toEqual([...corpus.releases].sort((a, b) => a.knownAt < b.knownAt ? 1 : -1));
    }
  });

  it('preserves empty component sets and missing lookups', async () => {
    const empty = { ...FIXTURE_CORPORA[0], releases: [], records: [], retractions: [] };
    await seed(empty);
    expect(await source.listCorpora()).toEqual([empty]);
    expect(await source.getCorpus('missing')).toBeUndefined();
    expect(await source.getRelease('missing')).toBeUndefined();
    expect(await source.listReleases('missing')).toEqual([]);
  });

  it('fails the batch on an unprojectable admission instead of silently dropping the record', async () => {
    const corpus = FIXTURE_CORPORA[0];
    await seed(corpus);
    await db.update(schema.records).set({ provenance: 'LIVE_CAPTURE', data: {} }).where(eq(schema.records.recordId, corpus.records[0].recordId));
    await expect(source.listCorpora()).rejects.toThrow('CORPUS_ADMISSION_PROJECTION_UNAVAILABLE');
    await expect(source.getCorpus(corpus.corpusId)).rejects.toThrow('CORPUS_ADMISSION_PROJECTION_UNAVAILABLE');
  });
});
