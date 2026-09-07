/**
 * The statutory filing harvester, served.
 *
 * `/api/v1/insurability/filings` reports `admitted: 0, synthetic: N`, because
 * nothing statutory had ever crossed the admission gate. This route is the
 * other half: capture, extract, build, admit, serve — with the gate in the
 * middle rather than beside it.
 *
 * GET runs the drafted specimens and serves what the corpus holds as of a
 * knowledge instant. The rows it returns crossed the gate on all ten checks;
 * the bytes they descend from are specimens drafted in this repository. Both
 * facts are in the payload, because either one alone would mislead.
 *
 * POST runs the same pipeline over bytes the caller supplies. It does not
 * fetch, and there is no parameter that would make it: collecting against a
 * regulator is the operator's act under the operator's credentials. It also
 * refuses to name its own authority or decide its own rights — both must be
 * declared in the request, and a request without them is refused rather than
 * defaulted.
 */
import { NextRequest } from 'next/server';
import { json, refusal } from '../../_lib';
import {
  HARVEST_LOSS,
  JURISDICTION_GRAMMAR,
  JURISDICTION_IDS,
  type CaptureDeclaration,
} from '@/domain/statutoryHarvest';
import {
  STATUTORY_ADMISSION_LOSS,
  STATUTORY_BUILD_CONTRACT,
  STATUTORY_PREDICATE,
  type StatutoryContext,
} from '@/domain/statutoryAdmission';
import { reportHarvest, runHarvest, runSpecimenHarvest } from '@/adapter/statutoryHarvester';
import { STATUTORY_SPECIMENS } from '@/fixtures/insurability/statutoryFilings';
import type { Registration } from '@/domain/identityResolution';

export const MAX_DOCUMENTS = 32;
export const MAX_DOCUMENT_BYTES = 512 * 1024;

const SURFACE = {
  schema: 'payload.insurability.harvester.v1',
  contract: STATUTORY_BUILD_CONTRACT,
  stages: ['CAPTURE', 'EXTRACT', 'CANDIDATE_BUILD', 'ADMIT', 'SERVE'],
  jurisdictions: JURISDICTION_IDS.map((id) => ({
    id,
    regulator: JURISDICTION_GRAMMAR[id].regulator,
    stateCode: JURISDICTION_GRAMMAR[id].stateCode,
    labels: JURISDICTION_GRAMMAR[id].fields.map((rule) => ({ field: rule.field, label: rule.label, kind: rule.kind })),
  })),
  predicates: STATUTORY_PREDICATE,
  collection: {
    performed: false,
    detail: 'This route never fetches. Capture takes bytes the caller supplies and there is no parameter that would make it reach a regulator, because collecting against a source is the operator’s act under the operator’s credentials and their reading of the source’s terms.',
  },
  loss: [...HARVEST_LOSS, ...STATUTORY_ADMISSION_LOSS],
} as const;

/**
 * The specimen run, served as of a knowledge instant.
 *
 * `?asOf=` bounds what the corpus knew; `?inForceAt=` additionally bounds what
 * was in force in the world. They are different questions and the payload keeps
 * them apart: an order knowable in February and effective in April is in the
 * first answer for March and out of the second.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const asOf = searchParams.get('asOf') ?? new Date().toISOString();
  const inForceAt = searchParams.get('inForceAt');
  if (!Number.isFinite(Date.parse(asOf))) {
    return refusal(400, 'UNREADABLE_AS_OF', `asOf=${asOf} is not a readable instant.`, 'Supply asOf as an ISO 8601 instant, or omit it for now.');
  }
  if (inForceAt !== null && !Number.isFinite(Date.parse(inForceAt))) {
    return refusal(400, 'UNREADABLE_IN_FORCE_AT', `inForceAt=${inForceAt} is not a readable instant.`, 'Supply inForceAt as an ISO 8601 instant, or omit it to ask the knowledge-time question alone.');
  }

  const ran = runSpecimenHarvest();

  return json({
    ...SURFACE,
    mode: 'DRAFTED_SPECIMEN_DEMONSTRATION',
    specimens: STATUTORY_SPECIMENS.map((entry) => ({ captureId: entry.declaration.captureId, jurisdiction: entry.declaration.jurisdiction, demonstrates: entry.demonstrates })),
    ...reportHarvest(ran, asOf, inForceAt),
  });
}

/**
 * Run the pipeline over supplied bytes.
 *
 * Authority and rights context are required and never defaulted: this route
 * cannot name its own authority (the gate refuses that) and will not decide
 * whether a caller may use a source.
 */
