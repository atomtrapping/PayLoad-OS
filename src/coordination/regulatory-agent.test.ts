import { describe, expect, it, vi } from 'vitest';
import type { FederalRegisterCaptureInspection } from '../acquisition/store';
import type { WorkerClient } from './contract-review';
import {
  REGULATORY_AGENT_ID, REGULATORY_AGENT_TOPIC, regulatoryAgentDefinition, runRegulatoryAgentOnce,
  type FederalRegisterInspector,
} from './regulatory-agent';
import type { BoardMessage, CoordinationSnapshot, Participant } from './types';

const scope = 'firm:test';
const digest = `sha256:${'a'.repeat(64)}`;
const requester: Participant = {
  id: 'apparatus.corpus', name: 'Corpus', kind: 'APPARATUS', version: '1', purpose: 'test', authority: 'canonical',
  runtime: 'JavaScript', status: 'LOCAL', scope, domains: ['CARAVAN'], inputs: [], outputs: [], capabilities: [], reference: 'test',
};
const message: BoardMessage = {
  id: 'MSG-1', sequence: 1, requestId: 'request-1', scope, authorId: requester.id, recipientId: REGULATORY_AGENT_ID,
  kind: 'REQUEST', topic: REGULATORY_AGENT_TOPIC, title: 'Review federal changes', context: null, replyTo: null,
  createdAt: '2026-09-12T13:00:00.000Z',
  body: JSON.stringify({
    schema: 'payload.regulatory-agent-request.v1', captureId: 'fr-day', expectedContentDigest: digest,
    runId: 'regulatory-day', knownThrough: '2026-09-12T23:59:59.000Z',
    watches: [{
      watchId: 'us-rules', jurisdictions: ['US_FEDERAL'], authorities: [], entities: [], topics: [],
      instrumentKinds: ['RULE'], targets: ['PAYLOAD_CAPABILITY_GRAPH'],
    }],
  }),
};

function capture(): FederalRegisterCaptureInspection {
  return {
    state: 'CAPTURED', intent: { request: { requestId: 'fr-day' } }, receipt: { state: 'CAPTURED' },
    acquisition: { id: 'source-capture:fr-day', contentDigest: digest, capturedAt: '2026-09-12T12:00:00.000Z' },
    observations: {
      sourceId: 'us-federal-register-api', documents: [{
        documentNumber: '2026-19001', instrumentKind: 'RULE', title: 'Synthetic rule', abstract: null, action: 'Final rule.',
        publicationDate: '2026-09-11', effectiveOn: '2026-10-01', commentsCloseOn: null,
        agencies: ['Synthetic Infrastructure Agency'],
        htmlUrl: 'https://www.federalregister.gov/documents/2026/09/11/2026-19001/synthetic-rule',
        sourcePdfUrl: null, sourceItemId: '2026-19001', sourceAuthority: 'OFFICIAL_GOVERNMENT_MIRROR',
        legalEffect: 'NOT_ESTABLISHED_BY_THIS_SOURCE',
      }],
    },
  } as unknown as FederalRegisterCaptureInspection;
}

function client() {
  const state: CoordinationSnapshot = {
    schema: 'payload.coordination.v1', fixture_only: true, scope, mode: 'LOCAL_SANDBOX', persistence: 'LOCAL_FILE', canWrite: true,
    participants: [requester], messages: [structuredClone(message)], acknowledgements: [], connections: [], releaseContexts: [],
  };
  const api: WorkerClient = {
    snapshot: vi.fn(async () => structuredClone(state)),
    register: vi.fn(async (participant) => {
      if (!state.participants.some((entry) => entry.id === participant.id)) state.participants.push(structuredClone(participant));
      return structuredClone(state);
    }),
    inbox: vi.fn(async () => ({
      ...structuredClone(state), schema: 'payload.coordination-inbox.v1' as const,
      participantId: REGULATORY_AGENT_ID, afterSequence: 0, nextSequence: 1,
      highWaterSequence: 1, hasMore: false, messages: state.acknowledgements.length ? [] : [structuredClone(message)],
    })),
    post: vi.fn(async (draft) => {
      state.messages.push({ ...structuredClone(draft), id: 'MSG-2', sequence: 2, scope, createdAt: '2026-09-12T13:01:00.000Z' });
      return structuredClone(state);
    }),
    acknowledge: vi.fn(async (messageId, participantId) => {
      state.acknowledgements.push({ messageId, participantId, scope, createdAt: '2026-09-12T13:02:00.000Z' });
      return structuredClone(state);
    }),
  };
  return { api, state };
}

