/**
 * The corpus adapter: the product's read interface.
 */
import type { VisibilityClass } from '@/domain/types';
import type { AdmittedCount } from '@/domain/compression';
import type { AsOfAnswer, AsOfQuery, Corpus, CorpusRecord, CorpusRelease, Retraction } from '@/domain/corpus';
import { currentRelease, deliverableRecords, queryAsOf, releaseById, retractionsSince } from '@/domain/corpus';
import { FIXTURE_CORPORA } from '@/fixtures';
import { and, asc, count, eq, gt } from 'drizzle-orm';
import { databaseConfigured } from '@/db/config';
import { hydrateCorpusRecord, storageJson, timestamp, type StoredRecord } from '@/db/recordStorage';
import type { corpora as storedCorpora, releases as storedReleases, retractions as storedRetractions } from '@/db/schema';
import { assertReadScope, assertViewer, boundedRows, catalogPage, CONSISTENT_CORPUS_READ, CORPUS_READ_LIMITS, parseCatalogQuery, parseRecordQuery, releaseRecordPage,
  type CorpusCatalogPage, type CorpusCatalogQuery, type CorpusRecordPage, type CorpusRecordQuery } from './corpusQuery';

/**
 * How many records have crossed the admission gate, and how that was learned.
 *
 * The count is `'UNKNOWN'` whenever it could not be read, and never a zero
 * standing in for one — SILENCE-IS-NOT-ZERO applied to the system's report
 * about itself. `because` carries which of the two happened, so a reader can
 * tell "nothing has been admitted" from "I could not check", which are
 * different facts and only one of them is a claim about the world.
 */
export interface AdmittedReading {
  count: AdmittedCount;
  because: string;
}

/**
 * Provenance values the admission gate stamps. `DEMONSTRATION` is deliberately
 * absent: the seeder writes it and the gate cannot, so the committed fixtures
 * are mechanically excluded from every admitted count by the column itself
 * rather than by a caller remembering to filter.
 */
import { ADMITTED_PROVENANCE } from '@/domain/admission';
export { ADMITTED_PROVENANCE };

/**
 * What the admission gate has ruled, read back.
 *
 * `admitRecords` writes a row to `admission_ruling` for every ruling it makes,
 * refusals included, in the same transaction as the record it admitted. That
 * table had no reader anywhere in the system: the gate's own account of what it
 * decided was written and never looked at, which makes it a log rather than a
 * ledger. This reading is the reader.
 *
 * Every field is `number | 'UNKNOWN'` for the same reason the admitted count is.
 * A store that cannot be reached has an unknown number of rulings in it, and
 * answering zero would say the gate has never refused anything on the strength
 * of a failed connection.
 */
export interface LedgerReading {
  rulings: AdmittedCount;
  /** Rulings by their own outcome word, as the gate wrote it. Empty when unreadable. */
  byOutcome: readonly { outcome: string; rulings: number }[];
  /** Rows in `record_ancestry`: released records that can still name the build that proposed them. */
  ancestry: AdmittedCount;
  because: string;
}

export interface CorpusSource {
  readonly origin: { kind: 'FIXTURE'; label: string } | { kind: 'LIVE'; label: string };
  listCorpora(): Promise<Corpus[]>;
  getCorpus(corpusId: string): Promise<Corpus | undefined>;
  listReleases(corpusId?: string): Promise<CorpusRelease[]>;
  getRelease(releaseId: string): Promise<{ corpus: Corpus; release: CorpusRelease } | undefined>;
  records(releaseId: string, viewer: VisibilityClass): Promise<{ records: CorpusRecord[]; withheldByRights: number; withheldByVisibility: number; withheldReasons: Record<string, number> } | undefined>;
  asOf(releaseId: string, q: AsOfQuery): Promise<AsOfAnswer | undefined>;
  retractions(since: string | undefined, viewer: VisibilityClass): Promise<Retraction[]>;
  /** Derived from the store, never asserted. A source that cannot reach one answers UNKNOWN. */
  admittedRecords(): Promise<AdmittedReading>;
  /** The gate's own record of every ruling it made, admitted and refused alike. */
  admissionLedger(): Promise<LedgerReading>;
  /** Optional for third-party adapters; concrete built-in adapters implement both. */
  catalog?(query?: CorpusCatalogQuery): Promise<CorpusCatalogPage>;
  recordPage?(releaseId: string, viewer: VisibilityClass, query?: CorpusRecordQuery): Promise<CorpusRecordPage | undefined>;
}

