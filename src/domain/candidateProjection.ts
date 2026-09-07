/**
 * From what the rail produces to what the gate rules on.
 *
 * The two halves were never joined. The normalization rail ends at a candidate
 * that is *entity-shaped* — one source record with N named fields — and the
 * admission gate begins at a candidate that is *assertion-shaped*: one subject,
 * one predicate, one value. Nothing in the repository converted between them,
 * so the gate's only inputs were hand-written JSON read by the CLI. A rail that
 * cannot reach the gate is a rail that ends in a file somebody types.
 *
 * The arity is the substance of it. One carrier record with three fields is
 * three claims about one subject, and they are admitted or refused separately:
 * a legal name that resolves and an operating site that does not are different
 * facts with different evidence, and a gate that took them as one lump would be
 * ruling on the lump.
 *
 * WHAT THIS REFUSES TO INVENT
 *
 * Three things the rail does not carry, and none of them is guessed here.
 *
 * The predicate. A field is called `legalName` and a corpus predicate is called
 * something the corpus decided; deriving one from the other is this system
 * inventing vocabulary, which it has already had to unpick twice. Callers
 * declare the mapping and a field with no declared predicate is skipped with
 * that as the reason.
 *
 * The canonical subject. Both rail candidates state `identity.state:
 * 'UNRESOLVED'` and `canonicalId: null`, which is the rail being honest about a
 * step nobody has run. That null is carried through rather than filled, so the
 * gate refuses on SUBJECT_IDENTIFIED — which is the correct outcome and the
 * whole point: identity resolution is an absent stage, and a projection that
 * papered over it would move the fabrication one hop upstream.
 *
 * The evidence class, the origin, the provenance class, the source clock and
 * the rights decision. These come from the source registration and the rights
 * schedule, not from the parse, so the caller supplies them as a declared
 * context. A projection that defaulted them would be deciding admissibility
 * while pretending to be a format conversion.
 *
 * AND WHAT IT SKIPS
 *
 * A field with no value produces no candidate. An omitted field, an explicit
 * null and a field the adapter listed as missing are all absences, and an
 * absence is not a claim of nothing — it is the lack of a claim. Emitting an
 * empty assertion would make the corpus assert that a carrier's operating site
 * is nothing, which no source said.
 */
import type { AdmissionCandidate } from './admission';

/** What the rail cannot supply and the parse must not decide. */
export interface DeclaredContext {
  /** Epistemic origin as the producer declared it. */
  origin: string | null;
  evidenceClass: { claimStrength: string | null; productionClass: string | null; interest: string | null } | null;
  provenanceClass: 'LIVE_CAPTURE' | 'BACKFILLED' | null;
  /** When the source published it. Not the capture time and not derivable from it. */
  sourceTime: string | null;
  rightsDecision: 'PERMITTED' | 'PROHIBITED' | 'UNDECIDED' | null;
  conditions: readonly string[];
  /** Field name to corpus predicate. Declared, never derived from the field name. */
  predicateFor: Readonly<Record<string, string>>;
}

/** The rail's shape, reduced to what a projection needs. Both candidate kinds fit it. */
export interface RailCandidate {
  candidateId: string;
  buildId?: string | null;
  identity: { sourceRecordId: string; canonicalId: string | null };
  knownAt: string;
  capturedAt: string | null;
  artifactDigest: string | null;
  /**
   * World time, as the rail established it — or did not.
   *
   * UNOBSERVED is the census adapter's own answer, which it spells
   * NOT_ESTABLISHED_BY_SNAPSHOT: a snapshot says what a register held when it
   * was read, not when the fact became true in the world. Carried through as
   * null so the gate refuses on BOTH_CLOCKS, because establishing valid time is
   * a second absent stage and filling it here would hide that.
   */
  validTime: { state: 'UNOBSERVED'; from: null } | { state: 'OBSERVED'; from: string };
  /** One entry per field the adapter parsed, in declaration order. */
  claims: ReadonlyArray<{ field: string; value: string | number | null; unit?: string | null; basis?: string | null }>;
}

export interface SkippedField {
  field: string;
  because: string;
}

export interface Projection {
  candidates: AdmissionCandidate[];
  skipped: SkippedField[];
  because: string;
}

const stated = (value: string | number | null | undefined): boolean =>
  value !== null && value !== undefined && !(typeof value === 'string' && value.trim() === '');

/**
 * Pure: one rail candidate becomes one admission candidate per stated field.
 *
 * Nothing is defaulted and nothing is derived. What the rail does not carry,
 * the context supplies or the field is skipped.
 */
