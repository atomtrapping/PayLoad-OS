/**
 * Who acts in the governance demonstration.
 *
 * Every name here is registered in the kernel's principal table before
 * anything is proposed, because a reviewer or grantor that is not a row is a
 * string. The customer is simulated and named as such; the agent is an agent
 * and may propose, prepare and reconcile, and the column will not let it
 * review, grant or revoke.
 */
import type { Principal } from './ledger';

export const PRINCIPALS = {
  customer: { principalId: 'customer:demonstration-buyer', kind: 'HUMAN', displayName: 'Demonstration buyer — a simulated customer, not a real one' },
  otherCustomer: { principalId: 'customer:demonstration-other', kind: 'HUMAN', displayName: 'A second simulated customer, who asked for nothing' },
  steward: { principalId: 'operator:corpus-steward', kind: 'HUMAN', displayName: 'Corpus steward' },
  secondReviewer: { principalId: 'operator:second-reviewer', kind: 'HUMAN', displayName: 'A second operator, to whom a refused proposal must not be routed' },
  editor: { principalId: 'editor:desk', kind: 'HUMAN', displayName: 'Desk editor' },
  rightsReviewer: { principalId: 'reviewer:rights', kind: 'HUMAN', displayName: 'Rights reviewer' },
  privacyReviewer: { principalId: 'reviewer:privacy', kind: 'HUMAN', displayName: 'Privacy reviewer' },
  conflictReviewer: { principalId: 'reviewer:conflict', kind: 'HUMAN', displayName: 'Conflicts reviewer' },
  treasurer: { principalId: 'operator:treasurer', kind: 'HUMAN', displayName: 'Treasurer' },
  agent: { principalId: 'agent:governance-demonstration', kind: 'AGENT', displayName: 'The agent: proposes, prepares, reconciles; never reviews, grants or revokes' },
  pricingPolicy: { principalId: 'policy:pricing-2026', kind: 'POLICY', displayName: 'Pricing policy, 2026 — approved by the steward' },
} as const satisfies Record<string, Principal>;

export const ALL_PRINCIPALS: readonly Principal[] = Object.values(PRINCIPALS);
