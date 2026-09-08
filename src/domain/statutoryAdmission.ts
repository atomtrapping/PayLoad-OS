/**
 * The statutory rail's second half: extracted fields become candidates, and the
 * gate rules on them.
 *
 * This is the first rail in the repository that can reach ADMITTED, and the
 * reason is worth stating plainly because it is not that the gate was relaxed.
 *
 * `candidateProjection` documents two absent stages. The census rail's
 * candidates are refused on SUBJECT_IDENTIFIED, because a company name is not
 * an issued identifier and nothing binds it to a canonical subject; and on
 * BOTH_CLOCKS, because a snapshot of a register establishes when it was read
 * and not when the fact became true. Neither refusal was a defect in the
 * projection. They were two missing stages showing through.
 *
 * A regulator's filing supplies both, and supplies them as testimony rather
 * than as inference:
 *
 * The order names an NAIC company code, which the National Association of
 * Insurance Commissioners issues. That is an issued identifier in the sense
 * `identityResolution` requires, so a registration can bind it to a canonical
 * subject and resolution is a lookup against evidence rather than a guess at a
 * name.
 *
 * The order declares its own effective date. That is
 * SOURCE_DECLARED_EFFECTIVE — the one kind of time evidence `worldTime`
 * resolves cleanly — because the regulator is stating when its own rule takes
 * legal effect, which is the one question a regulator is authoritative on.
 *
 * So the statutory rail reaches the gate with both clocks and a resolved
 * subject, and passes on the merits. Nothing here weakens a check, and the
 * specimens deliberately include filings that fail: one whose subject is a
 * class of insurers rather than a named one, and one whose effective date is
 * conditioned on an event rather than stated as a time. Both are refused, and
 * both refusals are the correct reading of the document.
 *
 * WHAT IS A CLAIM AND WHAT IS NOT
 *
 * Five of the ten extracted fields become claims about the carrier. The other
 * five are not claims and are never admitted as ones:
 *
 * The NAIC code and the carrier name are identity, consumed by resolution.
 * The effective date is valid time and the signature date is source time; both
 * are clocks, and a clock admitted as an assertion would be the corpus claiming
 * that a carrier's effective date is a fact about the carrier rather than the
 * coordinate of one.
 * The order reference is the basis, and it travels onto every claim so a reader
 * of any single row can name the document it came from.
 *
 * ONE FILING IS SEVERAL RECORDS
 *
 * A consent order that withdraws a carrier from a line, at a peril, over a
 * stated number of policies, is not one fact. It is several facts about one
 * subject, and they are ruled on separately: a filing type that reads cleanly
 * and a capacity reduction the grammar could not parse are admitted and refused
 * independently, which is the arity `candidateProjection` exists to preserve.
 */
import { createHash } from 'node:crypto';
import { canonicalJson } from '@/fixtures/digest';
import {
  admit,
  admittedRow,
  isAdmitting,
  type AdmissionCandidate,
  type AdmissionRuling,
  type AdmittedRow,
} from './admission';
import { projectToCandidates, type DeclaredContext, type RailCandidate } from './candidateProjection';
import { resolveSubject, type OfferedIdentifier, type Registration, type Resolution } from './identityResolution';
import { establishWorldTime, type WorldTime } from './worldTime';
import { fieldOf, type StatutoryExtraction } from './statutoryHarvest';
// The two as-of questions live in a Node-free module so the workspace can ask
// them in the browser against this exact implementation rather than a copy.
export { serveAdmittedAsOf, serveInForceAsOf } from './statutoryServing';
import type { ISODateTime } from './types';

export const STATUTORY_ADMISSION_METHOD = 'notationsos.statutory-admission.v1';

