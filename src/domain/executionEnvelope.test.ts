import { describe, expect, it } from 'vitest';
import {
  ACTION_PHASES, AGENT_MAY, AGENT_MAY_NEVER, AGENT_RULE, BLOCKED_ON, ENVELOPE_CLASSES,
  ENVELOPE_CONTRACTS, IDENTITIES, LIFECYCLE, LIFECYCLE_ARROWS, MEMORY_RULE, OUTCOMES,
  PRICING, PROHIBITIONS, STATE_OBJECTS, UNKNOWN_OUTCOME_RULE, VERIFICATION_CONTRACT,
  agentMay, envelopeContract, envelopeStanding,
} from './executionEnvelope';

describe('three objects, never collapsed', () => {
  it('names X, H and S and what collapsing each would produce', () => {
    expect(STATE_OBJECTS.map((object) => object.symbol)).toEqual(['X', 'H', 'S']);
    for (const object of STATE_OBJECTS) expect(object.forbids, object.symbol).not.toHaveLength(0);
    expect(STATE_OBJECTS[0].forbids).toBe('A database recording delivery is not delivery.');
    expect(STATE_OBJECTS[2].forbids).toContain('S never silently becomes X');
  });
});

describe('the lifecycle arrows are boundaries', () => {
  it('runs observe to reconcile, once each', () => {
    expect(LIFECYCLE).toEqual(['observe', 'propose', 'evaluate', 'authorize', 'execute', 'verify', 'reconcile']);
    expect(new Set(LIFECYCLE).size).toBe(LIFECYCLE.length);
  });

  it('states the three that are skipped in the expensive failures', () => {
    expect(LIFECYCLE_ARROWS).toEqual([
      'A proposal is not an authorization.',
      'An authorization is not dispatch.',
      'A dispatch is not completion.',
    ]);
  });
});

describe('where the agent sits', () => {
  /*
   * The division is the whole safety argument, so it is a partition rather than
   * a preference: every step is either one an agent may take or one it may not,
   * and no step is both.
   */
  it('lets the agent observe, propose, verify and reconcile, and nothing else', () => {
    expect(AGENT_MAY).toEqual(['observe', 'propose', 'verify', 'reconcile']);
    expect(AGENT_MAY_NEVER).toEqual(['authorize', 'execute']);
    for (const step of AGENT_MAY) expect(AGENT_MAY_NEVER, step).not.toContain(step);
    for (const step of LIFECYCLE) expect(agentMay(step), step).toBe(AGENT_MAY.includes(step));
    expect(agentMay('authorize')).toBe(false);
    expect(agentMay('execute')).toBe(false);
    expect(AGENT_RULE).toContain('must not manufacture its own authority');
  });

  it('keeps the operation, the attempt and the verification as three identities', () => {
    expect(IDENTITIES).toHaveLength(3);
    expect(IDENTITIES.map((entry) => entry.identity)).toEqual(['operation', 'execution attempt', 'verification']);
    expect(IDENTITIES[0].collapsing).toContain('a retry becomes a second commitment');
  });
});

describe('envelope classes are capabilities, not confidence levels', () => {
  it('gives exactly one class side effects, and that one alone needs an authorization', () => {
    expect(ENVELOPE_CLASSES).toEqual(['READ_ONLY', 'PROPOSAL', 'NARROW_ACTION']);
    const withEffects = ENVELOPE_CONTRACTS.filter((contract) => contract.sideEffects);
    expect(withEffects.map((contract) => contract.class)).toEqual(['NARROW_ACTION']);
    for (const contract of ENVELOPE_CONTRACTS) {
      expect(contract.requiresAuthorization, contract.class).toBe(contract.sideEffects);
    }
    expect(envelopeContract('READ_ONLY').sideEffects).toBe(false);
  });
});

