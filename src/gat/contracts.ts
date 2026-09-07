import type { EvidenceClass, Interest } from '../domain/types';
import type { SourceUseDecision } from '../data-os/contracts';
import { encodeLocalRecord, exactFields } from '../data-os/local-record';
import { ProductionError } from '../production/errors';
import { GAT_ADAPTER_VERSION, type GatRuntimeIdentity } from './pin';
import type { GatAuditProjection, GatStageStatus } from './report';

export const MAX_GAT_REQUEST_BYTES = 8 * 1024;
export const MAX_GAT_RECEIPT_BYTES = 64 * 1024;
export interface GatAuditRequest {
  schema: 'payload.gat-audit-request.v1'; requestId: string; operation: 'IFC_AUDIT'; adapterVersion: typeof GAT_ADAPTER_VERSION; purpose: string;
  source: { acquisition: { id: string; digest: string }; evidence: { id: string; contentDigest: string } };
}
export type GatOutcome = 'SUPPORTED_SCOPE_AUDIT' | 'AUDIT_BLOCKED' | 'SOURCE_UNAVAILABLE' | 'SOURCE_INTEGRITY_FAILED' | 'SOURCE_REFERENCE_MISMATCH'
  | 'SOURCE_MEDIA_UNSUPPORTED' | 'SOURCE_TIME_MISMATCH' | 'PROCESSING_DISALLOWED' | 'ENGINE_UNAVAILABLE' | 'ENGINE_INTEGRITY_FAILED'
  | 'EXECUTION_TIMEOUT' | 'EXECUTION_FAILED' | 'INVALID_REPORT' | 'INPUT_TOO_LARGE' | 'ENGINE_BUSY';
export interface GatArtifactReference { id: string; contentDigest: string; byteLength: number }
export interface GatReceipt {
  schema: 'payload.gat-execution-receipt.v1'; request: GatAuditRequest; requestDigest: string; reservationDigest: string;
  startedAt: string; completedAt: string; engine: { repository: string; commit: string; sourceTreeDigest: string; adapterVersion: string; pinDigest: string };
  runtime: GatRuntimeIdentity | null; outcome: GatOutcome; sourceVerified: boolean;
  sourcePolicy: { id: string; digest: string; policyVersion: string } | null; deriveDecision: SourceUseDecision | null;
  report: GatArtifactReference | null; projection: GatArtifactReference | null;
  stages: { evidence: 'PASS' | 'BLOCKED'; processingPermission: 'ALLOWED' | 'DENIED' | 'APPROVAL_REQUIRED' | 'NOT_RUN'; execution: 'COMPLETED' | 'FAILED' | 'NOT_RUN';
    report: 'RETAINED' | 'NOT_RETAINED'; parse: GatStageStatus | null; lowering: GatStageStatus | null; compilation: GatStageStatus | null; verification: GatStageStatus | null };
  mode: 'LOCAL_DEVELOPMENT'; policyAuthority: 'OPERATOR_DECLARATION'; canonicalAdmission: false; independentlyVerified: false; sourceTruthClaimed: false; physicalActionAuthorized: false;
  digest: string;
}
export interface GatInspection {
  schema: 'payload.gat-inspection.v1'; mode: 'LOCAL_DEVELOPMENT'; requestId: string; requestDigest: string;
  receipt: { id: string; digest: string }; source: GatAuditRequest['source']; startedAt: string; completedAt: string;
  engine: GatReceipt['engine']; runtime: GatRuntimeIdentity | null; outcome: GatOutcome; stages: GatReceipt['stages'];
  processingPermission: { state: SourceUseDecision['state']; reasons: readonly string[]; evaluatedAt: string; policy: GatReceipt['sourcePolicy'] } | null;
  report: GatArtifactReference | null; projectionReference: GatArtifactReference | null; projection: GatAuditProjection | null;
  retained: { sourceVerifiedAtExecution: boolean; receipt: true; report: boolean; projection: boolean };
  retry: { sameRequest: 'HISTORICAL_INSPECTION_NO_EXECUTION'; newExecutionRequiresNewRequestId: true; remediationInputs: string[] };
  integrity: 'RECOMPUTED_LOCAL'; inspection: 'HISTORICAL'; currentRightsGrant: false; originalReportDelivered: false;
  canonicalAdmission: false; independentlyVerified: false; sourceTruthClaimed: false; physicalActionAuthorized: false;
}

