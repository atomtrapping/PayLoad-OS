import { describe, expect, it } from 'vitest';
import { CARAVAN_CORPUS } from '@/fixtures/caravan/release';
import { currentRelease, deliverableRecords, queryAsOf, recordStatusAt, releaseById, releaseRecords, retractionsSince, standingRecords, takenBackBy } from './corpus';

const corpus = CARAVAN_CORPUS;
const rel1 = releaseById(corpus, 'REL-CAR-2026.08.11')!;
const rel2 = releaseById(corpus, 'REL-CAR-2026.08.25')!;
const rel3 = currentRelease(corpus);

describe('corpus releases', () => {
  it('compares millisecond and offset instants without changing historical timestamp spellings', () => {
    const cutoff = '2026-09-01T12:00:00Z';
    const release = { ...rel3, knownAt: cutoff };
    const records = [
      { ...corpus.records[0], recordId: 'equal-offset', knownAt: '2026-09-01T08:00:00-04:00' },
      { ...corpus.records[0], recordId: 'later-millisecond', knownAt: '2026-09-01T12:00:00.001Z' },
    ];
    expect(releaseRecords({ ...corpus, records }, release).map((record) => record.recordId)).toEqual(['equal-offset']);
    expect(release.knownAt).toBe(cutoff);
    expect(records[0].knownAt).toBe('2026-09-01T08:00:00-04:00');
  });

  it('a release carries exactly the records knowable by its cutoff', () => {
    expect(releaseRecords(corpus, rel1).map((r) => r.recordId).sort()).toEqual(['REC-0101', 'REC-0102', 'REC-0111', 'REC-0112']);
    expect(releaseRecords(corpus, rel3).length).toBe(corpus.records.length);
  });

  it('an earlier release still shows a later-withdrawn record as it stood', () => {
    const r = corpus.records.find((x) => x.recordId === 'REC-0111')!;
    expect(recordStatusAt(corpus, r, rel1.knownAt)).toBe('CURRENT');
    expect(recordStatusAt(corpus, r, rel3.knownAt)).toBe('RETRACTED');
  });
});

