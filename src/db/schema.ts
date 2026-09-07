import { pgTable, text, timestamp, jsonb, integer } from 'drizzle-orm/pg-core';

export const corpora = pgTable('corpora', {
  corpusId: text('corpus_id').primaryKey(),
  domain: text('domain').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  data: jsonb('data').notNull(), // The full Corpus object minus what's extracted
});

export const releases = pgTable('releases', {
  releaseId: text('release_id').primaryKey(),
  corpusId: text('corpus_id').notNull().references(() => corpora.corpusId),
  status: text('status').notNull(), // 'CURRENT' | 'SUPERSEDED'
  knownAt: timestamp('known_at', { withTimezone: true, mode: 'string' }).notNull(),
  data: jsonb('data').notNull(),
});

export const records = pgTable('records', {
  recordId: text('record_id').primaryKey(),
  corpusId: text('corpus_id').notNull().references(() => corpora.corpusId),
  subjectId: text('subject_id').notNull(),
  predicate: text('predicate').notNull(),
  validFrom: timestamp('valid_from', { withTimezone: true, mode: 'string' }).notNull(),
  validTo: timestamp('valid_to', { withTimezone: true, mode: 'string' }),
  knownAt: timestamp('known_at', { withTimezone: true, mode: 'string' }).notNull(),
  // Stamped at entry by the admission gate, never reconstructed later: when
  // the source published it, when this system obtained it, and how it
  // arrived. The last is declared by the candidate and never inferred from
  // the gap between the other two.
  sourceTime: timestamp('source_time', { withTimezone: true, mode: 'string' }).notNull(),
  acquisitionTime: timestamp('acquisition_time', { withTimezone: true, mode: 'string' }).notNull(),
  // LIVE_CAPTURE and BACKFILLED are stamped by the admission gate and mean
  // the row crossed it. DEMONSTRATION means it did not: the committed
  // fixtures are seeded here so the pages have something to show, and the
  // column is what keeps them from reading as admitted state. The gate
  // cannot emit DEMONSTRATION and the seeder cannot emit the other two.
  provenance: text('provenance').notNull(),
  // The subject as the source named it, kept beside the canonical identity
  // rather than in place of it. They are different identifiers and writing one
  // into the other's column silently breaks every join that uses either.
  subjectCanonicalId: text('subject_canonical_id'),
  // Conditions a conditional admission attached, carried onto the row so a
  // reader downstream cannot mistake it for an unconditional one. Empty means
  // none were declared, which is not the same as none applying.
  conditions: jsonb('conditions').notNull().default([]),
  // The claim: value, unit, basis and the admission stamp. Not a summary of the
  // ruling — the thing the record asserts about the world.
  data: jsonb('data').notNull(),
});

// Every ruling the admission gate makes, admitted or refused. A refusal is a
// record too: what fails is not deleted or hidden, it stays here with the
// checks it failed and the authority that ruled.
export const admissionRulings = pgTable('admission_ruling', {
  rulingId: text('ruling_id').primaryKey(),
  candidateId: text('candidate_id').notNull(),
  recordId: text('record_id').notNull(),
  outcome: text('outcome').notNull(),
  authority: text('authority').notNull(),
  ruledAt: timestamp('ruled_at', { withTimezone: true, mode: 'string' }).notNull(),
  data: jsonb('data').notNull(),
});

// The join a correction needs, kept where doctrine rule 2 allows it to live:
// outside the release. A release carries no candidate, build or run
// identifier, and this table is how a corrected record reaches the build that
// proposed it without one leaking into the release.
export const recordAncestry = pgTable('record_ancestry', {
  recordId: text('record_id').primaryKey(),
  releaseId: text('release_id').notNull(),
  candidateId: text('candidate_id').notNull(),
  buildId: text('build_id'),
  ruledAt: timestamp('ruled_at', { withTimezone: true, mode: 'string' }).notNull(),
  authority: text('authority').notNull(),
});

// The forward edge. record_ancestry runs backwards — where a record came from —
// and nothing answered the other direction, so a retraction could only reach
// dependents whoever wrote it had listed by hand. A dependent declares this at
// the moment it comes to depend; an undeclared one is unreachable, which the
// fan-out reports rather than implying it covered everything.
export const dependencyEdges = pgTable('dependency_edge', {
  dependentKind: text('dependent_kind').notNull(),
  dependentId: text('dependent_id').notNull(),
  dependsOn: text('depends_on').notNull(),
  declaredAt: timestamp('declared_at', { withTimezone: true, mode: 'string' }).notNull(),
  because: text('because').notNull(),
});

export const retractions = pgTable('retractions', {
  retractionId: text('retraction_id').primaryKey(),
  corpusId: text('corpus_id').notNull().references(() => corpora.corpusId),
  issuedAt: timestamp('issued_at', { withTimezone: true, mode: 'string' }).notNull(),
  data: jsonb('data').notNull(),
});

// Workbench / Case tables
export const cases = pgTable('cases', {
  caseId: text('case_id').primaryKey(),
  status: text('status').notNull(),
  lastChangedAt: timestamp('last_changed_at', { withTimezone: true, mode: 'string' }).notNull(),
  data: jsonb('data').notNull(),
});

export const rulings = pgTable('rulings', {
  rulingId: text('ruling_id').primaryKey(),
  caseId: text('case_id').notNull().references(() => cases.caseId),
  status: text('status').notNull(),
  ruledAt: timestamp('ruled_at', { withTimezone: true, mode: 'string' }).notNull(),
  data: jsonb('data').notNull(),
});

