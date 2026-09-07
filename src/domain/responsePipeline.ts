/**
 * The response pipeline: what leaves, why, and the receipt that proves the
 * policy ran.
 *
 * Five stages in a fail-closed order, and the order is the argument. What no
 * contract can buy is checked before what a contract can: the estates — the
 * system's knowledge about itself — are refused first, because a licence is
 * not the reason they stay in, and a caller who is fully permitted still
 * cannot have them. Rights come next, then admissibility, then the as-of
 * question, then shaping. A later stage never rescues an earlier refusal.
 *
 * The pipeline is deterministic over pinned inputs — a query, a licence, a
 * release, a policy version — which is what makes it *proof-eligible*: the
 * same shape a zero-knowledge guest needs. It generates no proof. What it
 * generates is a receipt over a canonical serialization, and the thing worth
 * noticing is that proof-eligibility is not a new property to design for. It
 * is `cardGrade` applied to the pipeline's own execution: the set of
 * computations that could ever be proved is exactly the set already grading
 * CARD_GRADE, and `executionArtifact` hands the pipeline's run to that
 * grader rather than asserting the claim.
 *
 * A refusal is a result, never an error and never silence. It names the
 * stage that refused and why, because a caller who cannot have the substance
 * can still be told the shape of the wall.
 */
import { createHash } from 'node:crypto';
import { canonicalJson } from '@/fixtures/digest';
import { crossedTheGate, type RecordProvenance } from './admission';
import { answerable, type AsOfQuestion } from './referenceGround';
import { cardGrade, type CardVerdict, type ComputationArtifact } from './computationCard';

export const PIPELINE_METHOD = 'notationsos.response-pipeline.v1';

/** In refusal order. Nothing later rescues something refused earlier. */
export type Stage = 'ESTATE' | 'RIGHTS' | 'ADMISSIBILITY' | 'QUESTION' | 'SHAPING';

export const STAGE_ORDER: readonly Stage[] = ['ESTATE', 'RIGHTS', 'ADMISSIBILITY', 'QUESTION', 'SHAPING'];

/**
 * What the system knows about itself. No licence reaches these, which is why
 * they are refused before rights are even read: cryptography enforces a
 * boundary and never draws one, and this boundary is drawn here.
 */
export const NEVER_SERVED = ['CALIBRATION', 'IDENTITY_DECISION', 'SOURCE_RELIABILITY', 'SURPRISE_TAPE'] as const;
export type EstateClass = (typeof NEVER_SERVED)[number];

/** How much of a permitted row the caller receives. */
export type Disclosure = 'FULL' | 'PROVENANCE_ONLY';

export const DISCLOSURE_MEANING: Record<Disclosure, string> = {
  FULL: 'The record’s content, with its provenance beside it.',
  PROVENANCE_ONLY: 'That the record exists in this release, what grade it carries and how it was admitted — without its substance. A caller deciding whether to buy learns the shape of the answer and not the answer.',
};

export interface Licence {
  callerId: string;
  permittedPurposes: readonly string[];
  permittedSourceIds: readonly string[];
  disclosure: Disclosure;
}

export interface ServableRow {
  recordId: string;
  sourceId: string;
  /** Set only for the system's own knowledge about itself. */
  estateClass: EstateClass | null;
  provenance: RecordProvenance;
  validFrom: string;
  validTo: string | null;
  knownAt: string;
  sourceTime: string;
  acquisitionTime: string;
  evidenceGrade: string;
  content: unknown;
}

export interface ResponseRequest {
  queryId: string;
  releaseId: string;
  policyVersion: string;
  question: AsOfQuestion;
  atInstant: string;
  purpose: string;
}

export interface RowOutcome {
  recordId: string;
  served: boolean;
  disclosure: Disclosure | null;
  refusedAt: Stage | null;
  because: string;
  /** Present only when served; PROVENANCE_ONLY omits `content`. */
  payload: Record<string, unknown> | null;
}

export interface PipelineResponse {
  method: string;
  request: ResponseRequest;
  callerId: string;
  outcomes: RowOutcome[];
  served: number;
  refused: number;
  /** sha256 over the canonical serialization of request, licence terms and outcomes. */
  receiptDigest: string;
  because: string;
}

function estateRefusal(row: ServableRow): RowOutcome | null {
  if (!row.estateClass) return null;
  return {
    recordId: row.recordId, served: false, disclosure: null, refusedAt: 'ESTATE', payload: null,
    because: `${row.estateClass} is the system’s knowledge about itself and is never served. No licence reaches it, so this is refused before rights are read: a permitted caller is still refused here.`,
  };
}

function rightsRefusal(row: ServableRow, licence: Licence, request: ResponseRequest): RowOutcome | null {
  if (!licence.permittedPurposes.includes(request.purpose)) {
    return { recordId: row.recordId, served: false, disclosure: null, refusedAt: 'RIGHTS', payload: null,
      because: `Purpose ${request.purpose} is not among this licence’s permitted purposes. An unlisted purpose is a refusal, never a default permission.` };
  }
  if (!licence.permittedSourceIds.includes(row.sourceId)) {
    return { recordId: row.recordId, served: false, disclosure: null, refusedAt: 'RIGHTS', payload: null,
      because: `Source ${row.sourceId} is not licensed to this caller.` };
  }
  return null;
}

