/**
 * DEMONSTRATION FIXTURE — fixture_only: true — the Tradewind freight-rate
 * corpus: two releases, the records they carry, one correction, and the rights
 * schedule of every source.
 *
 * Tradewind's line is markets, instruments, pricing and risk. A record here is
 * a fact about an instrument or a position — a settlement price, a notional
 * exposure, the delivery point a position is written against — carried under
 * exactly the discipline Caravan's records are: value, unit, bounds, validity
 * bounds, both clocks, provenance, evidence class, rights, stable identity.
 * Nothing is edited in place.
 *
 * WHY THE PROVENANCE CARRIES NO CONTENT DIGEST
 *
 * Caravan's records name an artifact and its content digest because artifact
 * bytes were captured and hashed for the cases that draw on them. No bytes
 * were captured for this corpus, so its records name their artifact and stop
 * there. `contentHash`, `contentDigest`, `storageKey` and `receiptId` are
 * optional on the contract, and leaving them absent is the honest reading:
 * a digest that was never computed over bytes that were never captured would
 * be a fabricated commitment. The release digest and the manifest commitment
 * ARE computed, over the record set this file declares, by the same stamper
 * that computes Caravan's.
 *
 * WHAT THIS CORPUS IS FOR, BEYOND ITSELF
 *
 * Position TW-1180 is written against a delivery point at the Maasvlakte
 * loading terminal, which is where Caravan's lot 5B-221 is declared to sit
 * over an overlapping interval, and where Landshark's parcel NL-0442 is. That
 * co-location is deliberate: it is what lets the cross-line blocking keys be
 * demonstrated rather than asserted. It establishes nothing about whether the
 * three subjects are related — see ../../domain/crossLineJoin.
 */
import type { Corpus, CorpusRecord, CorpusRelease, Retraction, RightsSchedule, StageRecord } from '@/domain/corpus';
import { derivePermittedUses } from '@/domain/corpus';
import type { SourceRegistration } from '@/data-os/contracts';
import { digestOf } from '../digestLookup';

const CORPUS_ID = 'tradewind.freight-rates';
const TITLE = 'Tradewind — dry-bulk freight rates (demonstration corpus)';
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

/**
 * PROPRIETARY_STRATEGY and TRADING are prohibited purposes on every
 * registration here, not merely absent — which matters more on this line than
 * on any other, because market data is exactly the material a firm would be
 * tempted to trade on. The information barrier is declared at the source.
 */
const TRADEWIND_REGISTRATIONS: Record<string, SourceRegistration> = {
  'baltic-settlements': reg({ local: 'baltic-settlements', displayName: 'Dry-bulk settlement service (demonstration)', sourceClass: 'MARKET_SETTLEMENT', licenseId: 'settlement-redistribution-licence-2026', policyVersion: '1.0.0', permittedPurposes: ['AGGREGATION', 'TRADEWIND_CORPUS'], prohibitedPurposes: ['MODEL_TRAINING', 'PROPRIETARY_STRATEGY', 'TRADING'], allowedOperations: ['DERIVE', 'EXPORT', 'INDEX', 'INGEST', 'RETRIEVE'], approvalRequiredOperations: ['PUBLISH'], allowedAudiences: ['CUSTOMER', 'INTERNAL', 'PUBLIC'], retention: { mode: 'INDEFINITE' } }),
  'harbourline-book': reg({ local: 'harbourline-book', displayName: 'Harbourline Brokerage position book', sourceClass: 'COUNTERPARTY_BOOK', licenseId: 'harbourline-named-party-access-2026', policyVersion: '1.0.0', permittedPurposes: ['TRADEWIND_CORPUS'], prohibitedPurposes: ['AGGREGATION', 'MODEL_TRAINING', 'PROPRIETARY_STRATEGY', 'TRADING'], allowedOperations: ['DERIVE', 'INDEX', 'INGEST', 'RETRIEVE'], allowedAudiences: ['CUSTOMER', 'INTERNAL'], retention: { mode: 'UNTIL_SOURCE_EXPIRY' } }),
};

