/**
 * The coupling, against an actual PostgreSQL engine.
 *
 * The four stages are four tables that reference each other in one direction,
 * so the chain can be assembled and cannot be assumed. Every case below is
 * about the assumption rather than the assembly: land bought and nothing built,
 * a permit and no line, a line and no output, a route and no shipment.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import {
  ASSERTING_BASES, RELATIONSHIP_ROLES, TRANSPORT_STAGES, utilization,
} from '@/domain/capacityCoupling';
import { CAPACITY_LEDGER_DDL, STANDING_BASES } from './capacityLedger';

let client: PGlite;
let scenario = 0;

const T_BUY = '2026-01-10T00:00:00.000Z';
const T_BUILD = '2026-04-10T00:00:00.000Z';
const T_LIVE = '2026-09-10T00:00:00.000Z';
const T_SEE = '2026-11-10T00:00:00.000Z';

beforeAll(async () => { client = new PGlite(); await client.waitReady; });
afterAll(async () => { await client?.close(); });

beforeEach(async () => {
  scenario += 1;
  await client.exec(`CREATE SCHEMA cap_${scenario}; SET search_path TO cap_${scenario}; ${CAPACITY_LEDGER_DDL}`);
});

async function sql(statement: string) {
  await client.exec(`SET search_path TO cap_${scenario}; ${statement}`);
}
async function rows(query: string) {
  await client.query(`SET search_path TO cap_${scenario}`);
  return (await client.query(query)).rows as Record<string, unknown>[];
}

const acquisition = () => sql(`INSERT INTO parcel_acquisition VALUES ('AQ1', 'parcel:1', 'org:meridian', '${T_BUY}', 'Registry transfer.')`);
const commitment = () => sql(`INSERT INTO construction_commitment VALUES ('CM1', 'AQ1', '${T_BUILD}', 'Building permit issued.')`);
const capacity = (rated = 40000) => sql(`INSERT INTO commissioned_capacity VALUES ('CP1', 'CM1', 'facility:1', 'line-A', ${rated}, 'kt/yr', '${T_LIVE}')`);

describe('four stages that do not promote', () => {
  /*
   * Land is acquired as an option, a hedge, or a block on a competitor, and
   * nothing is ever built. The acquisition exists and creates nothing.
   */
  it('does not create a commitment by acquiring land', async () => {
    await acquisition();
    expect(await rows(`SELECT count(*)::int AS n FROM construction_commitment`)).toEqual([{ n: 0 }]);
    expect(await rows(`SELECT count(*)::int AS n FROM commissioned_capacity`)).toEqual([{ n: 0 }]);
    expect(await rows(`SELECT count(*)::int AS n FROM observed_production`)).toEqual([{ n: 0 }]);
  });

  it('refuses a commitment with no acquisition behind it', async () => {
    await expect(commitment()).rejects.toThrow(/acquisition_id|foreign key/i);
  });

  it('refuses capacity with no commitment behind it', async () => {
    await acquisition();
    await expect(capacity()).rejects.toThrow(/commitment_id|foreign key/i);
  });

  /* A commissioned line runs at a fraction of its rating, or not at all. */
  it('does not create production by commissioning a line', async () => {
    await acquisition(); await commitment(); await capacity();
    expect(await rows(`SELECT count(*)::int AS n FROM observed_production`)).toEqual([{ n: 0 }]);
  });

  it('assembles the whole chain when every stage is evidenced', async () => {
    await acquisition(); await commitment(); await capacity();
    await sql(`INSERT INTO observed_production VALUES ('PD1', 'CP1', 40000, 26000, '2026 to date', '${T_SEE}', 'Shipment manifests.')`);
    expect(await rows(`SELECT observed_value::int AS v FROM observed_production`)).toEqual([{ v: 26000 }]);
  });

  /* Utilization is against the rating that line actually has. */
  it('refuses production measured against a rating the line does not have', async () => {
    await acquisition(); await commitment(); await capacity(40000);
    await expect(sql(`INSERT INTO observed_production VALUES ('PD1', 'CP1', 90000, 26000, 'x', '${T_SEE}', 'e')`))
      .rejects.toThrow(/production_capacity|foreign key/i);
  });

  it('computes utilization exactly, and refuses a rating of zero', () => {
    expect(utilization(26000, 40000)).toBe(0.65);
    expect(utilization(0, 40000)).toBe(0);
    expect(() => utilization(1, 0)).toThrow(/COUPLING_RATING_NOT_POSITIVE/);
  });

  /*
   * And the database refuses it too. The function's guard protects a caller
   * that went through the function; the column protects the one that did not,
   * which is the writer this repository actually worries about.
   */
  it('refuses commissioning a line rated at nothing', async () => {
    await acquisition(); await commitment();
    await expect(capacity(0)).rejects.toThrow(/rated_value/);
    await expect(capacity(-5)).rejects.toThrow(/rated_value/);
  });
});

