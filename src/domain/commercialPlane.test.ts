import { describe, expect, it } from 'vitest';
import {
  COMMERCIAL_ARROWS, COMMERCIAL_BLOCKED_ON, COMMERCIAL_PIPELINE, ENGAGEMENT_FIELDS,
  ENGAGEMENT_OUTCOMES, ENGAGEMENT_STANDINGS, MARKET_DISCOVERY, MARKET_DISCOVERY_RULE,
  MESSAGE_IS_A_SERVING_SURFACE, MISSING_COUNTERFACTUAL, OPPORTUNITY_CLASSES, OPPORTUNITY_FIELDS,
  OPPORTUNITY_RULE, OUTCOME_ADMISSION_RULE, OUTCOME_RULE, SALES_AGENT_MAY, SALES_AGENT_MAY_NEVER,
  SEPARATION_RULE, commercialStanding,
} from './commercialPlane';
import { CLASS_CONTRACTS, FITTED_CLASSES } from './discoveryLayer';

describe('the same arrows, in commercial words', () => {
  it('runs corpus to new evidence and closes the loop', () => {
    expect(COMMERCIAL_PIPELINE[0]).toBe('Corpus');
    expect(COMMERCIAL_PIPELINE.at(-1)).toBe('New evidence');
    expect(COMMERCIAL_PIPELINE).toContain('Authorization');
    expect(COMMERCIAL_PIPELINE.indexOf('Authorization'))
      .toBeGreaterThan(COMMERCIAL_PIPELINE.indexOf('Engagement proposal'));
  });

  it('states the three that are skipped in the expensive failures', () => {
    expect(COMMERCIAL_ARROWS).toEqual([
      'A detected opportunity is not an engagement.',
      'An engagement proposal is not an authorization to send it.',
      'A sent message is not a commercial outcome.',
    ]);
    expect(SEPARATION_RULE).toBe('Knowing something is not deciding something is not doing something.');
  });
});

describe('an opportunity is a fitted claim about an account', () => {
  /*
   * "This account has a problem we can help with" is a hypothesis about an
   * organization's situation and intentions. Arithmetic does not produce one.
   */
  it('is only ever a class the discovery layer treats as fitted', () => {
    expect(OPPORTUNITY_CLASSES).toEqual(['MODEL_INFERENCE', 'RECOMMENDATION']);
    for (const cls of OPPORTUNITY_CLASSES) expect(FITTED_CLASSES, cls).toContain(cls);
    expect(OPPORTUNITY_CLASSES).not.toContain('COMPUTED_RESULT');
    expect(OPPORTUNITY_CLASSES).not.toContain('SOURCE_OBSERVATION');
    expect(OPPORTUNITY_RULE).toContain('not a fact about it');
  });

  /* The trigger and the evidence are separate: one is what was noticed, the
   * other is what it was noticed in. */
  it('requires the evidence beside the trigger, not instead of it', () => {
    const required = OPPORTUNITY_FIELDS.filter((field) => field.required).map((field) => field.field);
    expect(required).toContain('trigger');
    expect(required).toContain('evidence');
    expect(required).toContain('confidence');
    expect(OPPORTUNITY_FIELDS.find((f) => f.field === 'estimatedValue')!.required).toBe(false);
  });
});

