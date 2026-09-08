/** Read-only adapters exercised against a private embedded PostgreSQL database. */
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FIXTURE_CASES } from '@/fixtures';
import { allRulings } from '@/domain/selectors';
import * as schema from '@/db/schema';
import type { ClaimCaseBundle } from '@/domain/types';
import { FixtureCaseSource, LiveCaseSource } from './caseSource';

const database = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@/db', () => ({ get db() { return database.current; } }));

let client: PGlite;
let db: ReturnType<typeof drizzle<typeof schema>>;
let scenario = 0;
const logQuery = vi.fn();
const source = new LiveCaseSource();

beforeAll(async () => { client = new PGlite(); await client.waitReady; });
afterAll(async () => { await client?.close(); });
beforeEach(async () => {
  scenario += 1;
  await client.exec(`CREATE SCHEMA case_read_${scenario}; SET search_path TO case_read_${scenario};
    CREATE TABLE cases (case_id text PRIMARY KEY, status text NOT NULL, last_changed_at timestamptz NOT NULL, data jsonb NOT NULL);
    CREATE TABLE rulings (ruling_id text PRIMARY KEY, case_id text NOT NULL REFERENCES cases(case_id), status text NOT NULL, ruled_at timestamptz NOT NULL, data jsonb NOT NULL);
  `);
  db = drizzle(client, { schema, logger: { logQuery } });
  database.current = db;
  logQuery.mockClear();
});

async function seed(bundle: ClaimCaseBundle, id = bundle.caseId, withHistory = true) {
  const data = { ...structuredClone(bundle), caseId: id };
  await db.insert(schema.cases).values({ caseId: id, status: bundle.status, lastChangedAt: '2026-09-08T00:00:00Z', data });
  if (withHistory) {
    // Deliberately insert ascending revisions; adapter chooses the latest.
    const history = allRulings(bundle).map((ruling) => ({ ...ruling, rulingId: `${id}:${ruling.rulingId}` }));
    if (history.length) await db.insert(schema.rulings).values(history.map((ruling) => ({
      rulingId: ruling.rulingId, caseId: id, status: ruling.status, ruledAt: '2026-09-08T00:00:00Z', data: ruling,
    })));
  }
}

describe('live case source batched readback', () => {
  it('returns no cases with one query and no invented ruling history', async () => {
    expect(await source.listCases()).toEqual([]);
    expect(logQuery).toHaveBeenCalledTimes(1);
  });

  it('lists all cases with two queries instead of rereading each case and ruling history', async () => {
    for (let index = 0; index < 12; index++) await seed(FIXTURE_CASES[0], `batch-${index}`);
    logQuery.mockClear();
    const listed = await source.listCases();
    expect(listed).toHaveLength(12);
    expect(logQuery).toHaveBeenCalledTimes(2);
    expect(logQuery.mock.calls.every(([query]) => /^select /i.test(query))).toBe(true);
    for (const bundle of listed) expect(await source.getCase(bundle.caseId)).toEqual(bundle);
  });

  it('keeps histories attached to their own case and latest revision first', async () => {
    const selected = FIXTURE_CASES.find((bundle) => allRulings(bundle).length > 1)!;
    expect(selected).toBeDefined();
    await seed(selected, 'first');
    await seed(selected, 'second');
    for (const bundle of await source.listCases()) {
      const history = [bundle.currentRuling!, ...bundle.previousRulings];
      expect(history.every((ruling) => ruling.rulingId.startsWith(`${bundle.caseId}:`))).toBe(true);
      expect(history.map((ruling) => ruling.revision)).toEqual(history.map((ruling) => ruling.revision).sort((a, b) => b - a));
      const previous = history[1];
      expect(await source.getRuling(previous.rulingId)).toEqual({ bundle, ruling: previous });
    }
  });

  it('does not substitute a stale embedded ruling when the ruling table is empty', async () => {
    await seed(FIXTURE_CASES[0], 'no-history', false);
    const listed = await source.listCases();
    expect(listed[0].currentRuling).toBeUndefined();
    expect(listed[0].previousRulings).toEqual([]);
    expect(await source.getCase('no-history')).toEqual(listed[0]);
  });

  it('preserves missing references and profile/remediation fixture semantics', async () => {
    expect(await source.getCase('missing')).toBeUndefined();
    expect(await source.getRuling('missing')).toBeUndefined();
    const fixture = new FixtureCaseSource();
    expect(await source.listProfiles()).toEqual(await fixture.listProfiles());
    for (const profile of await fixture.listProfiles()) expect(await source.getProfile(profile.profileId)).toEqual(profile);
    expect(await source.getRemediation('missing')).toBeUndefined();
  });
});
