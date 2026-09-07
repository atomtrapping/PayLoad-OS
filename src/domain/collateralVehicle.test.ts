import { describe, expect, it } from 'vitest';
import { CARAVAN_CORPUS } from '@/fixtures/caravan/release';
import { currentRelease, releaseById } from './corpus';
import {
  DISPUTE_QUESTION, LIABILITY_BOUNDARY, LIFECYCLE, NEVER, VEHICLE_ROLE, VEHICLE_SEQUENCE,
  evaluateRelease, exposureAfter, restatementExposure, type ReleaseCondition,
} from './collateralVehicle';

const corpus = CARAVAN_CORPUS;
const release = currentRelease(corpus);

/** The condition sits between the draft survey (40.000 t) and the weighbridge (40.120 t). */
const TIGHT: ReleaseCondition = {
  conditionId: 'COND-GROSS-40-05',
  subjectId: 'LOT-5B-221',
  predicate: 'quantity.gross',
  test: 'AT_MOST',
  value: 40.05,
  agreedText: 'Release on confirmation that the gross quantity of lot 5B-221 does not exceed 40.05 t.',
};

describe('conditional custody: hold, monitor, adjudicate, release', () => {
  it('is the condition evaluator and refuses every role that would make it a party', () => {
    expect(VEHICLE_ROLE.is).toContain('condition evaluator');
    expect(VEHICLE_ROLE.isNot.length).toBeGreaterThanOrEqual(4);
    const acts = NEVER.map((n) => n.act.toLowerCase());
    expect(acts.some((a) => a.includes('hold the collateral'))).toBe(true);
    expect(acts.some((a) => a.includes('warrant the outcome'))).toBe(true);
    expect(acts.some((a) => a.includes('un-fire'))).toBe(true);
    for (const prohibition of NEVER) {
      expect(prohibition.why.length).toBeGreaterThan(40);
      expect(prohibition.enforcedHere.length).toBeGreaterThan(30);
    }
    expect(LIABILITY_BOUNDARY.doesNotWarrant).toContain('cargo is fit');
  });

  it('states no balance, account or transfer anywhere, because custody is the one role that would need a licence', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('src/domain/collateralVehicle.ts', 'utf8');
    // The prohibitions may name these words; no interface or function may implement them.
    expect(/\b(balance|transfer|withdrawBalance)\s*[:(]/.test(source)).toBe(false);
  });

  it('names the machinery and what exists here for every stage of the lifecycle', () => {
    expect(LIFECYCLE.map((s) => s.state)).toEqual(['DEPOSITED', 'HELD', 'CONDITION_MET', 'RELEASED', 'RETURNED']);
    for (const stage of LIFECYCLE) expect(stage.here.length).toBeGreaterThan(20);
    expect(LIFECYCLE.find((s) => s.state === 'RELEASED')!.here).toContain('No release has fired');
  });

  it('adjudicates on what the vehicle held, and stamps every decision over this corpus as a demonstration', () => {
    const decision = evaluateRelease(corpus, release, TIGHT, '2026-08-20T00:00:00Z');
    expect(decision.standing).toBe('DEMONSTRATION');
    expect(decision.verdict).toBe('GRANTED');
    expect(decision.reliedOn).toEqual(['REC-0203']);
    expect(decision.because).toContain('not about the cargo');
    // The dispute asks one question, and it is the one this corpus can bound.
    expect(DISPUTE_QUESTION).toBe('WHAT_WE_HELD');
  });

  it('reverses on corrected facts without un-firing the release: right when it fired, wrong five and a half days later', () => {
    // Decided on 2026-08-20, when the corpus held only the draft survey at 40.000 t.
    const decision = evaluateRelease(corpus, release, TIGHT, '2026-08-20T00:00:00Z');
    expect(decision.verdict).toBe('GRANTED');

    // RET-0001 supersedes it on 2026-08-25T14:00Z with a weighbridge ticket at 40.120 t:
    // 5 days 14 hours after the vehicle decided, and well inside any plausible hold.
    const exposure = exposureAfter(corpus, release, decision, '2026-09-01T12:00:00Z');
    expect(exposure.restatements.map((r) => r.retractionId)).toEqual(['RET-0001']);
    expect(exposure.restatements[0].kind).toBe('CORRECTION');
    expect(exposure.restatements[0].lagSeconds).toBe(5 * 86_400 + 14 * 3_600);
    expect(exposure.verdictNow).toBe('WITHHELD');
    expect(exposure.reversed).toBe(true);
    expect(exposure.unsupported).toBe(false);
    expect(exposure.because).toContain('right on what was held and is wrong on what is held');

    // The decision itself is untouched: a release that fired is history.
    expect(decision.verdict).toBe('GRANTED');
    expect(exposure.decision.decidedAtKnowledge).toBe('2026-08-20T00:00:00Z');
  });

  it('reports a withdrawal as lost support rather than as a contrary fact', () => {
    const rel1 = releaseById(corpus, 'REL-CAR-2026.08.18') ?? release;
    const moisture: ReleaseCondition = {
      conditionId: 'COND-MOISTURE-EXISTS',
      subjectId: 'SAMPLE-S-4390',
      predicate: 'condition.moisture',
      test: 'EXISTS',
      agreedText: 'Release on a moisture determination for sample S-4390 being of record.',
    };
    const decision = evaluateRelease(corpus, rel1, moisture, '2026-08-14T00:00:00Z');
    expect(decision.verdict).toBe('GRANTED');
    expect(decision.reliedOn).toContain('REC-0111');

    // RET-0002 withdraws the certificate for a chain-of-custody defect.
    const exposure = exposureAfter(corpus, release, decision, '2026-09-01T12:00:00Z');
    expect(exposure.restatements.map((r) => r.kind)).toContain('WITHDRAWAL');
    expect(exposure.unsupported).toBe(true);
    expect(exposure.because).toContain('removes support');
    expect(exposure.because).toContain('not a finding that the condition was false');
    // The corpus's own reason keeps the same distinction, and the vehicle carries it verbatim.
    expect(exposure.restatements.find((r) => r.kind === 'WITHDRAWAL')!.reason).toContain('not a finding about the cargo');
  });

  it('withholds rather than releasing when the corpus cannot answer, and never returns on an unanswerable condition', () => {
    const absent: ReleaseCondition = {
      conditionId: 'COND-ABSENT', subjectId: 'LOT-9A-017', predicate: 'quantity.gross', test: 'AT_LEAST', value: 1,
      agreedText: 'Release on a gross quantity for a lot the corpus has never carried.',
    };
    const decision = evaluateRelease(corpus, release, absent, '2026-09-01T12:00:00Z');
    expect(decision.verdict).toBe('NOT_ADJUDICABLE');
    expect(decision.reliedOn).toEqual([]);
    expect(decision.because).toContain('the vehicle stays held');
  });

  it('measures the exposure window and refuses to turn it into a rate', () => {
    const exposure = restatementExposure(corpus);
    expect(exposure.corrections).toBe(1);
    expect(exposure.withdrawals).toBe(1);
    expect(exposure.observedLagDays.length).toBeGreaterThanOrEqual(3);
    expect(exposure.longestLagDays).toBeGreaterThan(7);
    expect(exposure.ratePriceable).toBe(false);
    expect(exposure.statement).toContain('anecdote, not a frequency');
  });

  it('names an admitted record and an independent channel before any of this is real', () => {
    expect(VEHICLE_SEQUENCE[0]).toContain('admitted record');
    expect(VEHICLE_SEQUENCE.some((s) => s.includes('adversarial-oracle'))).toBe(true);
    expect(VEHICLE_SEQUENCE.some((s) => s.toLowerCase().includes('custody arrangement'))).toBe(true);
  });

  it('carries the corpus\u2019s restatement exposure on the decision, so an audit reads the risk neighbourhood rather than reconstructing it', () => {
    const decision = evaluateRelease(corpus, release!, TIGHT, '2026-08-20T00:00:00Z');
    // The decision arrives with its own context: what this corpus had
    // restated by the instant it decided.
    expect(decision.exposureAtDecision).toBeDefined();
    expect(decision.exposureAtDecision).toEqual(restatementExposure(corpus));
    expect(typeof decision.exposureAtDecision.recordsCarried).toBe('number');
    // Carried, never priced. The refusal travels with the decision so nobody
    // multiplies a fixture-scale denominator by an exposure downstream.
    expect(decision.exposureAtDecision.ratePriceable).toBe(false);
  });
});
