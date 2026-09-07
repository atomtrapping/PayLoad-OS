/**
 * The admission authority: the gate that is owed.
 *
 * Two places in this repository already name its absence as a live risk
 * rather than a settled sequence. `storage.ts` says the records store
 * arrived first, so "nothing yet stops an unadmitted candidate being written
 * into a releases or records row as though it were a version, and that gate
 * is what the store still needs." `correction.ts` says a corrected record
 * cannot reach back to the build that proposed it, and that closing it needs
 * "an admission authority ... in a place that does not leak rail identifiers
 * into the release."
 *
 * This is that gate, and it is built to those two statements rather than to
 * a fresh idea. Three properties follow from doctrine rather than from
 * preference:
 *
 * Refusal is the default. A check that cannot be evaluated fails. Nothing is
 * admitted because a process computed it (rule 4), and nothing is admitted
 * because nobody objected.
 *
 * Admission is an act with an author. Rule 7 says promotion is an act at a
 * boundary, with a record — so a ruling names the authority that made it,
 * and this module refuses to be its own authority. An automatic admission is
 * not an admission; it is a write.
 *
 * Ancestry lives outside the release. Rule 2 keeps candidate, build and run
 * identifiers out of every release, and a correction still has to reach the
 * build. So the ruling ledger holds the join, the release holds none of it,
 * and `releaseLeaks` is the check that says so rather than the comment.
 */

export const ADMISSION_METHOD = 'notationsos.admission.v1';

/** Each is a gate. A gate that cannot be evaluated is a failure, never a pass. */
export type AdmissionCheck =
  | 'EVIDENCE_ARTIFACT_BOUND'
  | 'EVIDENCE_CLASS_COMPLETE'
  | 'ORIGIN_ADMISSIBLE'
  | 'BOTH_CLOCKS'
  | 'SUBJECT_IDENTIFIED'
  | 'RIGHTS_DECIDED'
  | 'AUTHORITY_IS_NOT_THE_PROCESS';

export const CHECK_MEANING: Record<AdmissionCheck, string> = {
  EVIDENCE_ARTIFACT_BOUND: 'The candidate names the retained artifact it was extracted from, by content digest. A candidate that cannot point at bytes is an assertion, not an extraction.',
  EVIDENCE_CLASS_COMPLETE: 'All three evidence axes are declared and the production class is not unclassified, which the corpus already holds inadmissible for canonical assertion.',
  ORIGIN_ADMISSIBLE: 'The claim’s epistemic origin is one that can be evidence at all. A declared assumption and a simulation are conditions a computation ran under, not observations of the world.',
  BOTH_CLOCKS: 'A world time and a knowledge time, and the knowledge time is not earlier than the capture it descends from. A record knowable before its evidence was captured is not a record.',
  SUBJECT_IDENTIFIED: 'The subject carries a canonical identity, so the record joins on identity rather than on a name.',
  RIGHTS_DECIDED: 'A rights decision exists for the operation this admission performs. An undecided right is a refusal, never a default permission.',
  AUTHORITY_IS_NOT_THE_PROCESS: 'The ruling names an authority, and the authority is not this method. Promotion is an act; a process admitting on its own behalf is a write wearing a ruling’s clothes.',
};

/** Origins that may never become evidence, from the engine boundary mapping. */
export const INADMISSIBLE_ORIGINS = ['ASSUMED', 'SIMULATED'] as const;

export interface AdmissionCandidate {
  candidateId: string;
  buildId: string | null;
  /** The proposed record's identity, which survives admission unchanged. */
  recordId: string;
  subjectCanonicalId: string | null;
  /** Epistemic origin as the producer declared it. */
  origin: string | null;
  evidenceClass: { claimStrength: string | null; productionClass: string | null; interest: string | null } | null;
  provenance: { artifactDigest: string | null; capturedAt: string | null };
  validFrom: string | null;
  knownAt: string | null;
  rightsDecision: 'PERMITTED' | 'PROHIBITED' | 'UNDECIDED' | null;
}

export interface AdmissionRuling {
  candidateId: string;
  recordId: string;
  outcome: 'ADMITTED' | 'REFUSED';
  authority: string;
  ruledAt: string;
  passed: AdmissionCheck[];
  failed: Array<{ check: AdmissionCheck; because: string }>;
  because: string;
}

/** The join a correction needs, kept where rule 2 allows it to live. */
export interface AncestryEntry {
  recordId: string;
  releaseId: string;
  candidateId: string;
  buildId: string | null;
  ruledAt: string;
  authority: string;
}

