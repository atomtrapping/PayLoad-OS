import { z } from 'zod';
import { localRecordDigest } from '../data-os/local-record';
import type { FederalRegisterCaptureInspection } from '../acquisition/store';

export const REGULATORY_MANAGER_METHOD = 'payload.regulatory-manager.v1';

export const REGULATORY_SOURCE_CLASSES = [
  'OFFICIAL_LEGAL_EDITION',
  'OFFICIAL_GOVERNMENT_MIRROR',
  'LEGISLATIVE_RECORD',
  'GOVERNMENT_ANNOUNCEMENT',
  'SECONDARY_REPORTING',
  'SOCIAL_MEDIA',
] as const;

export const REGULATORY_INSTRUMENT_KINDS = [
  'RULE', 'PROPOSED_RULE', 'NOTICE', 'EXECUTIVE_ACTION', 'LEGISLATION',
  'BUDGET', 'PROCUREMENT', 'GRANT', 'SANCTION', 'POLICY', 'OTHER',
] as const;

export const REGULATORY_EVENT_KINDS = [
  'RULE_PUBLISHED', 'PROPOSED_RULE_PUBLISHED', 'POLICY_NOTICE_PUBLISHED',
  'EXECUTIVE_ACTION_PUBLISHED', 'BILL_INTRODUCED', 'BILL_PASSED', 'LAW_ENACTED',
  'POLICY_EFFECTIVE', 'AMENDED', 'REPEALED', 'ENJOINED',
  'APPROPRIATION_ENACTED', 'CONTRACT_AWARDED', 'GRANT_AWARDED', 'SANCTION_IMPOSED', 'OTHER',
] as const;

export const REGULATORY_TARGETS = [
  'PAYLOAD_CAPABILITY_GRAPH', 'COMMERCIAL_AGENT', 'NOTATIONS_TERMINAL', 'ENTERPRISE_APPARATUS',
] as const;

const identifier = z.string().min(1).max(180).regex(/^[A-Za-z0-9:._-]+$/);
const safeText = (maximum: number) => z.string().trim().min(1).max(maximum).refine((value) => !/[\u0000-\u001f\u007f]/.test(value));
const instant = z.iso.datetime({ offset: true });
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);

const sourceSchema = z.object({
  sourceId: identifier,
  sourceClass: z.enum(REGULATORY_SOURCE_CLASSES),
  /** All coverage ultimately derived from one press release or register shares this key. */
  independenceKey: identifier,
  /** Stable item identity at the source; repeat captures of one item keep this value. */
  sourceItemId: identifier,
  url: z.string().url().max(2_048).refine((value) => new URL(value).protocol === 'https:'),
  officialEditionUrl: z.string().url().max(2_048).refine((value) => new URL(value).protocol === 'https:').nullable(),
  publishedAt: instant,
  collectedAt: instant,
  evidenceDigest: digest,
  artifactId: identifier,
}).strict();

const instrumentSchema = z.object({
  jurisdiction: safeText(80),
  authority: safeText(256),
  instrumentId: identifier,
  kind: z.enum(REGULATORY_INSTRUMENT_KINDS),
  title: safeText(1_000),
}).strict();

const eventSchema = z.object({
  kind: z.enum(REGULATORY_EVENT_KINDS),
  effectiveAt: instant.nullable(),
  statement: safeText(4_000),
  /** A normalized amount, threshold or status when the source states one; null means none was extracted. */
  assertedValue: safeText(512).nullable(),
}).strict();

export const regulatoryObservationSchema = z.object({
  schema: z.literal('payload.regulatory-observation.v1'),
  observationId: identifier,
  source: sourceSchema,
  instrument: instrumentSchema,
  event: eventSchema,
  entities: z.array(safeText(256)).max(64),
  topics: z.array(safeText(128)).max(64),
}).strict();
export type RegulatoryObservation = z.infer<typeof regulatoryObservationSchema>;

