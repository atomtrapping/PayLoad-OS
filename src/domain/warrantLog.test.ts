import { describe, expect, it } from 'vitest';
import {
  ASSURANCE_CONTRACTS, ASSURANCE_JOBS, CREDENTIAL_RULE, DISCLOSURE_IS_AN_OPERATION,
  DISPATCH_OUTCOMES, DISPATCH_RECHECKS, EXCEPTION_CONTRACTS, EXCEPTION_DESK_RULE, EXCEPTION_KINDS,
  EXTERNAL_EXECUTION_RULE, INTERCHANGE_RULE, REFERENCE_CONTRACTS, RESERVATION_RULE,
  RESERVATION_STATES, SIX_REFERENCES_RULE, STALENESS_RULE, TRANSITION_REFERENCES,
  VERIFIED_COMPUTATION_IS_NOT_VERIFIED_REALITY, WARRANT_BLOCKED_ON, WARRANT_QUESTIONS,
  WARRANT_RULE, warrantStanding,
} from './warrantLog';

describe('six references that must stay distinct', () => {
  it('names them in order, each with what collapsing it costs', () => {
    expect(TRANSITION_REFERENCES).toEqual([
      'EVIDENCE', 'OPERATION', 'PROPOSAL', 'AUTHORIZATION', 'EXECUTION_ATTEMPT', 'VERIFICATION',
    ]);
    expect(REFERENCE_CONTRACTS.map((entry) => entry.reference)).toEqual([...TRANSITION_REFERENCES]);
    for (const contract of REFERENCE_CONTRACTS) expect(contract.collapsing, contract.reference).not.toHaveLength(0);
  });

  /* The expensive collapse, and the one that books the freight twice. */
  it('keeps a retry from becoming a second commitment', () => {
    const attempt = REFERENCE_CONTRACTS.find((entry) => entry.reference === 'EXECUTION_ATTEMPT')!;
    expect(attempt.collapsing).toContain('the freight is booked twice');
    expect(SIX_REFERENCES_RULE).toContain('not many authorized business actions');
  });

  it('keeps dispatching from becoming completing', () => {
    const verification = REFERENCE_CONTRACTS.find((entry) => entry.reference === 'VERIFICATION')!;
    expect(verification.collapsing).toContain('a receipt becomes a delivery');
  });
});

describe('a warrant answers seven questions', () => {
  it('carries all seven, starting with what changed', () => {
    expect(WARRANT_QUESTIONS).toHaveLength(7);
    expect(WARRANT_QUESTIONS[0]).toBe('What changed');
    expect(WARRANT_QUESTIONS).toContain('By whose authority');
    expect(WARRANT_QUESTIONS).toContain('With what verification');
  });

  it('says what a warrant missing one of them is', () => {
    expect(WARRANT_RULE).toContain('it is a log line');
    expect(WARRANT_RULE).toContain('why this was permitted');
  });
});

describe('staleness, and the subtler half', () => {
  it('rechecks the preconditions at dispatch rather than trusting the approval', () => {
    expect(DISPATCH_RECHECKS).toContain('the authorization has not expired');
    expect(DISPATCH_RECHECKS).toContain('the state revision is still the one authorized');
    expect(STALENESS_RULE).toContain('rather than trusted from the moment of approval');
  });

  /*
   * The half that is easy to miss: a limit check that holds nothing cannot stop
   * two concurrent actions that each pass it.
   */
  it('reserves a shared budget rather than consulting it', () => {
    expect(RESERVATION_STATES).toEqual(['HELD', 'CONSUMED', 'RELEASED']);
    expect(RESERVATION_RULE).toContain('RESERVED at authorization, not merely checked');
    expect(RESERVATION_RULE).toContain('a check that does not hold anything cannot prevent that');
  });
});