function readable(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function instant(value: string | null | undefined): number | null {
  if (!readable(value)) return null;
  const ms = Date.parse(value!);
  return Number.isFinite(ms) ? ms : null;
}

function evaluate(candidate: AdmissionCandidate, authority: string): Array<{ check: AdmissionCheck; because: string }> {
  const failed: Array<{ check: AdmissionCheck; because: string }> = [];
  const fail = (check: AdmissionCheck, because: string) => failed.push({ check, because });

  if (!readable(candidate.provenance?.artifactDigest)) fail('EVIDENCE_ARTIFACT_BOUND', 'No artifact digest: this candidate points at no retained bytes.');

  const klass = candidate.evidenceClass;
  if (!klass || !readable(klass.claimStrength) || !readable(klass.productionClass) || !readable(klass.interest)) {
    fail('EVIDENCE_CLASS_COMPLETE', 'One or more evidence axes are undeclared, and an undeclared axis is not a weak one.');
  } else if (klass.productionClass === 'unclassified') {
    fail('EVIDENCE_CLASS_COMPLETE', 'The production class is unclassified, which the corpus holds inadmissible for canonical assertion.');
  }

  if (!readable(candidate.origin)) fail('ORIGIN_ADMISSIBLE', 'The epistemic origin is undeclared, so nothing says this could be evidence at all.');
  else if ((INADMISSIBLE_ORIGINS as readonly string[]).includes(candidate.origin!)) {
    fail('ORIGIN_ADMISSIBLE', `Origin ${candidate.origin} is a condition a computation ran under, not an observation of the world.`);
  }

  const valid = instant(candidate.validFrom);
  const known = instant(candidate.knownAt);
  const captured = instant(candidate.provenance?.capturedAt);
  if (valid === null || known === null) fail('BOTH_CLOCKS', 'A world time and a knowledge time are both required, and at least one is missing or unreadable.');
  else if (captured !== null && known < captured) fail('BOTH_CLOCKS', 'The knowledge time is earlier than the capture it descends from, so this was knowable before its evidence existed.');

  if (!readable(candidate.subjectCanonicalId)) fail('SUBJECT_IDENTIFIED', 'The subject carries no canonical identity, so this record would join on a name.');

  if (candidate.rightsDecision !== 'PERMITTED') {
    fail('RIGHTS_DECIDED', `The rights decision is ${candidate.rightsDecision ?? 'absent'}. Only PERMITTED admits; undecided is a refusal and never a default permission.`);
  }

  if (!readable(authority) || authority.trim() === ADMISSION_METHOD) {
    fail('AUTHORITY_IS_NOT_THE_PROCESS', 'A ruling names an authority, and that authority is not this method. Nothing admits on its own behalf.');
  }

  return failed;
}

const ALL_CHECKS: readonly AdmissionCheck[] = [
  'EVIDENCE_ARTIFACT_BOUND', 'EVIDENCE_CLASS_COMPLETE', 'ORIGIN_ADMISSIBLE',
  'BOTH_CLOCKS', 'SUBJECT_IDENTIFIED', 'RIGHTS_DECIDED', 'AUTHORITY_IS_NOT_THE_PROCESS',
];

/** Rule on one candidate. Refusal is the default and every failure is named. */
export function admit(candidate: AdmissionCandidate, authority: string, ruledAt: string): AdmissionRuling {
  const failed = evaluate(candidate, authority);
  const failedChecks = new Set(failed.map((entry) => entry.check));
  const passed = ALL_CHECKS.filter((check) => !failedChecks.has(check));
  const outcome = failed.length ? 'REFUSED' : 'ADMITTED';
  return {
    candidateId: candidate.candidateId,
    recordId: candidate.recordId,
    outcome,
    authority,
    ruledAt,
    passed,
    failed,
    because: failed.length
      ? `Refused on ${failed.length} of ${ALL_CHECKS.length} ${failed.length === 1 ? 'check' : 'checks'}: ${failed.map((entry) => entry.check).join(', ')}. Nothing is admitted because the rest passed.`
      : `Admitted by ${authority} on all ${ALL_CHECKS.length} checks. This says the candidate may become a version; it does not say the claim is true.`,
  };
}

/** Ancestry is produced only by an admission, so a caller cannot have one without the other. */
export function admitInto(
  release: { releaseId: string },
  candidates: readonly AdmissionCandidate[],
  authority: string,
  ruledAt: string,
): { rulings: AdmissionRuling[]; ancestry: AncestryEntry[] } {
  const rulings = candidates.map((candidate) => admit(candidate, authority, ruledAt));
  const ancestry = rulings
    .filter((ruling) => ruling.outcome === 'ADMITTED')
    .map((ruling) => {
      const candidate = candidates.find((entry) => entry.candidateId === ruling.candidateId)!;
      return { recordId: ruling.recordId, releaseId: release.releaseId, candidateId: ruling.candidateId, buildId: candidate.buildId, ruledAt, authority };
    });
  return { rulings, ancestry };
}

/**
 * Rule 2, checked rather than asserted: no candidate, build or run identifier
 * may appear anywhere in a release. The ancestry ledger holds the join; the
 * release holds none of it.
 */
export function releaseLeaks(release: unknown, ancestry: readonly AncestryEntry[]): string[] {
  const serialized = JSON.stringify(release ?? null);
  const leaked = new Set<string>();
  for (const entry of ancestry) {
    for (const identifier of [entry.candidateId, entry.buildId]) {
      if (readable(identifier) && serialized.includes(identifier!)) leaked.add(identifier!);
    }
  }
  return [...leaked].sort();
}

export const ADMISSION_LOSS = [
  'Admission says a candidate may become a version. It does not say the claim is true, and no number of passed checks makes it true.',
  'Refusal is the default. A check that cannot be evaluated fails, because an undeclared axis is not a weak one and an undecided right is not a quiet permission.',
  'Nothing admits on its own behalf. A ruling names an authority that is not this method, because a process promoting its own output is a write wearing a ruling’s clothes.',
  'The ancestry ledger is not part of the release. A correction reaches the build through the ledger, and the release carries no candidate, build or run identifier — which releaseLeaks checks rather than the comment claiming it.',
  'A refusal is a record too. A candidate refused here has not been deleted, hidden or made unavailable; it stays on the rail with the reasons it failed.',
] as const;