function groupCorpusRows<T extends { corpusId: string }>(rows: readonly T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const group = groups.get(row.corpusId) ?? [];
    group.push(row);
    groups.set(row.corpusId, group);
  }
  return groups;
}

type StoredCorpus = typeof storedCorpora.$inferSelect;
type StoredRelease = typeof storedReleases.$inferSelect;
type StoredRetraction = typeof storedRetractions.$inferSelect;

function boundFields(data: unknown, expected: Record<string, unknown>, clocks: readonly string[] = []): Record<string, unknown> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('CORPUS_METADATA_BINDING_MISMATCH');
  const document = data as Record<string, unknown>;
  const normalize = (fields: Record<string, unknown>) => Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, clocks.includes(key) ? timestamp(value as string) : value]));
  if (storageJson(normalize(Object.fromEntries(Object.keys(expected).map(key => [key, document[key]])))) !== storageJson(normalize(expected))) throw new Error('CORPUS_METADATA_BINDING_MISMATCH');
  return document;
}

function storedRelease(row: StoredRelease): CorpusRelease {
  return boundFields(row.data, { releaseId: row.releaseId, corpusId: row.corpusId, status: row.status, knownAt: row.knownAt }, ['knownAt']) as unknown as CorpusRelease;
}

/** Individual and batch reads use the same column/document binding and record hydration. */
function storedCorpus(row: StoredCorpus, releases: readonly StoredRelease[], records: readonly StoredRecord[], retractions: readonly StoredRetraction[]): Corpus {
  const data = boundFields(row.data, { corpusId: row.corpusId, domain: row.domain, title: row.title, description: row.description });
  const rels = releases.map(storedRelease);
  if (rels.some(release => release.corpusId !== row.corpusId || release.domain !== row.domain)) throw new Error('CORPUS_METADATA_BINDING_MISMATCH');
  return {
    ...data,
    releases: rels.sort((a, b) => Date.parse(a.knownAt) - Date.parse(b.knownAt) || a.releaseId.localeCompare(b.releaseId)),
    records: records.map(hydrateCorpusRecord),
    retractions: retractions.map(row => boundFields(row.data, { retractionId: row.retractionId, issuedAt: row.issuedAt }, ['issuedAt'])),
  } as unknown as Corpus;
}

export class FixtureCorpusSource implements CorpusSource {
  readonly origin = { kind: 'FIXTURE', label: 'Demonstration corpus (fixture_only: true)' } as const;

  async catalog(input: CorpusCatalogQuery = {}): Promise<CorpusCatalogPage> {
    const query = parseCatalogQuery(input);
    const entries = FIXTURE_CORPORA.filter(corpus => (!query.domain || corpus.domain === query.domain) && (!query.afterCorpusId || corpus.corpusId > query.afterCorpusId))
      .sort((a, b) => a.corpusId < b.corpusId ? -1 : 1)
      .map(({ corpusId, title, description, domain }) => ({ corpusId, title, description, domain }));
    return catalogPage(entries, query.limit);
  }

  async recordPage(releaseId: string, viewer: VisibilityClass, query: CorpusRecordQuery = {}): Promise<CorpusRecordPage | undefined> {
    assertReadScope(releaseId); assertViewer(viewer); parseRecordQuery(query);
    const hit = await this.getRelease(releaseId);
    return hit ? releaseRecordPage(hit.corpus, hit.release, viewer, query) : undefined;
  }

  /**
   * UNKNOWN, for exactly the reason the admitted count is.
   *
   * It is tempting to answer zero here — no store, so no gate, so surely no
   * rulings. That reasoning is wrong in the same way everywhere it appears:
   * this process not being connected to the admission store says nothing about
   * what is in it. A gate may have ruled a thousand times in a database this
   * process was never pointed at. Zero would be a claim about that store made
   * from a process that cannot see it.
   */
  async admissionLedger(): Promise<LedgerReading> {
    return {
      rulings: 'UNKNOWN',
      byOutcome: [],
      ancestry: 'UNKNOWN',
      because: 'This process reads the committed demonstration corpus and holds no connection to the store the admission gate writes its rulings to. What that gate has ruled is not readable from here, and an unreadable count is not a zero.',
    };
  }

  async listCorpora(): Promise<Corpus[]> {
    return [...FIXTURE_CORPORA];
  }

  async getCorpus(corpusId: string): Promise<Corpus | undefined> {
    return FIXTURE_CORPORA.find((c) => c.corpusId === corpusId);
  }