const rights = (sourceId: string, r: Omit<RightsSchedule, 'sourceId' | 'canonicalId' | 'registration' | 'permittedUses' | 'sourceName' | 'licence'>): RightsSchedule => {
  const registration = TRADEWIND_REGISTRATIONS[sourceId];
  return { sourceId, canonicalId: registration.sourceId, sourceName: registration.displayName, licence: registration.licenseId, registration, permittedUses: derivePermittedUses(registration, RIGHTS_AT, sourceId, 'TRADEWIND'), ...r };
};

export const TRADEWIND_SOURCES: RightsSchedule[] = [
  rights('baltic-settlements', { materialClass: 'operational', nonUse: ['No model training on settlement content', 'No proprietary strategy', 'No trading'], redistribution: 'licensed', attributionRequired: true, producerId: 'P-PRODUCER-SETTLEMENT' }),
  rights('harbourline-book', { materialClass: 'operational', nonUse: ['No aggregation across counterparties', 'No model training', 'No proprietary strategy', 'No trading'], redistribution: 'internal_only', attributionRequired: false, producerId: 'P-SPONSOR-HARBOURLINE' }),
];

const REL_1 = 'REL-TW-2026.08.20';
const REL_2 = 'REL-TW-2026.09.01';

const rec = (r: Omit<CorpusRecord, 'canonicalId' | 'subjectCanonicalId'> & { subjectCanonicalId?: string }): CorpusRecord => ({
  ...r,
  canonicalId: uri('claim', `${r.subjectId}/${r.predicate}/${r.recordId}`),
  subjectCanonicalId: r.subjectCanonicalId ?? uri('entity', `${r.subjectType.toLowerCase()}/${r.subjectId.replace(/^(POS|INST)-TW-/, '')}`),
});

/** Named artifact, no invented digest. See the header. */
const prov = (sourceId: string, artifactId: string, producerId: string) => ({ sourceId, artifactId, producerId });

const REPORTED_MEASURED = { claimStrength: 'reported', productionClass: 'measured', interest: 'disinterested' } as const;
/** A counterparty stating its own book has a stake in how it is stated. */
const SELF_REPORTED = { claimStrength: 'reported', productionClass: 'asserted', interest: 'self_reported' } as const;

