import type { CoordinationCommand, Participant } from '../coordination/types';

export const COMMERCIAL_PARTICIPANT: Participant = {
  id: 'agent.commercial.v1', name: 'Commercial opportunity agent', kind: 'AGENT', version: '0.1.0',
  authority: 'derived', status: 'LOCAL', runtime: 'JavaScript', scope: 'firm:coordination-demo',
  domains: ['CARAVAN', 'TRADEWIND', 'LANDSHARK'],
  purpose: 'Match supplied buyer intents to data capabilities, check commercial policy and prepare internal proposals for principal review. Manually invoked CLI; no external contact or execution.',
  inputs: ['notation.commercial-request.v1'], outputs: ['notation.commercial-report.v1'],
  capabilities: ['commercial.qualify', 'commercial.rank', 'commercial.propose'],
  reference: 'NotationsOS: src/commercial/; npm run agent:commercial; docs/COMMERCIAL_AGENT.md',
};

/** Emit an ordinary registration event rather than changing the seed pinned by local board history. */
export function commercialRegistration(): CoordinationCommand {
  return { operation: 'register', participant: structuredClone(COMMERCIAL_PARTICIPANT) };
}
