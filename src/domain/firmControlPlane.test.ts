import { describe, expect, it } from 'vitest';
import {
  COMMAND_BAR_RULE, COMMAND_EXAMPLES, FIRM_LOOP, FIRM_QUESTIONS, FIRM_STATE_COMPONENTS,
  INTENT_OUTCOMES, INTENT_PIPELINE, LAYER_CONTRACTS, LAYER_NAMES, MONOLITH_WARNING,
  OPERATING_PLANES, SEPARATIONS, TWIN_RULE, TWIN_STATES, TWIN_TRAVERSALS,
  WHY_PROVENANCE_MATTERS_HERE, layerContract, planeStanding,
} from './firmControlPlane';

describe('three names, kept apart', () => {
  it('names the substrate, the authority and the surface, and what each is made of', () => {
    expect(LAYER_NAMES).toEqual(['PayloadOS', 'Payload Control Plane', 'Payload Terminal']);
    expect(LAYER_CONTRACTS.map((entry) => entry.name)).toEqual([...LAYER_NAMES]);
    expect(layerContract('PayloadOS').madeOf).toContain('evidence');
    expect(layerContract('Payload Control Plane').madeOf).toEqual(['observe', 'propose', 'authorize', 'execute', 'verify']);
    expect(layerContract('Payload Terminal').madeOf).toContain('command bar');
  });

  /*
   * Each collapse licenses a specific bad decision, so each contract says which
   * one rather than asserting that the separation is important.
   */
  it('says what collapsing each one would license', () => {
    for (const contract of LAYER_CONTRACTS) expect(contract.collapsing, contract.name).not.toHaveLength(0);
    expect(layerContract('Payload Terminal').collapsing).toContain('clicking becomes deciding');
    expect(layerContract('Payload Control Plane').collapsing).toContain('a column somebody can update');
  });

  it('keeps the four sentences', () => {
    expect(SEPARATIONS).toEqual([
      'The Terminal is not the OS.',
      'The Control Plane is not the database.',
      'The database is not the corpus.',
      'The agent is not the authority.',
    ]);
  });

  it('refuses a layer it does not carry', () => {
    expect(() => layerContract('Payload Cloud' as never)).toThrow(/CONTROL_PLANE_UNKNOWN_LAYER/);
  });
});

describe('the planes, and which of them exist', () => {
  it('names ten and says which this repository surfaces today', () => {
    expect(OPERATING_PLANES).toHaveLength(10);
    const standing = planeStanding();
    expect(standing.surfaced + standing.notSurfaced).toBe(10);
    expect(standing.awaiting).toEqual(['Intelligence', 'Commercial', 'Operations']);
  });

  /* Ten boxes on a diagram are not ten planes, and the standing says so. */
  it('does not report a plane as operated because it is drawn', () => {
    const standing = planeStanding([
      { plane: 'Corpus', controls: 'x', surfaced: true },
      { plane: 'Operations', controls: 'y', surfaced: false },
    ]);
    expect(standing.planes).toBe(2);
    expect(standing.surfaced).toBe(1);
    expect(standing.awaiting).toEqual(['Operations']);
  });

  it('warns against the monolith the ten planes invite', () => {
    expect(MONOLITH_WARNING).toContain('does not supply one process');
    expect(MONOLITH_WARNING).toContain('stay separable');
  });
});

describe('the command bar turns intent into a bounded operation', () => {
  /*
   * The whole difference between a control surface and a chatbot is the second
   * step: intent becomes a question or a request, never an action.
   */
  it('resolves every instruction to a query or a proposal, and never to an execution', () => {
    expect(INTENT_OUTCOMES).toEqual(['QUERY', 'PROPOSAL']);
    expect(INTENT_OUTCOMES).not.toContain('EXECUTION' as never);
    for (const example of COMMAND_EXAMPLES) {
      expect(INTENT_OUTCOMES, example.instruction).toContain(example.becomes);
    }
    expect(planeStanding().executionsFromIntent).toBe(0);
  });

  it('puts policy and authorization between the intent and anything happening', () => {
    expect(INTENT_PIPELINE).toEqual(['Intent', 'Query or proposal', 'Policy', 'Authorization', 'Execution', 'Audit']);
    expect(INTENT_PIPELINE.indexOf('Authorization')).toBeLessThan(INTENT_PIPELINE.indexOf('Execution'));
    expect(INTENT_PIPELINE.at(-1)).toBe('Audit');
    expect(COMMAND_BAR_RULE).toContain('never becomes an execution');
  });

  /* Both kinds present, or the boundary reads as a limitation. */
  it('carries instructions of both kinds', () => {
    const standing = planeStanding();
    expect(standing.queries).toBeGreaterThan(0);
    expect(standing.proposals).toBeGreaterThan(0);
    expect(COMMAND_EXAMPLES.find((e) => e.instruction.startsWith('draft'))!.becomes).toBe('PROPOSAL');
    expect(COMMAND_EXAMPLES.find((e) => e.instruction.startsWith('show the evidence'))!.becomes).toBe('QUERY');
  });
});

describe('the twin is a control surface, not a picture', () => {
  it('traverses the state rather than describing it', () => {
    expect(TWIN_TRAVERSALS).toContain('Evidence');
    expect(TWIN_TRAVERSALS).toContain('Agent activity');
    expect(TWIN_TRAVERSALS).toHaveLength(10);
  });

  /*
   * A shape on a map does not look like a claim, so it will be believed like a
   * fact. Seven states, and they must be visually distinguishable.
   */
  it('distinguishes observed from inferred from predicted, and unavailable from all of them', () => {
    expect(TWIN_STATES).toEqual(['observed', 'canonical', 'inferred', 'predicted', 'stale', 'uncertain', 'unavailable']);
    expect(TWIN_RULE).toContain('never a second database');
    expect(TWIN_RULE).toContain('does not look like a claim');
  });
});

describe('the firm itself as state', () => {
  it('names one coherent state model rather than one database', () => {
    expect(FIRM_STATE_COMPONENTS).toEqual(['corpus', 'compute', 'commercial', 'operations', 'agents', 'infrastructure']);
  });

  it('asks the question a dashboard never asks', () => {
    expect(FIRM_QUESTIONS.at(-1)).toBe('Which predictions were wrong?');
    expect(FIRM_QUESTIONS).toContain('What requires approval?');
    expect(FIRM_LOOP).toEqual(['Observe', 'Understand', 'Decide', 'Act', 'Measure', 'Learn']);
  });

  it('explains why the surface can answer it', () => {
    expect(WHY_PROVENANCE_MATTERS_HERE).toContain('why the system believes what it believes');
    expect(WHY_PROVENANCE_MATTERS_HERE).toContain('a dashboard with buttons');
  });
});
