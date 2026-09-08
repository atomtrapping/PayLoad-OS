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
}

export class FixtureCorpusSource implements CorpusSource {
  readonly origin = { kind: 'FIXTURE', label: 'Demonstration corpus (fixture_only: true)' } as const;

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
