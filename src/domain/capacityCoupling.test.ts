import { describe, expect, it } from 'vitest';
import {
  ASSERTING_BASES, CAPACITY_IS_THE_MISSING_MECHANISM, CLUSTER_ARTEFACTS, CLUSTER_RULE,
  COUPLING_BLOCKED_ON, COUPLING_RULE, COUPLING_STAGES, CO_LOCATION_RULE, INDUSTRIAL_CHAIN_RULE,
  INDUSTRIAL_STAGES, RELATIONSHIP_BASES, RELATIONSHIP_ROLES, ROLE_MEANING, STAGE_CONTRACTS,
  TRANSPORT_CHAIN_RULE, TRANSPORT_STAGES, TRANSPORT_STAGE_MEANING, UTILIZATION_RULE,
  couplingStanding, stageContract, utilization,
} from './capacityCoupling';

describe('the coupling, and the mechanism in the middle of it', () => {
  it('runs land to capacity to movement to market', () => {
    expect(COUPLING_STAGES).toEqual([
      'LAND_CONDITIONS', 'CAPACITY_AND_UTILIZATION', 'MATERIAL_AND_MOVEMENT', 'NETWORK_AND_MARKET',
    ]);
    expect(COUPLING_RULE).toContain('none of them is automatic');
    expect(COUPLING_RULE).toContain('research hypotheses, not causality');
  });

  /* A parcel does not produce freight. */
  it('names capacity as what land and movement otherwise lack', () => {
    expect(CAPACITY_IS_THE_MISSING_MECHANISM).toContain('A parcel does not produce freight');
    expect(CAPACITY_IS_THE_MISSING_MECHANISM).toContain('sit beside each other without meeting');
  });
});

describe('four things that are not each other', () => {
  it('names them and what each does not establish about the next', () => {
    expect(INDUSTRIAL_STAGES).toEqual([
      'PARCEL_ACQUISITION', 'CONSTRUCTION_COMMITMENT', 'COMMISSIONED_CAPACITY', 'ACTUAL_PRODUCTION',
    ]);
    expect(STAGE_CONTRACTS.map((entry) => entry.stage)).toEqual([...INDUSTRIAL_STAGES]);
    expect(stageContract('PARCEL_ACQUISITION').doesNotEstablish).toContain('anything will be built');
    expect(stageContract('COMMISSIONED_CAPACITY').doesNotEstablish).toContain('producing anything');
  });

  /* Every step of it has failed somewhere. */
  it('carries the observed failure between each stage and the next', () => {
    expect(stageContract('PARCEL_ACQUISITION').failsWhen).toContain('a block on a competitor');
    expect(stageContract('CONSTRUCTION_COMMITMENT').failsWhen).toContain('abandoned half-built');
    expect(stageContract('COMMISSIONED_CAPACITY').failsWhen).toContain('a fraction of its rating');
  });

  it('makes only the last one evidence of production', () => {
    expect(stageContract('ACTUAL_PRODUCTION').doesNotEstablish).toContain('Nothing above it');
    expect(INDUSTRIAL_CHAIN_RULE).toContain('sold a guess as a finding');
  });

  it('refuses a stage it does not carry', () => {
    expect(() => stageContract('PLANNED' as never)).toThrow(/COUPLING_UNKNOWN_STAGE/);
  });
});

describe('and three more on the transport side', () => {
  it('separates topology from a commercial fact from something that happened', () => {
    expect(TRANSPORT_STAGES).toEqual(['POSSIBLE_ROUTE', 'BOOKED_CAPACITY', 'OBSERVED_SHIPMENT']);
    expect(TRANSPORT_STAGE_MEANING.POSSIBLE_ROUTE).toContain('about network topology');
    expect(TRANSPORT_STAGE_MEANING.BOOKED_CAPACITY).toContain('commercial fact');
    expect(TRANSPORT_STAGE_MEANING.OBSERVED_SHIPMENT).toContain('the only one that is evidence anything moved');
    expect(TRANSPORT_CHAIN_RULE).toContain('a hypothesis about where freight could go');
  });
});

describe('four roles a spatial match does not establish', () => {
  it('keeps owner, occupier, operator and controlling apart', () => {
    expect(RELATIONSHIP_ROLES).toEqual(['OWNER', 'OCCUPIER', 'OPERATOR', 'CONTROLLING']);
    expect(ROLE_MEANING.OWNER).toContain('May never have set foot on it');
    expect(ROLE_MEANING.OPERATOR).toContain('whose decisions change what the facility does');
    expect(ROLE_MEANING.CONTROLLING).toContain('appears in no local record at all');
  });

  /* The most nearly-right error in the domain. */
  it('lets co-location support a candidate and never an assertion', () => {
    expect(RELATIONSHIP_BASES).toContain('CO_LOCATION_ONLY');
    expect(ASSERTING_BASES).not.toContain('CO_LOCATION_ONLY');
    expect(ASSERTING_BASES).toHaveLength(RELATIONSHIP_BASES.length - 1);
    expect(CO_LOCATION_RULE).toContain('never who runs one of them');
  });
});

describe('utilization is against a rating that came from somewhere', () => {
  it('divides exactly, and refuses a rating of zero', () => {
    expect(utilization(26000, 40000)).toBe(0.65);
    expect(utilization(1, 3)).toBe(0.333333);
    expect(() => utilization(1, 0)).toThrow(/COUPLING_RATING_NOT_POSITIVE/);
    expect(() => utilization(1, -4)).toThrow(/COUPLING_RATING_NOT_POSITIVE/);
  });

  it('says where both numbers have to come from', () => {
    expect(UTILIZATION_RULE).toContain('a brochure figure');
    expect(UTILIZATION_RULE).toContain('an assumption dressed as a measurement');
  });
});

describe('measure the cluster before interpreting its growth', () => {
  it('compares counts only under one definition', () => {
    expect(CLUSTER_RULE).toContain('only when both used the same definition');
    expect(CLUSTER_RULE).toContain('no new industrial activity at all');
  });

  it('names the artefacts that look like findings', () => {
    expect(CLUSTER_ARTEFACTS).toContain('improved coverage read as expansion');
    expect(CLUSTER_ARTEFACTS).toContain('a resolved duplicate read as a closure');
  });
});

describe('nothing is mapped, and the zero is derived', () => {
  it('reports no couplings and what it is blocked on', () => {
    const standing = couplingStanding();
    expect(standing.couplings).toBe(0);
    expect(standing.producing).toBe(0);
    expect(standing.stages).toBe(4);
    expect(standing.roles).toBe(4);
    expect(standing.blockedOn).toEqual([...COUPLING_BLOCKED_ON]);
    expect(standing.coverage).toBe('CONTRACT_ONLY_NOTHING_MAPPED');
  });

  /* Three acquisitions and no production is the common real shape. */
  it('counts by stage without promoting anything', () => {
    const standing = couplingStanding([
      { couplingId: 'C1', stage: 'PARCEL_ACQUISITION' },
      { couplingId: 'C2', stage: 'PARCEL_ACQUISITION' },
      { couplingId: 'C3', stage: 'CONSTRUCTION_COMMITMENT' },
    ]);
    expect(standing.couplings).toBe(3);
    expect(standing.byStage.PARCEL_ACQUISITION).toBe(2);
    expect(standing.byStage.COMMISSIONED_CAPACITY).toBe(0);
    expect(standing.producing).toBe(0);
    expect(standing.blockedOn).toEqual([]);
  });
});