export function requireGatId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) throw new ProductionError('INVALID_GAT_REQUEST', 'Use bounded identifiers without paths or whitespace.');
}
export function requireGatDigest(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(value)) throw new ProductionError('INVALID_GAT_REQUEST', 'Use the exact full SHA-256 reference digest.');
}
export function parseGatAuditRequest(input: unknown): GatAuditRequest {
  try {
    const value = JSON.parse(encodeLocalRecord(input, MAX_GAT_REQUEST_BYTES).toString('utf8'));
    exactFields(value, ['schema', 'requestId', 'operation', 'adapterVersion', 'purpose', 'source']);
    if (value.schema !== 'payload.gat-audit-request.v1' || value.operation !== 'IFC_AUDIT' || value.adapterVersion !== GAT_ADAPTER_VERSION) throw new Error();
    requireGatId(value.requestId);
    if (typeof value.purpose !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9 _.,:-]{0,179}$/.test(value.purpose) || value.purpose.trim() !== value.purpose) throw new Error();
    exactFields(value.source, ['acquisition', 'evidence']); exactFields(value.source.acquisition, ['id', 'digest']); exactFields(value.source.evidence, ['id', 'contentDigest']);
    requireGatId(value.source.acquisition.id); requireGatDigest(value.source.acquisition.digest); requireGatId(value.source.evidence.id); requireGatDigest(value.source.evidence.contentDigest);
    return value as unknown as GatAuditRequest;
  } catch { throw new ProductionError('INVALID_GAT_REQUEST', 'Send the closed IFC_AUDIT request with exact preserved acquisition/evidence references, the pinned adapter version, and declared purpose.'); }
}

/* ── The engine's epistemic vocabulary, and what it may become here ── */

/**
 * GAT declares the epistemic origin of every claim entering its belief state
 * on one axis of six terms (`gat/evidence.py`, `EvidenceKind`). The corpus
 * declares evidence on three axes that are not that axis. Neither is wrong;
 * they answer different questions, and the collision is worth stating before
 * a third producer arrives and makes it pairwise.
 *
 * The trap is `DERIVED`. It is a GAT `EvidenceKind`, a corpus `claimStrength`
 * and a corpus `productionClass` — three terms, one spelling, three meanings.
 * A mapping that matches vocabularies by spelling gets this row wrong and
 * looks right doing it.
 *
 * This mapping is the consumer's reading, not the engine's declaration. The
 * engine declares its own terms and has never declared what they become here,
 * so every row says so and none of them is authority.
 */
export type GatEvidenceKind = 'MEASURED' | 'ESTIMATED' | 'INFERRED' | 'ASSUMED' | 'SIMULATED' | 'DERIVED';

export const GAT_EVIDENCE_KINDS: readonly GatEvidenceKind[] =
  ['MEASURED', 'ESTIMATED', 'INFERRED', 'ASSUMED', 'SIMULATED', 'DERIVED'];

/** Who says a row is what it is. Never the engine, today. */
export const EVIDENCE_MAPPING_DECLARED_BY = 'THE CONSUMER, reading the engine’s terms; the engine has declared no mapping';

export interface GatEvidenceMapping {
  kind: GatEvidenceKind;
  /** What the engine means by it. */
  means: string;
  /** The class a corpus record carrying it would take, or null when it may not become a record. */
  becomes: EvidenceClass | null;
  because: string;
}