  async listReleases(corpusId?: string): Promise<CorpusRelease[]> {
    return FIXTURE_CORPORA.filter((c) => !corpusId || c.corpusId === corpusId).flatMap((c) => c.releases).sort((a, b) => (a.knownAt < b.knownAt ? 1 : -1));
  }

  async getRelease(releaseId: string): Promise<{ corpus: Corpus; release: CorpusRelease } | undefined> {
    for (const corpus of FIXTURE_CORPORA) {
      const release = releaseById(corpus, releaseId);
      if (release) return { corpus, release };
    }
    return undefined;
  }

  async records(releaseId: string, viewer: VisibilityClass) {
    const hit = await this.getRelease(releaseId);
    if (!hit) return undefined;
    return deliverableRecords(hit.corpus, hit.release, viewer);
  }

  async asOf(releaseId: string, q: AsOfQuery): Promise<AsOfAnswer | undefined> {
    const hit = await this.getRelease(releaseId);
    if (!hit) return undefined;
    return queryAsOf(hit.corpus, hit.release, q, { enforceRights: true, viewer: 'COUNTERPARTY_SHARED' });
  }

  async retractions(since: string | undefined, viewer: VisibilityClass): Promise<Retraction[]> {
    return FIXTURE_CORPORA.flatMap((c) => retractionsSince(c, since, viewer));
  }

  /**
   * UNKNOWN, and not zero. This source reads the committed demonstration corpus
   * and holds no connection to the store where admission is recorded, so it
   * cannot see whether a record has been admitted — which is a different fact
   * from none having been.
   */
  async admittedRecords(): Promise<AdmittedReading> {
    return {
      count: 'UNKNOWN',
      because: 'This process reads the committed demonstration corpus and holds no connection to the store where admission is recorded. It cannot see whether a record has been admitted, and an unreadable count is not a zero.',
    };
  }
}

export class LiveCorpusSource implements CorpusSource {
  readonly origin = { kind: 'LIVE', label: 'Configured PostgreSQL corpus' } as const;

  /** Loaded on demand: the fixture path must not pull the driver into a bundle. */
  private async database() {
    const [{ db }, schema] = await Promise.all([import('@/db'), import('@/db/schema')]);
    return { db, ...schema };
  }

  private async fetchFullCorpus(scope: { corpusId: string } | { releaseId: string }): Promise<Corpus | undefined> {
    assertReadScope('corpusId' in scope ? scope.corpusId : scope.releaseId);
    const { db, corpora, releases, records, retractions } = await this.database();
    return db.transaction(async tx => {
      // Resolve release ownership inside the same snapshot as its history.
      const corpusId = 'corpusId' in scope ? scope.corpusId
        : (await tx.select({ corpusId: releases.corpusId }).from(releases).where(eq(releases.releaseId, scope.releaseId)))[0]?.corpusId;
      if (!corpusId) return undefined;
      const corpusRes = await tx.select().from(corpora).where(eq(corpora.corpusId, corpusId));
      if (corpusRes.length === 0) return undefined;
      const rels = boundedRows(await tx.select().from(releases).where(eq(releases.corpusId, corpusId)).limit(CORPUS_READ_LIMITS.releases + 1), CORPUS_READ_LIMITS.releases);
      const recs = boundedRows(await tx.select().from(records).where(eq(records.corpusId, corpusId)).limit(CORPUS_READ_LIMITS.records + 1), CORPUS_READ_LIMITS.records);
      const rets = boundedRows(await tx.select().from(retractions).where(eq(retractions.corpusId, corpusId)).limit(CORPUS_READ_LIMITS.retractions + 1), CORPUS_READ_LIMITS.retractions);
      return storedCorpus(corpusRes[0], rels, recs, rets);
    }, CONSISTENT_CORPUS_READ);
  }

  /** Lightweight single-statement catalog: never selects corpus JSON or record history. */
  async catalog(input: CorpusCatalogQuery = {}): Promise<CorpusCatalogPage> {
    const query = parseCatalogQuery(input);
    const { db, corpora } = await this.database();
    const entries = await db.select({ corpusId: corpora.corpusId, title: corpora.title, description: corpora.description, domain: corpora.domain }).from(corpora)
      .where(and(query.domain ? eq(corpora.domain, query.domain) : undefined, query.afterCorpusId ? gt(corpora.corpusId, query.afterCorpusId) : undefined))
      .orderBy(asc(corpora.corpusId)).limit(query.limit + 1);
    if (entries.some(entry => !['CARAVAN', 'LANDSHARK', 'TRADEWIND'].includes(entry.domain))) throw new Error('CORPUS_CATALOG_INVALID_DOMAIN');
    return catalogPage(entries as CorpusCatalogPage['entries'], query.limit);
  }

