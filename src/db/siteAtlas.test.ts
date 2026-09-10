/**
 * The chain, against an actual PostgreSQL engine.
 *
 * Embedded, in a private schema per case: no host database, no network, no
 * operator history. The DDL applied here is `SITE_ATLAS_DDL` itself — the same
 * statement an operator runs — so a constraint test proves something about the
 * real schema rather than about a copy of it maintained by hand beside it.
 *
 * Every rule is checked twice, on purpose. Once through the store, which
 * refuses by name so a caller can act on which rule it broke. Once through raw
 * SQL, which is what proves the rule holds for a writer that never calls the
 * store — the operator at the psql prompt, the import script somebody adds
 * later, the migration that seemed harmless.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableColumns } from 'drizzle-orm';
import * as schema from './schema';
import { SITE_ATLAS_DDL, SITE_LINK_STEPS, SITE_NODE_KINDS } from './siteAtlas';
import { ddlColumns } from './ddl';
import {
  assertLink, atlasCoverage, proposeLink, putNode, readChain, refuseLink, unresolvedMatches,
  type AtlasDatabase,
} from './siteAtlasStore';

let client: PGlite;
let db: AtlasDatabase;
let scenario = 0;

const T0 = '2026-01-01T00:00:00.000Z';
const T1 = '2026-02-01T00:00:00.000Z';
const T2 = '2026-03-01T00:00:00.000Z';

beforeAll(async () => { client = new PGlite(); await client.waitReady; });
afterAll(async () => { await client?.close(); });

beforeEach(async () => {
  scenario += 1;
  await client.exec(`CREATE SCHEMA scenario_${scenario}; SET search_path TO scenario_${scenario};${SITE_ATLAS_DDL}`);
  db = drizzle(client, { schema }) as unknown as AtlasDatabase;
});

/** One node per kind, so a case can link any adjacent pair without repeating the setup. */
async function seedChain(suffix = '') {
  for (const kind of SITE_NODE_KINDS) {
    await putNode(db, {
      nodeId: `${kind}${suffix}`, kind, label: `${kind}${suffix} label`,
      jurisdiction: kind === 'NETWORK_CONNECTION' ? null : 'CA-ON',
      coverageLevel: 'REFERENCE', knownAt: T0,
    });
  }
}

const step = (index: number) => SITE_LINK_STEPS[index];
const link = (index: number, over: Record<string, unknown> = {}) => {
  const [from, to] = step(index);
  return {
    linkId: `L${index}`,
    from: { nodeId: from, kind: from }, to: { nodeId: to, kind: to },
    validFrom: T0, knownAt: T1, ...over,
  };
};
const evidence = [{ sourceId: 'registry:on', artifactDigest: 'sha256-abc' }];

async function raw(sql: string) {
  await client.exec(`SET search_path TO scenario_${scenario}; ${sql}`);
}

