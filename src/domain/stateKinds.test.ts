import { describe, expect, it } from 'vitest';
import {
  APPLICABILITY_RULE, BASIS_MEANING, CAPACITY_IS_THE_CONNECTOR, CONTRADICTION_IS_A_STATE,
  CORRECTION_MOVES_KNOWLEDGE_NOT_THE_EVENT, ESTIMATE_CLOCKS, ESTIMATE_CLOCK_MEANING,
  ESTIMATE_CONTRACT, EVIDENTIAL_STANDING_RULE, INDEPENDENT_KINDS, OBSERVATION_BASES,
  PHYSICAL_BLOCKS, PHYSICAL_BLOCK_MEANING, REVISION_IS_WHAT_AUTHORIZATIONS_BIND_TO,
  REVISION_RULE, STATE_BLOCKED_ON, STATE_KINDS, STATE_KIND_CONTRACTS, THREE_MEANINGS_RULE,
  stateKindContract, stateStanding,
} from './stateKinds';

describe('three meanings, and only one is about the world', () => {
  it('names them and what collapsing each would produce', () => {
    expect(STATE_KINDS).toEqual(['PHYSICAL', 'ESTIMATED', 'OPERATIONAL']);
    expect(STATE_KIND_CONTRACTS.map((entry) => entry.kind)).toEqual([...STATE_KINDS]);
    for (const contract of STATE_KIND_CONTRACTS) expect(contract.collapsing, contract.kind).not.toHaveLength(0);
    expect(THREE_MEANINGS_RULE).toContain('Only the first exists independently of the record');
  });

  /* The one that exists whether or not anybody wrote it down. */
  it('makes exactly the physical state independent of the record', () => {
    expect(INDEPENDENT_KINDS).toEqual(['PHYSICAL']);
    expect(stateKindContract('PHYSICAL').wrongWhen).toContain('only unobserved');
    expect(stateKindContract('OPERATIONAL').collapsing).toContain('the database has no vote');
    expect(stateKindContract('PHYSICAL').collapsing).toContain('the map becomes the territory');
  });

  it('refuses a kind it does not carry', () => {
    expect(() => stateKindContract('BELIEVED' as never)).toThrow(/STATE_UNKNOWN_KIND/);
  });
});

describe('the physical vector, and the block that connects it', () => {
  it('carries land, capacity, flow and market', () => {
    expect(PHYSICAL_BLOCKS).toEqual(['LAND', 'CAPACITY', 'FLOW', 'MARKET']);
    for (const block of PHYSICAL_BLOCKS) expect(PHYSICAL_BLOCK_MEANING[block], block).not.toHaveLength(0);
  });

  /* A parcel does not produce freight. */
  it('names capacity as the connector between land and movement', () => {
    expect(PHYSICAL_BLOCK_MEANING.CAPACITY).toContain('connector between land and movement');
    expect(CAPACITY_IS_THE_CONNECTOR).toContain('A parcel does not produce freight');
    expect(CAPACITY_IS_THE_CONNECTOR).toContain('without meeting');
  });
});

describe('two clocks on an estimate', () => {
  it('separates the period described from the time the evidence arrived', () => {
    expect(ESTIMATE_CLOCKS).toEqual(['DESCRIBES_AT', 'EVIDENCE_KNOWN_BY']);
    expect(ESTIMATE_CLOCK_MEANING.DESCRIBES_AT).toContain('however recently it arrived');
    expect(ESTIMATE_CLOCK_MEANING.EVIDENCE_KNOWN_BY).toContain('This is what a correction moves');
  });

  /* Harder to notice than a wrong number, and worse. */
  it('does not let a correction move the event', () => {
    expect(CORRECTION_MOVES_KNOWLEDGE_NOT_THE_EVENT).toContain('It does not move the period');
    expect(CORRECTION_MOVES_KNOWLEDGE_NOT_THE_EVENT).toContain('kept the old question’s audience');
  });
});

describe('what an estimate must carry', () => {
  it('requires both clocks, the snapshot, the model, the uncertainty and the limit', () => {
    const fields = ESTIMATE_CONTRACT.map((entry) => entry.field);
    for (const field of ['describesAt', 'evidenceKnownBy', 'evidenceSnapshot', 'modelVersion', 'uncertainty', 'applicabilityLimit']) {
      expect(fields, field).toContain(field);
    }
  });

  /*
   * Two of these had no home anywhere in the repository before, and the
   * applicability limit is the sharper absence: a horizon bounds time and
   * nothing else.
   */
  it('houses the two fields nothing here previously carried', () => {
    const homeless = ESTIMATE_CONTRACT.filter((entry) => entry.previouslyHomeless).map((entry) => entry.field);
    expect(homeless).toEqual(['modelVersion', 'applicabilityLimit']);
    expect(APPLICABILITY_RULE).toContain('A horizon bounds time and nothing else');
    expect(APPLICABILITY_RULE).toContain('no way to detect it');
  });
});

describe('three bases that arrive through the same pipe', () => {
  it('keeps a document, an observation and a computation distinguishable', () => {
    expect(OBSERVATION_BASES).toEqual(['DOCUMENT_ASSERTION', 'DIRECT_OBSERVATION', 'MODELLED_ESTIMATE']);
    expect(BASIS_MEANING.DOCUMENT_ASSERTION).toContain('not evidence that it is true');
    expect(BASIS_MEANING.MODELLED_ESTIMATE).toContain('only as far as the model holds');
    expect(EVIDENTIAL_STANDING_RULE).toContain('look alike by the time they are rows');
  });
});

describe('operational state', () => {
  /* The inversion: a contradiction is recorded rather than refused. */
  it('treats a recorded contradiction as a legitimate state', () => {
    expect(CONTRADICTION_IS_A_STATE).toContain('authoritative for the application’s record');
    expect(CONTRADICTION_IS_A_STATE).toContain('will pick one and forget that it did');
  });

  it('advances by version and does not rewrite what was accepted', () => {
    expect(REVISION_RULE).toContain('nothing rewrites a revision that has been accepted');
    expect(REVISION_RULE).toContain('against what version 41 said');
  });

  /* The execution ledger consumed a revision that nothing produced. */
  it('gives the execution ledger’s binding something real to point at', () => {
    expect(REVISION_IS_WHAT_AUTHORIZATIONS_BIND_TO).toContain('binds to the state revision');
    expect(REVISION_IS_WHAT_AUTHORIZATIONS_BIND_TO).toContain('maintained by convention');
  });
});

describe('nothing is declared, and the zero is derived', () => {
  it('reports no subjects and what it is blocked on', () => {
    const standing = stateStanding();
    expect(standing.subjects).toBe(0);
    expect(standing.byKind.PHYSICAL).toBe(0);
    expect(standing.kinds).toBe(3);
    expect(standing.fieldsNewlyHoused).toBe(2);
    expect(standing.blockedOn).toEqual([...STATE_BLOCKED_ON]);
    expect(standing.coverage).toBe('CONTRACT_ONLY_NO_SUBJECT_DECLARED');
  });

  it('counts subjects by kind once they exist', () => {
    const standing = stateStanding([
      { subjectId: 'S1', kind: 'PHYSICAL' },
      { subjectId: 'S2', kind: 'PHYSICAL' },
      { subjectId: 'S3', kind: 'OPERATIONAL' },
    ]);
    expect(standing.subjects).toBe(3);
    expect(standing.byKind.PHYSICAL).toBe(2);
    expect(standing.byKind.OPERATIONAL).toBe(1);
    expect(standing.byKind.ESTIMATED).toBe(0);
    expect(standing.blockedOn).toEqual([]);
  });
});
