import { describe, expect, it } from 'vitest';
import type { FederalRegisterCaptureInspection } from '../acquisition/store';
import {
  analyzeRegulatoryChanges, observationsFromFederalRegister, parseRegulatoryManagerRequest,
  type RegulatoryManagerRequest, type RegulatoryObservation, type RegulatoryWatch,
} from './manager';

const hash = (character: string) => `sha256:${character.repeat(64)}`;

function observation(id: string, overrides: {
  sourceId?: string;
  sourceClass?: RegulatoryObservation['source']['sourceClass'];
  independenceKey?: string;
  sourceItemId?: string;
  collectedAt?: string;
  effectiveAt?: string | null;
  assertedValue?: string | null;
  evidenceDigest?: string;
} = {}): RegulatoryObservation {
  return {
    schema: 'payload.regulatory-observation.v1',
    observationId: id,
    source: {
      sourceId: overrides.sourceId ?? 'regulator-feed',
      sourceClass: overrides.sourceClass ?? 'OFFICIAL_GOVERNMENT_MIRROR',
      independenceKey: overrides.independenceKey ?? 'underlying-government-release',
      sourceItemId: overrides.sourceItemId ?? id,
      url: `https://example.gov/notices/${id}`,
      officialEditionUrl: null,
      publishedAt: '2026-09-10T00:00:00.000Z',
      collectedAt: overrides.collectedAt ?? '2026-09-10T12:00:00.000Z',
      evidenceDigest: overrides.evidenceDigest ?? hash('a'),
      artifactId: `artifact:${id}`,
    },
    instrument: {
      jurisdiction: 'US_FEDERAL',
      authority: 'Synthetic Infrastructure Agency',
      instrumentId: 'US-FR:2026-19001',
      kind: 'RULE',
      title: 'Synthetic infrastructure reporting rule',
    },
    event: {
      kind: 'RULE_PUBLISHED',
      effectiveAt: overrides.effectiveAt === undefined ? '2026-10-01T00:00:00.000Z' : overrides.effectiveAt,
      statement: 'The agency states that reporting requirements will change.',
      assertedValue: overrides.assertedValue ?? null,
    },
    entities: ['Synthetic Infrastructure Agency'],
    topics: ['critical infrastructure'],
  };
}

const watch: RegulatoryWatch = {
  watchId: 'federal-infrastructure',
  jurisdictions: ['US_FEDERAL'],
  authorities: [],
  entities: [],
  topics: ['critical infrastructure'],
  instrumentKinds: ['RULE'],
  targets: ['PAYLOAD_CAPABILITY_GRAPH', 'COMMERCIAL_AGENT', 'ENTERPRISE_APPARATUS'],
};

function request(observations: RegulatoryObservation[], watches: RegulatoryWatch[] = [watch]): RegulatoryManagerRequest {
  return {
    schema: 'payload.regulatory-manager-request.v1',
    runId: 'regulatory-run-1',
    knownThrough: '2026-09-12T00:00:00.000Z',
    observations,
    watches,
  };
}

describe('regulatory evidence grouping', () => {
  it('groups repeated coverage and does not count two items with one declared origin as independent confirmation', () => {
    const report = analyzeRegulatoryChanges(request([
      observation('official-item'),
      observation('wire-copy', { sourceId: 'wire-service', sourceClass: 'SECONDARY_REPORTING', sourceItemId: 'wire-42', evidenceDigest: hash('b') }),
    ]));
    expect(report.clusters).toHaveLength(1);
    expect(report.clusters[0]).toMatchObject({
      sourceItemCount: 2,
      independenceKeys: ['underlying-government-release'],
      support: 'REPEATED_ONE_ORIGIN',
      acceptance: 'OBSERVATION_ONLY',
      legalEffectEstablished: false,
    });
  });

  it('recognizes declared independent support only when the independence roots differ', () => {
    const report = analyzeRegulatoryChanges(request([
      observation('official-item'),
      observation('independent-analysis', {
        sourceId: 'independent-analysis', sourceClass: 'SECONDARY_REPORTING', independenceKey: 'independent-document-review',
        sourceItemId: 'analysis-7', evidenceDigest: hash('b'),
      }),
    ]));
    expect(report.clusters[0].support).toBe('PRIMARY_AND_INDEPENDENT_SUPPORT');
    expect(report.clusters[0].independenceKeys).toHaveLength(2);
  });

  it('surfaces incompatible effective dates as a conflict and refuses to propose a resolved value', () => {
    const report = analyzeRegulatoryChanges(request([
      observation('source-a'),
      observation('source-b', { independenceKey: 'second-root', effectiveAt: '2026-11-01T00:00:00.000Z', evidenceDigest: hash('b') }),
    ]));
    expect(report.counts.conflicts).toBe(1);
    expect(report.clusters[0]).toMatchObject({ support: 'CONFLICTED', effectiveAt: null, conflict: { field: 'effectiveAt' } });
    expect(report.proposals.every((entry) => entry.requiredEvidence === 'RESOLVE_CONFLICT' && entry.proposedState === null)).toBe(true);
  });

  it('bounds knowledge time on collection and reports later observations as deferred', () => {
    const report = analyzeRegulatoryChanges(request([
      observation('known'),
      observation('later', { collectedAt: '2026-09-13T00:00:00.000Z', evidenceDigest: hash('b') }),
    ]));
    expect(report.counts).toMatchObject({ suppliedObservations: 2, observationsInHorizon: 1, deferred: 1 });
    expect(report.deferredObservationIds).toEqual(['later']);
    expect(report.clusters[0].observationIds).toEqual(['known']);
  });
});

