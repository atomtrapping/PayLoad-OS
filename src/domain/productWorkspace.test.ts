import { describe, expect, it } from 'vitest';
import { LANDSHARK_CORPUS } from '@/fixtures/landshark/release';
import { TRADEWIND_CORPUS } from '@/fixtures/tradewind/release';
import { buildProductWorkspace, productReadingLink, type WorkspaceParams } from './productWorkspace';

const land = (params: WorkspaceParams = {}) => buildProductWorkspace(LANDSHARK_CORPUS, 'LANDSHARK', params);
const trade = (params: WorkspaceParams = {}) => buildProductWorkspace(TRADEWIND_CORPUS, 'TRADEWIND', params);
const entitlement = { subject: 'PARCEL-BR-1207', predicate: 'entitlement.status', validAt: '2026-08-20T00:00:00Z' };

describe('product inquiry read model', () => {
  it('opens a useful domain-specific observation, not a stale settlement at release time', () => {
    const ls = land();
    expect(ls.fixtureOnly).toBe(true);
    expect(ls.reading?.answer?.record).toMatchObject({ recordId: 'LS-0101', predicate: 'area.cadastral', value: 84500 });
    expect(ls.comparison).toBe('SAME_RECORD');
    const tw = trade();
    expect(tw.reading?.answer?.record).toMatchObject({ recordId: 'TW-0202', predicate: 'price.settlement', value: 19.05, unit: 'USD/t' });
    expect(Date.parse(tw.reading!.query.validAt)).toBe(Date.parse('2026-08-27T17:00:00Z'));
    expect(tw.reading!.query.validAt).not.toBe(tw.release.knownAt);
  });

  it('distinguishes a withdrawn record from refused permission or a zero value', () => {
    const model = land(entitlement);
    expect(model.reading?.answer).toBeNull();
    expect(model.reading?.refusal?.code).toBe('RETRACTED');
    expect(model.previous?.answer?.record).toMatchObject({ recordId: 'LS-0112', value: 'Under review — expansion of bulk storage' });
    expect(model.comparison).toBe('UNRESOLVED');
    const earlier = land({ ...entitlement, knownAt: '2026-08-20T09:00:00Z' });
    expect(earlier.reading?.answer?.record.recordId).toBe('LS-0112');
    expect(JSON.stringify(earlier.reading)).not.toContain('RET-LS-0001');
  });

  it('evaluates each vintage under its own rights and never serializes the withheld exposure', () => {
    const model = trade({ subject: 'POS-TW-1180', predicate: 'exposure.notional', validAt: '2026-08-17T00:00:00Z' });
    expect(model.reading?.answer?.record).toMatchObject({ recordId: 'TW-0201', value: 1312500 });
    expect(model.previous?.answer).toBeNull();
    expect(model.previous?.refusal?.code).toBe('NOT_DELIVERABLE');
    expect(model.withheld).toBe(2);
    const json = JSON.stringify(model);
    for (const secret of ['TW-0102', 'TW-0103', '1250000', 'EV-BOOK-HL-1180', 'harbourline-book', 'candidates', 'considered']) expect(json).not.toContain(secret);
  });

  it('does not resurrect a visible original when a later successor is private', () => {
    const corpus = structuredClone(LANDSHARK_CORPUS);
    const original = corpus.records.find((r) => r.recordId === 'LS-0101')!;
    const successor = { ...original, recordId: 'SECRET_SUCCESSOR', value: 'SECRET_VALUE', knownAt: '2026-08-29T00:00:00Z', visibility: 'INTERNAL_ONLY' as const, supersedesRecordId: original.recordId };
    original.supersededByRecordId = successor.recordId;
    corpus.records.push(successor);
    const params = { subject: original.subjectId, predicate: original.predicate, validAt: original.validFrom };
    const model = buildProductWorkspace(corpus, 'LANDSHARK', params);
    expect(model.reading?.answer).toBeNull();
    expect(model.records.find((r) => r.record.recordId === original.recordId)?.status).toBe('SUPERSEDED');
    expect(JSON.stringify(model)).not.toMatch(/SECRET_SUCCESSOR|SECRET_VALUE/);
    const early = buildProductWorkspace(corpus, 'LANDSHARK', { ...params, knownAt: '2026-08-20T09:00:00Z' });
    expect(early.reading?.answer?.record.recordId).toBe(original.recordId);
  });

  it.each(['PRIVATE_PREFLIGHT', 'INTERNAL_ONLY'] as const)('preserves withdrawal standing without disclosing a %s event identity', (visibility) => {
    const corpus = structuredClone(LANDSHARK_CORPUS);
    const event = corpus.retractions[0];
    const originalId = event.retractionId;
    event.retractionId = 'SECRET_WITHDRAWAL';
    event.visibility = visibility;
    for (const record of corpus.records) if (record.retractedByRetractionId === originalId) record.retractedByRetractionId = event.retractionId;
    const model = buildProductWorkspace(corpus, 'LANDSHARK', entitlement);
    expect(model.reading?.refusal?.code).toBe('RETRACTED');
    expect(model.records.find((r) => r.record.recordId === 'LS-0112')?.status).toBe('RETRACTED');
    expect(JSON.stringify(model)).not.toContain('SECRET_WITHDRAWAL');
  });

  it('preserves missing positional uncertainty and original fixture bytes', () => {
    const before = structuredClone(LANDSHARK_CORPUS);
    const model = land();
    const point = model.records.find((r) => r.record.subjectId === 'PARCEL-NL-0511' && r.record.predicate === 'location.position')!.record;
    expect(point.geometry).not.toHaveProperty('horizontalUncertaintyM');
    expect(LANDSHARK_CORPUS).toEqual(before);
  });

  it('keeps milliseconds through UTC and datetime-local input forms', () => {
    const utc = land({ validAt: '2026-08-20T00:00:00.500Z', knownAt: '2026-08-20T09:00:00.250Z' });
    const local = land({ validAt: '2026-08-20T00:00:00.5', knownAt: '2026-08-20T09:00:00.25' });
    expect(local.reading?.query).toEqual(utc.reading?.query);
    expect(local.reading?.query.validAt).toBe('2026-08-20T00:00:00.500Z');
    expect(land({ validAt: '2026-08-20T00:00' }).reading).not.toBeNull();
  });

  it.each(['2026-02-30T00:00:00Z', '2026-08-20T24:00:00Z', '2026-08-20T00:00:00+01:00', 'nonsense', '2026-08-20T00:00:00.0001Z'])('rejects invalid or ambiguous time %s', (validAt) => {
    expect(() => land({ validAt })).toThrow('INVALID_QUERY');
  });

  it.each([{ release: ['a', 'b'] }, { release: '' }, { subject: ' ' }, { question: 'GUESS' }, { subject: 'x'.repeat(257) }, { predicate: 'a\nb' }, { knownAt: ['2026-08-20T00:00', '2026-08-21T00:00'] }])('rejects malformed parameters %j', (params) => {
    expect(() => land(params)).toThrow('INVALID_QUERY');
  });

  it('refuses unknown selections rather than silently substituting defaults', () => {
    expect(() => land({ release: 'missing' })).toThrow('RELEASE_NOT_AVAILABLE');
    expect(() => trade({ record: 'TW-0102' })).toThrow('RECORD_NOT_AVAILABLE');
    expect(() => trade({ record: 'missing' })).toThrow('RECORD_NOT_AVAILABLE');
    expect(() => buildProductWorkspace(LANDSHARK_CORPUS, 'TRADEWIND', {})).toThrow('CORPUS_NOT_AVAILABLE');
  });

  it('caps knowledge time, refuses unsupported source time and names the first vintage', () => {
    const model = land({ knownAt: '2030-01-01T00:00:00Z' });
    expect(Date.parse(model.reading!.query.knownAt)).toBe(Date.parse(model.release.knownAt));
    expect(land({ question: 'WHAT_THE_SOURCE_KNEW' }).reading?.refusal?.code).toBe('QUESTION_NOT_ANSWERABLE');
    const first = land({ release: 'REL-LS-2026.08.20' });
    expect(first.previous).toBeNull();
    expect(first.comparison).toBe('NO_PREVIOUS_RELEASE');
    expect(first.records.some((r) => r.record.recordId === 'LS-0121')).toBe(false);
  });

  it('replays record links with an explicit question and reports an empty release honestly', () => {
    const model = trade();
    const record = model.reading!.answer!.record;
    const url = new URL(productReadingLink('TRADEWIND', model.release.releaseId, record), 'http://test');
    expect(url.pathname).toBe('/tradewind');
    const replay = trade(Object.fromEntries(url.searchParams));
    expect(replay.reading?.answer?.record.recordId).toBe(record.recordId);
    expect(url.searchParams.get('question')).toBe('WHAT_WE_HELD');
    const empty = buildProductWorkspace({ ...LANDSHARK_CORPUS, records: [] }, 'LANDSHARK', {});
    expect(empty.reading).toBeNull();
    expect(empty.records).toEqual([]);
  });
});