export const STATUTORY_BUILD_CONTRACT = Object.freeze({
  id: 'payload.statutory-candidate-build.v1',
  version: '1.0.0',
  domain: 'INSURABILITY',
  recordType: 'StatutoryFilingAssertion',
  knowledgeTime: 'EXTRACTION_KNOWN_AT_LE_KNOWN_THROUGH',
  validTime: 'SOURCE_DECLARED_EFFECTIVE_OR_REFUSED',
  identityResolution: 'ISSUED_NAIC_COMPANY_CODE_ONLY',
  sourceClock: 'REGULATOR_SIGNATURE_DATE',
  claimArity: 'ONE_CANDIDATE_PER_STATED_FIELD',
  admissionAuthority: 'DECLARED_BY_CALLER_NEVER_THE_METHOD',
  completenessClaimed: false,
  sourceTruthClaimed: false,
} as const);

/**
 * Field to corpus predicate. Declared here because vocabulary is a decision,
 * and `candidateProjection` refuses to derive one from a field name. A field
 * with no entry is not a claim and produces no candidate.
 */
export const STATUTORY_PREDICATE: Readonly<Record<string, string>> = Object.freeze({
  filingType: 'insurability:regulatoryActionType',
  lineOfBusiness: 'insurability:lineOfBusiness',
  primaryPeril: 'insurability:primaryPeril',
  policiesImpacted: 'insurability:policiesAffectedCount',
  capacityReductionPct: 'insurability:capacityReductionPercent',
});

/** Fields consumed as identity, clocks or basis. Never admitted as assertions. */
export const NON_ASSERTION_FIELDS = Object.freeze({
  carrierNaic: 'Identity. Consumed by resolution; a subject key is not a claim about the subject.',
  carrierName: 'Identity, and not an issued one. Offered to the resolver, which sets it aside.',
  effectiveDate: 'Valid time. A coordinate of the claims, not a claim.',
  issuedDate: 'Source time. When the regulator published, which is the third clock and not an assertion.',
  orderReference: 'Basis. Travels onto every claim so a reader of one row can name the document.',
});

/** What the parse cannot decide, supplied by whoever owns the source registration. */
export interface StatutoryContext {
  origin: string;
  evidenceClass: { claimStrength: string; productionClass: string; interest: string };
  provenanceClass: 'LIVE_CAPTURE' | 'BACKFILLED';
  rightsDecision: 'PERMITTED' | 'PROHIBITED' | 'UNDECIDED';
  conditions: readonly string[];
}

export interface StatutoryBuildRequest {
  schema: typeof STATUTORY_BUILD_CONTRACT.id;
  buildId: string;
  /** The build's knowledge horizon. An extraction knowable later is excluded, not held. */
  knownThrough: ISODateTime;
  context: StatutoryContext;
}

/** One filing's passage from extraction to candidates, with both adjudications kept. */
export interface StatutoryMember {
  extractionId: string;
  captureId: string;
  jurisdiction: StatutoryExtraction['jurisdiction'];
  artifactDigest: string;
  knownAt: ISODateTime;
  /** Subject resolution, with the registrations that decided it. */
  identity: Resolution;
  /**
   * World time as the filing establishes it, or refuses to.
   *
   * This rail produces ESTABLISHED or REFUSED and never a bracket: a bracket
   * comes from re-reading a register that changed between reads, and a filing
   * is a document that is issued once rather than a register. The bracket
   * branch below is still handled rather than assumed away, and a test asserts
   * the absence so a reader does not go looking for one.
   */
  worldTime: WorldTime;
  /** The regulator's own publication instant, or null when the document did not state one readably. */
  sourceTime: ISODateTime | null;
  candidates: AdmissionCandidate[];
  skipped: Array<{ field: string; because: string }>;
  because: string;
}

export interface StatutoryCandidateBuild {
  schema: typeof STATUTORY_BUILD_CONTRACT.id;
  buildId: string;
  state: 'UNADMITTED';
  knownThrough: ISODateTime;
  contractDigest: string;
  members: StatutoryMember[];
  /** Extractions the cutoff excluded, named so their absence is visible. */
  excluded: Array<{ extractionId: string; knownAt: ISODateTime; because: string }>;
  candidateCount: number;
  because: string;
}