// ---------------------------------------------------------------------------
// MVP Production Storage Tier: N03 Acquisition, N04 Observation, Identity, Marts
// ---------------------------------------------------------------------------

// N03 Acquisition
export const acquisitionEvents = pgTable('acquisition_event', {
  acquisitionId: text('acquisition_id').primaryKey(),
  sourceUrl: text('source_url').notNull(),
  jurisdiction: text('jurisdiction').notNull(),
  httpStatusCode: integer('http_status_code').notNull(),
  contentType: text('content_type').notNull(),
  capturedAt: timestamp('captured_at', { withTimezone: true, mode: 'string' }).notNull(),
  artifactDigest: text('artifact_digest').notNull(),
  workerVersion: text('worker_version').notNull(),
});

export const sourceArtifacts = pgTable('source_artifact', {
  artifactDigest: text('artifact_digest').primaryKey(),
  contentSizeBytes: integer('content_size_bytes').notNull(),
  mimeType: text('mime_type').notNull(),
  storageUri: text('storage_uri').notNull(),
  textPayload: text('text_payload').notNull(),
  checksum: text('checksum').notNull(),
});

// Extraction Runs
export const extractionRuns = pgTable('extraction_run', {
  runId: text('run_id').primaryKey(),
  adapterVersion: text('adapter_version').notNull(),
  inputSetDigest: text('input_set_digest').notNull(),
  outputObservationsCount: integer('output_observations_count').notNull(),
  runAt: timestamp('run_at', { withTimezone: true, mode: 'string' }).notNull(),
});

// N04 Bitemporal Filing Observations
export const filingObservations = pgTable('filing_observation', {
  observationId: text('observation_id').primaryKey(),
  acquisitionId: text('acquisition_id').notNull(),
  sourceArtifactDigest: text('source_artifact_digest').notNull(),
  carrierNaic: text('carrier_naic').notNull(),
  carrierGroup: text('carrier_group').notNull(),
  stateCode: text('state_code').notNull(),
  filingType: text('filing_type').notNull(),
  primaryPeril: text('primary_peril').notNull(),
  lineOfBusiness: text('line_of_business').notNull(),
  // Bitemporal coordinates
  validTime: timestamp('valid_time', { withTimezone: true, mode: 'string' }).notNull(),
  validTo: timestamp('valid_to', { withTimezone: true, mode: 'string' }),
  knowledgeTime: timestamp('knowledge_time', { withTimezone: true, mode: 'string' }).notNull(),
  admissionStatus: text('admission_status').notNull(), // 'CANDIDATE' | 'ADMITTED' | 'QUARANTINED' | 'SUPERSEDED'
  supersedesId: text('supersedes_id'),
  data: jsonb('data').notNull(),
});

// Identity Resolution
export const carrierIdentities = pgTable('carrier_identity', {
  carrierNaic: text('carrier_naic').primaryKey(),
  groupCode: text('group_code').notNull(),
  legalEntityName: text('legal_entity_name').notNull(),
  stateOfDomicile: text('state_of_domicile').notNull(),
  activeStatus: text('active_status').notNull(),
  data: jsonb('data').notNull(), // aliases, provenance, resolution decisions
});

// Model Parameter Registry
export const parameterRegistryRows = pgTable('parameter_registry', {
  paramKey: text('param_key').primaryKey(),
  version: text('version').notNull(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  value: text('value').notNull(), // JSON serialized
  unit: text('unit').notNull(),
  citation: jsonb('citation').notNull(),
  rationale: text('rationale').notNull(),
});

// Reference Instrument Catalog
export const instrumentCatalogs = pgTable('instrument_catalog', {
  instrumentId: text('instrument_id').primaryKey(),
  version: text('version').notNull(),
  label: text('label').notNull(),
  category: text('category').notNull(),
  unitCostCents: integer('unit_cost_cents').notNull(),
  latencyHours: integer('latency_hours').notNull(),
  sensitivity: text('sensitivity').notNull(),
  falseAlarmRate: text('false_alarm_rate').notNull(),
  vendorSpecCitation: jsonb('vendor_spec_citation').notNull(),
});

// Production Objects: N11 Closed-Loop Tasking Orders
export const taskingOrders = pgTable('tasking_order', {
  orderId: text('order_id').primaryKey(),
  projectId: text('project_id').notNull(),
  targetMilestone: text('target_milestone').notNull(),
  instrumentId: text('instrument_id').notNull(),
  status: text('status').notNull(), // 'DRAFTED' | 'DISPATCHED' | 'OBSERVED' | 'CALIBRATED'
  dispatchedAt: timestamp('dispatched_at', { withTimezone: true, mode: 'string' }).notNull(),
  data: jsonb('data').notNull(), // priors + empirical outcome
});

// Computation Receipts: Non-retained Customer Workload Receipts
export const computationReceipts = pgTable('computation_receipt', {
  receiptId: text('receipt_id').primaryKey(),
  engine: text('engine').notNull(),
  engineVersion: text('engine_version').notNull(),
  inputsDigest: text('inputs_digest').notNull(),
  parameterSetVersion: text('parameter_set_version').notNull(),
  corpusReleaseDigest: text('corpus_release_digest').notNull(),
  outputDigest: text('output_digest').notNull(),
  evaluatedAt: timestamp('evaluated_at', { withTimezone: true, mode: 'string' }).notNull(),
  asOfKnowledgeTime: timestamp('as_of_knowledge_time', { withTimezone: true, mode: 'string' }).notNull(),
  data: jsonb('data').notNull(),
});

