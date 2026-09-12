import { describe, expect, it } from 'vitest';
import {
  ACQUISITION_LOOP, CLAIM_CLASSES, CLAIM_ORIGINS, CLASS_CONTRACTS, DERIVABLE_CLASSES,
  DERIVATION_RULE, DISCOVERY_BLOCKED_ON, EXECUTION_IS_NOT_VALIDITY, FITTED_CLASSES, FLYWHEEL,
  GAP_LOOP, GAP_LOOP_RULE, INFERENCE_CONTRACT, INFORMATION_CAPITAL, LAYER_POSITION,
  MINING_CONTRACTS, MINING_KINDS, PRESCRIPTIVE_BOUNDARY, RIGHTS_INHERITANCE_RULE, SUBSTRATE_RULE,
  SUBSTRATE_WORKLOADS, VALIDATION_INSTANT_RULE, VALIDATION_OUTCOMES, VALIDATION_RECORD, VALIDATION_RULE, VALIDATION_STATES,
  WORKLOAD_IDENTITIES, WORKLOAD_IDENTITY_CONTRACTS, classContract, discoveryStanding,
  inheritedRights, originOf,
} from './discoveryLayer';

describe('seven classes, ordered by distance from the world', () => {
  it('names them and what collapsing each into its neighbour would produce', () => {
    expect(CLAIM_CLASSES).toEqual([
      'SOURCE_OBSERVATION', 'COMPUTED_RESULT', 'MODEL_INFERENCE', 'PREDICTION',
      'RECOMMENDATION', 'DECISION', 'EXECUTION_RESULT',
    ]);
    expect(CLASS_CONTRACTS.map((entry) => entry.class)).toEqual([...CLAIM_CLASSES]);
    for (const contract of CLASS_CONTRACTS) expect(contract.forbids, contract.class).not.toHaveLength(0);
  });

  /*
   * Each class has exactly one origin, and the origin is what decides who may
   * produce it. That is what makes the boundaries checkable rather than
   * remembered: a class is not a label a producer chooses.
   */
  it('gives every class exactly one origin, drawn from the four', () => {
    for (const contract of CLASS_CONTRACTS) {
      expect(CLAIM_ORIGINS, contract.class).toContain(contract.origin);
      expect(originOf(contract.class)).toBe(contract.origin);
    }
    expect(originOf('SOURCE_OBSERVATION')).toBe('ACQUISITION');
    expect(originOf('DECISION')).toBe('AUTHORIZATION');
    expect(originOf('EXECUTION_RESULT')).toBe('EXECUTION');
  });

  /*
   * The sentence the whole layer exists to hold. A join that surfaces a
   * dependency and a document that establishes one are different objects, and
   * served without a class they read identically.
   */
  it('states the bill-of-lading distinction on the computed result', () => {
    expect(classContract('COMPUTED_RESULT').forbids).toContain('bill of lading');
    expect(classContract('COMPUTED_RESULT').forbids).toContain('computes it');
  });

  /*
   * The mining engine's reach, bounded at both ends. It cannot manufacture
   * evidence behind it and it cannot manufacture authority ahead of it.
   */
  it('lets computation produce four classes and neither acquire nor decide', () => {
    expect(DERIVABLE_CLASSES).toEqual(['COMPUTED_RESULT', 'MODEL_INFERENCE', 'PREDICTION', 'RECOMMENDATION']);
    expect(DERIVABLE_CLASSES).not.toContain('SOURCE_OBSERVATION');
    expect(DERIVABLE_CLASSES).not.toContain('DECISION');
    expect(DERIVABLE_CLASSES).not.toContain('EXECUTION_RESULT');
    expect(DERIVATION_RULE).toContain('may not produce a source observation');
    expect(DERIVATION_RULE).toContain('computing a recommendation is not deciding on it');
  });

  it('separates the recommendation from the decision that accepts it', () => {
    expect(classContract('RECOMMENDATION').origin).toBe('COMPUTATION');
    expect(classContract('DECISION').origin).toBe('AUTHORIZATION');
    expect(classContract('DECISION').producedBy).toContain('never an agent and never a computation');
    expect(classContract('EXECUTION_RESULT').forbids).toContain('a dispatch is not completion');
  });

  /*
   * Confidence tracks whether the thing was fitted, not whether it is
   * uncertain. A deterministic aggregate can be wrong; it cannot be 0.7.
   */
  it('carries confidence on exactly the fitted classes', () => {
    expect(FITTED_CLASSES).toEqual(['MODEL_INFERENCE', 'PREDICTION', 'RECOMMENDATION']);
    expect(FITTED_CLASSES).not.toContain('COMPUTED_RESULT');
    expect(CLASS_CONTRACTS.filter((entry) => entry.aboutTheFuture).map((entry) => entry.class))
      .toEqual(['PREDICTION', 'RECOMMENDATION']);
  });

  it('refuses a class it does not carry', () => {
    expect(() => classContract('LIKELY' as never)).toThrow(/DISCOVERY_UNKNOWN_CLASS/);
  });
});

