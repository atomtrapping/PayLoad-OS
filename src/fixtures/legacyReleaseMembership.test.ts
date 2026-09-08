import { describe, expect, it } from 'vitest';
import { releaseRecords, releaseRetractions } from '../domain/corpus';
import { FIXTURE_CORPORA } from './index';
import { releaseCanonical } from './digestPlan';
import { buildReleaseManifest } from './releaseManifest';
import { legacyFixtureReleaseRecords, legacyFixtureReleaseRetractions } from './legacyReleaseMembership';

describe('frozen v0 fixture membership versus runtime instant selection', () => {
  it('preserves the committed checked-in record and retraction sets at every release', () => {
    for (const corpus of FIXTURE_CORPORA) for (const release of corpus.releases) {
      expect(legacyFixtureReleaseRecords(corpus, release)).toEqual(releaseRecords(corpus, release));
      expect(legacyFixtureReleaseRetractions(corpus, release)).toEqual(releaseRetractions(corpus, release));
    }
  });

  it('keeps offset spelling in the legacy codec without weakening numeric runtime cutoff selection', () => {
    const corpus = structuredClone(FIXTURE_CORPORA[0]);
    const release = corpus.releases.find((entry) => entry.status === 'CURRENT')!;
    const base = corpus.records[0];
    corpus.records = [
      { ...base, recordId: 'EARLIER_OFFSET', knownAt: '2026-09-01T13:00:00+02:00' },
      { ...base, recordId: 'LATER_MILLISECOND', knownAt: '2026-09-01T12:00:00.001Z' },
    ];
    release.knownAt = '2026-09-01T12:00:00Z';
    expect(releaseRecords(corpus, release).map((record) => record.recordId)).toEqual(['EARLIER_OFFSET']);
    expect(legacyFixtureReleaseRecords(corpus, release).map((record) => record.recordId)).toEqual(['LATER_MILLISECOND']);
    expect(releaseCanonical(corpus, release.releaseId)?.map((record) => record.recordId)).toEqual(['LATER_MILLISECOND']);
    expect(buildReleaseManifest(corpus, release).recordCount).toBe(1);
    expect(corpus.records[0].knownAt).toBe('2026-09-01T13:00:00+02:00');
  });

  it('retains the v0 manifest retraction set independently from numeric runtime knowledge', () => {
    const corpus = structuredClone(FIXTURE_CORPORA[0]);
    const release = corpus.releases.find((entry) => entry.status === 'CURRENT')!;
    const base = corpus.retractions[0];
    corpus.retractions = [{ ...base, issuedAt: '2026-09-01T13:00:00+02:00' }];
    release.knownAt = '2026-09-01T12:00:00Z';
    expect(releaseRetractions(corpus, release)).toHaveLength(1);
    expect(legacyFixtureReleaseRetractions(corpus, release)).toEqual([]);
    expect(buildReleaseManifest(corpus, release).retractionsApplied).toEqual([]);
  });
});
