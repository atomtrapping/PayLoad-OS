/**
 * DEMONSTRATION FIXTURE — fixture_only: true — the Landshark parcel corpus:
 * two releases, the records they carry, one withdrawal, and the rights
 * schedule of every source.
 *
 * Landshark's line is parcels, zoning, entitlements and development state. A
 * record here is a fact about a parcel — its cadastral area, its zoning
 * designation, the standing of an entitlement application, the position the
 * registry publishes for it — under the same discipline every other line
 * carries. Nothing is edited in place: a withdrawal retracts and the earlier
 * release still shows what it said.
 *
 * Provenance carries no content digest, for the reason the Tradewind corpus
 * states: no artifact bytes were captured for this corpus, and a digest over
 * bytes that were never captured would be a fabricated commitment. The release
 * digest and the manifest commitment are computed and real.
 *
 * THREE POSITIONS, AND ONE OF THEM CANNOT BE KEYED
 *
 * Parcel NL-0442 is the Maasvlakte terminal, where Caravan's lot 5B-221 sits
 * and where Tradewind's position TW-1180 is delivered. Parcel BR-1207 is the
 * Santos origination yard, where Caravan's lot 7C-104 sits. Both state a
 * horizontal uncertainty and are therefore keyable.
 *
 * Parcel NL-0511 states none. The registry published a centroid without a
 * precision, and a centroid without a precision is a point somebody drew: it
 * gets no key, it can never be co-located with anything, and it is kept in the
 * corpus exactly as published rather than given a default radius. That is the
 * spatial key's NO_STATED_UNCERTAINTY refusal, demonstrated on real corpus
 * data rather than described.
 */
import type { Corpus, CorpusRecord, CorpusRelease, Retraction, RightsSchedule, StageRecord } from '@/domain/corpus';
import { derivePermittedUses } from '@/domain/corpus';
import type { SourceRegistration } from '@/data-os/contracts';
import { digestOf } from '../digestLookup';

const CORPUS_ID = 'landshark.terminal-parcels';
const TITLE = 'Landshark — terminal and yard parcels (demonstration corpus)';
/** The same authority segment every canonical URI in this repository carries. An identifier, not a brand. */
const AUTH = 'payload-os-demo';
const uri = (kind: string, local: string) => `notation://${kind}/${AUTH}/${local}`;

const POLICY_WINDOW = { effectiveFrom: '2026-08-01T00:00:00Z', effectiveUntil: '2027-08-01T00:00:00Z' } as const;
const RIGHTS_AT = '2026-09-01T12:00:00Z';

const reg = (r: Omit<SourceRegistration, 'registrationId' | 'sourceId' | 'effectiveFrom' | 'effectiveUntil'> & { local: string }): SourceRegistration => ({
  registrationId: `source:${r.local}`,
  sourceId: uri('source', r.local),
  effectiveFrom: POLICY_WINDOW.effectiveFrom,
  effectiveUntil: POLICY_WINDOW.effectiveUntil,
  displayName: r.displayName,
  sourceClass: r.sourceClass,
  licenseId: r.licenseId,
  policyVersion: r.policyVersion,
  permittedPurposes: r.permittedPurposes,
  prohibitedPurposes: r.prohibitedPurposes,
  allowedOperations: r.allowedOperations,
  approvalRequiredOperations: r.approvalRequiredOperations,
  allowedAudiences: r.allowedAudiences,
  retention: r.retention,
});

