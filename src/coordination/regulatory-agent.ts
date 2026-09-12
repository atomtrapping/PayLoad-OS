import { z } from 'zod';
import type { FederalRegisterCaptureInspection } from '../acquisition/store';
import { localRecordDigest } from '../data-os/local-record';
import {
  analyzeRegulatoryChanges, observationsFromFederalRegister, regulatoryWatchSchema,
  type RegulatoryManagerReport,
} from '../regulatory/manager';
import type { WorkerClient } from './contract-review';
import type { BoardMessage, CoordinationSnapshot, Participant } from './types';

export const REGULATORY_AGENT_ID = 'agent.regulatory-manager.v1';
export const REGULATORY_AGENT_TOPIC = 'regulatory-change-review';

const requestSchema = z.object({
  schema: z.literal('payload.regulatory-agent-request.v1'),
  captureId: z.string().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/),
  expectedContentDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  runId: z.string().min(1).max(180).regex(/^[A-Za-z0-9:._-]+$/),
  knownThrough: z.iso.datetime({ offset: true }),
  watches: z.array(regulatoryWatchSchema).max(25),
}).strict();
export type RegulatoryAgentRequest = z.infer<typeof requestSchema>;

export interface FederalRegisterInspector {
  inspect(captureId: string): FederalRegisterCaptureInspection | undefined;
}

const NONCLAIMS = Object.freeze({
  fetchedSource: false,
  canonicalAdmission: false,
  canonicalStateMutated: false,
  actionAuthorized: false,
  legalEffectEstablished: false,
} as const);

type AgentError = 'INVALID_REQUEST' | 'CAPTURE_UNAVAILABLE' | 'CAPTURE_NOT_READY' | 'CAPTURE_DIGEST_MISMATCH' | 'ANALYSIS_FAILED';

interface RegulatoryAgentResult extends Readonly<typeof NONCLAIMS> {
  schema: 'payload.regulatory-agent-result.v1';
  requestDigest: string;
  captureId: string | null;
  assessment: 'ANALYZED' | 'UNAVAILABLE' | 'REJECTED';
  error: AgentError | null;
  reportDigest: string | null;
  counts: RegulatoryManagerReport['counts'] | null;
  proposals: Array<{ proposalId: string; target: string; instrumentId: string; requiredEvidence: string }>;
  omittedProposals: number;
}

export function regulatoryAgentDefinition(scope: string): Participant {
  return {
    id: REGULATORY_AGENT_ID,
    name: 'Regulatory manager agent',
    kind: 'AGENT',
    version: '0.1.0',
    purpose: 'Inspect retained government publication captures, group repeated coverage, measure declared source independence and propose review-gated updates for firm systems.',
    authority: 'derived',
    runtime: 'JavaScript',
    status: 'LOCAL',
    scope,
    domains: ['CARAVAN', 'TRADEWIND', 'LANDSHARK'],
    inputs: ['payload.federal-register-feed-observation.v1', 'payload.regulatory-agent-request.v1'],
    outputs: ['payload.regulatory-agent-result.v1'],
    capabilities: ['regulatory.observe', 'regulatory.cluster', 'regulatory.propose'],
    reference: 'Payload OS: src/coordination/regulatory-agent.ts',
  };
}

function assessment(error: AgentError | null): RegulatoryAgentResult['assessment'] {
  return error === null ? 'ANALYZED' : ['CAPTURE_UNAVAILABLE', 'CAPTURE_NOT_READY'].includes(error) ? 'UNAVAILABLE' : 'REJECTED';
}

function parseRequest(message: BoardMessage): RegulatoryAgentRequest | null {
  try {
    const parsed = requestSchema.parse(JSON.parse(message.body));
    if (new Date(parsed.knownThrough).toISOString() !== parsed.knownThrough) return null;
    return parsed;
  } catch { return null; }
}

function resultFor(message: BoardMessage, inspector: FederalRegisterInspector): RegulatoryAgentResult {
  const request = parseRequest(message);
  let error: AgentError | null = request ? null : 'INVALID_REQUEST';
  let report: RegulatoryManagerReport | null = null;
  if (request) {
    try {
      const capture = inspector.inspect(request.captureId);
      if (!capture) error = 'CAPTURE_UNAVAILABLE';
      else if (capture.state !== 'CAPTURED' || !capture.acquisition || !capture.observations) error = 'CAPTURE_NOT_READY';
      else if (capture.acquisition.contentDigest !== request.expectedContentDigest) error = 'CAPTURE_DIGEST_MISMATCH';
      else report = analyzeRegulatoryChanges({
        schema: 'payload.regulatory-manager-request.v1',
        runId: request.runId,
        knownThrough: request.knownThrough,
        observations: observationsFromFederalRegister(capture),
        watches: request.watches,
      });
    } catch { error = 'ANALYSIS_FAILED'; }
  }
  const proposals = report?.proposals.slice(0, 10).map((entry) => ({
    proposalId: entry.proposalId,
    target: entry.target,
    instrumentId: entry.instrumentId,
    requiredEvidence: entry.requiredEvidence,
  })) ?? [];
  return {
    schema: 'payload.regulatory-agent-result.v1',
    requestDigest: localRecordDigest(message),
    captureId: request?.captureId ?? null,
    assessment: assessment(error),
    error,
    reportDigest: report?.digest ?? null,
    counts: report?.counts ?? null,
    proposals,
    omittedProposals: report ? report.proposals.length - proposals.length : 0,
    ...NONCLAIMS,
  };
}