describe('a spatial match is not an operating relationship', () => {
  const relationship = (id: string, role: string, basis: string, standing: string) => sql(`
    INSERT INTO site_relationship VALUES ('${id}', 'org:meridian', 'facility:1', '${role}', '${basis}',
      '${standing}', '${T_BUY}', NULL, 'The polygons overlap.')`);

  /*
   * The most nearly-right error in the domain: the polygons really do overlap.
   * Co-location may support a candidate and never an assertion, for every one
   * of the four roles.
   */
  it('refuses asserting any role on co-location alone', async () => {
    for (const [index, role] of RELATIONSHIP_ROLES.entries()) {
      await expect(relationship(`R${index}`, role, 'CO_LOCATION_ONLY', 'ASSERTED'), role)
        .rejects.toThrow(/relationship_basis_supports_its_standing/);
    }
  });

  it('permits it as a candidate', async () => {
    await relationship('R1', 'OPERATOR', 'CO_LOCATION_ONLY', 'CANDIDATE');
    expect(await rows(`SELECT standing FROM site_relationship`)).toEqual([{ standing: 'CANDIDATE' }]);
  });

  it('asserts a role on a basis that supports one', async () => {
    for (const [index, basis] of ASSERTING_BASES.entries()) {
      await relationship(`R${index}`, 'OPERATOR', basis, 'ASSERTED');
      await sql(`DELETE FROM site_relationship`);
    }
    expect(ASSERTING_BASES).not.toContain('CO_LOCATION_ONLY');
  });

  /* Four relationships, not four words for one. */
  it('holds the four roles separately for one organization and site', async () => {
    for (const [index, role] of RELATIONSHIP_ROLES.entries()) {
      await relationship(`R${index}`, role, 'REGISTRY_RECORD', 'ASSERTED');
    }
    expect(await rows(`SELECT count(DISTINCT role)::int AS n FROM site_relationship`))
      .toEqual([{ n: RELATIONSHIP_ROLES.length }]);
  });

  it('refuses an interval that ends before it starts', async () => {
    await expect(sql(`INSERT INTO site_relationship VALUES ('R1', 'org:m', 'facility:1', 'OWNER',
      'REGISTRY_RECORD', 'ASSERTED', '${T_LIVE}', '${T_BUY}', 'e')`))
      .rejects.toThrow(/relationship_interval/);
  });

  it('keeps the domain and the schema agreeing about which bases assert', () => {
    expect(STANDING_BASES).toContainEqual(['CANDIDATE', 'CO_LOCATION_ONLY']);
    expect(STANDING_BASES).not.toContainEqual(['ASSERTED', 'CO_LOCATION_ONLY']);
  });
});