export const TRADEWIND_RECORDS: CorpusRecord[] = [
  rec({ recordId: 'TW-0101', firstReleaseId: REL_1, subjectId: 'INST-TW-C5', subjectType: 'Instrument', predicate: 'price.settlement', title: 'Settlement price, dry-bulk route C5', value: 18.42, unit: 'USD/t', basis: 'Daily settlement, route C5', uncertainty: { low: 18.42, high: 18.42, semantics: 'Settlement is a published figure, not an estimate: the bounds are the figure itself' }, validFrom: '2026-08-19T17:00:00Z', validTo: '2026-08-20T17:00:00Z', knownAt: '2026-08-19T18:30:00Z', observedAt: '2026-08-19T17:00:00Z', evidenceClass: REPORTED_MEASURED, provenance: prov('baltic-settlements', 'EV-SETTLE-C5-0819', 'P-PRODUCER-SETTLEMENT'), visibility: 'COUNTERPARTY_SHARED' }),

  rec({ recordId: 'TW-0102', firstReleaseId: REL_1, subjectId: 'POS-TW-1180', subjectType: 'Position', predicate: 'exposure.notional', title: 'Notional exposure, position TW-1180', value: 1_250_000, unit: 'USD', basis: 'Counterparty book, as stated', uncertainty: { low: 1_250_000, high: 1_250_000, semantics: 'A book figure as the counterparty stated it; no independent measurement' }, validFrom: '2026-08-14T00:00:00Z', validTo: '2026-08-21T00:00:00Z', knownAt: '2026-08-19T18:30:00Z', evidenceClass: SELF_REPORTED, provenance: prov('harbourline-book', 'EV-BOOK-HL-1180', 'P-SPONSOR-HARBOURLINE'), visibility: 'COUNTERPARTY_SHARED', supersededByRecordId: 'TW-0201' }),

  /**
   * The delivery point the position is written against. This is a position
   * record like Caravan's: it says where the source says the delivery point
   * is, over an interval, with a stated uncertainty — which is what makes it
   * keyable at all.
   */
  rec({ recordId: 'TW-0103', firstReleaseId: REL_1, subjectId: 'POS-TW-1180', subjectType: 'Position', predicate: 'location.position', title: 'Delivery point, position TW-1180', value: '51.9497 N, 4.0250 E', basis: 'Counterparty book: the loading terminal named as the delivery point, ±400 m as stated', validFrom: '2026-08-14T00:00:00Z', validTo: '2026-08-21T00:00:00Z', knownAt: '2026-08-19T18:30:00Z', evidenceClass: SELF_REPORTED, provenance: prov('harbourline-book', 'EV-BOOK-HL-1180', 'P-SPONSOR-HARBOURLINE'), geometry: { kind: 'POINT', datum: 'WGS84', longitude: 4.0250, latitude: 51.9497, horizontalUncertaintyM: 400 }, visibility: 'COUNTERPARTY_SHARED' }),

  /**
   * The route's designated discharge point, from the settlement service.
   *
   * This is public market infrastructure — where route C5 discharges — and it
   * is deliverable. The position record above (TW-0103) is the counterparty's
   * own delivery point for its own position, and it is NOT deliverable: the
   * book registration permits no EXPORT, so the rights guard withholds it from
   * every seat. Two positions in one line, one that leaves the corpus and one
   * that does not, and the difference is the source's registration rather than
   * anything about the coordinates.
   */
  rec({ recordId: 'TW-0104', firstReleaseId: REL_1, subjectId: 'INST-TW-C5', subjectType: 'Instrument', predicate: 'location.position', title: 'Designated discharge point, route C5', value: '51.9497 N, 4.0250 E', basis: 'Settlement service route definition: the terminal designated for discharge, ±400 m as published', validFrom: '2026-08-01T00:00:00Z', knownAt: '2026-08-19T18:30:00Z', evidenceClass: REPORTED_MEASURED, provenance: prov('baltic-settlements', 'EV-ROUTE-C5', 'P-PRODUCER-SETTLEMENT'), geometry: { kind: 'POINT', datum: 'WGS84', longitude: 4.0250, latitude: 51.9497, horizontalUncertaintyM: 400 }, visibility: 'COUNTERPARTY_SHARED' }),

  /* ── Release 2: the exposure corrected against a confirmation ── */
  rec({ recordId: 'TW-0201', firstReleaseId: REL_2, subjectId: 'POS-TW-1180', subjectType: 'Position', predicate: 'exposure.notional', title: 'Notional exposure, position TW-1180 (confirmed)', value: 1_312_500, unit: 'USD', basis: 'Trade confirmation reconciled against the settlement price', uncertainty: { low: 1_312_500, high: 1_312_500, semantics: 'Reconciled against a published settlement; the figure is exact at that settlement' }, validFrom: '2026-08-14T00:00:00Z', validTo: '2026-08-21T00:00:00Z', knownAt: '2026-08-28T09:00:00Z', evidenceClass: REPORTED_MEASURED, provenance: prov('baltic-settlements', 'EV-CONFIRM-1180', 'P-PRODUCER-SETTLEMENT'), visibility: 'COUNTERPARTY_SHARED', supersedesRecordId: 'TW-0102' }),

  rec({ recordId: 'TW-0202', firstReleaseId: REL_2, subjectId: 'INST-TW-C5', subjectType: 'Instrument', predicate: 'price.settlement', title: 'Settlement price, dry-bulk route C5', value: 19.05, unit: 'USD/t', basis: 'Daily settlement, route C5', uncertainty: { low: 19.05, high: 19.05, semantics: 'Settlement is a published figure, not an estimate: the bounds are the figure itself' }, validFrom: '2026-08-27T17:00:00Z', validTo: '2026-08-28T17:00:00Z', knownAt: '2026-08-28T09:00:00Z', observedAt: '2026-08-27T17:00:00Z', evidenceClass: REPORTED_MEASURED, provenance: prov('baltic-settlements', 'EV-SETTLE-C5-0827', 'P-PRODUCER-SETTLEMENT'), visibility: 'COUNTERPARTY_SHARED' }),
];