export const regulatoryWatchSchema = z.object({
  watchId: identifier,
  jurisdictions: z.array(safeText(80)).max(32),
  authorities: z.array(safeText(256)).max(64),
  entities: z.array(safeText(256)).max(128),
  topics: z.array(safeText(128)).max(128),
  instrumentKinds: z.array(z.enum(REGULATORY_INSTRUMENT_KINDS)).max(REGULATORY_INSTRUMENT_KINDS.length),
  targets: z.array(z.enum(REGULATORY_TARGETS)).min(1).max(REGULATORY_TARGETS.length),
}).strict().refine((value) => value.jurisdictions.length + value.authorities.length + value.entities.length
  + value.topics.length + value.instrumentKinds.length > 0, 'A watch must declare at least one selector.');
export type RegulatoryWatch = z.infer<typeof regulatoryWatchSchema>;

export const regulatoryManagerRequestSchema = z.object({
  schema: z.literal('payload.regulatory-manager-request.v1'),
  runId: identifier,
  knownThrough: instant,
  observations: z.array(regulatoryObservationSchema).max(500),
  watches: z.array(regulatoryWatchSchema).max(100),
}).strict();
export type RegulatoryManagerRequest = z.infer<typeof regulatoryManagerRequestSchema>;

export type RegulatorySupport =
  | 'CONFLICTED'
  | 'OFFICIAL_LEGAL_TEXT_OBSERVED'
  | 'PRIMARY_AND_INDEPENDENT_SUPPORT'
  | 'INDEPENDENT_SUPPORT_WITHOUT_PRIMARY'
  | 'REPEATED_ONE_ORIGIN'
  | 'SINGLE_SOURCE';

export interface RegulatoryCluster {
  clusterId: string;
  jurisdiction: string;
  authority: string;
  instrumentId: string;
  instrumentKind: RegulatoryObservation['instrument']['kind'];
  title: string;
  eventKind: RegulatoryObservation['event']['kind'];
  effectiveAt: string | null;
  assertedValue: string | null;
  observationIds: string[];
  evidenceDigests: string[];
  sourceItemCount: number;
  independenceKeys: string[];
  sourceClasses: RegulatoryObservation['source']['sourceClass'][];
  entities: string[];
  topics: string[];
  support: RegulatorySupport;
  conflict: null | { field: 'effectiveAt' | 'assertedValue'; values: string[] };
  legalEffectEstablished: false;
  acceptance: 'OBSERVATION_ONLY';
}

export interface RegulatoryProposal {
  proposalId: string;
  watchId: string;
  target: typeof REGULATORY_TARGETS[number];
  clusterId: string;
  instrumentId: string;
  operation: 'REASSESS_TRACKED_STATE';
  proposedState: null;
  reviewStatus: 'PENDING_HUMAN_REVIEW';
  requiredReview: 'FIRM_REGULATORY_REVIEW';
  requiredEvidence: 'RESOLVE_CONFLICT' | 'VERIFY_OFFICIAL_LEGAL_EDITION' | 'REVIEW_PRIMARY_SOURCE';
  basisObservationIds: string[];
  because: string;
  stateMutation: false;
}

export interface RegulatoryManagerReport {
  schema: 'payload.regulatory-manager-report.v1';
  method: typeof REGULATORY_MANAGER_METHOD;
  runId: string;
  knownThrough: string;
  requestDigest: string;
  clusters: RegulatoryCluster[];
  proposals: RegulatoryProposal[];
  deferredObservationIds: string[];
  unmatchedClusterIds: string[];
  counts: {
    suppliedObservations: number;
    observationsInHorizon: number;
    clusters: number;
    conflicts: number;
    proposals: number;
    deferred: number;
  };
  canonicalAdmission: false;
  canonicalStateMutated: false;
  actionAuthorized: false;
  sourceTruthClaimed: false;
  legalEffectEstablished: false;
  digest: string;
}

function canonicalInstant(value: string, field: string): string {
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== value) throw new Error(`${field} must be a canonical UTC instant.`);
  return value;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function normalized(values: readonly string[]): string[] {
  return unique(values.map((value) => value.toLocaleLowerCase('en-US')));
}