const LANDSHARK_REGISTRATIONS: Record<string, SourceRegistration> = {
  'cadastral-registry': reg({ local: 'cadastral-registry', displayName: 'National cadastral registry (demonstration)', sourceClass: 'PUBLIC_CADASTRE', licenseId: 'cadastre-open-licence-2026', policyVersion: '1.0.0', permittedPurposes: ['AGGREGATION', 'LANDSHARK_CORPUS', 'INTERNAL_RESEARCH'], prohibitedPurposes: ['PROPRIETARY_STRATEGY', 'TRADING'], allowedOperations: ['DERIVE', 'EXPORT', 'INDEX', 'INGEST', 'RETRIEVE'], allowedAudiences: ['CUSTOMER', 'INTERNAL', 'PUBLIC'], retention: { mode: 'INDEFINITE' } }),
  'municipal-planning': reg({ local: 'municipal-planning', displayName: 'Municipal planning authority (demonstration)', sourceClass: 'PLANNING_DECISION', licenseId: 'planning-public-record-2026', policyVersion: '1.0.0', permittedPurposes: ['AGGREGATION', 'LANDSHARK_CORPUS'], prohibitedPurposes: ['MODEL_TRAINING', 'PROPRIETARY_STRATEGY', 'TRADING'], allowedOperations: ['DERIVE', 'EXPORT', 'INDEX', 'INGEST', 'RETRIEVE'], approvalRequiredOperations: ['PUBLISH'], allowedAudiences: ['CUSTOMER', 'INTERNAL', 'PUBLIC'], retention: { mode: 'INDEFINITE' } }),
};

const rights = (sourceId: string, r: Omit<RightsSchedule, 'sourceId' | 'canonicalId' | 'registration' | 'permittedUses' | 'sourceName' | 'licence'>): RightsSchedule => {
  const registration = LANDSHARK_REGISTRATIONS[sourceId];
  return { sourceId, canonicalId: registration.sourceId, sourceName: registration.displayName, licence: registration.licenseId, registration, permittedUses: derivePermittedUses(registration, RIGHTS_AT, sourceId, 'LANDSHARK'), ...r };
};

export const LANDSHARK_SOURCES: RightsSchedule[] = [
  rights('cadastral-registry', { materialClass: 'operational', nonUse: ['No proprietary strategy', 'No trading'], redistribution: 'licensed', attributionRequired: true, producerId: 'P-PRODUCER-CADASTRE' }),
  rights('municipal-planning', { materialClass: 'operational', nonUse: ['No model training on planning content', 'No proprietary strategy', 'No trading'], redistribution: 'licensed', attributionRequired: true, producerId: 'P-PRODUCER-PLANNING' }),
];

const REL_1 = 'REL-LS-2026.08.20';
const REL_2 = 'REL-LS-2026.09.01';

const rec = (r: Omit<CorpusRecord, 'canonicalId' | 'subjectCanonicalId'> & { subjectCanonicalId?: string }): CorpusRecord => ({
  ...r,
  canonicalId: uri('claim', `${r.subjectId}/${r.predicate}/${r.recordId}`),
  subjectCanonicalId: r.subjectCanonicalId ?? uri('entity', `parcel/${r.subjectId.replace(/^PARCEL-/, '')}`),
});

const prov = (sourceId: string, artifactId: string, producerId: string) => ({ sourceId, artifactId, producerId });

const REGISTRY_MEASURED = { claimStrength: 'reported', productionClass: 'measured', interest: 'disinterested' } as const;
const AUTHORITY_ASSERTED = { claimStrength: 'reported', productionClass: 'asserted', interest: 'disinterested' } as const;