export async function POST(req: NextRequest) {
  let body: {
    documents?: Array<{ declaration: CaptureDeclaration; text: string }>;
    registry?: Registration[];
    buildId?: string;
    knownThrough?: string;
    context?: StatutoryContext;
    authority?: string;
    ruledAt?: string;
    asOf?: string;
    inForceAt?: string;
  };
  try {
    const text = await req.text();
    body = text.trim().length > 0 ? JSON.parse(text) : {};
  } catch {
    return refusal(400, 'UNREADABLE_BODY', 'The request body is not readable JSON.', 'Send a JSON object with documents, buildId, knownThrough, context and authority.');
  }

  const documents = body.documents;
  if (!Array.isArray(documents) || documents.length === 0) {
    return refusal(400, 'NO_DOCUMENTS', 'No documents were supplied.', 'Send documents: [{ declaration, text }]. This route never fetches; the bytes come from the caller.');
  }
  if (documents.length > MAX_DOCUMENTS) {
    return refusal(413, 'TOO_MANY_DOCUMENTS', `${documents.length} documents exceeds the limit of ${MAX_DOCUMENTS}.`, `Send at most ${MAX_DOCUMENTS} documents per build.`);
  }
  for (const document of documents) {
    if (typeof document?.text !== 'string' || Buffer.byteLength(document.text, 'utf-8') > MAX_DOCUMENT_BYTES) {
      return refusal(413, 'DOCUMENT_TOO_LARGE', `Each document must carry text of at most ${MAX_DOCUMENT_BYTES} bytes.`, 'Split the capture, or supply the machine-readable header block alone.');
    }
  }

  const authority = typeof body.authority === 'string' ? body.authority.trim() : '';
  if (authority === '') {
    return refusal(422, 'NO_AUTHORITY_NAMED', 'The request names no admission authority.', 'Send authority: "<the party ruling on these candidates>". Admission is an act with an author, and this route will not name itself.');
  }
  const context = body.context;
  if (!context || typeof context !== 'object' || typeof context.rightsDecision !== 'string' || typeof context.origin !== 'string' || !context.evidenceClass || typeof context.provenanceClass !== 'string') {
    return refusal(422, 'NO_DECLARED_CONTEXT', 'The request declares no origin, evidence class, provenance class or rights decision.', 'Send context: { origin, evidenceClass: { claimStrength, productionClass, interest }, provenanceClass, rightsDecision, conditions }. This route will not decide whether you may use a source.');
  }
  const knownThrough = typeof body.knownThrough === 'string' ? body.knownThrough : '';
  if (!Number.isFinite(Date.parse(knownThrough))) {
    return refusal(422, 'NO_KNOWLEDGE_HORIZON', 'The request states no readable knownThrough.', 'Send knownThrough as an ISO 8601 instant. A build states what it knew, so the horizon is required rather than assumed to be now.');
  }
  const buildId = typeof body.buildId === 'string' && body.buildId.trim() !== '' ? body.buildId.trim() : '';
  if (buildId === '') {
    return refusal(422, 'NO_BUILD_ID', 'The request names no buildId.', 'Send buildId: "<a name for this build>", so its candidates can be traced back to it.');
  }

  const ruledAt = typeof body.ruledAt === 'string' && Number.isFinite(Date.parse(body.ruledAt)) ? body.ruledAt : new Date().toISOString();
  const asOf = typeof body.asOf === 'string' && Number.isFinite(Date.parse(body.asOf)) ? body.asOf : ruledAt;
  const inForceAt = typeof body.inForceAt === 'string' && Number.isFinite(Date.parse(body.inForceAt)) ? body.inForceAt : null;
  const registry = Array.isArray(body.registry) ? body.registry : [];

  const ran = runHarvest(documents, registry, buildId, knownThrough, context, authority, ruledAt);

  return json({
    ...SURFACE,
    mode: 'SUPPLIED_BYTES',
    buildId,
    registrySize: registry.length,
    registryNote: registry.length === 0
      ? 'No NAIC registrations were supplied, so every subject stays UNRESOLVED and every candidate is refused on SUBJECT_IDENTIFIED. That is the registry being empty, not the filings being wrong.'
      : `${registry.length} registrations supplied; resolution is bounded by the build horizon of ${knownThrough}.`,
    ...reportHarvest(ran, asOf, inForceAt),
  });
}