export interface StatutoryAdmissionReceipt {
  schema: 'payload.statutory-admission-receipt.v1';
  receiptId: string;
  method: typeof STATUTORY_ADMISSION_METHOD;
  contract: typeof STATUTORY_BUILD_CONTRACT;
  buildId: string;
  authority: string;
  ruledAt: ISODateTime;
  knownThrough: ISODateTime;
  counts: {
    extractions: number;
    excludedByCutoff: number;
    candidates: number;
    admitted: number;
    refused: number;
    rows: number;
  };
  /** Every failed check across the build, tallied, so the common refusal is visible. */
  refusalTally: Array<{ check: string; count: number }>;
  rulings: AdmissionRuling[];
  rows: AdmittedRow[];
  receiptDigest: string;
  because: string;
}

/**
 * One canonicalization, and it is the corpus's.
 *
 * This used to be `JSON.stringify(value)` — key-order dependent. Two objects
 * with the same content, built by different code paths or by the same path
 * after a field was moved, digest differently. That is not a content address;
 * it is a hash of one serializer's traversal order. Six other modules already
 * hash through `canonicalJson`, which sorts keys recursively and drops
 * undefined, so a repository whose thesis is reproducibility was running two
 * digest disciplines at once.
 */
const digestOf = (value: unknown): string =>
  `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;

const CONTRACT_DIGEST = digestOf(STATUTORY_BUILD_CONTRACT);

/**
 * The claims one filing makes about its carrier, in declared order.
 *
 * Only fields with a declared predicate are offered. A field the grammar could
 * not read carries null, which the projection skips: unreadable is not a value,
 * and admitting one would have the corpus assert what the document did not say
 * legibly.
 */
function claimsOf(extraction: StatutoryExtraction, basis: string | null): RailCandidate['claims'] {
  return Object.keys(STATUTORY_PREDICATE).map((field) => {
    const entry = fieldOf(extraction, field);
    return {
      field,
      value: entry?.presence === 'PRESENT' ? entry.value : null,
      unit: field === 'capacityReductionPct' ? 'percent' : null,
      basis,
    };
  });
}

/**
 * The time evidence one filing offers.
 *
 * A stated effective date is the regulator declaring when its own rule takes
 * legal effect. Anything else — absent, unreadable, or stated twice — leaves
 * only the fact that this system read the document at a moment, which
 * establishes when it was read and refuses to say more.
 */
function timeEvidenceOf(extraction: StatutoryExtraction): WorldTime {
  const effective = fieldOf(extraction, 'effectiveDate');
  if (effective?.presence === 'PRESENT' && typeof effective.value === 'string') {
    return establishWorldTime({ kind: 'SOURCE_DECLARED_EFFECTIVE', at: effective.value, declaredBy: extraction.regulator });
  }
  return establishWorldTime({ kind: 'SNAPSHOT_READ', at: extraction.capturedAt, register: `${extraction.regulator} filing ${extraction.captureId}` });
}

/** What the filing offers as a way of naming its subject, including what is not an identifier. */
function offeredIdentifiers(extraction: StatutoryExtraction): OfferedIdentifier[] {
  const offered: OfferedIdentifier[] = [];
  const naic = fieldOf(extraction, 'carrierNaic');
  if (naic?.presence === 'PRESENT' && naic.value !== null) offered.push({ family: 'NAIC', value: String(naic.value) });
  const name = fieldOf(extraction, 'carrierName');
  if (name?.presence === 'PRESENT' && name.value !== null) offered.push({ family: 'NOT_AN_IDENTIFIER', value: String(name.value) });
  return offered;
}

/**
 * Pure: extractions become admission candidates under a declared knowledge
 * horizon.
 *
 * Resolution runs as of `knownThrough` rather than as of each filing's own
 * knowledge time, because that is the horizon this build declares it holds: a
 * registration learned after a filing still legitimately resolves it, and a
 * build that resolved at each filing's instant would answer a question nobody
 * asked. The bound is stated on every resolution so a replay can reproduce it.
 */
export function buildStatutoryCandidates(
  extractions: readonly StatutoryExtraction[],
  registry: readonly Registration[],
  request: StatutoryBuildRequest,
): StatutoryCandidateBuild {
  const members: StatutoryMember[] = [];
  const excluded: StatutoryCandidateBuild['excluded'] = [];

  for (const extraction of extractions) {
    if (extraction.knownAt > request.knownThrough) {
      excluded.push({
        extractionId: extraction.extractionId,
        knownAt: extraction.knownAt,
        because: `Knowable at ${extraction.knownAt}, after this build's horizon of ${request.knownThrough}. Excluded rather than held back: a build states what it knew, and including it would give the build hindsight it did not have.`,
      });
      continue;
    }

    const identity = resolveSubject(offeredIdentifiers(extraction), registry, request.knownThrough);
    const worldTime = timeEvidenceOf(extraction);
    const issued = fieldOf(extraction, 'issuedDate');
    const sourceTime = issued?.presence === 'PRESENT' && typeof issued.value === 'string' ? issued.value : null;
    const reference = fieldOf(extraction, 'orderReference');
    const basis = reference?.presence === 'PRESENT' && reference.value !== null ? String(reference.value) : null;

    const rail: RailCandidate = {
      candidateId: `${request.buildId}:${extraction.captureId}`,
      buildId: request.buildId,
      identity: {
        // The order reference is what the source called this filing. It is not
        // the canonical subject and is never written into that column.
        sourceRecordId: basis ?? extraction.captureId,
        canonicalId: identity.canonicalId,
      },
      knownAt: extraction.knownAt,
      capturedAt: extraction.capturedAt,
      artifactDigest: extraction.artifactDigest,
      // Anything short of ESTABLISHED reaches the projection as UNOBSERVED, so
      // the gate refuses on the clocks. That covers the case this rail does
      // produce — a filing whose effective date nobody stated readably — and
      // the bracket case it does not: `worldTime` holds that both ends of a
      // bracket are wrong as a valid-from and the midpoint is invented, so a
      // bracket may not be flattened into one here either.
      validTime: worldTime.outcome === 'ESTABLISHED' && worldTime.validFrom !== null
        ? { state: 'OBSERVED', from: worldTime.validFrom }
        : { state: 'UNOBSERVED', from: null },
      claims: claimsOf(extraction, basis),
    };

    const context: DeclaredContext = {
      origin: request.context.origin,
      evidenceClass: request.context.evidenceClass,
      provenanceClass: request.context.provenanceClass,
      sourceTime,
      rightsDecision: request.context.rightsDecision,
      conditions: request.context.conditions,
      predicateFor: STATUTORY_PREDICATE,
    };

    const projection = projectToCandidates(rail, context);
    members.push({
      extractionId: extraction.extractionId,
      captureId: extraction.captureId,
      jurisdiction: extraction.jurisdiction,
      artifactDigest: extraction.artifactDigest,
      knownAt: extraction.knownAt,
      identity,
      worldTime,
      sourceTime,
      candidates: projection.candidates,
      skipped: projection.skipped,
      because: `${identity.outcome} on identity, ${worldTime.outcome} on world time. ${projection.because}`,
    });
  }

  const candidateCount = members.reduce((total, member) => total + member.candidates.length, 0);
  return {
    schema: STATUTORY_BUILD_CONTRACT.id,
    buildId: request.buildId,
    state: 'UNADMITTED',
    knownThrough: request.knownThrough,
    contractDigest: CONTRACT_DIGEST,
    members,
    excluded,
    candidateCount,
    because: `${members.length} of ${extractions.length} extractions are within the horizon of ${request.knownThrough} and produced ${candidateCount} candidates; ${excluded.length} were excluded by the cutoff. The build is UNADMITTED: producing candidates is not admitting them, and nothing here rules on its own output.`,
  };
}