export const LANDSHARK_RECORDS: CorpusRecord[] = [
  /* ── Parcel NL-0442: the Maasvlakte terminal ── */
  rec({ recordId: 'LS-0101', firstReleaseId: REL_1, subjectId: 'PARCEL-NL-0442', subjectType: 'Parcel', predicate: 'area.cadastral', title: 'Cadastral area', value: 84_500, unit: 'm²', basis: 'Registered cadastral boundary', uncertainty: { low: 84_400, high: 84_600, semantics: 'Registry stated survey tolerance ±100 m²' }, validFrom: '2026-01-01T00:00:00Z', knownAt: '2026-08-19T10:00:00Z', evidenceClass: REGISTRY_MEASURED, provenance: prov('cadastral-registry', 'EV-CAD-NL-0442', 'P-PRODUCER-CADASTRE'), visibility: 'PUBLIC_RULING' }),

  rec({ recordId: 'LS-0102', firstReleaseId: REL_1, subjectId: 'PARCEL-NL-0442', subjectType: 'Parcel', predicate: 'zoning.designation', title: 'Zoning designation', value: 'Port industrial — heavy cargo handling', basis: 'Municipal zoning plan in force', validFrom: '2026-01-01T00:00:00Z', knownAt: '2026-08-19T10:00:00Z', evidenceClass: AUTHORITY_ASSERTED, provenance: prov('municipal-planning', 'EV-ZONE-NL-0442', 'P-PRODUCER-PLANNING'), visibility: 'PUBLIC_RULING' }),

  /** Keyable: the registry states a precision. Co-located with Caravan's lot 5B-221 and Tradewind's delivery point. */
  rec({ recordId: 'LS-0103', firstReleaseId: REL_1, subjectId: 'PARCEL-NL-0442', subjectType: 'Parcel', predicate: 'location.position', title: 'Registry centroid', value: '51.9497 N, 4.0250 E', basis: 'Cadastral registry centroid, ±250 m as published', validFrom: '2026-01-01T00:00:00Z', knownAt: '2026-08-19T10:00:00Z', evidenceClass: REGISTRY_MEASURED, provenance: prov('cadastral-registry', 'EV-CAD-NL-0442', 'P-PRODUCER-CADASTRE'), geometry: { kind: 'POINT', datum: 'WGS84', longitude: 4.0250, latitude: 51.9497, horizontalUncertaintyM: 250 }, visibility: 'PUBLIC_RULING' }),

  /* ── Parcel BR-1207: the Santos origination yard ── */
  rec({ recordId: 'LS-0111', firstReleaseId: REL_1, subjectId: 'PARCEL-BR-1207', subjectType: 'Parcel', predicate: 'location.position', title: 'Registry centroid', value: '23.9535 S, 46.3130 W', basis: 'Cadastral registry centroid, ±500 m as published', validFrom: '2026-01-01T00:00:00Z', knownAt: '2026-08-19T10:00:00Z', evidenceClass: REGISTRY_MEASURED, provenance: prov('cadastral-registry', 'EV-CAD-BR-1207', 'P-PRODUCER-CADASTRE'), geometry: { kind: 'POINT', datum: 'WGS84', longitude: -46.3130, latitude: -23.9535, horizontalUncertaintyM: 500 }, visibility: 'PUBLIC_RULING' }),

  /** Withdrawn in release 2: the application was found to have lapsed before it was recorded. */
  rec({ recordId: 'LS-0112', firstReleaseId: REL_1, subjectId: 'PARCEL-BR-1207', subjectType: 'Parcel', predicate: 'entitlement.status', title: 'Entitlement application standing', value: 'Under review — expansion of bulk storage', basis: 'Planning authority register, as published', validFrom: '2026-06-01T00:00:00Z', knownAt: '2026-08-19T10:00:00Z', evidenceClass: AUTHORITY_ASSERTED, provenance: prov('municipal-planning', 'EV-ENT-BR-1207', 'P-PRODUCER-PLANNING'), visibility: 'PUBLIC_RULING', retractedByRetractionId: 'RET-LS-0001' }),

  /**
   * Parcel NL-0511: a centroid with no stated precision. Kept as published and
   * given no key. It cannot be co-located with anything, which is the honest
   * consequence of a source that did not say how well it knew.
   */
  rec({ recordId: 'LS-0121', firstReleaseId: REL_2, subjectId: 'PARCEL-NL-0511', subjectType: 'Parcel', predicate: 'location.position', title: 'Registry centroid, precision not stated', value: '51.9530 N, 4.0310 E', basis: 'Cadastral registry centroid; the registry published no precision for this parcel', validFrom: '2026-01-01T00:00:00Z', knownAt: '2026-08-30T10:00:00Z', evidenceClass: REGISTRY_MEASURED, provenance: prov('cadastral-registry', 'EV-CAD-NL-0511', 'P-PRODUCER-CADASTRE'), geometry: { kind: 'POINT', datum: 'WGS84', longitude: 4.0310, latitude: 51.9530 }, visibility: 'PUBLIC_RULING' }),

  rec({ recordId: 'LS-0122', firstReleaseId: REL_2, subjectId: 'PARCEL-NL-0511', subjectType: 'Parcel', predicate: 'zoning.designation', title: 'Zoning designation', value: 'Port industrial — ancillary', basis: 'Municipal zoning plan in force', validFrom: '2026-01-01T00:00:00Z', knownAt: '2026-08-30T10:00:00Z', evidenceClass: AUTHORITY_ASSERTED, provenance: prov('municipal-planning', 'EV-ZONE-NL-0511', 'P-PRODUCER-PLANNING'), visibility: 'PUBLIC_RULING' }),
];

