import type { Corpus, CorpusRecord, CorpusRelease, Retraction } from '../domain/corpus';

/**
 * Frozen membership rules for the already-stamped v0 demonstration codec.
 * These lexical comparisons are deliberately NOT a general time selector:
 * changing them would change what historical fixture commitments contain.
 * Runtime/database selection uses the instant-aware domain selectors instead.
 */
export function legacyFixtureReleaseRecords(corpus: Corpus, release: CorpusRelease): CorpusRecord[] {
  return corpus.records.filter((record) => record.knownAt <= release.knownAt);
}

export function legacyFixtureReleaseRetractions(corpus: Corpus, release: CorpusRelease): Retraction[] {
  return corpus.retractions.filter((retraction) => retraction.issuedAt <= release.knownAt);
}