describe('how a dispatch can end', () => {
  it('carries an unknown outcome as a terminal state rather than a reason to retry', () => {
    expect(OUTCOMES).toEqual(['CONFIRMED', 'REJECTED', 'OUTCOME_UNKNOWN']);
    expect(UNKNOWN_OUTCOME_RULE).toContain('never treated as "nothing happened"');
    expect(UNKNOWN_OUTCOME_RULE).toContain('never triggers an automatic retry');
  });
});

describe('the standing prohibitions', () => {
  it('keeps all four, each with what it means', () => {
    expect(PROHIBITIONS.map((entry) => entry.rule)).toEqual([
      'Never hold', 'Never warrant', 'Never un-fire', 'Never commit on unadmitted state',
    ]);
    expect(PROHIBITIONS.find((entry) => entry.rule === 'Never un-fire')!.means).toContain('Corrections are new events');
  });
});

describe('verification is a named claim with a coverage', () => {
  it('never emits a bare true, and carries the coverage hole with it', () => {
    expect(VERIFICATION_CONTRACT.neverEmit).toBe('verified: true');
    expect(VERIFICATION_CONTRACT.coverageHole).toContain('says nothing about what was omitted');
    expect(VERIFICATION_CONTRACT.privacySeparations).toHaveLength(2);
    expect(VERIFICATION_CONTRACT.privacySeparations[0]).toContain('not privacy from the proving infrastructure');
    expect(VERIFICATION_CONTRACT.firstGuest).toContain('Certify a useful boundary');
  });
});

describe('pricing, corrected', () => {
  /*
   * The third implication is the newest and the one that gives a pilot a
   * failure direction to measure rather than only successes to report.
   */
  it('demotes the heuristic and counts false interventions in the economics', () => {
    expect(PRICING.screeningHeuristic).toContain('not a pricing law');
    expect(PRICING.exposureRule).toBe('Exposure is not avoided loss. A number describing what is at stake is not a number describing what was saved.');
    expect(PRICING.implications).toHaveLength(3);
    expect(PRICING.implications[0]).toContain('Authority is a value channel, not a prerequisite');
    expect(PRICING.implications[2]).toContain('unnecessary holds are a measured outcome');
  });
});

describe('memory is measured behaviour', () => {
  it('stores observations rather than verdicts, and states the counterfactual it cannot see', () => {
    expect(MEMORY_RULE.stores).toEqual(['promised date', 'observed date', 'lane', 'source', 'uncertainty']);
    expect(MEMORY_RULE.neverStores).toContain('"This supplier lies" is a conclusion');
    expect(MEMORY_RULE.missingCounterfactual).toContain('nothing about the outcomes of the alternatives declined');
    expect(MEMORY_RULE.customerBoundary).toContain('never to charge rent for possessing their past');
  });
});

describe('the phases, and what blocks them', () => {
  it('gives only the third phase any live authority', () => {
    expect(ACTION_PHASES.map((phase) => phase.order)).toEqual([1, 2, 3]);
    expect(ACTION_PHASES.filter((phase) => phase.liveAuthority).map((phase) => phase.order)).toEqual([3]);
    expect(ACTION_PHASES[0].requires).toContain('Admitted history to reconstruct');
  });

  /*
   * The readiness claim, made in the negative. An envelope binds to a release
   * and there are none, so nothing can be authorized — and the standing says
   * that rather than reporting a capability the corpus does not have.
   */
  it('cannot authorize anything while no release exists to bind to', () => {
    const standing = envelopeStanding();
    expect(standing.releasesAvailableToBindTo).toBe(0);
    expect(standing.canAuthorize).toBe(false);
    expect(standing.dispatches).toBe(0);
    expect(standing.phase).toBe(0);
    expect(standing.blockedOn).toEqual([...BLOCKED_ON]);
    expect(standing.coverage).toBe('CONTRACT_ONLY_NOTHING_DISPATCHED');
  });

  it('clears the block only when a release exists, so the zero means something', () => {
    const standing = envelopeStanding({ releases: 1 });
    expect(standing.canAuthorize).toBe(true);
    expect(standing.blockedOn).toEqual([]);
  });
});