export const LANDSHARK_RETRACTIONS: Retraction[] = [
  {
    retractionId: 'RET-LS-0001',
    kind: 'WITHDRAWAL',
    issuedAt: '2026-08-30T10:00:00Z',
    releaseId: REL_1,
    affectedRecordIds: ['LS-0112'],
    reason: 'The planning authority withdrew the entitlement entry: the application had lapsed before the register was published, so the standing it recorded never held. Support is removed and nothing is put in its place — this is not a finding that the expansion was refused.',
    sourceId: 'municipal-planning',
    visibility: 'PUBLIC_RULING',
  },
];

const release = (r: Omit<CorpusRelease, 'fixture_only' | 'corpusId' | 'corpusTitle' | 'domain' | 'sources' | 'releaseDigest'>): CorpusRelease => ({
  fixture_only: true, corpusId: CORPUS_ID, corpusTitle: TITLE, domain: 'LANDSHARK',
  sources: LANDSHARK_SOURCES, releaseDigest: digestOf(`release:${r.releaseId}`), ...r,
});

function stagesFor(at: string, opts: { releasedAt: string; verification: string; recall?: string }): StageRecord[] {
  return [
    { stage: 'acquisition', status: 'COMPLETED', note: 'Cadastral and planning extracts read from the two authorized public sources named in the rights schedule.', at },
    { stage: 'extraction', status: 'COMPLETED', note: 'Bounded fields extracted: parcel identifier, cadastral area, zoning designation, entitlement standing, published centroid and its precision where the registry stated one.', at },
    { stage: 'normalization', status: 'COMPLETED', note: 'Areas normalized to m²; centroids carried in WGS84 as published. No coordinate was reprojected, so no reprojection lineage is recorded.', at },
    { stage: 'identity', status: 'COMPLETED', note: 'Parcels kept distinct by registry identifier. No parcel is resolved to a subject in another line, and adjacency is not identity.', at },
    { stage: 'ontology', status: 'COMPLETED', note: 'Predicates aligned to the demonstration vocabulary (area.cadastral, zoning.designation, entitlement.status, location.position).', at },
    { stage: 'computation', status: 'NOT_APPLICABLE', note: 'No derived quantities. Buildable area would be a computation and this corpus carries none.' },
    { stage: 'storage', status: 'NOT_RUN', note: 'No production storage: this repository holds committed fixtures.' },
    { stage: 'indexing', status: 'COMPLETED', note: 'Subject, predicate and time index built for as-of queries.', at },
    { stage: 'verification', status: 'COMPLETED', note: opts.verification, at },
    { stage: 'release', status: 'COMPLETED', note: 'Release manifest produced and committed; commitment recorded in the certification.', at: opts.releasedAt },
    { stage: 'correction', status: 'NOT_APPLICABLE', note: 'No correction issued against this release.' },
    { stage: 'recall', status: opts.recall ? 'COMPLETED' : 'NOT_APPLICABLE', note: opts.recall ?? 'No recall issued against this release.', ...(opts.recall ? { at } : {}) },
  ];
}

const BUILT_1 = '2026-08-20T09:05:00Z';
const BUILT_2 = '2026-09-01T12:05:00Z';