export function parseRegulatoryManagerRequest(value: unknown): RegulatoryManagerRequest {
  const parsed = regulatoryManagerRequestSchema.parse(value);
  canonicalInstant(parsed.knownThrough, 'knownThrough');
  for (const observation of parsed.observations) {
    canonicalInstant(observation.source.publishedAt, 'publishedAt');
    canonicalInstant(observation.source.collectedAt, 'collectedAt');
    if (observation.event.effectiveAt) canonicalInstant(observation.event.effectiveAt, 'effectiveAt');
  }
  if (new Set(parsed.observations.map((entry) => entry.observationId)).size !== parsed.observations.length) throw new Error('Observation IDs must be unique within a manager run.');
  if (new Set(parsed.watches.map((entry) => entry.watchId)).size !== parsed.watches.length) throw new Error('Watch IDs must be unique within a manager run.');
  return structuredClone(parsed);
}

function clusterKey(observation: RegulatoryObservation): string {
  return [observation.instrument.jurisdiction, observation.instrument.instrumentId, observation.event.kind].join('|');
}

function conflictOf(observations: readonly RegulatoryObservation[]): RegulatoryCluster['conflict'] {
  const effective = unique(observations.flatMap((entry) => entry.event.effectiveAt ? [entry.event.effectiveAt] : []));
  if (effective.length > 1) return { field: 'effectiveAt', values: effective };
  const asserted = unique(observations.flatMap((entry) => entry.event.assertedValue ? [entry.event.assertedValue] : []));
  return asserted.length > 1 ? { field: 'assertedValue', values: asserted } : null;
}

function supportOf(observations: readonly RegulatoryObservation[], conflict: RegulatoryCluster['conflict']): RegulatorySupport {
  if (conflict) return 'CONFLICTED';
  const classes = new Set(observations.map((entry) => entry.source.sourceClass));
  const groups = new Set(observations.map((entry) => entry.source.independenceKey));
  if (classes.has('OFFICIAL_LEGAL_EDITION')) return 'OFFICIAL_LEGAL_TEXT_OBSERVED';
  const primary = ['OFFICIAL_GOVERNMENT_MIRROR', 'LEGISLATIVE_RECORD', 'GOVERNMENT_ANNOUNCEMENT']
    .some((sourceClass) => classes.has(sourceClass as RegulatoryObservation['source']['sourceClass']));
  if (primary && groups.size > 1) return 'PRIMARY_AND_INDEPENDENT_SUPPORT';
  if (groups.size > 1) return 'INDEPENDENT_SUPPORT_WITHOUT_PRIMARY';
  const items = new Set(observations.map((entry) => `${entry.source.sourceId}|${entry.source.sourceItemId}`));
  return items.size > 1 ? 'REPEATED_ONE_ORIGIN' : 'SINGLE_SOURCE';
}

function makeCluster(entries: readonly RegulatoryObservation[]): RegulatoryCluster {
  const observations = [...entries].sort((a, b) => a.observationId.localeCompare(b.observationId));
  const first = observations[0];
  const conflict = conflictOf(observations);
  const effective = unique(observations.flatMap((entry) => entry.event.effectiveAt ? [entry.event.effectiveAt] : []));
  const asserted = unique(observations.flatMap((entry) => entry.event.assertedValue ? [entry.event.assertedValue] : []));
  const clusterBasis = { jurisdiction: first.instrument.jurisdiction, instrumentId: first.instrument.instrumentId, eventKind: first.event.kind };
  return {
    clusterId: `reg:${localRecordDigest(clusterBasis).slice(7, 31)}`,
    jurisdiction: first.instrument.jurisdiction,
    authority: first.instrument.authority,
    instrumentId: first.instrument.instrumentId,
    instrumentKind: first.instrument.kind,
    title: first.instrument.title,
    eventKind: first.event.kind,
    effectiveAt: effective.length === 1 ? effective[0] : null,
    assertedValue: asserted.length === 1 ? asserted[0] : null,
    observationIds: observations.map((entry) => entry.observationId),
    evidenceDigests: unique(observations.map((entry) => entry.source.evidenceDigest)),
    sourceItemCount: new Set(observations.map((entry) => `${entry.source.sourceId}|${entry.source.sourceItemId}`)).size,
    independenceKeys: unique(observations.map((entry) => entry.source.independenceKey)),
    sourceClasses: unique(observations.map((entry) => entry.source.sourceClass)) as RegulatoryCluster['sourceClasses'],
    entities: unique(observations.flatMap((entry) => entry.entities)),
    topics: unique(observations.flatMap((entry) => entry.topics)),
    support: supportOf(observations, conflict),
    conflict,
    legalEffectEstablished: false,
    acceptance: 'OBSERVATION_ONLY',
  };
}