export const TRADEWIND_RETRACTIONS: Retraction[] = [
  {
    retractionId: 'RET-TW-0001',
    kind: 'CORRECTION',
    issuedAt: '2026-08-28T09:00:00Z',
    releaseId: REL_1,
    affectedRecordIds: ['TW-0102'],
    replacementRecordIds: ['TW-0201'],
    reason: 'The notional exposure stated by the counterparty’s own book was reconciled against the trade confirmation and the published settlement, and corrected upward. The earlier release still shows what the book said.',
    sourceId: 'harbourline-book',
    visibility: 'COUNTERPARTY_SHARED',
  },
];

const release = (r: Omit<CorpusRelease, 'fixture_only' | 'corpusId' | 'corpusTitle' | 'domain' | 'sources' | 'releaseDigest'>): CorpusRelease => ({
  fixture_only: true, corpusId: CORPUS_ID, corpusTitle: TITLE, domain: 'TRADEWIND',
  sources: TRADEWIND_SOURCES, releaseDigest: digestOf(`release:${r.releaseId}`), ...r,
});

function stagesFor(at: string, opts: { releasedAt: string; verification: string; correction?: string }): StageRecord[] {
  return [
    { stage: 'acquisition', status: 'COMPLETED', note: 'Settlement notices and counterparty book extracts read from the two authorized sources named in the rights schedule.', at },
    { stage: 'extraction', status: 'COMPLETED', note: 'Bounded fields extracted: instrument, route, settlement value, notional, delivery point, and the times each was stated for.', at },
    { stage: 'normalization', status: 'COMPLETED', note: 'Currency and unit terms normalized to USD and USD/t; no rate conversion was applied, so no conversion lineage is recorded.', at },
    { stage: 'identity', status: 'COMPLETED', note: 'Instruments and positions kept distinct. No position is merged with any instrument, and nothing in this corpus is resolved to a subject in another line.', at },
    { stage: 'ontology', status: 'COMPLETED', note: 'Predicates aligned to the demonstration vocabulary (price.settlement, exposure.notional, location.position).', at },
    { stage: 'computation', status: 'NOT_APPLICABLE', note: 'No derived quantities. A mark-to-market would be a computation and this corpus carries none.' },
    { stage: 'storage', status: 'NOT_RUN', note: 'No production storage: this repository holds committed fixtures.' },
    { stage: 'indexing', status: 'COMPLETED', note: 'Subject, predicate and time index built for as-of queries.', at },
    { stage: 'verification', status: 'COMPLETED', note: opts.verification, at },
    { stage: 'release', status: 'COMPLETED', note: 'Release manifest produced and committed; commitment recorded in the certification.', at: opts.releasedAt },
    { stage: 'correction', status: opts.correction ? 'COMPLETED' : 'NOT_APPLICABLE', note: opts.correction ?? 'No correction issued against this release.', ...(opts.correction ? { at } : {}) },
    { stage: 'recall', status: 'NOT_APPLICABLE', note: 'No recall issued against this release.' },
  ];
}

const BUILT_1 = '2026-08-20T09:05:00Z';
const BUILT_2 = '2026-09-01T12:05:00Z';

