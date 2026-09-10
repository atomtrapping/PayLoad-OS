/**
 * The coupling, in the database.
 *
 * BESIDE `siteAtlas`, NOT INSIDE IT
 *
 * The obvious move was to widen `SITE_LINK_STEPS` with the four organizational
 * roles and let the existing one-step check carry them. It would have been
 * wrong twice. The role-permitted pairs would have projected onto exactly the
 * widened step list, so `site_link_is_one_step` — the constraint that module's
 * own header calls the inference the chain exists to prevent — would have
 * become unfireable. And its existing test asserts a specific constraint name
 * where PostgreSQL does not define which of two violated CHECKs it reports, so
 * that test would have started passing or failing on whichever name came back.
 *
 * A working constraint elsewhere is not a reason to route new work through it.
 * This is a separate ledger that references the atlas's nodes.
 *
 * FOUR STAGES THAT DO NOT PROMOTE
 *
 * Each stage is its own table and each references the one before it. So
 * commissioned capacity requires a construction commitment, which requires an
 * acquisition — and having an acquisition creates none of them. The chain can
 * be assembled and it cannot be assumed, which is the difference between a
 * finding and a guess sold as one.
 *
 * A SPATIAL MATCH IS NOT AN OPERATING RELATIONSHIP
 *
 * `CO_LOCATION_ONLY` is a basis a candidate may rest on and an assertion may
 * not. The polygons really do overlap, which is why this needs a constraint
 * rather than a reviewer: it is the most nearly-right error in the domain.
 *
 * A CHANGE IS ONLY A CHANGE UNDER ONE DEFINITION
 *
 * Two censuses of a cluster compare only when both were taken under the same
 * definition version. More mapped facilities could mean more facilities or
 * better mapping, and a boundary redrawn between two counts produces apparent
 * growth with no new industrial activity at all.
 */
import { quoted } from './ddl';
import {
  ASSERTING_BASES, RELATIONSHIP_BASES, RELATIONSHIP_ROLES, RELATIONSHIP_STANDINGS,
  TRANSPORT_STAGES,
} from '@/domain/capacityCoupling';

/** The (standing, basis) pairs permitted. Co-location supports a candidate, never an assertion. */
export const STANDING_BASES: ReadonlyArray<readonly [string, string]> = [
  ...RELATIONSHIP_BASES.map((basis) => ['CANDIDATE', basis] as const),
  ...ASSERTING_BASES.map((basis) => ['ASSERTED', basis] as const),
  ...RELATIONSHIP_BASES.map((basis) => ['REFUSED', basis] as const),
];

const STANDING_BASIS_PAIRS = STANDING_BASES.map(([standing, basis]) => `('${standing}', '${basis}')`).join(', ');

