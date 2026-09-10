/**
 * What connects land to movement, and the four things that are not each other.
 *
 * Landshark sees a parcel acquired, an application filed, a permit approved,
 * and later some construction. Caravan sees corridor access and, later still,
 * observed movements. Tradewind sees a regional supply consequence. Put side by
 * side those look like a causal chain, and the temptation is to read the first
 * event as evidence for the last.
 *
 * They are a coupled system and not an automatic one. The intermediate
 * mechanism is missing, and its absence is why land evidence and transport
 * evidence otherwise sit beside each other without ever meeting:
 *
 *   land conditions → capacity and utilization → material requirements and
 *   movements → network and market consequences
 *
 * A parcel does not produce freight. An operating facility, running particular
 * processes on particular materials at some utilization, does.
 *
 * FOUR THINGS THAT ARE NOT EACH OTHER
 *
 *   Parcel acquisition ≠ Construction commitment ≠ Commissioned capacity ≠
 *   Actual production
 *
 * Every step of that has failed somewhere. Land is bought and nothing is built.
 * Ground is broken and the project is abandoned. A line is commissioned and
 * runs at a fraction of its rating for two years. The value is in assembling
 * the chain and TESTING it, not in assuming its first event guarantees its
 * last — and a system that promotes an acquisition into a production forecast
 * has sold a guess as a finding.
 *
 * AND THREE MORE ON THE TRANSPORT SIDE
 *
 *   Possible transport route ≠ Booked capacity ≠ Observed shipment
 *
 * A route on a network graph is a statement about topology. A booking is a
 * commercial fact. A shipment is something that happened. Only the last is
 * evidence that anything moved.
 *
 * FOUR ROLES A SPATIAL MATCH DOES NOT ESTABLISH
 *
 * Owner, occupier, operator and controlling organization are different
 * relationships, and a facility sitting inside a parcel boundary establishes
 * none of them. Co-location is where the two things are; it is not who runs
 * one of them. That is the most common quiet error in this domain because it
 * is so nearly right: the polygons really do overlap.
 *
 * MEASURE THE CLUSTER BEFORE INTERPRETING ITS GROWTH
 *
 * More mapped facilities in a region could mean more facilities, or it could
 * mean better mapping. A boundary redrawn between two counts produces apparent
 * growth with no new industrial activity at all. So a census names the
 * definition it was taken under, and a change is only a change when both
 * counts used the same one.
 */

import { SITE_LINK_STANDINGS } from '@/db/siteAtlas';

/* ── The coupling ── */

export const COUPLING_STAGES = [
  'LAND_CONDITIONS', 'CAPACITY_AND_UTILIZATION', 'MATERIAL_AND_MOVEMENT', 'NETWORK_AND_MARKET',
] as const;
export type CouplingStage = typeof COUPLING_STAGES[number];

export const COUPLING_RULE =
  'Land conditions, capacity and utilization, material requirements and movements, and network and market consequences are a coupled system. Each link is independently inspectable and none of them is automatic — the coupling supports research hypotheses, not causality.';

export const CAPACITY_IS_THE_MISSING_MECHANISM =
  'A parcel does not produce freight. An operating facility, running particular processes on particular materials at some utilization, does. Capacity is the mechanism that connects the two, and its absence is why land evidence and transport evidence sit beside each other without meeting.';

/* ── The industrial chain ── */

export const INDUSTRIAL_STAGES = [
  'PARCEL_ACQUISITION', 'CONSTRUCTION_COMMITMENT', 'COMMISSIONED_CAPACITY', 'ACTUAL_PRODUCTION',
] as const;
export type IndustrialStage = typeof INDUSTRIAL_STAGES[number];

export interface StageContract {
  stage: IndustrialStage;
  is: string;
  /** What it does NOT establish about the next stage. */
  doesNotEstablish: string;
  /** The observed failure between this stage and the next. */
  failsWhen: string;
}

export const STAGE_CONTRACTS: readonly StageContract[] = [
  {
    stage: 'PARCEL_ACQUISITION',
    is: 'Somebody bought land.',
    doesNotEstablish: 'That anything will be built on it.',
    failsWhen: 'Land is acquired as an option, a hedge, or a block on a competitor, and nothing is ever built.',
  },
  {
    stage: 'CONSTRUCTION_COMMITMENT',
    is: 'A permit, a contract, or ground broken.',
    doesNotEstablish: 'That a line will be commissioned.',
    failsWhen: 'Financing changes, the project is abandoned half-built, or the permit lapses.',
  },
  {
    stage: 'COMMISSIONED_CAPACITY',
    is: 'A line exists and is rated at some volume.',
    doesNotEstablish: 'That it is producing anything.',
    failsWhen: 'A commissioned line runs at a fraction of its rating for two years, or not at all.',
  },
  {
    stage: 'ACTUAL_PRODUCTION',
    is: 'Something was made, and observed to have been made.',
    doesNotEstablish: 'Nothing above it. This is the one that is evidence of production.',
    failsWhen: 'Nothing. It is the observation the other three were proxies for.',
  },
];

export function stageContract(stage: IndustrialStage): StageContract {
  const found = STAGE_CONTRACTS.find((entry) => entry.stage === stage);
  if (!found) throw new Error(`COUPLING_UNKNOWN_STAGE:${stage}`);
  return found;
}

export const INDUSTRIAL_CHAIN_RULE =
  'Parcel acquisition is not construction commitment is not commissioned capacity is not actual production. Every step has failed somewhere, and a system that promotes an acquisition into a production forecast has sold a guess as a finding.';

