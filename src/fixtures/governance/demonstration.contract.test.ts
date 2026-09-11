/**
 * The committed governance demonstration is exactly what the ledgers produce
 * when the three lifecycles are run at their declared instants. Node only;
 * two embedded PostgreSQL databases.
 */
import { describe, expect, it } from 'vitest';
import demoJson from './demonstration.json';
import { GOVERNANCE_DEMONSTRATION_SCHEMA, runGovernanceDemonstration, type GovernanceDemonstration } from '@/governance/demonstration';

const demo = demoJson as unknown as GovernanceDemonstration;

describe('the governance demonstration reproduces', () => {
  it('regenerates byte-for-byte from the ledgers at the declared instants (run npm run stamp:governance after changing them)', async () => {
    expect(await runGovernanceDemonstration()).toEqual(demo);
  }, 120_000);

  it('says what it is on its own fields', () => {
    expect(demo.schema).toBe(GOVERNANCE_DEMONSTRATION_SCHEMA);
    expect(demo.fixture_only).toBe(true);
    expect(demo.simulated).toBe(true);
    expect(demo.notClaimed.length).toBeGreaterThanOrEqual(6);
    expect(demo.seeded.spatial.baselineUnchanged).toBe(true);
  });

  it('carries every refusal with the ledger it happened in, and names each guard once', () => {
    expect(demo.refusals.length).toBe(demo.dossier.refusals.length + demo.editorial.refusals.length + demo.treasury.refusals.length);
    expect(demo.refusedBy).toEqual([...new Set(demo.refusedBy)].sort());
    for (const refusal of demo.refusals) expect(demo.refusedBy).toContain(refusal.refusedBy.split(':')[0]);
  });
});
