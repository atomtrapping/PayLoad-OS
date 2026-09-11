/**
 * Stamp the governance demonstration (node only).
 *
 *   npm run stamp:governance
 *
 * Runs the three lifecycles through two embedded PostgreSQL databases at the
 * instants declared in src/governance and writes
 * src/fixtures/governance/demonstration.json. demonstration.contract.test.ts
 * runs the same lifecycles and asserts equality, so the committed file cannot
 * drift from what the ledgers do.
 */
import { writeFileSync } from 'node:fs';
import { runGovernanceDemonstration } from '@/governance/demonstration';

const OUT = new URL('../src/fixtures/governance/demonstration.json', import.meta.url);
const demo = await runGovernanceDemonstration();
writeFileSync(OUT, JSON.stringify(demo, null, 2) + '\n');
console.log(`stamped ${demo.counts.proposals} proposals, ${demo.counts.authorizations} authorizations, ${demo.counts.refusals} refusals by ${demo.refusedBy.length} guards → src/fixtures/governance/demonstration.json`);