/* ── The transport chain ── */

export const TRANSPORT_STAGES = ['POSSIBLE_ROUTE', 'BOOKED_CAPACITY', 'OBSERVED_SHIPMENT'] as const;
export type TransportStage = typeof TRANSPORT_STAGES[number];

export const TRANSPORT_STAGE_MEANING: Readonly<Record<TransportStage, string>> = {
  POSSIBLE_ROUTE: 'A statement about network topology. Something could go this way.',
  BOOKED_CAPACITY: 'A commercial fact. Somebody paid for space.',
  OBSERVED_SHIPMENT: 'Something happened. This is the only one that is evidence anything moved.',
};

export const TRANSPORT_CHAIN_RULE =
  'A possible route is not booked capacity is not an observed shipment. Only the last is evidence that anything moved, and a corridor drawn from topology is a hypothesis about where freight could go.';

/* ── Relationship roles ── */

export const RELATIONSHIP_ROLES = ['OWNER', 'OCCUPIER', 'OPERATOR', 'CONTROLLING'] as const;
export type RelationshipRole = typeof RELATIONSHIP_ROLES[number];

export const ROLE_MEANING: Readonly<Record<RelationshipRole, string>> = {
  OWNER: 'Holds title. May never have set foot on it.',
  OCCUPIER: 'Is physically there. May be a tenant of a tenant.',
  OPERATOR: 'Runs the process. The one whose decisions change what the facility does.',
  CONTROLLING: 'Directs the operator. Often a parent that appears in no local record at all.',
};

/** How a relationship came to be believed. */
export const RELATIONSHIP_BASES = [
  'REGISTRY_RECORD', 'CONTRACT', 'DIRECT_OBSERVATION', 'CO_LOCATION_ONLY',
] as const;
export type RelationshipBasis = typeof RELATIONSHIP_BASES[number];

/**
 * The same three standings the site atlas already uses for its links, imported
 * rather than restated. A relationship and a link are different objects and
 * they answer the same question about how firmly anything is believed, so a
 * fourth standing must reach both or neither.
 */
export const RELATIONSHIP_STANDINGS = SITE_LINK_STANDINGS;
export type RelationshipStanding = typeof SITE_LINK_STANDINGS[number];

/**
 * The one that is so nearly right.
 *
 * A facility inside a parcel boundary establishes where two things are. It
 * establishes nothing about who owns, occupies, operates or controls either of
 * them — and it is the most common quiet error in this domain precisely
 * because the polygons really do overlap.
 */
export const CO_LOCATION_RULE =
  'A spatial match is not an operating relationship. Co-location establishes where two things are, never who runs one of them, and it may support a candidate but never an assertion.';

/** The bases strong enough to assert a relationship rather than propose one. */
export const ASSERTING_BASES: readonly RelationshipBasis[] =
  RELATIONSHIP_BASES.filter((basis) => basis !== 'CO_LOCATION_ONLY');

/* ── Utilization ── */

export const UTILIZATION_RULE =
  'Utilization is observed output over rated capacity, and both come from somewhere. A rating with no commissioning record behind it is a brochure figure, and an output with no observation behind it is an assumption dressed as a measurement.';

/** Exact, so the number is the same on every machine that computes it. */
export function utilization(observed: number, rated: number): number {
  if (rated <= 0) throw new Error('COUPLING_RATING_NOT_POSITIVE');
  return Math.round((observed / rated) * 1e6) / 1e6;
}

/* ── Clusters ── */

export const CLUSTER_RULE =
  'A census names the definition it was taken under, and a change between two censuses is a change only when both used the same definition. More mapped facilities could mean more facilities or better mapping, and a boundary redrawn between two counts produces apparent growth with no new industrial activity at all.';

export const CLUSTER_ARTEFACTS: readonly string[] = [
  'improved coverage read as expansion',
  'a redrawn boundary read as growth',
  'a renamed operator read as a new entrant',
  'a resolved duplicate read as a closure',
];

/* ── Standing ── */

export interface Coupling {
  couplingId: string;
  stage: IndustrialStage;
}

/** None. No facility is mapped, because nothing has been admitted about one. */
export const COUPLINGS: readonly Coupling[] = [];

export const COUPLING_BLOCKED_ON: readonly string[] = [
  'No parcel, facility or organization is held, because admitted records are zero.',
  'No capacity is commissioned, so no utilization can be computed.',
  'No cluster definition exists, so no census can be taken under one.',
];

export function couplingStanding(couplings: readonly Coupling[] = COUPLINGS) {
  const byStage = Object.fromEntries(
    INDUSTRIAL_STAGES.map((stage) => [stage, couplings.filter((entry) => entry.stage === stage).length]),
  ) as Record<IndustrialStage, number>;
  return {
    couplings: couplings.length,
    byStage,
    stages: INDUSTRIAL_STAGES.length,
    transportStages: TRANSPORT_STAGES.length,
    roles: RELATIONSHIP_ROLES.length,
    /* The only stage that is evidence of production. */
    producing: byStage.ACTUAL_PRODUCTION,
    assertingBases: ASSERTING_BASES.length,
    blockedOn: couplings.length > 0 ? [] : [...COUPLING_BLOCKED_ON],
    coverage: couplings.length === 0 ? 'CONTRACT_ONLY_NOTHING_MAPPED' : 'COUPLINGS_PRESENT',
  } as const;
}
