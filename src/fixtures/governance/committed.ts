/**
 * The committed governance demonstration, typed. Stamped by
 * `npm run stamp:governance`; held to the ledgers by demonstration.contract.test.ts.
 */
import demoJson from './demonstration.json';
import type { GovernanceDemonstration } from '@/governance/demonstration';

export const GOVERNANCE_DEMONSTRATION = demoJson as unknown as GovernanceDemonstration;