describe('four kinds of question', () => {
  it('runs descriptive to prescriptive, each with what it yields', () => {
    expect(MINING_KINDS).toEqual(['DESCRIPTIVE', 'INFERENTIAL', 'PREDICTIVE', 'PRESCRIPTIVE']);
    expect(MINING_CONTRACTS.map((entry) => entry.kind)).toEqual([...MINING_KINDS]);
    for (const contract of MINING_CONTRACTS) {
      expect(contract.question, contract.kind).toMatch(/\?$/);
      expect(contract.yields.length, contract.kind).toBeGreaterThan(0);
      expect(DERIVABLE_CLASSES, contract.kind).toContain(contract.produces);
    }
  });

  /*
   * A recommendation that executed itself would be the proposal/authorization
   * arrow skipped, which is the failure the action layer is built around.
   */
  it('lets exactly one kind reach the action layer, and stops it at authorize', () => {
    expect(MINING_CONTRACTS.filter((entry) => entry.crossesIntoAction).map((entry) => entry.kind))
      .toEqual(['PRESCRIPTIVE']);
    expect(PRESCRIPTIVE_BOUNDARY).toContain('stops at authorize');
  });
});

describe('what a derivation must retain to be re-examinable', () => {
  it('requires the reproducibility fields of every derived class', () => {
    const always = INFERENCE_CONTRACT.filter((f) => f.requiredFor.length === DERIVABLE_CLASSES.length).map((f) => f.field);
    for (const field of ['claim', 'inputs', 'method', 'parameters', 'codeVersion', 'computedAt', 'validation']) {
      expect(always, field).toContain(field);
    }
  });

  it('requires the model and confidence only of fitted classes, and a horizon only of forward claims', () => {
    const need = (field: string) => INFERENCE_CONTRACT.find((f) => f.field === field)!.requiredFor;
    expect(need('model')).toEqual([...FITTED_CLASSES]);
    expect(need('confidence')).toEqual([...FITTED_CLASSES]);
    expect(need('horizon')).toEqual(['PREDICTION', 'RECOMMENDATION']);
  });

  /*
   * Reproducibility is not restated here. `src/domain/computationCard.ts`
   * already answers whether a computation re-runs and grades the answer, and
   * two vocabularies for one question would be one too many.
   */
  it('defers reproducibility to the computation card rather than restating it', () => {
    const field = INFERENCE_CONTRACT.find((f) => f.field === 'reproducibility')!;
    expect(field.answers).toContain('computation card');
    expect(field.requiredFor).toEqual([...DERIVABLE_CLASSES]);
  });

  it('keeps NOT_VALIDATED as a recorded state rather than a missing field', () => {
    expect(VALIDATION_STATES[0]).toBe('NOT_VALIDATED');
    expect(VALIDATION_STATES).toContain('FALSIFIED');
    expect(VALIDATION_RULE).toContain('silence is never read as having passed');
  });
});