describe('as-of answers', () => {
  it('reconstructs the earlier quantity before the correction was knowable, and the corrected one after', () => {
    const before = queryAsOf(corpus, rel3, { subjectId: 'LOT-5B-221', predicate: 'quantity.gross', validAt: '2026-08-17T16:00:00Z', knownAt: '2026-08-20T00:00:00Z', question: 'WHAT_WE_HELD' });
    expect(before.record?.recordId).toBe('REC-0203');
    expect(before.record?.value).toBe(40);
    expect(before.status).toBe('CURRENT');
    const after = queryAsOf(corpus, rel3, { subjectId: 'LOT-5B-221', predicate: 'quantity.gross', validAt: '2026-08-17T16:00:00Z', knownAt: '2026-08-26T00:00:00Z', question: 'WHAT_WE_HELD' });
    expect(after.record?.recordId).toBe('REC-0204');
    expect(after.record?.value).toBe(40.12);
    expect(after.record?.uncertainty).toEqual({ low: 40.08, high: 40.16, semantics: 'Weighbridge stated accuracy ±0.040 t' });
  });

  it('reaches a lot condition through an identity-link record, and refuses with a remedy when no link exists', () => {
    const linked = queryAsOf(corpus, rel3, { subjectId: 'LOT-5B-221', predicate: 'condition.moisture', validAt: '2026-08-17T16:00:00Z', knownAt: rel3.knownAt, question: 'WHAT_WE_HELD' });
    expect(linked.resolution).toBe('VIA_IDENTITY_LINK');
    expect(linked.identityLink?.recordId).toBe('REC-0202');
    expect(linked.record?.value).toBe(5.1);
    const unlinked = queryAsOf(corpus, rel3, { subjectId: 'LOT-7C-104', predicate: 'condition.moisture', validAt: '2026-08-28T14:00:00Z', knownAt: rel3.knownAt, question: 'WHAT_WE_HELD' });
    expect(unlinked.record).toBeUndefined();
    expect(unlinked.refusal?.code).toBe('NO_IDENTITY_LINK');
    expect(unlinked.refusal?.remedy).toMatch(/links a sample identifier to LOT-7C-104/);
    expect(unlinked.refusal?.considered[0].recordId).toBe('REC-0301');
  });

  it('a withdrawn record answers before the withdrawal was knowable and is refused as RETRACTED after', () => {
    const before = queryAsOf(corpus, rel3, { subjectId: 'LOT-3F-440', predicate: 'condition.moisture', validAt: '2026-08-11T12:00:00Z', knownAt: '2026-08-15T00:00:00Z', question: 'WHAT_WE_HELD' });
    expect(before.record?.recordId).toBe('REC-0111');
    const after = queryAsOf(corpus, rel3, { subjectId: 'LOT-3F-440', predicate: 'condition.moisture', validAt: '2026-08-11T12:00:00Z', knownAt: rel3.knownAt, question: 'WHAT_WE_HELD' });
    expect(after.record).toBeUndefined();
    // the identity link was withdrawn too, so the refusal is the absence of a link, not a retracted moisture
    expect(['RETRACTED', 'NO_IDENTITY_LINK']).toContain(after.refusal?.code);
    expect(after.refusal?.reason).toMatch(/withdrawn|link/);
  });

  it('refuses outside validity and refuses with NO_RECORD, never a zero', () => {
    const early = queryAsOf(corpus, rel3, { subjectId: 'LOT-5B-221', predicate: 'quantity.gross', validAt: '2026-08-01T00:00:00Z', knownAt: rel3.knownAt, question: 'WHAT_WE_HELD' });
    expect(early.refusal?.code).toBe('OUTSIDE_VALIDITY');
    const none = queryAsOf(corpus, rel3, { subjectId: 'LOT-9A-017', predicate: 'quantity.gross', validAt: '2026-08-30T10:00:00Z', knownAt: rel3.knownAt, question: 'WHAT_WE_HELD' });
    expect(none.refusal?.code).toBe('NO_RECORD');
    expect(none.record).toBeUndefined();
  });

  it('a knowledge time later than the release cutoff is clamped to the release', () => {
    const a = queryAsOf(corpus, rel2, { subjectId: 'LOT-7C-104', predicate: 'custody.loading_completed', validAt: '2026-08-28T14:00:00Z', knownAt: '2026-09-30T00:00:00Z', question: 'WHAT_WE_HELD' });
    expect(a.query.knownAt).toBe(rel2.knownAt);
    expect(a.refusal?.code).toBe('NO_RECORD');
  });

  it('rights guard: a record whose source forbids customer delivery never leaves the corpus', () => {
    const a = queryAsOf(corpus, rel3, { subjectId: 'LOT-7C-104', predicate: 'contract.moisture_max', validAt: '2026-08-28T14:00:00Z', knownAt: rel3.knownAt, question: 'WHAT_WE_HELD' }, { enforceRights: true });
    expect(a.record).toBeUndefined();
    expect(a.refusal?.code).toBe('NOT_DELIVERABLE');
    const delivered = deliverableRecords(corpus, rel3, 'COUNTERPARTY_SHARED');
    expect(delivered.records.some((r) => r.provenance.sourceId === 'harbourline-deals')).toBe(false);
    expect(delivered.withheldByRights).toBe(1);
    expect(delivered.withheldByVisibility).toBe(2);
  });
});

