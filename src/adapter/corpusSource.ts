/**
 * The corpus adapter: the product's read interface.
 */
import type { VisibilityClass } from '@/domain/types';
import type { AdmittedCount } from '@/domain/compression';
import type { AsOfAnswer, AsOfQuery, Corpus, CorpusRecord, CorpusRelease, Retraction } from '@/domain/corpus';
import { currentRelease, deliverableRecords, queryAsOf, releaseById, retractionsSince } from '@/domain/corpus';
import { FIXTURE_CORPORA } from '@/fixtures';
import { count, eq } from 'drizzle-orm';

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
export const ADMITTED_PROVENANCE = ['LIVE_CAPTURE', 'BACKFILLED'] as const;

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
}

export class FixtureCorpusSource implements CorpusSource {
  readonly origin = { kind: 'FIXTURE', label: 'Demonstration corpus (fixture_only: true)' } as const;

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
  readonly origin = { kind: 'LIVE', label: 'Live Cloud SQL Corpus' } as const;

  /** Loaded on demand: the fixture path must not pull the driver into a bundle. */
  private async database() {
    const [{ db }, schema] = await Promise.all([import('@/db'), import('@/db/schema')]);
    return { db, ...schema };
  }

  private async fetchFullCorpus(corpusId: string): Promise<Corpus | undefined> {
    const corpusRes = await (await this.database()).db.select().from((await this.database()).corpora).where(eq((await this.database()).corpora.corpusId, corpusId));
    if (corpusRes.length === 0) return undefined;
    
    const [c] = corpusRes;
    const rels = await (await this.database()).db.select().from((await this.database()).releases).where(eq((await this.database()).releases.corpusId, corpusId));
    const recs = await (await this.database()).db.select().from((await this.database()).records).where(eq((await this.database()).records.corpusId, corpusId));
    const rets = await (await this.database()).db.select().from((await this.database()).retractions).where(eq((await this.database()).retractions.corpusId, corpusId));
    
    return {
      ...(c.data as Record<string, unknown>),
      releases: (rels.map((r) => r.data) as unknown as CorpusRelease[]).sort((a, b) => (a.knownAt < b.knownAt ? -1 : 1)),
      records: recs.map((r) => r.data),
      retractions: rets.map((r) => r.data)
    } as Corpus;
  }

  async listCorpora(): Promise<Corpus[]> {
    const allCorpora = await (await this.database()).db.select().from((await this.database()).corpora);
    const results: Corpus[] = [];
    for (const c of allCorpora) {
      const full = await this.fetchFullCorpus(c.corpusId);
      if (full) results.push(full);
    }
    return results;
  }

  async getCorpus(corpusId: string): Promise<Corpus | undefined> {
    return this.fetchFullCorpus(corpusId);
  }

  async listReleases(corpusId?: string): Promise<CorpusRelease[]> {
    const rels = corpusId
      ? await (await this.database()).db.select().from((await this.database()).releases).where(eq((await this.database()).releases.corpusId, corpusId))
      : await (await this.database()).db.select().from((await this.database()).releases);
    return rels.map((r) => r.data as unknown as CorpusRelease).sort((a, b) => (a.knownAt < b.knownAt ? 1 : -1));
  }

  async getRelease(releaseId: string): Promise<{ corpus: Corpus; release: CorpusRelease } | undefined> {
    const rels = await (await this.database()).db.select().from((await this.database()).releases).where(eq((await this.database()).releases.releaseId, releaseId));
    if (rels.length === 0) return undefined;
    
    const release = rels[0];
    const corpus = await this.fetchFullCorpus(release.corpusId);
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
}

let source: CorpusSource | undefined;

/**
 * The corpus is served from Postgres when a database is configured, and from the
 * committed demonstration otherwise. `origin` says which, and every fixture-backed
 * screen reads it, so a reader is never told a demonstration is a live corpus.
 */
export function corpusDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL || process.env.SQL_HOST);
}

export function getCorpusSource(): CorpusSource {
  if (!source) source = corpusDatabaseConfigured() ? new LiveCorpusSource() : new FixtureCorpusSource();
  return source;
}

/** Synchronous helpers for client components that already hold the corpus. */
export function currentReleaseOf(corpus: Corpus): CorpusRelease {
  return currentRelease(corpus);
}
