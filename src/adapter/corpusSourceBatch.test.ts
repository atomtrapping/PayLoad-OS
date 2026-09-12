/** Batch readback uses actual SQL and the existing admission-aware hydration. */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FIXTURE_CORPORA } from '@/fixtures';
import * as schema from '@/db/schema';
import type { Corpus } from '@/domain/corpus';
import { FixtureCorpusSource, LiveCorpusSource } from './corpusSource';
import { CONSISTENT_CORPUS_READ, CORPUS_READ_LIMITS } from './corpusQuery';

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
    expect(logQuery.mock.calls.filter(([query]) => /^select /i.test(query))).toHaveLength(1);
  });

  it('reconstructs every corpus in four reads without cross-domain membership leakage', async () => {
    for (const corpus of FIXTURE_CORPORA) await seed(corpus);
    logQuery.mockClear();
    const listed = await source.listCorpora();
    expect(listed).toHaveLength(FIXTURE_CORPORA.length);
    expect(logQuery.mock.calls.filter(([query]) => /^select /i.test(query))).toHaveLength(4);
    expect(logQuery.mock.calls.map(([query]) => query).join('\n')).toMatch(/repeatable read read only/i);
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

  it('pages the lightweight catalog without reading JSON documents or record history', async () => {
    for (const corpus of FIXTURE_CORPORA) await seed(corpus);
    logQuery.mockClear();
    const first = await source.catalog({ limit: 1 });
    expect(first.entries).toHaveLength(1);
    expect(first.nextCursor).toBe(first.entries[0].corpusId);
    const second = await source.catalog({ limit: 1, afterCorpusId: first.nextCursor! });
    expect(second.entries[0].corpusId).not.toBe(first.entries[0].corpusId);
    for (const [query] of logQuery.mock.calls) {
      expect(query).not.toMatch(/"data"|"records"|"releases"|"retractions"/);
      expect(query).toMatch(/limit \$\d+/);
    }
    expect((await source.catalog({ domain: 'LANDSHARK' })).entries.map(entry => entry.domain)).toEqual(['LANDSHARK']);
  });

  it('refuses release-column/JSON disagreement instead of serving a different clock or status', async () => {
    const corpus = FIXTURE_CORPORA[0];
    await seed(corpus);
    await db.update(schema.releases).set({ knownAt: '2040-01-01T00:00:00Z' }).where(eq(schema.releases.releaseId, corpus.releases[0].releaseId));
    await expect(source.getCorpus(corpus.corpusId)).rejects.toThrow('CORPUS_METADATA_BINDING_MISMATCH');
    await expect(source.listReleases(corpus.corpusId)).rejects.toThrow('CORPUS_METADATA_BINDING_MISMATCH');
  });

  it('refuses corpus-column/JSON disagreement instead of switching identity or domain', async () => {
    const corpus = FIXTURE_CORPORA[0];
    await seed(corpus);
    await db.update(schema.corpora).set({ title: 'unbound title' }).where(eq(schema.corpora.corpusId, corpus.corpusId));
    await expect(source.getCorpus(corpus.corpusId)).rejects.toThrow('CORPUS_METADATA_BINDING_MISMATCH');
  });

  it('refuses retraction-column/JSON disagreement instead of changing withdrawal time', async () => {
    const corpus = FIXTURE_CORPORA.find(entry => entry.retractions.length)!;
    await seed(corpus);
    await db.update(schema.retractions).set({ issuedAt: '2040-01-01T00:00:00Z' }).where(eq(schema.retractions.retractionId, corpus.retractions[0].retractionId));
    await expect(source.getCorpus(corpus.corpusId)).rejects.toThrow('CORPUS_METADATA_BINDING_MISMATCH');
  });

  it('validates bounded queries before executing SQL', async () => {
    await expect(source.catalog({ limit: 201 })).rejects.toThrow('CORPUS_QUERY_INVALID');
    await expect(source.recordPage('release', 'COUNTERPARTY_SHARED', { knownAt: '2026-02-30T00:00:00Z' })).rejects.toThrow('CORPUS_QUERY_INVALID');
    await expect(source.getRelease('')).rejects.toThrow('CORPUS_QUERY_INVALID');
    expect(logQuery).not.toHaveBeenCalled();
  });

  it('returns the same rights-filtered release pages from actual SQL as from the fixture adapter', async () => {
    const fixtures = new FixtureCorpusSource();
    for (const corpus of FIXTURE_CORPORA) {
      await seed(corpus);
      const releaseId = corpus.releases.find(release => release.status === 'CURRENT')!.releaseId;
      expect(await source.recordPage(releaseId, 'COUNTERPARTY_SHARED', { limit: 2 }))
        .toEqual(await fixtures.recordPage(releaseId, 'COUNTERPARTY_SHARED', { limit: 2 }));
    }
    expect(await source.recordPage('missing', 'COUNTERPARTY_SHARED')).toBeUndefined();
  });

  it('includes release ownership lookup in the read-only repeatable-read transaction', async () => {
    const corpus = FIXTURE_CORPORA[0];
    await seed(corpus);
    logQuery.mockClear();
    const transaction = vi.spyOn(db, 'transaction');
    const hit = await source.getRelease(corpus.releases[0].releaseId);
    expect(hit?.release.releaseId).toBe(corpus.releases[0].releaseId);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), CONSISTENT_CORPUS_READ);
    const queries = logQuery.mock.calls.map(([query]) => query as string);
    // PGlite performs BEGIN/COMMIT in its driver; its query logger records the
    // isolation statement and SQL within the transaction, not those wrappers.
    expect(queries[0]).toMatch(/repeatable read read only/i);
    const isolation = queries.findIndex(query => /repeatable read read only/i.test(query));
    const firstSelect = queries.findIndex(query => /^select /i.test(query));
    expect(isolation).toBeGreaterThanOrEqual(0);
    expect(firstSelect).toBeGreaterThan(isolation);
    expect(queries[firstSelect]).toMatch(/from "releases"/i);
    expect(queries.filter(query => /^select /i.test(query))).toHaveLength(5);
  });

  it('refuses oversized compatibility reads rather than silently truncating history', async () => {
    const corpus = { ...FIXTURE_CORPORA[0], releases: [], records: [], retractions: [] };
    await seed(corpus);
    await client.query(`INSERT INTO records (record_id, corpus_id, subject_id, predicate, valid_from, known_at, source_time, acquisition_time, provenance, data)
      SELECT 'large-' || n, $1, 'subject', 'predicate', now(), now(), now(), now(), 'DEMONSTRATION', '{}'::jsonb
      FROM generate_series(1, $2::integer) n`, [corpus.corpusId, CORPUS_READ_LIMITS.records + 1]);
    await expect(source.getCorpus(corpus.corpusId)).rejects.toThrow('CORPUS_READ_LIMIT_EXCEEDED');
    await expect(source.listCorpora()).rejects.toThrow('CORPUS_READ_LIMIT_EXCEEDED');
    expect((await source.catalog()).entries).toHaveLength(1);
  });

  it('applies the additive migration twice with exact ordered index columns and unchanged corpus rows', async () => {
    await seed(FIXTURE_CORPORA[0]);
    const inventory = async () => ({
      corpora: await db.select().from(schema.corpora),
      releases: await db.select().from(schema.releases),
      records: await db.select().from(schema.records),
      retractions: await db.select().from(schema.retractions),
    });
    const before = await inventory();
    const migration = readFileSync('src/db/migrations/0001_corpus_query_indexes.sql', 'utf8');
    await client.exec(migration);
    await client.exec(migration);
    const expected = [
      { name: 'records_corpus_known_idx', table: 'records', columns: ['corpus_id', 'known_at', 'record_id'] },
      { name: 'records_subject_history_idx', table: 'records', columns: ['corpus_id', 'subject_id', 'predicate', 'known_at', 'record_id'] },
      { name: 'releases_corpus_known_idx', table: 'releases', columns: ['corpus_id', 'known_at'] },
      { name: 'retractions_corpus_issued_idx', table: 'retractions', columns: ['corpus_id', 'issued_at'] },
    ];
    const actual = await client.query(`SELECT idx.relname AS name, relation.relname AS table,
      method.amname AS method, definition.indisvalid AS valid, definition.indisready AS ready,
      definition.indisunique AS unique, definition.indnatts AS total_columns, definition.indnkeyatts AS key_columns,
      ARRAY(SELECT pg_get_indexdef(definition.indexrelid, column_number, true)
        FROM generate_series(1, definition.indnatts) column_number) AS columns,
      pg_get_expr(definition.indpred, definition.indrelid) AS predicate
      FROM pg_index definition
      JOIN pg_class idx ON idx.oid=definition.indexrelid
      JOIN pg_class relation ON relation.oid=definition.indrelid
      JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
      JOIN pg_am method ON method.oid=idx.relam
      WHERE namespace.nspname=current_schema() AND idx.relname=ANY($1::text[])
      ORDER BY idx.relname`, [expected.map(index => index.name)]);
    expect(actual.rows).toEqual(expected.map(index => ({ ...index, method: 'btree', valid: true, ready: true,
      unique: false, total_columns: index.columns.length, key_columns: index.columns.length, predicate: null })));
    expect(await inventory()).toEqual(before);
  });
});