describe('review-gated impact proposals', () => {
  it('creates one deterministic proposal per matched target and authorizes no action', () => {
    const first = analyzeRegulatoryChanges(request([observation('official-item')]));
    const second = analyzeRegulatoryChanges(request([observation('official-item')]));
    expect(first).toEqual(second);
    expect(first.proposals.map((entry) => entry.target).sort()).toEqual([
      'COMMERCIAL_AGENT', 'ENTERPRISE_APPARATUS', 'PAYLOAD_CAPABILITY_GRAPH',
    ]);
    expect(first.proposals.every((entry) => entry.reviewStatus === 'PENDING_HUMAN_REVIEW'
      && entry.operation === 'REASSESS_TRACKED_STATE' && entry.stateMutation === false)).toBe(true);
    expect(first).toMatchObject({ canonicalAdmission: false, canonicalStateMutated: false, actionAuthorized: false, legalEffectEstablished: false });
    expect(first.digest).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('keeps unmatched clusters searchable without manufacturing a proposal', () => {
    const noMatch = { ...watch, watchId: 'canada-only', jurisdictions: ['CA_FEDERAL'] };
    const report = analyzeRegulatoryChanges(request([observation('official-item')], [noMatch]));
    expect(report.proposals).toEqual([]);
    expect(report.unmatchedClusterIds).toEqual([report.clusters[0].clusterId]);
  });

  it('requires explicit selectors and unique observation and watch identities', () => {
    const emptyWatch = { ...watch, jurisdictions: [], topics: [], instrumentKinds: [] };
    expect(() => parseRegulatoryManagerRequest(request([observation('a')], [emptyWatch]))).toThrow();
    expect(() => parseRegulatoryManagerRequest(request([observation('a'), observation('a')]))).toThrow('Observation IDs');
    expect(() => parseRegulatoryManagerRequest(request([observation('a')], [watch, watch]))).toThrow('Watch IDs');
  });
});

describe('Federal Register bridge', () => {
  it('binds every row to retained evidence while keeping the API mirror below legal-effect status', () => {
    const capture = {
      schema: 'payload.source-capture-inspection.v1',
      state: 'CAPTURED',
      intent: { request: { requestId: 'fr-day' } },
      receipt: { state: 'CAPTURED' },
      acquisition: { id: 'source-capture:fr-day', contentDigest: hash('f'), capturedAt: '2026-09-12T12:00:00.000Z' },
      observations: {
        sourceId: 'us-federal-register-api',
        documents: [{
          documentNumber: '2026-19001', instrumentKind: 'RULE', title: 'Synthetic rule',
          abstract: 'A source-authored summary.', action: 'Final rule.', publicationDate: '2026-09-11', effectiveOn: '2026-10-01',
          commentsCloseOn: null, agencies: ['Synthetic Infrastructure Agency'],
          htmlUrl: 'https://www.federalregister.gov/documents/2026/09/11/2026-19001/synthetic-rule',
          sourcePdfUrl: 'https://public-inspection.federalregister.gov/2026-19001.pdf', sourceItemId: '2026-19001',
          sourceAuthority: 'OFFICIAL_GOVERNMENT_MIRROR', legalEffect: 'NOT_ESTABLISHED_BY_THIS_SOURCE',
        }],
      },
    } as unknown as FederalRegisterCaptureInspection;
    const [mapped] = observationsFromFederalRegister(capture);
    expect(mapped).toMatchObject({
      observationId: 'federal-register:2026-19001:fr-day',
      source: { sourceClass: 'OFFICIAL_GOVERNMENT_MIRROR', evidenceDigest: hash('f'), artifactId: 'source-capture:fr-day' },
      instrument: { jurisdiction: 'US_FEDERAL', instrumentId: 'US-FR:2026-19001', kind: 'RULE' },
      event: { kind: 'RULE_PUBLISHED', effectiveAt: '2026-10-01T00:00:00.000Z' },
    });
  });
});