export const LANDSHARK_RELEASES: CorpusRelease[] = [
  release({
    releaseId: REL_1,
    knownAt: '2026-08-20T09:00:00Z',
    build: { buildId: 'build-landshark-tp-2026.08.20', builtAt: BUILT_1, methodology: { methodologyId: 'payload-methodology', version: '0.1.0', status: 'research' }, inputDigests: [], deterministic: true, stages: stagesFor(BUILT_1, { releasedAt: '2026-08-20T09:10:00Z', verification: 'Every record recomputed from its stated artifact and compared; no divergence. Internal recompute only, and no artifact bytes were captured for this corpus, so the recompute is over the declared fields and not over source bytes.' }) },
    certification: { status: 'CERTIFIED', certifiedAt: '2026-08-20T09:10:00Z', basis: 'Release digest recomputed by this system over the canonical record set and the manifest committed. Demonstration corpus: not audited, not independently verified, and no source bytes were captured.', verification: 'internal_recompute', manifestCommitment: digestOf(`releaseManifest:${REL_1}`) },
    supersededByReleaseId: REL_2,
    status: 'SUPERSEDED',
    coverage: 'Parcels NL-0442 and BR-1207: area, zoning, entitlement standing and published centroids.',
    note: 'Superseded. Carried the BR-1207 entitlement entry, later withdrawn by RET-LS-0001; this release still shows it as it stood.',
  }),
  release({
    releaseId: REL_2,
    knownAt: '2026-09-01T12:00:00Z',
    build: { buildId: 'build-landshark-tp-2026.09.01', builtAt: BUILT_2, methodology: { methodologyId: 'payload-methodology', version: '0.1.0', status: 'research' }, inputDigests: [], deterministic: true, stages: stagesFor(BUILT_2, { releasedAt: '2026-09-01T12:10:00Z', verification: 'Every record recomputed from its stated artifact and compared; the BR-1207 entitlement entry was found withdrawn by its authority. Internal recompute only.', recall: 'RET-LS-0001 issued: the BR-1207 entitlement entry recalled because the application had lapsed before the register was published; earlier releases left as they stood.' }) },
    certification: { status: 'CERTIFIED', certifiedAt: '2026-09-01T12:10:00Z', basis: 'Release digest recomputed by this system over the canonical record set and the manifest committed. Demonstration corpus: not audited, not independently verified, and no source bytes were captured.', verification: 'internal_recompute', manifestCommitment: digestOf(`releaseManifest:${REL_2}`) },
    supersedesReleaseId: REL_1,
    status: 'CURRENT',
    coverage: 'Parcels NL-0442, BR-1207 and NL-0511. Includes the RET-LS-0001 withdrawal and one centroid the registry published without a precision.',
    note: 'Current release. Fixture clock 2026-09-01 12:00 UTC, the same cutoff the Caravan and Tradewind corpora carry.',
  }),
];

export const LANDSHARK_CORPUS: Corpus = {
  fixture_only: true,
  corpusId: CORPUS_ID,
  title: TITLE,
  domain: 'LANDSHARK',
  description: 'Point-in-time facts about port and yard parcels: cadastral area, zoning designation, entitlement standing and the centroid the registry publishes, each with bounds where the source states them, validity bounds, both clocks, provenance, evidence class and rights. Synthetic and deterministic.',
  releases: LANDSHARK_RELEASES,
  records: LANDSHARK_RECORDS,
  retractions: LANDSHARK_RETRACTIONS,
  governance: {
    tenantIsolation: 'Both sources in this corpus are public records; nothing here is customer evidence and nothing is tenant-scoped.',
    informationBarrier: 'No source may be drawn on for proprietary strategy or trading. Neither use appears on either registration, so both are prohibited by construction.',
    releaseTiming: 'Nothing derived from a release may be acted on in a principal capacity before that release is delivered to the customers entitled to it. Recorded as policy; not enforced by this repository.',
    nonUse: ['No model training on planning content.', 'No proprietary strategy.', 'No trading.'],
    enforcement: 'This repository enforces customer_delivery at the feed (rights guard before visibility) and records the rest as policy.',
  },
};
