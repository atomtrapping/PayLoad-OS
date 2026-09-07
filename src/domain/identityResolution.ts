/**
 * Turning what a source called a thing into what the corpus calls it.
 *
 * The rails end with `identity.state: 'UNRESOLVED'` and `canonicalId: null`, and
 * the gate refuses on that, correctly. This is the stage that was missing —
 * written as an adjudication rather than a lookup, because the difference is
 * where entity resolution goes wrong.
 *
 * A lookup finds the closest thing and returns it. An adjudication says what
 * evidence entitles it to claim two names are one subject, and refuses when it
 * has none. The corpus never merges on similarity: two carriers called Blue
 * Anchor Logistics are two names, and a system that joined them because the
 * strings match would have manufactured a subject nobody registered.
 *
 * So resolution happens on **issued identifiers** and nothing else. An
 * identifier belongs to a family with a named issuer — USDOT to the FMCSA, IMO
 * to the IMO, LEI to GLEIF — and a registration binds one of those to a
 * canonical subject on evidence, at a stated instant. Resolving is finding that
 * registration. Failing to find one is UNRESOLVED, which is a fact about the
 * registry rather than about the world, and never an invitation to guess.
 *
 * THREE REFUSALS
 *
 * A name is not an identifier. Fields whose family is NOT_AN_IDENTIFIER are
 * rejected as resolution keys however distinctive they look, because
 * distinctiveness is not issuance.
 *
 * Two registrations disagreeing is AMBIGUOUS, and ambiguity is refused rather
 * than broken by a rule. Picking the newer, the longer or the first would be
 * the resolver deciding an identity question on a tiebreak nobody agreed to.
 *
 * A registration not knowable at the asked-for instant is not used. Resolution
 * is bitemporal like everything else: what this system could resolve in March
 * is not what it can resolve now, and a replay that used today's registry would
 * reconstruct a past it did not have.
 */
import type { ISODateTime } from './types';

export const RESOLUTION_METHOD = 'notationsos.identity-resolution.v1';

/**
 * A family whose issuer is named, or the explicit marker that a field is not an
 * identifier at all. The second is not an oversight — it is the value that
 * stops a name being used as a key.
 */
export type IdentifierFamilyId = 'USDOT' | 'IMO' | 'MMSI' | 'LEI' | 'LOT' | 'NOT_AN_IDENTIFIER';

export const FAMILY_ISSUER: Record<IdentifierFamilyId, string> = {
  USDOT: 'FMCSA',
  IMO: 'International Maritime Organization',
  MMSI: 'ITU',
  LEI: 'GLEIF',
  LOT: 'Operator, in the demonstration corpus',
  NOT_AN_IDENTIFIER: 'Nobody. A name, a description or a label, which no authority issued and which resolves nothing.',
};

/** What a source offered as a way of naming the subject. */
export interface OfferedIdentifier {
  family: IdentifierFamilyId;
  value: string;
}

/** A binding of one issued identifier to a canonical subject, on evidence. */
export interface Registration {
  family: IdentifierFamilyId;
  value: string;
  canonicalId: string;
  /** When this binding became knowable to the corpus. A later one is not used in an earlier replay. */
  knownAt: ISODateTime;
  /** The record that established it. A registration without one is not a registration. */
  evidenceRecordId: string;
}

export type ResolutionOutcome = 'RESOLVED' | 'UNRESOLVED' | 'AMBIGUOUS' | 'NO_USABLE_IDENTIFIER';

export interface Resolution {
  outcome: ResolutionOutcome;
  canonicalId: string | null;
  /** The registrations that decided it, so a dispute begins at the evidence. */
  on: Registration[];
  /** Identifiers offered that could not be used, and why. */
  setAside: Array<{ offered: OfferedIdentifier; because: string }>;
  because: string;
}

/**
 * Pure: resolve a subject from the identifiers a source offered, against the
 * registrations knowable at an instant.
 *
 * Never guesses, never merges on similarity, and refuses ambiguity rather than
 * breaking it.
 */
export function resolveSubject(
  offered: readonly OfferedIdentifier[],
  registry: readonly Registration[],
  knownBy: ISODateTime,
): Resolution {
  const setAside: Resolution['setAside'] = [];
  const usable: OfferedIdentifier[] = [];

  for (const candidate of offered) {
    if (candidate.family === 'NOT_AN_IDENTIFIER') {
      setAside.push({ offered: candidate, because: 'Not an issued identifier. A name is distinctive, not issued, and the corpus does not merge on similarity however well two strings match.' });
      continue;
    }
    if (candidate.value.trim() === '') {
      setAside.push({ offered: candidate, because: 'The identifier is empty, so there is nothing to look up.' });
      continue;
    }
    usable.push(candidate);
  }

  if (usable.length === 0) {
    return {
      outcome: 'NO_USABLE_IDENTIFIER', canonicalId: null, on: [], setAside,
      because: `Nothing offered is an issued identifier${setAside.length ? `: ${setAside.map((s) => s.offered.family).join(', ')}` : ''}. The subject stays unresolved, which is a fact about what the source supplied rather than about the world.`,
    };
  }

  // Bitemporal: a registration this system did not hold at the instant asked
  // about cannot resolve a question asked as of that instant.
  const knowable = registry.filter((entry) => entry.knownAt <= knownBy);
  const matched = knowable.filter((entry) => usable.some((u) => u.family === entry.family && u.value === entry.value));
  const distinct = [...new Set(matched.map((entry) => entry.canonicalId))];

  if (distinct.length === 0) {
    return {
      outcome: 'UNRESOLVED', canonicalId: null, on: [], setAside,
      because: `${usable.length} issued ${usable.length === 1 ? 'identifier was' : 'identifiers were'} offered and no registration knowable by ${knownBy} binds any of them to a subject. Unresolved is a statement about the registry, and nothing here invents a binding to get past it.`,
    };
  }
  if (distinct.length > 1) {
    return {
      outcome: 'AMBIGUOUS', canonicalId: null, on: matched, setAside,
      because: `The offered identifiers resolve to ${distinct.length} different subjects (${distinct.join(', ')}). That is a contradiction in the registry, and picking one on recency or order would be this resolver settling an identity question on a tiebreak nobody agreed to.`,
    };
  }
  return {
    outcome: 'RESOLVED', canonicalId: distinct[0], on: matched, setAside,
    because: `Resolved to ${distinct[0]} on ${matched.length} ${matched.length === 1 ? 'registration' : 'registrations'} (${matched.map((m) => `${m.family} ${m.value} by ${m.evidenceRecordId}`).join(', ')}), all knowable by ${knownBy}.`,
  };
}

export const RESOLUTION_LOSS = [
  'Resolution binds an issued identifier to a subject. It does not verify that the subject exists, that the issuer was right, or that the source was describing the thing it named.',
  'UNRESOLVED is a fact about the registry and never about the world. A subject with no registration is not a subject that does not exist.',
  'Ambiguity is refused rather than broken. Two registrations disagreeing is a contradiction to be fixed in the registry, not a choice to be made here.',
  'Nothing merges on similarity. Two identical names are two names, and the corpus has no rule that turns them into one subject.',
  'A registration is used only if it was knowable at the instant asked about, so a replay resolves what could have been resolved then rather than what can be resolved now.',
] as const;