/**
 * Rule on every candidate in a build and return the receipt.
 *
 * The authority is the caller's and is checked by the gate: a build cannot
 * admit itself, and passing this method's own name is refused on
 * AUTHORITY_IS_NOT_THE_PROCESS.
 */
export function admitStatutoryBuild(
  build: StatutoryCandidateBuild,
  authority: string,
  ruledAt: ISODateTime,
): StatutoryAdmissionReceipt {
  const candidates = build.members.flatMap((member) => member.candidates);
  const rulings = candidates.map((candidate) => admit(candidate, authority, ruledAt));

  const rows: AdmittedRow[] = [];
  for (const ruling of rulings) {
    if (!isAdmitting(ruling.outcome)) continue;
    const candidate = candidates.find((entry) => entry.candidateId === ruling.candidateId)!;
    const { row } = admittedRow(candidate, ruling);
    if (row) rows.push(row);
  }

  const tally = new Map<string, number>();
  for (const ruling of rulings) {
    for (const failure of ruling.failed) tally.set(failure.check, (tally.get(failure.check) ?? 0) + 1);
  }
  const refusalTally = [...tally.entries()]
    .map(([check, count]) => ({ check, count }))
    .sort((a, b) => (b.count - a.count) || (a.check < b.check ? -1 : 1));

  const admitted = rulings.filter((ruling) => isAdmitting(ruling.outcome)).length;
  const counts = {
    extractions: build.members.length + build.excluded.length,
    excludedByCutoff: build.excluded.length,
    candidates: candidates.length,
    admitted,
    refused: rulings.length - admitted,
    rows: rows.length,
  };

  const body = {
    schema: 'payload.statutory-admission-receipt.v1' as const,
    method: STATUTORY_ADMISSION_METHOD as typeof STATUTORY_ADMISSION_METHOD,
    contract: STATUTORY_BUILD_CONTRACT,
    buildId: build.buildId,
    authority,
    ruledAt,
    knownThrough: build.knownThrough,
    counts,
    refusalTally,
    rulings,
    rows,
  };

  return {
    ...body,
    receiptId: `rcpt_statutory_${digestOf(body).slice(7, 23)}`,
    receiptDigest: digestOf(body),
    because: counts.candidates === 0
      ? 'No candidate reached the gate, so nothing was admitted and nothing was refused. An empty build is not a clean one.'
      : `${counts.admitted} of ${counts.candidates} candidates admitted by ${authority}, ${counts.refused} refused${refusalTally.length ? ` (most often on ${refusalTally[0].check}, ${refusalTally[0].count} times)` : ''}. Admission says these candidates may become versions; it does not say the filings are true, and a refused candidate stays on the rail with its reasons rather than being deleted.`,
  };
}

export const STATUTORY_ADMISSION_LOSS = [
  'Admitting a filing says the regulator published it and this system read it correctly. It does not say the carrier will do what the order says, or that the order will survive appeal.',
  'This is the first rail here that reaches ADMITTED, and not because any check was relaxed. A filing supplies an issued NAIC code and declares its own effective date, so the two stages the census rail was missing are present as testimony rather than as inference.',
  'A filing addressed to a class of insurers has no usable identifier and is refused. The corpus has no subject for "all admitted carriers writing in the affected ZIP codes", and inventing one would manufacture a party.',
  'An effective date conditioned on an event is a condition, not a time. It is refused on the clocks rather than converted into an instant the document never stated.',
  'Five extracted fields are claims and five are not. A clock admitted as an assertion would make a coordinate into a fact about the subject.',
  'The knowledge-time query is not a valid-time query. What was knowable by a date and what was in force on a date are different questions, and they are served by different functions here on purpose.',
] as const;