export const CAPACITY_LEDGER_DDL = `
-- Who stands in what relationship to what, on what basis, over what interval.
CREATE TABLE site_relationship (
  relationship_id text PRIMARY KEY,
  organization_id text NOT NULL CHECK (length(btrim(organization_id)) > 0),
  site_id text NOT NULL CHECK (length(btrim(site_id)) > 0),
  -- Owner, occupier, operator and controlling are four relationships, not four
  -- words for one.
  role text NOT NULL CHECK (role IN (${quoted(RELATIONSHIP_ROLES)})),
  basis text NOT NULL CHECK (basis IN (${quoted(RELATIONSHIP_BASES)})),
  standing text NOT NULL CHECK (standing IN (${quoted(RELATIONSHIP_STANDINGS)})),
  valid_from timestamptz NOT NULL,
  valid_to timestamptz,
  evidence text NOT NULL CHECK (length(btrim(evidence)) > 0),

  -- The most nearly-right error in the domain. Co-location establishes where
  -- two things are; it never establishes who runs one of them.
  CONSTRAINT relationship_basis_supports_its_standing CHECK ((standing, basis) IN (${STANDING_BASIS_PAIRS})),
  CONSTRAINT relationship_interval CHECK (valid_to IS NULL OR valid_to > valid_from),
  CONSTRAINT relationship_once UNIQUE (organization_id, site_id, role, valid_from)
);

-- Stage one. Somebody bought land.
CREATE TABLE parcel_acquisition (
  acquisition_id text PRIMARY KEY,
  parcel_id text NOT NULL CHECK (length(btrim(parcel_id)) > 0),
  acquired_by text NOT NULL CHECK (length(btrim(acquired_by)) > 0),
  acquired_at timestamptz NOT NULL,
  evidence text NOT NULL CHECK (length(btrim(evidence)) > 0)
);

-- Stage two. It names the acquisition, and an acquisition creates none of these.
CREATE TABLE construction_commitment (
  commitment_id text PRIMARY KEY,
  acquisition_id text NOT NULL REFERENCES parcel_acquisition (acquisition_id),
  committed_at timestamptz NOT NULL,
  evidence text NOT NULL CHECK (length(btrim(evidence)) > 0)
);

-- Stage three. A line exists and is rated.
CREATE TABLE commissioned_capacity (
  capacity_id text PRIMARY KEY,
  commitment_id text NOT NULL REFERENCES construction_commitment (commitment_id),
  -- Capacity attaches to a process line at a facility, never to the parcel.
  facility_id text NOT NULL CHECK (length(btrim(facility_id)) > 0),
  process_line text NOT NULL CHECK (length(btrim(process_line)) > 0),
  rated_value numeric NOT NULL CHECK (rated_value > 0),
  rated_unit text NOT NULL CHECK (length(btrim(rated_unit)) > 0),
  commissioned_at timestamptz NOT NULL,
  UNIQUE (capacity_id, rated_value)
);

-- Stage four. Something was made, and observed to have been made.
CREATE TABLE observed_production (
  production_id text PRIMARY KEY,
  capacity_id text NOT NULL,
  -- Denormalised from the capacity and tied, so utilization is against the
  -- rating that line actually has.
  rated_value numeric NOT NULL,
  observed_value numeric NOT NULL CHECK (observed_value >= 0),
  observed_over text NOT NULL CHECK (length(btrim(observed_over)) > 0),
  observed_at timestamptz NOT NULL,
  evidence text NOT NULL CHECK (length(btrim(evidence)) > 0),

  CONSTRAINT production_capacity FOREIGN KEY (capacity_id, rated_value)
    REFERENCES commissioned_capacity (capacity_id, rated_value)
);

-- A route the network permits. A statement about topology.
CREATE TABLE possible_route (
  route_id text PRIMARY KEY,
  from_node text NOT NULL CHECK (length(btrim(from_node)) > 0),
  to_node text NOT NULL CHECK (length(btrim(to_node)) > 0),
  derived_from text NOT NULL CHECK (length(btrim(derived_from)) > 0),
  CONSTRAINT route_goes_somewhere CHECK (from_node <> to_node)
);

-- A movement, at whichever of the three stages it has actually reached.
CREATE TABLE movement_record (
  movement_id text PRIMARY KEY,
  stage text NOT NULL CHECK (stage IN (${quoted(TRANSPORT_STAGES)})),
  route_id text NOT NULL REFERENCES possible_route (route_id),
  -- A booking is a commercial fact and needs a counterparty.
  booked_with text,
  -- An observation is something that happened and needs evidence of it.
  observation_evidence text,
  recorded_at timestamptz NOT NULL,

  -- A booking names who it is with; a possible route does not have one.
  CONSTRAINT movement_booking_names_a_counterparty CHECK (
    (stage = 'BOOKED_CAPACITY') = (booked_with IS NOT NULL AND length(btrim(booked_with)) > 0)
  ),
  -- And only an observed shipment carries evidence that anything moved.
  CONSTRAINT movement_observation_has_evidence CHECK (
    (stage = 'OBSERVED_SHIPMENT') = (observation_evidence IS NOT NULL AND length(btrim(observation_evidence)) > 0)
  )
);

-- How a cluster is measured. A census is taken under exactly one of these.
CREATE TABLE cluster_definition (
  cluster_id text NOT NULL,
  definition_version integer NOT NULL CHECK (definition_version >= 1),
  boundary text NOT NULL CHECK (length(btrim(boundary)) > 0),
  inclusion_rule text NOT NULL CHECK (length(btrim(inclusion_rule)) > 0),
  adopted_at timestamptz NOT NULL,
  PRIMARY KEY (cluster_id, definition_version)
);

CREATE TABLE cluster_census (
  census_id text PRIMARY KEY,
  cluster_id text NOT NULL,
  definition_version integer NOT NULL,
  counted integer NOT NULL CHECK (counted >= 0),
  taken_at timestamptz NOT NULL,

  CONSTRAINT census_definition FOREIGN KEY (cluster_id, definition_version)
    REFERENCES cluster_definition (cluster_id, definition_version),
  UNIQUE (census_id, cluster_id, definition_version)
);

-- A change between two censuses. Only a change when both used one definition.
CREATE TABLE cluster_change (
  change_id text PRIMARY KEY,
  cluster_id text NOT NULL,
  definition_version integer NOT NULL,
  from_census_id text NOT NULL,
  to_census_id text NOT NULL,
  interpreted_as text NOT NULL CHECK (length(btrim(interpreted_as)) > 0),

  CONSTRAINT change_from FOREIGN KEY (from_census_id, cluster_id, definition_version)
    REFERENCES cluster_census (census_id, cluster_id, definition_version),
  CONSTRAINT change_to FOREIGN KEY (to_census_id, cluster_id, definition_version)
    REFERENCES cluster_census (census_id, cluster_id, definition_version),
  CONSTRAINT change_is_between_two CHECK (from_census_id <> to_census_id)
);

CREATE INDEX relationship_by_site ON site_relationship (site_id, role);
CREATE INDEX production_by_capacity ON observed_production (capacity_id, observed_at);
CREATE INDEX census_by_cluster ON cluster_census (cluster_id, definition_version, taken_at);
`;