describe('retraction feed', () => {
  it('lists retractions after a cursor, oldest first, with affected records and rulings', () => {
    const all = retractionsSince(corpus, undefined);
    expect(all.map((r) => r.retractionId)).toEqual(['RET-0001', 'RET-0002']);
    const later = retractionsSince(corpus, '2026-08-26T00:00:00Z');
    expect(later.map((r) => r.retractionId)).toEqual(['RET-0002']);
    expect(later[0].affectedRulingIds).toEqual(['RUL-3F440-r1']);
    expect(later[0].kind).toBe('WITHDRAWAL');
  });

  it('names the clock every answer was bounded by, and refuses the question this corpus cannot bound', () => {
    const q = { subjectId: 'LOT-5B-221', predicate: 'quantity.gross', validAt: '2026-08-17T16:00:00Z', knownAt: '2026-08-20T00:00:00Z' } as const;

    const held = queryAsOf(corpus, rel3, { ...q, question: 'WHAT_WE_HELD' });
    expect(held.boundedBy).toBe('CORPUS_KNOWLEDGE_TIME');
    expect(held.record?.recordId).toBe('REC-0203');

    // The same query, the other question. No record carries a source clock, so
    // bounding it is impossible and answering on knowledge time would report
    // what this system held as what the source knew.
    const source = queryAsOf(corpus, rel3, { ...q, question: 'WHAT_THE_SOURCE_KNEW' });
    expect(source.boundedBy).toBe('SOURCE_TIME');
    expect(source.record).toBeUndefined();
    expect(source.refusal?.code).toBe('QUESTION_NOT_ANSWERABLE');
    expect(source.candidates).toEqual([]);
    expect(source.resolution).toBe('NONE');
    // The remedy names the declared clock and forbids inferring one.
    expect(source.refusal?.remedy).toContain('declared source time');
    expect(source.refusal?.remedy).toContain('never inferred');
  });

  it('refuses the source question before anything else, so no rights or validity check can quietly answer it', () => {
    // A subject and predicate with no record at all: the source question is
    // still refused as unanswerable rather than as NO_RECORD, because which
    // question was asked is settled before what the corpus holds is consulted.
    const absent = queryAsOf(corpus, rel3, { subjectId: 'LOT-9A-017', predicate: 'quantity.gross', validAt: '2026-08-30T10:00:00Z', knownAt: rel3.knownAt, question: 'WHAT_THE_SOURCE_KNEW' });
    expect(absent.refusal?.code).toBe('QUESTION_NOT_ANSWERABLE');
    // And a rights-restricted one answers the same way, rather than leaking that a record exists.
    const restricted = queryAsOf(corpus, rel3, { subjectId: 'LOT-7C-104', predicate: 'contract.moisture_max', validAt: '2026-08-28T14:00:00Z', knownAt: rel3.knownAt, question: 'WHAT_THE_SOURCE_KNEW' }, { enforceRights: true });
    expect(restricted.refusal?.code).toBe('QUESTION_NOT_ANSWERABLE');
    expect(restricted.candidates).toEqual([]);
  });
});

describe('what still stands, which is not what was knowable', () => {
  /*
   * `releaseRecords` answers what the corpus could see. This answers what the
   * corpus still asserts, and anything computing over "the corpus" has to ask
   * the second question. The demonstration corpus carries both kinds of
   * retraction, so both are exercised on real rows.
   */
  const now = '2026-09-01T10:21:00Z';

  it('drops a withdrawn record and a corrected record\'s original, and keeps the replacement', () => {
    const standing = standingRecords(corpus, now).map((record) => record.recordId);
    // RET-0002 withdrew two records outright.
    expect(standing).not.toContain('REC-0111');
    expect(standing).not.toContain('REC-0112');
    // RET-0001 corrected REC-0203 with REC-0204. The original goes; the
    // replacement stays, because a correction replaces a claim rather than
    // adding a second one beside it.
    expect(standing).not.toContain('REC-0203');
    expect(standing).toContain('REC-0204');
  });

  it('counts what was knowable and what still stands as different numbers', () => {
    const knowable = releaseRecords(corpus, { ...rel3, knownAt: now }).length;
    const standing = standingRecords(corpus, now).length;
    expect(standing).toBe(knowable - 3);
    expect(takenBackBy(corpus, now).map((entry) => entry.recordId)).toEqual(['REC-0111', 'REC-0112', 'REC-0203']);
    expect(takenBackBy(corpus, now).find((entry) => entry.recordId === 'REC-0203')?.kind).toBe('CORRECTION');
  });

  /*
   * The bitemporal property, applied to the question of what a derivation was
   * allowed to read. A retraction issued after the knowledge time has not
   * happened yet, so replaying that time still sees the record standing — and
   * a computation replayed at it computes the same thing it computed then.
   */
  it('still sees a record that had not been taken back yet at the time asked about', () => {
    const before = '2026-08-30T14:59:59Z';
    expect(standingRecords(corpus, before).map((record) => record.recordId)).toContain('REC-0111');
    expect(takenBackBy(corpus, before).map((entry) => entry.recordId)).not.toContain('REC-0111');
    // And a moment after the withdrawal was issued, it is gone.
    expect(standingRecords(corpus, '2026-08-30T15:00:01Z').map((record) => record.recordId)).not.toContain('REC-0111');
  });

  it('never returns a record the corpus could not yet see', () => {
    const early = '2026-08-11T00:00:00Z';
    for (const record of standingRecords(corpus, early)) expect(record.knownAt <= early, record.recordId).toBe(true);
  });
});