  async recordPage(releaseId: string, viewer: VisibilityClass, query: CorpusRecordQuery = {}): Promise<CorpusRecordPage | undefined> {
    assertReadScope(releaseId); assertViewer(viewer); parseRecordQuery(query);
    const hit = await this.getRelease(releaseId);
    return hit ? releaseRecordPage(hit.corpus, hit.release, viewer, query) : undefined;
  }

  async listCorpora(): Promise<Corpus[]> {
    const { db, corpora, releases, records, retractions } = await this.database();
    // Compatibility reads fail at the cap instead of silently losing history.
    return db.transaction(async tx => {
      const allCorpora = boundedRows(await tx.select().from(corpora).limit(CORPUS_READ_LIMITS.catalog + 1), CORPUS_READ_LIMITS.catalog);
      if (!allCorpora.length) return [];
      const rels = groupCorpusRows(boundedRows(await tx.select().from(releases).limit(CORPUS_READ_LIMITS.releases + 1), CORPUS_READ_LIMITS.releases));
      const recs = groupCorpusRows(boundedRows(await tx.select().from(records).limit(CORPUS_READ_LIMITS.records + 1), CORPUS_READ_LIMITS.records));
      const rets = groupCorpusRows(boundedRows(await tx.select().from(retractions).limit(CORPUS_READ_LIMITS.retractions + 1), CORPUS_READ_LIMITS.retractions));
      return allCorpora.map((entry) => storedCorpus(entry, rels.get(entry.corpusId) ?? [], recs.get(entry.corpusId) ?? [], rets.get(entry.corpusId) ?? []));
    }, CONSISTENT_CORPUS_READ);
  }

  async getCorpus(corpusId: string): Promise<Corpus | undefined> {
    return this.fetchFullCorpus({ corpusId });
  }

  async listReleases(corpusId?: string): Promise<CorpusRelease[]> {
    if (corpusId !== undefined) assertReadScope(corpusId);
    const { db, releases } = await this.database();
    const rels = corpusId
      ? await db.select().from(releases).where(eq(releases.corpusId, corpusId)).limit(CORPUS_READ_LIMITS.releases + 1)
      : await db.select().from(releases).limit(CORPUS_READ_LIMITS.releases + 1);
    boundedRows(rels, CORPUS_READ_LIMITS.releases);
    return rels.map(storedRelease).sort((a, b) => Date.parse(b.knownAt) - Date.parse(a.knownAt) || a.releaseId.localeCompare(b.releaseId));
  }

  async getRelease(releaseId: string): Promise<{ corpus: Corpus; release: CorpusRelease } | undefined> {
    const corpus = await this.fetchFullCorpus({ releaseId });
    if (!corpus) return undefined;
    
    const releaseData = corpus.releases.find((r) => r.releaseId === releaseId);
    if (!releaseData) return undefined;
    
    return { corpus, release: releaseData };
  }

  async records(releaseId: string, viewer: VisibilityClass) {
    const hit = await this.getRelease(releaseId);
    if (!hit) return undefined;
    return deliverableRecords(hit.corpus, hit.release, viewer);
  }

  async asOf(releaseId: string, q: AsOfQuery): Promise<AsOfAnswer | undefined> {
    const hit = await this.getRelease(releaseId);
    if (!hit) return undefined;
    return queryAsOf(hit.corpus, hit.release, q, { enforceRights: true, viewer: 'COUNTERPARTY_SHARED' });
  }

  async retractions(since: string | undefined, viewer: VisibilityClass): Promise<Retraction[]> {
    const allCorpora = await this.listCorpora();
    return allCorpora.flatMap((c) => retractionsSince(c, since, viewer));
  }

