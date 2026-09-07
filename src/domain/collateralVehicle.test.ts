import { describe, expect, it } from 'vitest';
import { CARAVAN_CORPUS } from '@/fixtures/caravan/release';
import { currentRelease, releaseById } from './corpus';
import {
  ATTESTOR_KINDS, POST_RELEASE_MEANING, scalar, DISPUTE_QUESTION, LIABILITY_BOUNDARY, LIFECYCLE, NEVER, PRICEABILITY_GATE,
  TRUST_ORDER, VEHICLE_ROLE, VEHICLE_SEQUENCE, VENUE_PROPERTIES,
  evaluateRelease, exposureAfter, restatementExposure, type ReleaseCondition,
} from './collateralVehicle';

const corpus = CARAVAN_CORPUS;
const release = currentRelease(corpus);

/** The condition sits between the draft survey (40.000 t) and the weighbridge (40.120 t). */
const TIGHT: ReleaseCondition = {
  conditionId: 'COND-GROSS-40-05',
  agreedText: 'Release on confirmation that the gross quantity of lot 5B-221 does not exceed 40.05 t.',
  root: scalar('LOT-5B-221', 'quantity.gross', 'AT_MOST', 40.05, 'Gross quantity not to exceed 40.05 t.'),
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
    expect(exposure.state).toBe('REVERSED_ON_CORRECTION');
    expect(exposure.because).toContain('right on what was held and is wrong on what is held');

    // The decision itself is untouched: a release that fired is history.
    expect(decision.verdict).toBe('GRANTED');
    expect(exposure.decision.decidedAtKnowledge).toBe('2026-08-20T00:00:00Z');
  });

  it('reports a withdrawal as lost support rather than as a contrary fact', () => {
    const rel1 = releaseById(corpus, 'REL-CAR-2026.08.18') ?? release;
    const moisture: ReleaseCondition = {
      conditionId: 'COND-MOISTURE-EXISTS',
      agreedText: 'Release on a moisture determination for sample S-4390 being of record.',
      root: scalar('SAMPLE-S-4390', 'condition.moisture', 'EXISTS', undefined, 'A moisture determination is of record.'),
    };
    const decision = evaluateRelease(corpus, rel1, moisture, '2026-08-14T00:00:00Z');
    expect(decision.verdict).toBe('GRANTED');
    expect(decision.reliedOn).toContain('REC-0111');

    // RET-0002 withdraws the certificate for a chain-of-custody defect.
    const exposure = exposureAfter(corpus, release, decision, '2026-09-01T12:00:00Z');
    expect(exposure.restatements.map((r) => r.kind)).toContain('WITHDRAWAL');
    expect(exposure.unsupported).toBe(true);
    // The terminal state a consumer routes on keeps the withdrawal out of the
    // reversal branch, so no downstream caller can flatten the two.
    expect(exposure.state).toBe('UNSUPPORTED_BY_WITHDRAWAL');
    expect(POST_RELEASE_MEANING[exposure.state].andSo).toContain('never to be routed as one');
    expect(exposure.because).toContain('removes support');
    expect(exposure.because).toContain('not a finding that the condition was false');
    // The corpus's own reason keeps the same distinction, and the vehicle carries it verbatim.
    expect(exposure.restatements.find((r) => r.kind === 'WITHDRAWAL')!.reason).toContain('not a finding about the cargo');
  });

  it('withholds rather than releasing when the corpus cannot answer, and never returns on an unanswerable condition', () => {
    const absent: ReleaseCondition = {
      conditionId: 'COND-ABSENT',
      agreedText: 'Release on a gross quantity for a lot the corpus has never carried.',
      root: scalar('LOT-9A-017', 'quantity.gross', 'AT_LEAST', 1, 'Gross quantity of at least 1 t.'),
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

  it('carries the corpus\u2019s restatement exposure on the decision, bounded by its own clock rather than by hindsight', () => {
    const early = evaluateRelease(corpus, release, TIGHT, '2026-08-20T00:00:00Z');
    const late = evaluateRelease(corpus, release, TIGHT, '2026-09-01T12:00:00Z');

    // The decision arrives with its own context: what this corpus had restated
    // by the instant it decided — and, crucially, not what it restated after.
    // An exposure computed over everything since learned is hindsight wearing
    // the decision's clothes, so the early decision must report nothing.
    expect(early.exposureAtDecision.corrections + early.exposureAtDecision.withdrawals).toBe(0);
    expect(early.exposureAtDecision.longestLagDays).toBeNull();
    expect(early.exposureAtDecision.statement).toContain('no observed window at all');
    expect(early.exposureAtDecision).not.toEqual(restatementExposure(corpus));

    // By the later instant the same corpus has restated twice.
    expect(late.exposureAtDecision.corrections + late.exposureAtDecision.withdrawals).toBe(2);
    expect(late.exposureAtDecision.longestLagDays).toBeGreaterThan(0);

    // Carried, never priced. The refusal travels with the decision so nobody
    // multiplies a fixture-scale denominator by an exposure downstream.
    expect(early.exposureAtDecision.ratePriceable).toBe(false);
    expect(late.exposureAtDecision.ratePriceable).toBe(false);
    expect(late.exposureAtDecision.unmet.some((u) => u.includes('committed demonstration'))).toBe(true);
  });

  it('derives priceability from a declared gate rather than returning a permanent false', () => {
    const exposure = restatementExposure(corpus);
    expect(exposure.ratePriceable).toBe(false);
    expect(exposure.unmet.length).toBeGreaterThan(0);
    // Every unmet condition names a threshold from the gate, so the gate can open.
    expect(exposure.unmet.some((u) => u.includes(String(PRICEABILITY_GATE.minRestatements)))).toBe(true);
    expect(exposure.unmet.some((u) => u.includes(String(PRICEABILITY_GATE.minRecords)))).toBe(true);
    expect(PRICEABILITY_GATE.andEvenThen).toContain('different denominators');
    // ratePriceable is true exactly when nothing is unmet.
    expect(exposure.ratePriceable).toBe(exposure.unmet.length === 0);
  });

  it('bounds the exposure by a knowledge instant when one is given', () => {
    const all = restatementExposure(corpus);
    const early = restatementExposure(corpus, '2026-08-20T00:00:00Z');
    expect(all.corrections + all.withdrawals).toBe(2);
    expect(early.corrections + early.withdrawals).toBe(0);
    expect(early.recordsCarried).toBeLessThan(all.recordsCarried);
    expect(early.statement).toContain('no observed window at all');
  });

  it('targets a property set rather than a venue, and keeps the two kinds of attestor apart', () => {
    expect(VENUE_PROPERTIES.map((p) => p.property)).toContain('Non-custodial hold');
    expect(VENUE_PROPERTIES.length).toBe(4);
    const execution = ATTESTOR_KINDS.find((a) => a.kind === 'EXECUTION')!;
    const fact = ATTESTOR_KINDS.find((a) => a.kind === 'FACT')!;
    expect(execution.scarcity).toContain('Commodity');
    expect(execution.saysNothingAbout).toContain('verified assertion');
    expect(fact.scarcity).toContain('Estate-dependent');
    // Standing behind a fact is the measurable half, and it points at this module's own machinery.
    expect(fact.saysNothingAbout).toContain('what has been restated');
  });

  it('puts the adjudication first and a venue feature last, and separates transport from testimony', () => {
    expect(TRUST_ORDER.first).toContain('adjudication');
    expect(TRUST_ORDER.second).toContain('policy ran rather than that the policy was right');
    expect(TRUST_ORDER.third).toContain('never ground');
    expect(TRUST_ORDER.theConfusion).toContain('Transport verification is not content testimony');
  });

  it('names a terminal state for every outcome, and checks the withdrawal before the reversal', () => {
    // Every state has a meaning and a consequence, and the withdrawal's says plainly
    // that nothing contrary was established.
    for (const [state, meaning] of Object.entries(POST_RELEASE_MEANING)) {
      expect(meaning.meaning.length, state).toBeGreaterThan(30);
      expect(meaning.andSo.length, state).toBeGreaterThan(30);
    }
    expect(POST_RELEASE_MEANING.UNSUPPORTED_BY_WITHDRAWAL.andSo).toContain('Not a finding');
    expect(POST_RELEASE_MEANING.REVERSED_ON_CORRECTION.andSo).toContain('A finding');

    // A decision nothing has touched stands, rather than being called anything else.
    const untouched = evaluateRelease(corpus, release, {
      conditionId: 'COND-UNTOUCHED',
      agreedText: 'Release on a gross quantity for lot 7C-104 of at least 1 t.',
      root: scalar('LOT-7C-104', 'quantity.gross', 'AT_LEAST', 1, 'Gross quantity of at least 1 t.'),
    }, '2026-09-01T12:00:00Z');
    const exposure = exposureAfter(corpus, release, untouched, '2026-09-01T12:00:00Z');
    expect(exposure.state).toBe('STANDS');
    expect(exposure.restatements).toEqual([]);
  });

  it('adjudicates a composite condition over the real corpus, and an undecided leg does not become a failed one', () => {
    // One leg the corpus can answer, one it cannot. Under ALL_OF that is
    // undecided, never withheld — the release stays held rather than returning.
    const composite = evaluateRelease(corpus, release, {
      conditionId: 'COND-COMPOSITE',
      agreedText: 'Release on the gross quantity being within tolerance and a moisture determination of record for a lot that has none.',
      root: {
        kind: 'ALL_OF', agreedText: 'Both terms of the confirmation.',
        of: [
          scalar('LOT-5B-221', 'quantity.gross', 'AT_MOST', 41, 'Gross quantity not to exceed 41 t.'),
          scalar('LOT-9A-017', 'condition.moisture', 'EXISTS', undefined, 'A moisture determination is of record.'),
        ],
      },
    }, '2026-09-01T12:00:00Z');
    expect(composite.verdict).toBe('NOT_ADJUDICABLE');
    expect(composite.because).toContain('an undecided leg is not a failed one');
    expect(composite.because).toContain('the vehicle stays held');

    // Swap the unanswerable leg for a definitely-unmet one and the composite is decided.
    const decided = evaluateRelease(corpus, release, {
      conditionId: 'COND-COMPOSITE-2',
      agreedText: 'Release on the gross quantity being within an impossible tolerance and within a generous one.',
      root: {
        kind: 'ALL_OF', agreedText: 'Both terms.',
        of: [
          scalar('LOT-5B-221', 'quantity.gross', 'AT_MOST', 41, 'Gross quantity not to exceed 41 t.'),
          scalar('LOT-5B-221', 'quantity.gross', 'AT_MOST', 1, 'Gross quantity not to exceed 1 t.'),
        ],
      },
    }, '2026-09-01T12:00:00Z');
    expect(decided.verdict).toBe('WITHHELD');
    expect(decided.reliedOn).toContain('REC-0204');
  });
});