function intersects(expected: readonly string[], actual: readonly string[]): boolean {
  if (expected.length === 0) return true;
  const values = new Set(normalized(actual));
  return normalized(expected).some((entry) => values.has(entry));
}

function matches(watch: RegulatoryWatch, cluster: RegulatoryCluster): boolean {
  return intersects(watch.jurisdictions, [cluster.jurisdiction])
    && intersects(watch.authorities, [cluster.authority])
    && intersects(watch.entities, cluster.entities)
    && intersects(watch.topics, cluster.topics)
    && (watch.instrumentKinds.length === 0 || watch.instrumentKinds.includes(cluster.instrumentKind));
}

const TARGET_REASON: Record<typeof REGULATORY_TARGETS[number], string> = {
  PAYLOAD_CAPABILITY_GRAPH: 'Reassess capability availability, compliance conditions, timing and operating cost in the industrial graph.',
  COMMERCIAL_AGENT: 'Reassess tracked buyer obligations, public funding, procurement signals and emerging operational needs.',
  NOTATIONS_TERMINAL: 'Open a research item that compares the regulatory narrative with measured market and liquidity evidence.',
  ENTERPRISE_APPARATUS: 'Reassess organization, project and system assumptions affected by the observed government action.',
};

function requiredEvidence(cluster: RegulatoryCluster): RegulatoryProposal['requiredEvidence'] {
  if (cluster.conflict) return 'RESOLVE_CONFLICT';
  return cluster.support === 'OFFICIAL_LEGAL_TEXT_OBSERVED' ? 'REVIEW_PRIMARY_SOURCE' : 'VERIFY_OFFICIAL_LEGAL_EDITION';
}

function proposal(cluster: RegulatoryCluster, watch: RegulatoryWatch, target: RegulatoryProposal['target']): RegulatoryProposal {
  const basis = { clusterId: cluster.clusterId, watchId: watch.watchId, target, operation: 'REASSESS_TRACKED_STATE' };
  return {
    proposalId: `reg-proposal:${localRecordDigest(basis).slice(7, 31)}`,
    watchId: watch.watchId,
    target,
    clusterId: cluster.clusterId,
    instrumentId: cluster.instrumentId,
    operation: 'REASSESS_TRACKED_STATE',
    proposedState: null,
    reviewStatus: 'PENDING_HUMAN_REVIEW',
    requiredReview: 'FIRM_REGULATORY_REVIEW',
    requiredEvidence: requiredEvidence(cluster),
    basisObservationIds: [...cluster.observationIds],
    because: `${TARGET_REASON[target]} This is a review proposal based on ${cluster.support}; it does not accept the observed claim or change OS state.`,
    stateMutation: false,
  };
}