  /**
   * Counted in the store, from the column the gate stamps.
   *
   * `provenance` is what separates an admitted row from a seeded one: the gate
   * emits LIVE_CAPTURE or BACKFILLED and cannot emit DEMONSTRATION, the seeder
   * emits DEMONSTRATION and cannot emit the others, and `architecture.test.ts`
   * holds both halves. So this count excludes the committed fixtures by
   * construction rather than by a filter somebody has to remember.
   *
   * A store that is configured and unreachable answers UNKNOWN. Returning zero
   * there would be reporting a fact about the corpus on the strength of a
   * failed connection, which is precisely the mistake this system refuses
   * everywhere else.
   */
  async admittedRecords(): Promise<AdmittedReading> {
    try {
      const { db, records } = await this.database();
      // Grouped in the database rather than scanned into this process: the
      // answer is two integers, and reading every row to count them would make
      // the cost of the self-report grow with the corpus it reports on.
      const tallies = await db.select({ provenance: records.provenance, rows: count() }).from(records).groupBy(records.provenance);
      let admitted = 0;
      let total = 0;
      for (const tally of tallies) {
        total += Number(tally.rows);
        if ((ADMITTED_PROVENANCE as readonly string[]).includes(tally.provenance)) admitted += Number(tally.rows);
      }
      return {
        count: admitted,
        because: admitted === 0
          ? `The records table holds ${total} ${total === 1 ? 'row' : 'rows'} and none carries a gate-stamped provenance (${ADMITTED_PROVENANCE.join(' or ')}). This is a read of the store and not an assumption: nothing has been admitted.`
          : `${admitted} of ${total} rows in the records table carry a gate-stamped provenance (${ADMITTED_PROVENANCE.join(' or ')}). Seeded demonstration rows are excluded by that column, which the gate cannot write.`,
      };
    } catch {
      return {
        count: 'UNKNOWN',
        because: 'A corpus store is configured and could not be read, so the admitted count is unknown. An unreadable count is not a zero, and reporting one here would be a claim about the corpus made on the strength of a failed connection.',
      };
    }
  }

  /**
   * The gate's own account of itself, read back for the first time.
   *
   * `admitRecords` writes a ruling row for every decision it makes — refusals
   * as well as admissions, in the same transaction as the record — and nothing
   * in this system had ever read one. A refusal that is written and never read
   * is not accountability, it is storage.
   *
   * Grouped in the database, like the admitted count and for the same reason:
   * the answer is a handful of integers and the cost of a self-report should
   * not grow with what it reports on.
   */
  async admissionLedger(): Promise<LedgerReading> {
    try {
      const { db, admissionRulings, recordAncestry } = await this.database();
      const [tallies, ancestryRows] = await Promise.all([
        db.select({ outcome: admissionRulings.outcome, rows: count() }).from(admissionRulings).groupBy(admissionRulings.outcome),
        db.select({ rows: count() }).from(recordAncestry),
      ]);
      const byOutcome = tallies
        .map((tally) => ({ outcome: tally.outcome, rulings: Number(tally.rows) }))
        .sort((a, b) => (b.rulings - a.rulings) || (a.outcome < b.outcome ? -1 : 1));
      const rulings = byOutcome.reduce((total, entry) => total + entry.rulings, 0);
      const ancestry = Number(ancestryRows[0]?.rows ?? 0);
      return {
        rulings, byOutcome, ancestry,
        because: rulings === 0
          ? 'The admission ruling table is empty. This is a read of the store: the gate exists, it has never been asked to rule, and nothing has been refused either.'
          : `${rulings} ${rulings === 1 ? 'ruling' : 'rulings'} recorded, ${byOutcome.map((entry) => `${entry.rulings} ${entry.outcome}`).join(', ')}. Every ruling is written in the same transaction as the record it decided, refusals included, so this count is the gate's whole history and not only its successes.`,
      };
    } catch {
      return {
        rulings: 'UNKNOWN',
        byOutcome: [],
        ancestry: 'UNKNOWN',
        because: 'A corpus store is configured and the admission ruling table could not be read, so what the gate has ruled is unknown. Answering zero would say the gate has never refused anything, on the strength of a failed connection.',
      };
    }
  }
}

let source: CorpusSource | undefined;

/**
 * The corpus is served from Postgres when a database is configured, and from the
 * committed demonstration otherwise. `origin` says which, and every fixture-backed
 * screen reads it, so a reader is never told a demonstration is a live corpus.
 */
export function corpusDatabaseConfigured(): boolean {
  return databaseConfigured();
}

export function getCorpusSource(): CorpusSource {
  if (!source) source = corpusDatabaseConfigured() ? new LiveCorpusSource() : new FixtureCorpusSource();
  return source;
}

/** Synchronous helpers for client components that already hold the corpus. */
export function currentReleaseOf(corpus: Corpus): CorpusRelease {
  return currentRelease(corpus);
}