describe('the database refuses what the chain forbids, whoever is writing', () => {
  beforeEach(() => seedChain());

  /*
   * The one that matters most. "The company registered at this address operates
   * this plant" is a legal entity linked straight to a facility, and it is the
   * inference corpus 1 exists to prevent. It cannot be stored.
   */
  it('rejects a link that skips a kind', async () => {
    await expect(raw(`INSERT INTO site_link (link_id, from_node, from_kind, to_node, to_kind, standing, evidence, valid_from, known_at)
      VALUES ('skip', 'LEGAL_ENTITY', 'LEGAL_ENTITY', 'PHYSICAL_FACILITY', 'PHYSICAL_FACILITY', 'ASSERTED', '[{"sourceId":"x"}]'::jsonb, '${T0}', '${T1}')`))
      .rejects.toThrow(/site_link_is_one_step/);
  });

  it('rejects an assertion with no evidence', async () => {
    await expect(raw(`INSERT INTO site_link (link_id, from_node, from_kind, to_node, to_kind, standing, evidence, valid_from, known_at)
      VALUES ('bare', 'LEGAL_ENTITY', 'LEGAL_ENTITY', 'OPERATING_ORGANIZATION', 'OPERATING_ORGANIZATION', 'ASSERTED', '[]'::jsonb, '${T0}', '${T1}')`))
      .rejects.toThrow(/site_link_asserted_has_evidence/);
  });

  it('rejects a refusal with no reason', async () => {
    await expect(raw(`INSERT INTO site_link (link_id, from_node, from_kind, to_node, to_kind, standing, evidence, valid_from, known_at)
      VALUES ('why', 'LEGAL_ENTITY', 'LEGAL_ENTITY', 'OPERATING_ORGANIZATION', 'OPERATING_ORGANIZATION', 'REFUSED', '[]'::jsonb, '${T0}', '${T1}')`))
      .rejects.toThrow(/site_link_refused_has_reason/);
  });

  /* A link declaring a kind its node does not have would let the pair check pass on a lie. */
  it('rejects a link whose declared kind is not the node’s kind', async () => {
    await expect(raw(`INSERT INTO site_link (link_id, from_node, from_kind, to_node, to_kind, standing, evidence, valid_from, known_at)
      VALUES ('lie', 'PARCEL', 'LEGAL_ENTITY', 'OPERATING_ORGANIZATION', 'OPERATING_ORGANIZATION', 'CANDIDATE', '[]'::jsonb, '${T0}', '${T1}')`))
      .rejects.toThrow(/site_link_from_node|foreign key/i);
  });

  it('rejects an interval that ends before it starts', async () => {
    await expect(raw(`INSERT INTO site_link (link_id, from_node, from_kind, to_node, to_kind, standing, evidence, valid_from, valid_to, known_at)
      VALUES ('back', 'LEGAL_ENTITY', 'LEGAL_ENTITY', 'OPERATING_ORGANIZATION', 'OPERATING_ORGANIZATION', 'CANDIDATE', '[]'::jsonb, '${T1}', '${T0}', '${T1}')`))
      .rejects.toThrow(/site_link_interval/);
  });

  it('rejects the same pair twice at one knowledge time, and accepts it at a later one', async () => {
    await proposeLink(db, link(0));
    await expect(proposeLink(db, link(0, { linkId: 'L0-again' }))).rejects.toThrow();
    await proposeLink(db, link(0, { linkId: 'L0-later', knownAt: T2 }));
    expect(await unresolvedMatches(db)).toHaveLength(2);
  });

  it('rejects a node kind the vocabulary does not name', async () => {
    await expect(raw(`INSERT INTO site_node (node_id, kind, label, coverage_level, known_at)
      VALUES ('n', 'WAREHOUSE', 'x', 'REFERENCE', '${T0}')`)).rejects.toThrow();
  });

  it('rejects a coverage level the programme does not define', async () => {
    await expect(raw(`INSERT INTO site_node (node_id, kind, label, coverage_level, known_at)
      VALUES ('n', 'PARCEL', 'x', 'WATCHED', '${T0}')`)).rejects.toThrow();
  });
});

describe('the store refuses the same things, by name', () => {
  beforeEach(() => seedChain());

  it('names a missing basis differently from a malformed request', async () => {
    await expect(assertLink(db, { ...link(0), evidence: [] })).rejects.toThrow('ATLAS_ASSERTION_WITHOUT_EVIDENCE');
    // @ts-expect-error a request missing a required field is a different failure
    await expect(assertLink(db, { ...link(0), validFrom: undefined, evidence })).rejects.toThrow('ATLAS_INVALID_INPUT');
  });

  it('refuses a link that is not one step', async () => {
    await expect(proposeLink(db, {
      linkId: 'skip', from: { nodeId: 'LEGAL_ENTITY', kind: 'LEGAL_ENTITY' },
      to: { nodeId: 'PHYSICAL_FACILITY', kind: 'PHYSICAL_FACILITY' }, validFrom: T0, knownAt: T1,
    })).rejects.toThrow('ATLAS_LINK_IS_NOT_ONE_STEP');
  });

  it('refuses a link to itself and a refusal without a reason', async () => {
    await expect(proposeLink(db, {
      linkId: 'self', from: { nodeId: 'PARCEL', kind: 'PARCEL' },
      to: { nodeId: 'PARCEL', kind: 'ACCESS_POINT' }, validFrom: T0, knownAt: T1,
    })).rejects.toThrow('ATLAS_LINK_TO_ITSELF');
    await expect(refuseLink(db, { ...link(0), reason: '   ' })).rejects.toThrow('ATLAS_REFUSAL_WITHOUT_REASON');
  });

  it('refuses an interval that ends before it starts', async () => {
    await expect(proposeLink(db, link(0, { validFrom: T1, validTo: T0 })))
      .rejects.toThrow('ATLAS_INTERVAL_ENDS_BEFORE_IT_STARTS');
  });
});