describe('substrates are projections, not sources', () => {
  it('maps each substrate to its workload and says which are held today', () => {
    expect(SUBSTRATE_WORKLOADS.map((entry) => entry.substrate)).toContain('PostGIS');
    expect(SUBSTRATE_WORKLOADS.filter((entry) => entry.present).map((entry) => entry.substrate))
      .toEqual(['PostgreSQL', 'Canonical state']);
    expect(SUBSTRATE_RULE).toContain('never the substrate it read them through');
  });
});

describe('the loop and the flywheel', () => {
  it('closes the acquisition loop back onto acquisition', () => {
    expect(ACQUISITION_LOOP[0]).toBe('Acquire');
    expect(ACQUISITION_LOOP.at(-1)).toBe('Acquire strategically');
    expect(ACQUISITION_LOOP).toContain('Identify uncertainty');
  });

  it('runs the flywheel from external evidence to better models', () => {
    expect(FLYWHEEL[0]).toBe('external evidence');
    expect(FLYWHEEL.at(-1)).toBe('better models');
    expect(FLYWHEEL).toContain('operational observations');
  });

  it('places the layer between representations and products', () => {
    expect(LAYER_POSITION.indexOf('Computational discovery'))
      .toBeGreaterThan(LAYER_POSITION.indexOf('Representations'));
    expect(LAYER_POSITION.indexOf('Computational discovery'))
      .toBeLessThan(LAYER_POSITION.indexOf('Products and decisions'));
  });

  it('names the capital as artefacts rather than as a claim about moats', () => {
    expect(INFORMATION_CAPITAL).toContain('validation history');
    expect(INFORMATION_CAPITAL).toContain('accumulated identity resolution');
  });
});

describe('nothing has been mined, and the zero is derived', () => {
  /*
   * The readiness claim in the negative. This layer computes across a corpus
   * and there is not one, so the standing says so rather than reporting a
   * capability the corpus does not have.
   */
  it('reports zero derivations and what it is blocked on', () => {
    const standing = discoveryStanding();
    expect(standing.derivations).toBe(0);
    expect(standing.canMine).toBe(false);
    expect(standing.validated).toBe(0);
    expect(standing.byClass.MODEL_INFERENCE).toBe(0);
    expect(standing.blockedOn).toEqual([...DISCOVERY_BLOCKED_ON]);
    expect(standing.coverage).toBe('CONTRACT_ONLY_NOTHING_DERIVED');
    expect(standing.substratesPresent).toBe(2);
    expect(standing.substratesAbsent).toBe(5);
    expect(standing.byClass.RECOMMENDATION).toBe(0);
    expect(standing.byClass.EXECUTION_RESULT).toBe(0);
  });

  /* And it moves, so the zero means something in both directions. */
  it('counts a derivation that exists, by class, and clears the block', () => {
    const standing = discoveryStanding([
      { derivationId: 'D1', class: 'MODEL_INFERENCE', kind: 'INFERENTIAL', inputs: ['REC-1'], validation: 'HELD_OUT' },
      { derivationId: 'D2', class: 'PREDICTION', kind: 'PREDICTIVE', inputs: [], validation: 'NOT_VALIDATED' },
    ]);
    expect(standing.derivations).toBe(2);
    expect(standing.byClass.MODEL_INFERENCE).toBe(1);
    expect(standing.byClass.PREDICTION).toBe(1);
    expect(standing.byClass.SOURCE_OBSERVATION).toBe(0);
    expect(standing.validated).toBe(1);
    expect(standing.withoutInputs).toBe(1);
    expect(standing.canMine).toBe(true);
    expect(standing.blockedOn).toEqual([]);
    expect(standing.coverage).toBe('DERIVATIONS_PRESENT');
  });
});

