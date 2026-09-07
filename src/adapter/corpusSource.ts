/**
 * The corpus adapter: the product's read interface.
 */
import type { VisibilityClass } from '@/domain/types';
import type { AsOfAnswer, AsOfQuery, Corpus, CorpusRecord, CorpusRelease, Retraction } from '@/domain/corpus';
import { currentRelease, deliverableRecords, queryAsOf, releaseById, retractionsSince } from '@/domain/corpus';
import { FIXTURE_CORPORA } from '@/fixtures';
import { eq } from 'drizzle-orm';

export interface CorpusSource {
  readonly origin: { kind: 'FIXTURE'; label: string } | { kind: 'LIVE'; label: string };
  listCorpora(): Promise<Corpus[]>;
  getCorpus(corpusId: string): Promise<Corpus | undefined>;
  listReleases(corpusId?: string): Promise<CorpusRelease[]>;
  getRelease(releaseId: string): Promise<{ corpus: Corpus; release: CorpusRelease } | undefined>;
  records(releaseId: string, viewer: VisibilityClass): Promise<{ records: CorpusRecord[]; withheldByRights: number; withheldByVisibility: number; withheldReasons: Record<string, number> } | undefined>;
  asOf(releaseId: string, q: AsOfQuery): Promise<AsOfAnswer | undefined>;
  retractions(since: string | undefined, viewer: VisibilityClass): Promise<Retraction[]>;
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