describe('a route is not a booking is not a shipment', () => {
  beforeEach(() => sql(`INSERT INTO possible_route VALUES ('RT1', 'facility:1', 'port:1', 'Rail network topology.')`));

  it('records a possible route without claiming anything moved', async () => {
    await sql(`INSERT INTO movement_record VALUES ('MV1', 'POSSIBLE_ROUTE', 'RT1', NULL, NULL, '${T_LIVE}')`);
    expect(await rows(`SELECT stage FROM movement_record`)).toEqual([{ stage: 'POSSIBLE_ROUTE' }]);
  });

  /* Only the last stage is evidence that anything moved. */
  it('refuses an observed shipment with no evidence of it', async () => {
    await expect(sql(`INSERT INTO movement_record VALUES ('MV1', 'OBSERVED_SHIPMENT', 'RT1', NULL, NULL, '${T_SEE}')`))
      .rejects.toThrow(/movement_observation_has_evidence/);
  });

  it('refuses a possible route carrying evidence of a shipment', async () => {
    await expect(sql(`INSERT INTO movement_record VALUES ('MV1', 'POSSIBLE_ROUTE', 'RT1', NULL, 'A manifest.', '${T_SEE}')`))
      .rejects.toThrow(/movement_observation_has_evidence/);
  });

  it('refuses a booking that names no counterparty', async () => {
    await expect(sql(`INSERT INTO movement_record VALUES ('MV1', 'BOOKED_CAPACITY', 'RT1', NULL, NULL, '${T_LIVE}')`))
      .rejects.toThrow(/movement_booking_names_a_counterparty/);
  });

  it('records all three stages as different facts', async () => {
    await sql(`
      INSERT INTO movement_record VALUES ('MV1', 'POSSIBLE_ROUTE', 'RT1', NULL, NULL, '${T_LIVE}');
      INSERT INTO movement_record VALUES ('MV2', 'BOOKED_CAPACITY', 'RT1', 'carrier:acme', NULL, '${T_LIVE}');
      INSERT INTO movement_record VALUES ('MV3', 'OBSERVED_SHIPMENT', 'RT1', NULL, 'Gate camera and manifest.', '${T_SEE}')`);
    expect(await rows(`SELECT count(DISTINCT stage)::int AS n FROM movement_record`))
      .toEqual([{ n: TRANSPORT_STAGES.length }]);
  });

  it('refuses a route that goes nowhere', async () => {
    await expect(sql(`INSERT INTO possible_route VALUES ('RT2', 'facility:1', 'facility:1', 'x')`))
      .rejects.toThrow(/route_goes_somewhere/);
  });
});

describe('a change is only a change under one definition', () => {
  beforeEach(() => sql(`
    INSERT INTO cluster_definition VALUES ('CL1', 1, 'The 40km ring.', 'Chemical facilities above 10kt.', '${T_BUY}');
    INSERT INTO cluster_definition VALUES ('CL1', 2, 'The 60km ring.', 'Chemical facilities above 10kt.', '${T_LIVE}');
    INSERT INTO cluster_census VALUES ('CS1', 'CL1', 1, 14, '${T_BUY}');
    INSERT INTO cluster_census VALUES ('CS2', 'CL1', 1, 19, '${T_SEE}');
    INSERT INTO cluster_census VALUES ('CS3', 'CL1', 2, 31, '${T_SEE}')`));

  it('compares two censuses taken under the same definition', async () => {
    await sql(`INSERT INTO cluster_change VALUES ('CH1', 'CL1', 1, 'CS1', 'CS2', 'Five facilities newly mapped; coverage unchanged.')`);
    expect(await rows(`SELECT interpreted_as FROM cluster_change`))
      .toEqual([{ interpreted_as: 'Five facilities newly mapped; coverage unchanged.' }]);
  });

  /*
   * The artefact. A boundary redrawn between two counts produces apparent
   * growth — 14 to 31 — with no new industrial activity at all.
   */
  it('refuses comparing counts taken under different definitions', async () => {
    await expect(sql(`INSERT INTO cluster_change VALUES ('CH1', 'CL1', 1, 'CS1', 'CS3', 'Seventeen new facilities.')`))
      .rejects.toThrow(/change_to|foreign key/i);
    await expect(sql(`INSERT INTO cluster_change VALUES ('CH2', 'CL1', 2, 'CS1', 'CS3', 'Seventeen new facilities.')`))
      .rejects.toThrow(/change_from|foreign key/i);
  });

  it('refuses a census under a definition that does not exist', async () => {
    await expect(sql(`INSERT INTO cluster_census VALUES ('CS4', 'CL1', 9, 40, '${T_SEE}')`))
      .rejects.toThrow(/census_definition|foreign key/i);
  });

  it('refuses a change from a census to itself', async () => {
    await expect(sql(`INSERT INTO cluster_change VALUES ('CH1', 'CL1', 1, 'CS1', 'CS1', 'x')`))
      .rejects.toThrow(/change_is_between_two/);
  });

  it('refuses a change that does not say what it was read as', async () => {
    await expect(sql(`INSERT INTO cluster_change VALUES ('CH1', 'CL1', 1, 'CS1', 'CS2', '  ')`))
      .rejects.toThrow(/interpreted_as/);
  });
});

describe('nothing is mapped', () => {
  it('holds no relationship, stage, movement or census', async () => {
    for (const table of ['site_relationship', 'parcel_acquisition', 'construction_commitment',
      'commissioned_capacity', 'observed_production', 'possible_route', 'movement_record',
      'cluster_definition', 'cluster_census', 'cluster_change']) {
      expect(await rows(`SELECT 1 FROM ${table}`), table).toEqual([]);
    }
  });
});