describe('the workload, the run and the artifact are three identities', () => {
  it('keeps them apart and says what collapsing each would cost', () => {
    expect(WORKLOAD_IDENTITIES).toEqual(['WorkloadSpec', 'WorkloadRun', 'DerivedArtifact']);
    expect(WORKLOAD_IDENTITY_CONTRACTS.map((entry) => entry.identity)).toEqual([...WORKLOAD_IDENTITIES]);
    expect(WORKLOAD_IDENTITY_CONTRACTS[1].collapsing).toContain('a retry becomes a second result');
  });

  /* The one that is easiest to violate by accident. */
  it('separates a run that exited zero from a result that is valid', () => {
    expect(EXECUTION_IS_NOT_VALIDITY).toContain('did not produce a validated one');
    expect(EXECUTION_IS_NOT_VALIDITY).toContain('recorded separately');
  });

  it('makes a validation record say what it was measured against and what would have passed', () => {
    const fields = VALIDATION_RECORD.map((entry) => entry.field);
    for (const field of ['method', 'target', 'metric', 'baseline', 'result', 'threshold', 'evidence', 'validatedAt', 'outcome']) {
      expect(fields, field).toContain(field);
    }
    expect(VALIDATION_RECORD.find((f) => f.field === 'threshold')!.answers)
      .toContain('declared before the result rather than after it');
  });

  /* The state is dated, and unvalidated is not an outcome a record can carry. */
  it('dates a validation, and holds the artifact to its latest record', () => {
    expect(VALIDATION_OUTCOMES).toEqual(['HELD_OUT', 'BACKTESTED', 'OUTCOME_OBSERVED', 'FALSIFIED']);
    expect(VALIDATION_OUTCOMES).not.toContain('NOT_VALIDATED');
    expect(VALIDATION_INSTANT_RULE).toContain('latest validation record');
    expect(VALIDATION_INSTANT_RULE).toContain('standing at its own instant');
    expect(VALIDATION_INSTANT_RULE).toContain('the same way a retraction is');
  });
});

describe('rights are inherited, never widened', () => {
  /*
   * The quiet failure: a source that may not be redistributed is aggregated,
   * and the aggregate is redistributed because nobody recorded the descent.
   */
  it('takes the intersection of the inputs, so one restricted input restricts the result', () => {
    expect(inheritedRights([['READ', 'DERIVE', 'REDISTRIBUTE'], ['READ', 'DERIVE']]))
      .toEqual(['READ', 'DERIVE']);
    expect(inheritedRights([['READ', 'DERIVE', 'REDISTRIBUTE'], ['READ']]))
      .toEqual(['READ']);
    expect(inheritedRights([['READ'], ['DERIVE']])).toEqual([]);
  });

  it('never returns an operation no input carried', () => {
    const floor = inheritedRights([['READ', 'DERIVE'], ['READ', 'DERIVE', 'REDISTRIBUTE']]);
    expect(floor).not.toContain('REDISTRIBUTE');
  });

  /* No inputs is no floor to stand on, not an unrestricted result. */
  it('grants nothing when there are no inputs to inherit from', () => {
    expect(inheritedRights([])).toEqual([]);
  });

  it('states the rule as an intersection computed from the inputs', () => {
    expect(RIGHTS_INHERITANCE_RULE).toContain('intersection');
    expect(RIGHTS_INHERITANCE_RULE).toContain('never widens them');
  });
});

describe('the gap loop stops at a proposal', () => {
  it('routes a detected gap through policy and admission rather than at a source', () => {
    expect(GAP_LOOP[0]).toBe('GapDetection');
    expect(GAP_LOOP[1]).toBe('AcquisitionProposal');
    expect(GAP_LOOP).toContain('Policy and authorization');
    expect(GAP_LOOP).toContain('Evidence admission');
    expect(GAP_LOOP.at(-1)).toBe('Corpus');
  });

  it('forbids the engine reaching a source directly', () => {
    expect(GAP_LOOP_RULE).toContain('never reaches a source directly');
    expect(GAP_LOOP_RULE).toContain('one admission boundary');
  });
});