/**
 * `interest` is never `disinterested`. The engine has no stake, but its
 * inputs do, and it does not know whose they are: a computation over an
 * interested party's declarations is not disinterested because a machine
 * performed it. `unknown` is the honest term, and it is the corpus's own
 * ranking that puts `unknown` above `self_reported` and below
 * `disinterested`, which is exactly where an engine output belongs.
 */
export const ENGINE_INTEREST: Interest = 'unknown';

export const GAT_EVIDENCE_MAPPING: readonly GatEvidenceMapping[] = [
  {
    kind: 'MEASURED',
    means: 'An instrument reading admitted to the belief state through a calibrated measurement model.',
    becomes: { claimStrength: 'reported', productionClass: 'measured', interest: ENGINE_INTEREST },
    because: 'The engine measured nothing itself; a source did, and the engine conditioned on it. The strength is the reading’s, the production class is how the value came to exist, and the interest is the source’s and unknown here.',
  },
  {
    kind: 'ESTIMATED',
    means: 'A quantity fitted from evidence under the engine’s model.',
    becomes: { claimStrength: 'estimated', productionClass: 'computed', interest: ENGINE_INTEREST },
    because: 'A fitted value is an estimate on both vocabularies’ terms, and computation is how it came to exist.',
  },
  {
    kind: 'INFERRED',
    means: 'A quantity conditioned through the belief state rather than observed directly.',
    becomes: { claimStrength: 'estimated', productionClass: 'derived', interest: ENGINE_INTEREST },
    because: 'Derivation here is the corpus’s production class, not its claim strength: the value came to exist from other values. Its strength is still that of an estimate, because conditioning does not make a value harder than the evidence under it.',
  },
  {
    kind: 'DERIVED',
    means: 'A deterministic function of other variables in the engine’s graph.',
    becomes: { claimStrength: 'derived', productionClass: 'derived', interest: ENGINE_INTEREST },
    because: 'The one row where the spelling and the meaning agree on both axes, and the reason the other rows must be checked rather than matched.',
  },
  {
    kind: 'ASSUMED',
    means: 'A value the engine was told to hold, standing in for evidence that does not exist.',
    becomes: null,
    because: 'An assumption is not evidence about the world; it is a condition the computation ran under. It travels with a result as context and is never a record, because admitting it would make the absence of evidence indistinguishable from evidence.',
  },
  {
    kind: 'SIMULATED',
    means: 'A value produced by the engine’s own model of a situation, observed by nothing.',
    becomes: null,
    because: 'A simulated value is an observation of a model, not of the world. Nothing witnessed it, so no source can carry it and no class fits it.',
  },
];

/** What the mapping is not, stated where a reader will meet it. */
export const GAT_EVIDENCE_MAPPING_LOSS = [
  'The mapping says what class a record would carry, never that a record may be written. Admission is a separate decision and the engine is not a corpus writer.',
  'DERIVED is three terms in two vocabularies: a GAT kind, a corpus claim strength and a corpus production class. Matching vocabularies by spelling gets that row right by accident and the rows around it wrong.',
  'Two kinds map to nothing. ASSUMED and SIMULATED have no honest class here, and the absence is the finding: a value nothing witnessed cannot be graded as evidence, and no unclassified default is offered in its place.',
  'No engine output is disinterested. The engine holds no stake and knows nothing of its inputs’ stakes, so interest is unknown and never assumed away.',
  `Whose reading this is: ${EVIDENCE_MAPPING_DECLARED_BY}.`,
] as const;

/** The class a record carrying this engine kind would take, or null when it may not become one. */
export function corpusClassFor(kind: GatEvidenceKind): EvidenceClass | null {
  const row = GAT_EVIDENCE_MAPPING.find((entry) => entry.kind === kind);
  if (!row) throw new Error(`no mapping declared for engine evidence kind ${kind}`);
  return row.becomes;
}