describe('the sales agent is a bounded actor, not a new architecture', () => {
  it('lets it observe, infer, detect and draft, and nothing else', () => {
    expect(SALES_AGENT_MAY).toEqual(['observe', 'infer', 'detect', 'draft']);
    expect(SALES_AGENT_MAY_NEVER).toEqual(['authorize', 'send']);
    for (const step of SALES_AGENT_MAY) expect(SALES_AGENT_MAY_NEVER, step).not.toContain(step);
  });

  it('requires the whole message on the record before anyone authorizes it', () => {
    const required = ENGAGEMENT_FIELDS.filter((field) => field.required).map((field) => field.field);
    expect(required).toEqual(['opportunity', 'contact', 'channel', 'message', 'supportingClaims', 'authorizationStatus']);
    expect(ENGAGEMENT_FIELDS.find((f) => f.field === 'authorizationStatus')!.answers)
      .toContain('absent reads as ready');
  });

  /*
   * The constraint that matters most on this plane: an outbound message is a
   * serving surface, and it is the one where dropping the class buys a reply.
   */
  it('treats a claim in a message as a served claim', () => {
    expect(MESSAGE_IS_A_SERVING_SURFACE).toContain('served at the class it was computed at');
    expect(MESSAGE_IS_A_SERVING_SURFACE).toContain('more expensive because the recipient acts on it');
    for (const cls of OPPORTUNITY_CLASSES) {
      expect(CLASS_CONTRACTS.find((entry) => entry.class === cls)!.origin).toBe('COMPUTATION');
    }
  });

  it('carries a standing that includes having been sent', () => {
    expect(ENGAGEMENT_STANDINGS).toEqual(['DRAFTED', 'AUTHORIZED', 'REFUSED', 'SENT']);
  });
});

describe('what comes back is evidence, and it comes in the front door', () => {
  it('records silence as an outcome rather than as a missing row', () => {
    expect(ENGAGEMENT_OUTCOMES[0]).toBe('NO_RESPONSE');
    expect(ENGAGEMENT_OUTCOMES).toContain('DECLINED');
    expect(OUTCOME_RULE).toContain('not a row that is missing');
  });

  it('admits the firm’s own data through the same boundary as everyone else’s', () => {
    expect(OUTCOME_ADMISSION_RULE).toContain('no privileged path');
    expect(OUTCOME_ADMISSION_RULE).toContain('fitted on unadmitted state');
  });

  /* A model fitted only on contacted accounts learns what the ranking believed. */
  it('states the counterfactual the funnel cannot see', () => {
    expect(MISSING_COUNTERFACTUAL).toContain('never contacted');
    expect(MISSING_COUNTERFACTUAL).toContain('what the ranking already believed');
  });
});

describe('the corpus discovering a market rather than being sold to one', () => {
  it('runs from mining to commercial validation, and validation is last', () => {
    expect(MARKET_DISCOVERY[0]).toBe('Mine the corpus');
    expect(MARKET_DISCOVERY.at(-1)).toBe('Commercial validation');
    expect(MARKET_DISCOVERY).toContain('Estimate its economic severity');
  });

  it('does not mistake a recurring constraint for a market', () => {
    expect(MARKET_DISCOVERY_RULE).toContain('not discovering that anyone will pay');
    expect(MARKET_DISCOVERY_RULE).toContain('a hypothesis about a market, not a market');
  });
});

describe('nothing has been detected, and the zero is derived', () => {
  it('reports zero opportunities and what it is blocked on', () => {
    const standing = commercialStanding();
    expect(standing.opportunities).toBe(0);
    expect(standing.sent).toBe(0);
    expect(standing.canEngage).toBe(false);
    expect(standing.blockedOn).toEqual([...COMMERCIAL_BLOCKED_ON]);
    expect(standing.coverage).toBe('CONTRACT_ONLY_NOTHING_DETECTED');
  });

  it('counts one that exists, and an opportunity citing nothing as the hunch it is', () => {
    const standing = commercialStanding([
      { opportunityId: 'O1', account: 'org:a', class: 'MODEL_INFERENCE', evidenceArtifactIds: ['A1'], standing: 'AUTHORIZED' },
      { opportunityId: 'O2', account: 'org:b', class: 'RECOMMENDATION', evidenceArtifactIds: [], standing: 'DETECTED' },
    ]);
    expect(standing.opportunities).toBe(2);
    expect(standing.authorized).toBe(1);
    expect(standing.detected).toBe(1);
    expect(standing.withoutEvidence).toBe(1);
    expect(standing.canEngage).toBe(true);
    expect(standing.blockedOn).toEqual([]);
  });
});