describe('an unresolved match is a finding, not an absence', () => {
  beforeEach(() => seedChain());

  it('retains a candidate, counts it, and does not let it stand as a link', async () => {
    await proposeLink(db, link(1));
    const pending = await unresolvedMatches(db);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ fromKind: 'OPERATING_ORGANIZATION', toKind: 'PHYSICAL_FACILITY' });

    const coverage = await atlasCoverage(db);
    expect(coverage.unresolvedMatches).toBe(1);
    expect(coverage.assertedLinks, 'a candidate is not an assertion').toBe(0);

    const chain = await readChain(db, { nodeId: 'PHYSICAL_FACILITY', kind: 'PHYSICAL_FACILITY' }, T2);
    const organizationStep = chain.steps.find((entry) => entry.to === 'PHYSICAL_FACILITY')!;
    expect(organizationStep.state).toBe('ONLY_CANDIDATES');
    expect(organizationStep.nodeId, 'a candidate does not reach a node').toBeNull();
    expect(chain.complete).toBe(false);
  });

  it('keeps a refusal with its reason, distinct from never having looked', async () => {
    await refuseLink(db, { ...link(1), reason: 'The permit names a different operator.' });
    const coverage = await atlasCoverage(db);
    expect(coverage.refusedLinks).toBe(1);
    expect(coverage.unresolvedMatches).toBe(0);

    const chain = await readChain(db, { nodeId: 'PHYSICAL_FACILITY', kind: 'PHYSICAL_FACILITY' }, T2);
    expect(chain.steps.find((entry) => entry.to === 'PHYSICAL_FACILITY')!.state).toBe('ONLY_REFUSED');
    // And the step below, which nobody has looked at, says so differently.
    expect(chain.steps.find((entry) => entry.to === 'PARCEL')!.state).toBe('NO_LINK');
  });
});

describe('reading the chain', () => {
  beforeEach(() => seedChain());

  it('walks all six positions when every step is asserted', async () => {
    for (let index = 0; index < SITE_LINK_STEPS.length; index += 1) {
      await assertLink(db, { ...link(index), evidence });
    }
    const chain = await readChain(db, { nodeId: 'PHYSICAL_FACILITY', kind: 'PHYSICAL_FACILITY' }, T2);
    expect(chain.complete).toBe(true);
    expect(chain.positions.map((position) => position.nodeId)).toEqual([...SITE_NODE_KINDS]);
    expect(chain.steps.map((entry) => entry.state)).toEqual(Array(5).fill('ASSERTED'));
    expect(chain.steps.every((entry) => entry.evidenceCount === 1)).toBe(true);
  });

  /*
   * The reading is a description of what is known. A gap makes everything past
   * it unreachable rather than absent, because "we did not get there" and
   * "there is nothing there" are different answers and only the first one is
   * true.
   */
  it('reports a gap and marks everything past it unreachable, rather than bridging it', async () => {
    await assertLink(db, { ...link(0), evidence });   // entity → organization
    await assertLink(db, { ...link(1), evidence });   // organization → facility
    // Nothing links the facility to a parcel.
    await assertLink(db, { ...link(3), evidence });   // parcel → access point, orphaned
    const chain = await readChain(db, { nodeId: 'PHYSICAL_FACILITY', kind: 'PHYSICAL_FACILITY' }, T2);

    expect(chain.steps.map((entry) => entry.state)).toEqual([
      'ASSERTED', 'ASSERTED', 'NO_LINK', 'UNREACHABLE', 'UNREACHABLE',
    ]);
    expect(chain.positions[3].nodeId, 'the parcel was not reached').toBeNull();
    expect(chain.positions[4].nodeId, 'and neither was anything past it').toBeNull();
    expect(chain.complete).toBe(false);
  });

  it('reads as of a knowledge time, and does not use what it did not yet know', async () => {
    await assertLink(db, { ...link(1), knownAt: T2, evidence });
    const early = await readChain(db, { nodeId: 'PHYSICAL_FACILITY', kind: 'PHYSICAL_FACILITY' }, T1);
    expect(early.steps.find((entry) => entry.to === 'PHYSICAL_FACILITY')!.state).toBe('NO_LINK');
    const later = await readChain(db, { nodeId: 'PHYSICAL_FACILITY', kind: 'PHYSICAL_FACILITY' }, T2);
    expect(later.steps.find((entry) => entry.to === 'PHYSICAL_FACILITY')!.state).toBe('ASSERTED');
  });

  it('says so plainly when the node it was asked about is not there', async () => {
    const chain = await readChain(db, { nodeId: 'nothing-here', kind: 'PHYSICAL_FACILITY' }, T2);
    expect(chain.start).toBeNull();
    expect(chain.steps).toEqual([]);
    expect(chain.complete).toBe(false);
  });

  it('prefers the assertion when a pair carries both a candidate and one', async () => {
    await proposeLink(db, link(1));
    await assertLink(db, { ...link(1), linkId: 'L1-asserted', knownAt: T2, evidence });
    const chain = await readChain(db, { nodeId: 'PHYSICAL_FACILITY', kind: 'PHYSICAL_FACILITY' }, T2);
    expect(chain.steps.find((entry) => entry.to === 'PHYSICAL_FACILITY')!.linkId).toBe('L1-asserted');
    // And the candidate is still a candidate, still counted.
    expect(await unresolvedMatches(db)).toHaveLength(1);
  });
});