export function analyzeRegulatoryChanges(value: unknown): RegulatoryManagerReport {
  const request = parseRegulatoryManagerRequest(value);
  const knownThrough = Date.parse(request.knownThrough);
  const included = request.observations.filter((entry) => Date.parse(entry.source.collectedAt) <= knownThrough);
  const deferredObservationIds = request.observations.filter((entry) => Date.parse(entry.source.collectedAt) > knownThrough)
    .map((entry) => entry.observationId).sort((a, b) => a.localeCompare(b));
  const grouped = new Map<string, RegulatoryObservation[]>();
  for (const observation of included) {
    const key = clusterKey(observation);
    const existing = grouped.get(key) ?? [];
    existing.push(observation);
    grouped.set(key, existing);
  }
  const clusters = [...grouped.values()].map(makeCluster).sort((a, b) => a.clusterId.localeCompare(b.clusterId));
  const proposals: RegulatoryProposal[] = [];
  const matched = new Set<string>();
  for (const cluster of clusters) {
    for (const watch of request.watches) {
      if (!matches(watch, cluster)) continue;
      matched.add(cluster.clusterId);
      for (const target of unique(watch.targets) as RegulatoryProposal['target'][]) proposals.push(proposal(cluster, watch, target));
    }
  }
  proposals.sort((a, b) => a.proposalId.localeCompare(b.proposalId));
  const payload = {
    schema: 'payload.regulatory-manager-report.v1' as const,
    method: REGULATORY_MANAGER_METHOD as typeof REGULATORY_MANAGER_METHOD,
    runId: request.runId,
    knownThrough: request.knownThrough,
    requestDigest: localRecordDigest(request),
    clusters,
    proposals,
    deferredObservationIds,
    unmatchedClusterIds: clusters.filter((entry) => !matched.has(entry.clusterId)).map((entry) => entry.clusterId),
    counts: {
      suppliedObservations: request.observations.length,
      observationsInHorizon: included.length,
      clusters: clusters.length,
      conflicts: clusters.filter((entry) => entry.conflict !== null).length,
      proposals: proposals.length,
      deferred: deferredObservationIds.length,
    },
    canonicalAdmission: false as const,
    canonicalStateMutated: false as const,
    actionAuthorized: false as const,
    sourceTruthClaimed: false as const,
    legalEffectEstablished: false as const,
  };
  return structuredClone({ ...payload, digest: localRecordDigest(payload) });
}

const FEDERAL_REGISTER_EVENT: Record<string, RegulatoryObservation['event']['kind']> = {
  RULE: 'RULE_PUBLISHED',
  PROPOSED_RULE: 'PROPOSED_RULE_PUBLISHED',
  NOTICE: 'POLICY_NOTICE_PUBLISHED',
  PRESIDENTIAL_DOCUMENT: 'EXECUTIVE_ACTION_PUBLISHED',
};

const FEDERAL_REGISTER_INSTRUMENT: Record<string, RegulatoryObservation['instrument']['kind']> = {
  RULE: 'RULE',
  PROPOSED_RULE: 'PROPOSED_RULE',
  NOTICE: 'NOTICE',
  PRESIDENTIAL_DOCUMENT: 'EXECUTIVE_ACTION',
};

/** Bind parsed Federal Register rows to the exact retained capture that made them knowable. */
export function observationsFromFederalRegister(capture: FederalRegisterCaptureInspection): RegulatoryObservation[] {
  if (capture.state !== 'CAPTURED' || !capture.observations || !capture.acquisition || !capture.receipt) {
    throw new Error('A completed Federal Register capture is required.');
  }
  const collectedAt = canonicalInstant(capture.acquisition.capturedAt, 'capture time');
  const evidenceDigest = capture.acquisition.contentDigest;
  if (!/^sha256:[a-f0-9]{64}$/.test(evidenceDigest)) throw new Error('The capture content digest is invalid.');
  return capture.observations.documents.map((document) => regulatoryObservationSchema.parse({
    schema: 'payload.regulatory-observation.v1',
    observationId: `federal-register:${document.documentNumber}:${capture.intent.request.requestId}`,
    source: {
      sourceId: capture.observations!.sourceId,
      sourceClass: 'OFFICIAL_GOVERNMENT_MIRROR',
      independenceKey: 'us-office-federal-register-publication',
      sourceItemId: document.sourceItemId,
      url: document.htmlUrl,
      officialEditionUrl: document.sourcePdfUrl,
      publishedAt: `${document.publicationDate}T00:00:00.000Z`,
      collectedAt,
      evidenceDigest,
      artifactId: capture.acquisition!.id,
    },
    instrument: {
      jurisdiction: 'US_FEDERAL',
      authority: document.agencies.length ? document.agencies.join('; ') : 'Office of the Federal Register',
      instrumentId: `US-FR:${document.documentNumber}`,
      kind: FEDERAL_REGISTER_INSTRUMENT[document.instrumentKind],
      title: document.title,
    },
    event: {
      kind: FEDERAL_REGISTER_EVENT[document.instrumentKind],
      effectiveAt: document.effectiveOn ? `${document.effectiveOn}T00:00:00.000Z` : null,
      statement: document.action ?? document.abstract ?? document.title,
      assertedValue: null,
    },
    entities: document.agencies,
    topics: [],
  }));
}