describe('external execution is not a database write', () => {
  it('persists the intent, keeps identities stable, and reconciles before retrying', () => {
    expect(EXTERNAL_EXECUTION_RULE).toContain('persisted before anything leaves');
    expect(EXTERNAL_EXECUTION_RULE).toContain('one booking becomes two');
    expect(DISPATCH_OUTCOMES).toContain('OUTCOME_UNKNOWN');
  });

  /* A planner that is wrong proposed something wrong; it did not do something. */
  it('keeps the keys with the adapter and the contracts with the planner', () => {
    expect(CREDENTIAL_RULE).toContain('never keys');
    expect(CREDENTIAL_RULE).toContain('not one that did something');
  });
});

describe('the exception desk is part of the product', () => {
  it('carries six kinds, each with how it actually resolves', () => {
    expect(EXCEPTION_KINDS).toHaveLength(6);
    expect(EXCEPTION_CONTRACTS.map((entry) => entry.kind)).toEqual([...EXCEPTION_KINDS]);
    for (const contract of EXCEPTION_CONTRACTS) {
      expect(contract.arises, contract.kind).not.toHaveLength(0);
      expect(contract.resolvedBy, contract.kind).not.toHaveLength(0);
    }
  });

  /* None of them resolves by retrying. */
  it('resolves none of them by retrying', () => {
    for (const contract of EXCEPTION_CONTRACTS) {
      expect(contract.resolvedBy.toLowerCase(), contract.kind).not.toContain('retry');
      expect(contract.resolvedBy.toLowerCase(), contract.kind).not.toContain('try again');
    }
    expect(EXCEPTION_CONTRACTS.find((e) => e.kind === 'EXPIRED_APPROVAL')!.resolvedBy)
      .toContain('Never an extension of the old one');
    expect(EXCEPTION_DESK_RULE).toContain('none of them resolves by retrying');
  });

  it('treats publishing as consequential too', () => {
    expect(DISCLOSURE_IS_AN_OPERATION).toContain('disclosed to the wrong recipient is still a failure');
    expect(DISCLOSURE_IS_AN_OPERATION).toContain('same envelope as a payment');
  });
});

describe('three jobs that look like one', () => {
  it('gives each what it answers and what it does not', () => {
    expect(ASSURANCE_JOBS).toEqual(['TRANSITION_WARRANT', 'COMPUTATIONAL_LINEAGE', 'EXECUTION_PROOF']);
    for (const contract of ASSURANCE_CONTRACTS) {
      expect(contract.answers, contract.job).not.toHaveLength(0);
      expect(contract.doesNotAnswer, contract.job).not.toHaveLength(0);
    }
  });

  /* The one most often oversold. */
  it('does not let a proof of execution stand in for an observation', () => {
    const proof = ASSURANCE_CONTRACTS.find((entry) => entry.job === 'EXECUTION_PROOF')!;
    expect(proof.doesNotAnswer).toContain('does not prove the supplier will honour its capacity commitment');
    expect(VERIFIED_COMPUTATION_IS_NOT_VERIFIED_REALITY)
      .toContain('not a universal substitute for an observation');
  });

  it('treats an interchange vocabulary as a view rather than a replacement', () => {
    expect(INTERCHANGE_RULE).toContain('a lossy view of a record');
    expect(INTERCHANGE_RULE).toContain('what a dispute is settled against');
  });
});

describe('nothing has transitioned, and the zero is derived', () => {
  it('reports no warrants and what it is blocked on', () => {
    const standing = warrantStanding();
    expect(standing.warrants).toBe(0);
    expect(standing.operations).toBe(0);
    expect(standing.attempts).toBe(0);
    expect(standing.references).toBe(6);
    expect(standing.questions).toBe(7);
    expect(standing.blockedOn).toEqual([...WARRANT_BLOCKED_ON]);
    expect(standing.coverage).toBe('CONTRACT_ONLY_NOTHING_TRANSITIONED');
  });

  /* Attempts exceed operations as soon as anything is retried, and that is fine. */
  it('counts attempts above operations without that being an error', () => {
    const standing = warrantStanding([
      { warrantId: 'W1', operationId: 'O1', attempts: 3 },
      { warrantId: 'W2', operationId: 'O1', attempts: 1 },
    ]);
    expect(standing.warrants).toBe(2);
    expect(standing.operations).toBe(1);
    expect(standing.attempts).toBe(4);
    expect(standing.blockedOn).toEqual([]);
  });
});