function admissibilityRefusal(row: ServableRow): RowOutcome | null {
  if (crossedTheGate(row.provenance)) return null;
  return {
    recordId: row.recordId, served: false, disclosure: null, refusedAt: 'ADMISSIBILITY', payload: null,
    because: `Provenance ${row.provenance}: this row never crossed the admission gate, so it is not corpus state and cannot be served as one. The pages may show it; an answer may not carry it.`,
  };
}

function questionRefusal(row: ServableRow, request: ResponseRequest): RowOutcome | null {
  const reading = answerable(
    { recordId: row.recordId, provenance: row.provenance === 'BACKFILLED' ? 'BACKFILLED' : 'LIVE_CAPTURE', validFrom: row.validFrom, validTo: row.validTo, sourceTime: row.sourceTime, acquisitionTime: row.acquisitionTime },
    request.question,
    request.atInstant,
  );
  if (reading.answerable) return null;
  return { recordId: row.recordId, served: false, disclosure: null, refusedAt: 'QUESTION', payload: null, because: reading.because };
}

function shape(row: ServableRow, disclosure: Disclosure): RowOutcome {
  const provenance = {
    recordId: row.recordId, sourceId: row.sourceId, releaseProvenance: row.provenance,
    validFrom: row.validFrom, validTo: row.validTo, knownAt: row.knownAt,
    sourceTime: row.sourceTime, acquisitionTime: row.acquisitionTime, evidenceGrade: row.evidenceGrade,
  };
  return {
    recordId: row.recordId,
    served: true,
    disclosure,
    refusedAt: null,
    payload: disclosure === 'FULL' ? { ...provenance, content: row.content } : provenance,
    because: DISCLOSURE_MEANING[disclosure],
  };
}

/** Run one request against one licence over one release's rows. */
export function respond(request: ResponseRequest, licence: Licence, rows: readonly ServableRow[]): PipelineResponse {
  const outcomes = rows.map((row) =>
    estateRefusal(row)
    ?? rightsRefusal(row, licence, request)
    ?? admissibilityRefusal(row)
    ?? questionRefusal(row, request)
    ?? shape(row, licence.disclosure));

  const served = outcomes.filter((outcome) => outcome.served).length;
  const receiptDigest = `sha256:${createHash('sha256').update(canonicalJson({
    method: PIPELINE_METHOD,
    request,
    licence: { callerId: licence.callerId, permittedPurposes: [...licence.permittedPurposes].sort(), permittedSourceIds: [...licence.permittedSourceIds].sort(), disclosure: licence.disclosure },
    outcomes,
  })).digest('hex')}`;

  const byStage = STAGE_ORDER.map((stage) => [stage, outcomes.filter((outcome) => outcome.refusedAt === stage).length] as const).filter(([, count]) => count > 0);
  return {
    method: PIPELINE_METHOD,
    request,
    callerId: licence.callerId,
    outcomes,
    served,
    refused: outcomes.length - served,
    receiptDigest,
    because: `${served} of ${outcomes.length} served at ${licence.disclosure}${byStage.length ? `; refused at ${byStage.map(([stage, count]) => `${stage} (${count})`).join(', ')}` : ''}. A refusal is a result, and each one names the stage that made it.`,
  };
}

/**
 * The pipeline's own run, described as an artifact so the grader decides
 * whether it could be proved — rather than this module claiming it could.
 */
export function executionArtifact(request: ResponseRequest, licence: Licence, response: PipelineResponse): ComputationArtifact {
  return {
    artifactId: `response:${request.queryId}`,
    method: { id: PIPELINE_METHOD, version: request.policyVersion },
    executor: { id: 'notationsos.response-pipeline', version: request.policyVersion },
    // Every branch is a comparison over declared strings and instants; no
    // float enters the response path, which is what leaves the door open.
    arithmetic: 'FIXED_POINT',
    // References are the content addresses themselves, not notation:// names.
    // The grader was right to refuse those: an identity URI names a thing
    // whose content can change, and a later reader needs the bytes.
    inputs: [request, licence, request.releaseId].map((value, index) => {
      const digest = `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
      return { id: ['request', 'licence', 'release'][index], digest, reference: digest };
    }),
    outputDigest: response.receiptDigest,
  };
}

/** Proof-eligibility is not asserted here; it is the grade the card gives. */
export function proofEligibility(request: ResponseRequest, licence: Licence, response: PipelineResponse): CardVerdict {
  return cardGrade(executionArtifact(request, licence, response));
}

export const PIPELINE_LOSS = [
  'The estates are refused before rights are read, because no licence reaches them and checking them after a licence would imply one could. A fully permitted caller is still refused there.',
  'A refusal is a result, never an error and never silence. It names the stage and the reason, so a caller who cannot have the substance is still told the shape of the wall.',
  'Provenance-only disclosure serves existence and grade without content. It is not a weaker answer to the same question; it is the answer to a different one, and a caller must not read it as the record.',
  'A demonstration row can never be served as corpus state, whatever a licence permits. The pages may show it; an answer may not carry it.',
  'The receipt says the declared policy ran and produced this. It does not say the policy was the right policy, or that the release it ran over was complete — a perfect mirror of the policy, not of the obligation.',
  'Nothing here generates a proof. The pipeline is deterministic over pinned inputs, which is what a guest would need, and whether that holds is the grade the card gives rather than a claim this module makes.',
] as const;
