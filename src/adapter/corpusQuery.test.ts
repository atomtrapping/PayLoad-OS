import { describe, expect, it } from 'vitest';
import { FIXTURE_CORPORA } from '@/fixtures';
import { LANDSHARK_CORPUS } from '@/fixtures/landshark/release';
import { TRADEWIND_CORPUS } from '@/fixtures/tradewind/release';
import { currentRelease, deliverableRecords, recordStatusAt } from '@/domain/corpus';
import { FixtureCorpusSource } from './corpusSource';
import { boundedRows, parseCatalogQuery, parseRecordQuery, releaseRecordPage } from './corpusQuery';

describe('bounded read contracts', () => {
  it.each([0, -1, 201, 1.5, NaN, Infinity, '10', null])('refuses an invalid page size %s', limit => {
    expect(() => parseCatalogQuery({ limit } as never)).toThrow('CORPUS_QUERY_INVALID');
    expect(() => parseRecordQuery({ limit } as never)).toThrow('CORPUS_QUERY_INVALID');
  });
  it.each(['', 'x'.repeat(257), 'x\ny', '\u0000'])('refuses unbounded or control-bearing selectors', subjectId => {
    expect(() => parseRecordQuery({ subjectId })).toThrow('CORPUS_QUERY_INVALID');
  });
  it.each(['2026-02-30T00:00:00Z', '2026-08-20T24:00:00Z', '2026-08-20', 'not a time'])('refuses invalid knowledge time %s', knownAt => {
    expect(() => parseRecordQuery({ knownAt })).toThrow('CORPUS_QUERY_INVALID');
  });
  it('rejects unknown fields and cannot turn missing history into an empty page', () => {
    expect(() => parseRecordQuery({ limit: 10, offset: 100 } as never)).toThrow('CORPUS_QUERY_INVALID');
    expect(() => boundedRows([1, 2], 1)).toThrow('CORPUS_READ_LIMIT_EXCEEDED');
  });
  it('paginates a lightweight catalog without returning records, rights or artifact documents', async () => {
    const source = new FixtureCorpusSource();
    const seen: string[] = [];
    let afterCorpusId: string | undefined;
    do {
      const page = await source.catalog({ limit: 1, afterCorpusId });
      for (const entry of page.entries) {
        expect(Object.keys(entry).sort()).toEqual(['corpusId', 'description', 'domain', 'title']);
        seen.push(entry.corpusId);
      }
      afterCorpusId = page.nextCursor ?? undefined;
    } while (afterCorpusId);
    expect(seen).toEqual(FIXTURE_CORPORA.map(corpus => corpus.corpusId).sort());
  });
});

describe('release record pages preserve rights and history semantics', () => {
  it('returns each deliverable record exactly once over bounded pages', async () => {
    const source = new FixtureCorpusSource();
    for (const corpus of FIXTURE_CORPORA) {
      const release = currentRelease(corpus);
      const seen: string[] = [];
      let afterRecordId: string | undefined;
      do {
        const page = (await source.recordPage(release.releaseId, 'COUNTERPARTY_SHARED', { limit: 2, afterRecordId }))!;
        expect(page.records.length).toBeLessThanOrEqual(2);
        page.records.forEach(entry => {
          seen.push(entry.record.recordId);
          const original = corpus.records.find(record => record.recordId === entry.record.recordId)!;
          expect(entry.status).toBe(recordStatusAt(corpus, original, release.knownAt));
        });
        afterRecordId = page.nextCursor ?? undefined;
      } while (afterRecordId);
      expect(seen).toEqual(deliverableRecords(corpus, release, 'COUNTERPARTY_SHARED').records.map(record => record.recordId).sort());
    }
  });
  it('withholds prohibited Tradewind records and their private history pointers', () => {
    const release = currentRelease(TRADEWIND_CORPUS);
    const page = releaseRecordPage(TRADEWIND_CORPUS, release, 'COUNTERPARTY_SHARED');
    const json = JSON.stringify(page);
    for (const secret of ['TW-0102', 'TW-0103', '1250000', 'EV-BOOK-HL-1180']) expect(json).not.toContain(secret);
    expect(page.records.some(entry => entry.record.recordId === 'TW-0201')).toBe(true);
  });
  it('does not resurrect a visible predecessor when a withheld successor is known', () => {
    const corpus = structuredClone(LANDSHARK_CORPUS);
    const release = currentRelease(corpus);
    const original = corpus.records[0];
    original.supersededByRecordId = 'private-successor';
    corpus.records.push({ ...original, recordId: 'private-successor', visibility: 'INTERNAL_ONLY', supersededByRecordId: undefined, value: 'secret successor value' });
    const entry = releaseRecordPage(corpus, release, 'COUNTERPARTY_SHARED').records.find(row => row.record.recordId === original.recordId)!;
    expect(entry.status).toBe('SUPERSEDED');
    expect(entry.record.supersededByRecordId).toBeUndefined();
    expect(JSON.stringify(entry)).not.toContain('secret successor');
  });
  it('keeps withdrawal standing without exposing a private withdrawal identifier or reason', () => {
    const corpus = structuredClone(LANDSHARK_CORPUS);
    const release = currentRelease(corpus);
    const record = corpus.records[0];
    record.retractedByRetractionId = 'private-withdrawal';
    corpus.retractions.push({ retractionId: 'private-withdrawal', issuedAt: record.knownAt, releaseId: release.releaseId,
      affectedRecordIds: [record.recordId], reason: 'secret reason', kind: 'WITHDRAWAL', visibility: 'INTERNAL_ONLY' });
    const entry = releaseRecordPage(corpus, release, 'COUNTERPARTY_SHARED').records.find(row => row.record.recordId === record.recordId)!;
    expect(entry.status).toBe('RETRACTED');
    expect(entry.record.retractedByRetractionId).toBeUndefined();
    expect(JSON.stringify(entry)).not.toMatch(/private-withdrawal|secret reason/);
  });
  it('clamps knowledge to the release and preserves historical standing without mutating input', () => {
    const corpus = structuredClone(LANDSHARK_CORPUS);
    const before = JSON.stringify(corpus);
    const release = currentRelease(corpus);
    const early = releaseRecordPage(corpus, release, 'COUNTERPARTY_SHARED', { knownAt: '2026-08-20T09:00:00Z', subjectId: 'PARCEL-BR-1207', predicate: 'entitlement.status' });
    expect(early.records).toHaveLength(1);
    expect(early.records[0]).toMatchObject({ status: 'CURRENT', record: { recordId: 'LS-0112' } });
    expect(early.records[0].record.retractedByRetractionId).toBeUndefined();
    const later = releaseRecordPage(corpus, release, 'COUNTERPARTY_SHARED', { knownAt: '2030-01-01T00:00:00Z', subjectId: 'PARCEL-BR-1207', predicate: 'entitlement.status' });
    expect(later.boundedBy).toBe(new Date(release.knownAt).toISOString());
    expect(later.records[0].status).toBe('RETRACTED');
    expect(JSON.stringify(corpus)).toBe(before);
  });
  it('does not interpret an unsupported delayed viewer as internal access', async () => {
    await expect(new FixtureCorpusSource().recordPage(currentRelease(LANDSHARK_CORPUS).releaseId, 'DELAYED_AGGREGATE')).rejects.toThrow('CORPUS_QUERY_INVALID');
  });
});