export function projectToCandidates(rail: RailCandidate, context: DeclaredContext): Projection {
  const candidates: AdmissionCandidate[] = [];
  const skipped: SkippedField[] = [];

  for (const claim of rail.claims) {
    if (!stated(claim.value)) {
      skipped.push({ field: claim.field, because: 'The field states no value. An omitted field is the lack of a claim rather than a claim of nothing, and an empty assertion would have the corpus asserting something no source said.' });
      continue;
    }
    const predicate = context.predicateFor[claim.field];
    if (!stated(predicate)) {
      skipped.push({ field: claim.field, because: `No predicate is declared for ${claim.field}. Deriving one from the field name would be this system inventing vocabulary, so the field is skipped rather than guessed.` });
      continue;
    }
    candidates.push({
      // One candidate per claim, so each is ruled on separately: two fields of
      // one record can be admitted and refused independently.
      candidateId: `${rail.candidateId}#${claim.field}`,
      buildId: rail.buildId ?? null,
      recordId: `${rail.candidateId}#${claim.field}`,
      // Carried through as the rail states it. Null here means identity
      // resolution has not run, and the gate refuses on it — correctly.
      subjectCanonicalId: rail.identity.canonicalId,
      assertion: {
        subjectId: rail.identity.sourceRecordId,
        predicate,
        value: claim.value,
        ...(stated(claim.unit) ? { unit: claim.unit as string } : {}),
        ...(stated(claim.basis) ? { basis: claim.basis as string } : {}),
      },
      origin: context.origin,
      evidenceClass: context.evidenceClass,
      provenance: { artifactDigest: rail.artifactDigest, capturedAt: rail.capturedAt },
      provenanceClass: context.provenanceClass,
      sourceTime: context.sourceTime,
      conditions: context.conditions,
      validFrom: rail.validTime.state === 'OBSERVED' ? rail.validTime.from : null,
      knownAt: rail.knownAt,
      rightsDecision: context.rightsDecision,
    });
  }

  const absent = [
    rail.identity.canonicalId === null ? 'identity is unresolved, so the gate refuses on SUBJECT_IDENTIFIED' : null,
    rail.validTime.state === 'UNOBSERVED' ? 'world time was never established — a snapshot says what a register held when it was read, not when the fact became true — so the gate refuses on BOTH_CLOCKS' : null,
  ].filter((entry): entry is string => entry !== null);

  return {
    candidates,
    skipped,
    because: `${candidates.length} of ${rail.claims.length} fields became candidates; ${skipped.length} were skipped. Each field is ruled on separately, so two claims from one record can be admitted and refused independently.${absent.length ? ` The rail states that ${absent.join(', and that ')}. Those are absent stages showing through rather than defects in this projection, and filling either of them here would move the fabrication one hop upstream.` : ''}`,
  };
}

/** A carrier candidate's fields, in declaration order, with the adapter's missing list honoured. */
export function carrierClaims(
  fields: Readonly<Record<string, string | undefined>>,
  missingFields: readonly string[] = [],
): RailCandidate['claims'] {
  const missing = new Set(missingFields);
  return Object.keys(fields).map((field) => ({
    field,
    value: missing.has(field) ? null : (fields[field] ?? null),
    unit: null,
    basis: null,
  }));
}

/** A census candidate's fields, where presence and unit are already stated per field. */
export function censusClaims(
  fields: Readonly<Record<string, { value: string | number | null; unit: string | null; presence: 'PRESENT' | 'EXPLICIT_NULL' | 'OMITTED'; interpretation?: string }>>,
): RailCandidate['claims'] {
  return Object.keys(fields).map((field) => {
    const entry = fields[field];
    return {
      field,
      // An explicit null and an omission are both absences here. They differ
      // upstream and the difference is retained there; neither is a claim.
      value: entry.presence === 'PRESENT' ? entry.value : null,
      unit: entry.unit,
      basis: entry.interpretation ?? null,
    };
  });
}

/** What this projection does not do, so a reader does not assume the rail now reaches the corpus. */
export const PROJECTION_LOSS = [
  'It converts a shape. It does not resolve identity, decide rights, classify evidence or acquire anything, and it refuses to supply any of them.',
  'Every candidate it produces over a rail candidate with unresolved identity is refused by the gate on SUBJECT_IDENTIFIED, and every one over a candidate whose world time was never observed is refused on BOTH_CLOCKS. Those are the correct outcomes: identity resolution and valid-time establishment are two absent stages, and this is where their absence becomes visible rather than assumed away.',
  'A field with no declared predicate is skipped rather than named by convention. The mapping is a decision about vocabulary and belongs to whoever owns the vocabulary.',
  'One record becoming several candidates is deliberate. They are admitted or refused separately, because a legal name that resolves and a site that does not are different facts.',
] as const;