describe('regulatory manager worker', () => {
  it('registers as a derived local agent with no admission or action authority', () => {
    const definition = regulatoryAgentDefinition(scope);
    expect(definition).toMatchObject({ id: REGULATORY_AGENT_ID, authority: 'derived', status: 'LOCAL' });
    expect(definition.capabilities).toEqual(['regulatory.observe', 'regulatory.cluster', 'regulatory.propose']);
  });

  it('reads an exact retained capture, posts a bounded proposal summary and acknowledges only after readback', async () => {
    const { api, state } = client();
    const inspector: FederalRegisterInspector = { inspect: vi.fn(() => capture()) };
    await expect(runRegulatoryAgentOnce(api, inspector)).resolves.toEqual({ processed: 1, recovered: 0, skipped: 0, scanComplete: true });
    const result = state.messages.find((entry) => entry.authorId === REGULATORY_AGENT_ID)!;
    const body = JSON.parse(result.body);
    expect(body).toMatchObject({
      schema: 'payload.regulatory-agent-result.v1', assessment: 'ANALYZED', error: null,
      counts: { clusters: 1, proposals: 1 }, fetchedSource: false, canonicalAdmission: false,
      canonicalStateMutated: false, actionAuthorized: false, legalEffectEstablished: false,
    });
    expect(body.proposals).toMatchObject([{ target: 'PAYLOAD_CAPABILITY_GRAPH', instrumentId: 'US-FR:2026-19001' }]);
    expect(state.acknowledgements).toMatchObject([{ messageId: 'MSG-1', participantId: REGULATORY_AGENT_ID }]);
  });

  it('refuses changed readback before acknowledgement even when routing and nonclaims still match', async () => {
    const { api, state } = client();
    const post = api.post;
    api.post = vi.fn(async draft => {
      await post(draft);
      const result = state.messages.find(entry => entry.authorId === REGULATORY_AGENT_ID)!;
      const body = JSON.parse(result.body); body.reportDigest = `sha256:${'b'.repeat(64)}`;
      result.body = JSON.stringify(body);
      return structuredClone(state);
    });
    await expect(runRegulatoryAgentOnce(api, { inspect: () => capture() })).rejects.toThrow('exact proposed result');
    expect(api.acknowledge).not.toHaveBeenCalled();
    expect(state.acknowledgements).toEqual([]);
  });

  it('records a mismatched pinned capture digest as rejected without proposals', async () => {
    const { api, state } = client();
    const wrong = capture(); wrong.acquisition!.contentDigest = `sha256:${'b'.repeat(64)}`;
    await runRegulatoryAgentOnce(api, { inspect: () => wrong });
    const body = JSON.parse(state.messages.find(entry => entry.authorId === REGULATORY_AGENT_ID)!.body);
    expect(body).toMatchObject({ assessment: 'REJECTED', error: 'CAPTURE_DIGEST_MISMATCH', reportDigest: null, proposals: [] });
  });

  it('records unavailable evidence as unavailable without fetching, proposing or mutating state', async () => {
    const { api, state } = client();
    const inspector: FederalRegisterInspector = { inspect: vi.fn(() => undefined) };
    await runRegulatoryAgentOnce(api, inspector);
    const body = JSON.parse(state.messages.find((entry) => entry.authorId === REGULATORY_AGENT_ID)!.body);
    expect(body).toMatchObject({ assessment: 'UNAVAILABLE', error: 'CAPTURE_UNAVAILABLE', reportDigest: null, proposals: [], fetchedSource: false });
  });
});