describe('what the atlas holds is derived from the rows', () => {
  it('counts nothing when nothing has been written', async () => {
    const coverage = await atlasCoverage(db);
    expect(coverage).toMatchObject({ nodes: 0, assertedLinks: 0, unresolvedMatches: 0, refusedLinks: 0 });
    expect(coverage.byCoverageLevel).toEqual({ REFERENCE: 0, ASSESSED: 0, MONITORED: 0 });
  });

  it('counts nodes by kind and by the level they are maintained at', async () => {
    await seedChain();
    await putNode(db, { nodeId: 'F2', kind: 'PHYSICAL_FACILITY', label: 'Second facility', coverageLevel: 'ASSESSED', knownAt: T0 });
    const coverage = await atlasCoverage(db);
    expect(coverage.nodes).toBe(7);
    expect(coverage.byKind.PHYSICAL_FACILITY).toBe(2);
    expect(coverage.byCoverageLevel).toEqual({ REFERENCE: 6, ASSESSED: 1, MONITORED: 0 });
  });

  it('updates a node without letting it change kind under its links', async () => {
    await seedChain();
    await assertLink(db, { ...link(1), evidence });
    await putNode(db, { nodeId: 'PHYSICAL_FACILITY', kind: 'PHYSICAL_FACILITY', label: 'Renamed', coverageLevel: 'MONITORED', knownAt: T2 });
    const chain = await readChain(db, { nodeId: 'PHYSICAL_FACILITY', kind: 'PHYSICAL_FACILITY' }, T2);
    expect(chain.positions[2].label).toBe('Renamed');
    expect(chain.steps.find((entry) => entry.to === 'PHYSICAL_FACILITY')!.state).toBe('ASSERTED');
  });
});

describe('one schema, not two', () => {
  /*
   * The older tables keep their DDL in the test file beside a TypeScript
   * definition, which is two descriptions that can disagree. These have one,
   * and this is what keeps the query definitions from naming a column it does
   * not create.
   */
  it('creates every column the query definitions name', () => {
    const created = ddlColumns(SITE_ATLAS_DDL);
    for (const [table, columns] of [
      ['site_node', getTableColumns(schema.siteNodes)],
      ['site_link', getTableColumns(schema.siteLinks)],
    ] as const) {
      expect(created[table], `${table} is created by the DDL`).toBeDefined();
      for (const column of Object.values(columns)) {
        expect(created[table], `${table}.${column.name}`).toContain(column.name);
      }
    }
  });

  it('derives the five permitted steps from the six kinds rather than listing them again', () => {
    expect(SITE_LINK_STEPS).toHaveLength(SITE_NODE_KINDS.length - 1);
    expect(SITE_LINK_STEPS.map(([from]) => from)).toEqual(SITE_NODE_KINDS.slice(0, -1));
    expect(SITE_LINK_STEPS.map(([, to]) => to)).toEqual(SITE_NODE_KINDS.slice(1));
    // And the DDL's constraint carries exactly those pairs.
    for (const [from, to] of SITE_LINK_STEPS) expect(SITE_ATLAS_DDL).toContain(`('${from}', '${to}')`);
  });
});