function checkSnapshot(snapshot: CoordinationSnapshot, scope?: string): void {
  if (!snapshot.canWrite || snapshot.mode !== 'LOCAL_SANDBOX' || (scope !== undefined && snapshot.scope !== scope)) {
    throw new Error('The regulatory agent requires a writable local coordination sandbox with unchanged scope.');
  }
}

function validateSaved(result: BoardMessage, request: BoardMessage): void {
  if (result.kind !== 'RESULT' || result.topic !== REGULATORY_AGENT_TOPIC || result.replyTo !== request.id
    || result.recipientId !== request.authorId || result.context !== request.context) throw new Error('A regulatory result has invalid routing.');
  let body: RegulatoryAgentResult;
  try { body = JSON.parse(result.body) as RegulatoryAgentResult; } catch { throw new Error('A regulatory result is unreadable.'); }
  if (body.schema !== 'payload.regulatory-agent-result.v1' || body.requestDigest !== localRecordDigest(request)
    || Object.keys(NONCLAIMS).some((key) => body[key as keyof RegulatoryAgentResult] !== false)) {
    throw new Error('A regulatory result has invalid binding or authority claims.');
  }
}

function savedResult(snapshot: CoordinationSnapshot, message: BoardMessage, requestId: string): BoardMessage | undefined {
  const results = snapshot.messages.filter((entry) => entry.scope === message.scope && entry.authorId === REGULATORY_AGENT_ID && entry.requestId === requestId);
  if (results.length === 0) return undefined;
  if (results.length !== 1) throw new Error('More than one regulatory result uses the same worker request ID.');
  validateSaved(results[0], message);
  return results[0];
}

/** One bounded pass. The worker reads retained evidence and posts proposals; it never fetches, admits or acts on them. */
export async function runRegulatoryAgentOnce(client: WorkerClient, inspector: FederalRegisterInspector, limit = 10) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 25) throw new Error('Worker limit must be an integer from 1 to 25.');
  const initial = await client.snapshot();
  checkSnapshot(initial);
  checkSnapshot(await client.register(regulatoryAgentDefinition(initial.scope)), initial.scope);
  let processed = 0;
  let recovered = 0;
  let skipped = 0;
  let afterSequence = 0;
  for (let scan = 0; scan < 50; scan += 1) {
    const inbox = await client.inbox(REGULATORY_AGENT_ID, { afterSequence, limit: 100, includeAcknowledged: false, includeBroadcasts: false });
    if (inbox.scope !== initial.scope || inbox.participantId !== REGULATORY_AGENT_ID || inbox.mode !== 'LOCAL_SANDBOX' || !inbox.canWrite) {
      throw new Error('The inbox does not match the regulatory agent assignment.');
    }
    for (const message of inbox.messages) {
      if (message.recipientId !== REGULATORY_AGENT_ID || message.scope !== initial.scope) throw new Error('The inbox returned a message outside the regulatory assignment.');
      if (!['REQUEST', 'HANDOFF'].includes(message.kind) || message.topic !== REGULATORY_AGENT_TOPIC) { skipped += 1; continue; }
      const snapshot = await client.snapshot();
      checkSnapshot(snapshot, initial.scope);
      if (!snapshot.messages.some((entry) => entry.id === message.id && localRecordDigest(entry) === localRecordDigest(message))) {
        throw new Error('The regulatory request does not match the saved board record.');
      }
      const requestId = `${REGULATORY_AGENT_ID}:${message.id}`;
      let previous = savedResult(snapshot, message, requestId);
      if (!previous) {
        const body = JSON.stringify(resultFor(message, inspector));
        if (body.length > 3_500) throw new Error('The regulatory result exceeds the board body limit.');
        let postError: unknown;
        try {
          await client.post({
            requestId,
            authorId: REGULATORY_AGENT_ID,
            recipientId: message.authorId,
            kind: 'RESULT',
            topic: message.topic,
            title: 'Regulatory change review',
            body,
            context: message.context,
            replyTo: message.id,
          });
        } catch (failure) { postError = failure; }
        const after = await client.snapshot();
        checkSnapshot(after, initial.scope);
        const committed = savedResult(after, message, requestId);
        if (!committed) throw postError ?? new Error('The regulatory result was not persisted; the request remains pending.');
        if (committed.body !== body) throw new Error('The persisted regulatory result does not match the exact proposed result; the request remains pending.');
        if (postError) previous = committed;
      }
      const acknowledged = await client.acknowledge(message.id, REGULATORY_AGENT_ID);
      checkSnapshot(acknowledged, initial.scope);
      if (!acknowledged.acknowledgements.some((entry) => entry.messageId === message.id && entry.participantId === REGULATORY_AGENT_ID && entry.scope === initial.scope)) {
        throw new Error('The regulatory acknowledgement was not confirmed.');
      }
      if (previous) recovered += 1; else processed += 1;
      if (processed + recovered >= limit) return { processed, recovered, skipped, scanComplete: false };
    }
    if (!inbox.hasMore) return { processed, recovered, skipped, scanComplete: true };
    if (!Number.isSafeInteger(inbox.nextSequence) || inbox.nextSequence <= afterSequence) throw new Error('The inbox cursor did not advance.');
    afterSequence = inbox.nextSequence;
  }
  return { processed, recovered, skipped, scanComplete: false };
}