export const TRADEWIND_RELEASES: CorpusRelease[] = [
  release({
    releaseId: REL_1,
    knownAt: '2026-08-20T09:00:00Z',
    build: { buildId: 'build-tradewind-fr-2026.08.20', builtAt: BUILT_1, methodology: { methodologyId: 'payload-methodology', version: '0.1.0', status: 'research' }, inputDigests: [], deterministic: true, stages: stagesFor(BUILT_1, { releasedAt: '2026-08-20T09:10:00Z', verification: 'Every record recomputed from its stated artifact and compared; no divergence. Internal recompute only, and no artifact bytes were captured for this corpus, so the recompute is over the declared fields and not over source bytes.' }) },
    certification: { status: 'CERTIFIED', certifiedAt: '2026-08-20T09:10:00Z', basis: 'Release digest recomputed by this system over the canonical record set and the manifest committed. Demonstration corpus: not audited, not independently verified, and no source bytes were captured.', verification: 'internal_recompute', manifestCommitment: digestOf(`releaseManifest:${REL_1}`) },
    supersededByReleaseId: REL_2,
    status: 'SUPERSEDED',
    coverage: 'Instrument C5 with its designated discharge point, and position TW-1180 with the counterparty’s own delivery point, which the rights guard withholds.',
    note: 'Superseded. Carried the counterparty’s own notional, later corrected by RET-TW-0001; this release still shows it as it stood.',
  }),
  release({
    releaseId: REL_2,
    knownAt: '2026-09-01T12:00:00Z',
    build: { buildId: 'build-tradewind-fr-2026.09.01', builtAt: BUILT_2, methodology: { methodologyId: 'payload-methodology', version: '0.1.0', status: 'research' }, inputDigests: [], deterministic: true, stages: stagesFor(BUILT_2, { releasedAt: '2026-09-01T12:10:00Z', verification: 'Every record recomputed from its stated artifact and compared; the self-reported notional was found superseded by a reconciled confirmation. Internal recompute only.', correction: 'RET-TW-0001 issued: the notional exposure of position TW-1180 corrected from the counterparty’s own book figure to a reconciled confirmation; the earlier release left as it stood.' }) },
    certification: { status: 'CERTIFIED', certifiedAt: '2026-09-01T12:10:00Z', basis: 'Release digest recomputed by this system over the canonical record set and the manifest committed. Demonstration corpus: not audited, not independently verified, and no source bytes were captured.', verification: 'internal_recompute', manifestCommitment: digestOf(`releaseManifest:${REL_2}`) },
    supersedesReleaseId: REL_1,
    status: 'CURRENT',
    coverage: 'Instrument C5 across two settlements with its designated discharge point, and position TW-1180 with its corrected notional.',
    note: 'Current release. Fixture clock 2026-09-01 12:00 UTC, the same cutoff the Caravan and Landshark corpora carry.',
  }),
];

export const TRADEWIND_CORPUS: Corpus = {
  fixture_only: true,
  corpusId: CORPUS_ID,
  title: TITLE,
  domain: 'TRADEWIND',
  description: 'Point-in-time facts about dry-bulk freight instruments and the positions written against them: settlement price, notional exposure and declared delivery point, each with bounds, validity bounds, both clocks, provenance, evidence class and rights. Synthetic and deterministic.',
  releases: TRADEWIND_RELEASES,
  records: TRADEWIND_RECORDS,
  retractions: TRADEWIND_RETRACTIONS,
  governance: {
    tenantIsolation: 'Counterparty book extracts are tenant-isolated and delivered only to the parties named on the position.',
    informationBarrier: 'No source in this corpus may be drawn on for proprietary strategy or trading. Both are prohibited purposes on both registrations, not merely absent — which is the barrier that matters most on the market line.',
    releaseTiming: 'Nothing derived from a release may be acted on in a principal capacity before that release is delivered to the customers entitled to it. Recorded as policy; not enforced by this repository.',
    nonUse: ['No model training on settlement or book content.', 'No aggregation across counterparties.', 'No proprietary strategy.', 'No trading.'],
    enforcement: 'This repository enforces customer_delivery at the feed (rights guard before visibility) and records the rest as policy.',
  },
};
