import { describe, expect, it } from 'vitest';
import { ABSENCE_MEANING, GROUND_LOSS, GROUND_METHOD, QUESTION_MEANING, absenceIn, answerable, asOf, clocksCohere, mayLeaveTheBoundary, reasoningAllowed, type GroundRecord } from './referenceGround';

const live: GroundRecord = {
  recordId: 'REC-LIVE', provenance: 'LIVE_CAPTURE',
  validFrom: '2019-06-01T00:00:00Z', validTo: null,
  sourceTime: '2019-06-02T00:00:00Z', acquisitionTime: '2019-06-02T01:00:00Z',
};
const backfilled: GroundRecord = {
  recordId: 'REC-BACK', provenance: 'BACKFILLED',
  validFrom: '2019-06-01T00:00:00Z', validTo: null,
  sourceTime: '2019-06-02T00:00:00Z', acquisitionTime: '2026-09-07T00:00:00Z',
};

describe('the third clock, and the two questions it keeps apart', () => {
  it('answers what the source knew over backfill, and says that is not a claim about this system', () => {
    const reading = answerable(backfilled, 'WHAT_THE_SOURCE_KNEW', '2019-07-01T00:00:00Z');
    expect(reading.answerable).toBe(true);
    expect(reading.because).toMatch(/says nothing about whether this system held it/);
    expect(QUESTION_MEANING.WHAT_THE_SOURCE_KNEW).toMatch(/not a claim that this system held it/);
  });

  it('refuses to let backfill answer what this system held, which is the question the product sells', () => {
    // The fabrication this module exists to block: bought in 2026, it cannot
    // be part of what was held in 2019, however early the source knew it.
    const reading = answerable(backfilled, 'WHAT_WE_HELD', '2019-07-01T00:00:00Z');
    expect(reading.answerable).toBe(false);
    expect(reading.because).toMatch(/did not hold it then/);
    expect(reading.because).toMatch(/The source may have known it long before; that is the other question/);
    // Live capture answers both, because its clocks were never apart.
    expect(answerable(live, 'WHAT_WE_HELD', '2019-07-01T00:00:00Z').answerable).toBe(true);
    expect(answerable(live, 'WHAT_THE_SOURCE_KNEW', '2019-07-01T00:00:00Z').answerable).toBe(true);
    expect(GROUND_LOSS.join(' ')).toMatch(/invents a corpus that knew things it did not know/);
  });

  it('names what each question excluded rather than quietly dropping it', () => {
    const held = asOf([live, backfilled], 'WHAT_WE_HELD', '2019-07-01T00:00:00Z');
    expect(held.included.map((r) => r.recordId)).toEqual(['REC-LIVE']);
    expect(held.excluded[0]).toMatchObject({ recordId: 'REC-BACK' });
    expect(held.because).toMatch(/1 of 2 answer WHAT_WE_HELD/);

    const known = asOf([live, backfilled], 'WHAT_THE_SOURCE_KNEW', '2019-07-01T00:00:00Z');
    expect(known.included).toHaveLength(2);
    expect(known.because).toMatch(/1 of them backfilled/);
    // The same instant, two questions, two different answers, and the answer says which it answered.
    expect(known.question).not.toBe(held.question);
    expect(GROUND_METHOD).toMatch(/\.v1$/);
  });

  it('refuses a record obtained before its source published it, whatever it is labelled', () => {
    const impossible = clocksCohere({ ...live, acquisitionTime: '2019-06-01T00:00:00Z' });
    expect(impossible.coherent).toBe(false);
    expect(impossible.because).toMatch(/did not arrive the way it claims to have arrived/);
    expect(clocksCohere({ ...live, sourceTime: 'whenever' }).coherent).toBe(false);
    expect(answerable({ ...live, acquisitionTime: '2019-06-01T00:00:00Z' }, 'WHAT_WE_HELD', '2026-01-01T00:00:00Z').answerable).toBe(false);
    // Provenance itself is declared, never inferred from the gap.
    expect(GROUND_LOSS.join(' ')).toMatch(/Provenance is declared, never inferred/);
    expect(clocksCohere(backfilled).coherent).toBe(true);
  });
});

describe('absence has three readings and none of them is that it did not happen', () => {
  it('separates what the source did not record from what was never acquired', () => {
    expect(absenceIn({ groundCoversRange: false, sourceDeclaredComplete: true }).reading).toBe('WE_ACQUIRED_NOTHING');
    expect(absenceIn({ groundCoversRange: true, sourceDeclaredComplete: false }).reading).toBe('INDETERMINATE');
    expect(absenceIn({ groundCoversRange: true, sourceDeclaredComplete: true }).reading).toBe('SOURCE_RECORDED_NOTHING');
    expect(ABSENCE_MEANING.SOURCE_RECORDED_NOTHING).toMatch(/a fact about the source’s records/);
    expect(ABSENCE_MEANING.INDETERMINATE).toMatch(/indistinguishable here/);
    const loss = GROUND_LOSS.join(' ');
    expect(loss).toMatch(/none of them is that the thing did not happen/);
    expect(loss).toMatch(/the world is not obliged to have been quiet because nobody wrote it down/);
  });
});

describe('the boundary the ground never crosses', () => {
  it('lets a measurement of the ground be sold and never the ground', () => {
    expect(mayLeaveTheBoundary('MEASUREMENT_OF_GROUND').allowed).toBe(true);
    expect(mayLeaveTheBoundary('MEASUREMENT_OF_GROUND').because).toMatch(/You can sell the certification/);
    const ground = mayLeaveTheBoundary('GROUND');
    expect(ground.allowed).toBe(false);
    expect(ground.because).toMatch(/a negotiable standard is not a standard/);
    expect(ground.because).toMatch(/You cannot sell the judge/);
  });

  it('lets a reasoner work over the ground and never into it', () => {
    for (const use of ['QUERY', 'CITE', 'TEST'] as const) {
      expect(reasoningAllowed(use).allowed).toBe(true);
      expect(reasoningAllowed(use).because).toMatch(/stays external to the reasoner/);
    }
    for (const use of ['TRAIN', 'DISTIL', 'FINE_TUNE', 'EMBED'] as const) {
      const reading = reasoningAllowed(use);
      expect(reading.allowed).toBe(false);
      expect(reading.because).toMatch(/no longer external and nothing it "confirms" is a check/);
    }
    expect(GROUND_LOSS.join(' ')).toMatch(/a reasoner cannot be checked against something it has absorbed/);
  });

  it('says a backfilled release is a different object from a live-captured one', () => {
    expect(GROUND_LOSS.join(' ')).toMatch(/the shadow of a live corpus, not a substitute for one/);
    expect(GROUND_LOSS.join(' ')).toMatch(/its manifest says which it is/);
  });
});
