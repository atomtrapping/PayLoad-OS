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

/** Where this repository names its methods, and where it names no party. */
export const METHOD_NAMESPACE = 'notationsos.';

/** Each is a gate. A gate that cannot be evaluated is a failure, never a pass. */
export type AdmissionCheck =
  | 'EVIDENCE_ARTIFACT_BOUND'
  | 'EVIDENCE_CLASS_COMPLETE'
  | 'ORIGIN_ADMISSIBLE'
  | 'BOTH_CLOCKS'
  | 'SUBJECT_IDENTIFIED'
  | 'ASSERTION_PRESENT'
  | 'RIGHTS_DECIDED'
  | 'AUTHORITY_IS_NOT_THE_PROCESS'
  | 'PROVENANCE_DECLARED'
  | 'SOURCE_CLOCK_COHERENT'
  | 'SUPERSESSION_IS_ABOUT_THIS_RECORD';

export const CHECK_MEANING: Record<AdmissionCheck, string> = {
  EVIDENCE_ARTIFACT_BOUND: 'The candidate names the retained artifact it was extracted from, by content digest. A candidate that cannot point at bytes is an assertion, not an extraction.',
  EVIDENCE_CLASS_COMPLETE: 'All three evidence axes are declared and the production class is not unclassified, which the corpus already holds inadmissible for canonical assertion.',
  ORIGIN_ADMISSIBLE: 'The claim’s epistemic origin is one that can be evidence at all. A declared assumption and a simulation are conditions a computation ran under, not observations of the world.',
  BOTH_CLOCKS: 'A world time and a knowledge time, and the knowledge time is not earlier than the capture it descends from. A record knowable before its evidence was captured is not a record.',
  SUBJECT_IDENTIFIED: 'The subject carries a canonical identity, so the record joins on identity rather than on a name.',
  ASSERTION_PRESENT: 'The candidate states a subject, a predicate and a value, so there is a claim to admit. Provenance without a claim is a receipt for an empty envelope, and a gate that let one through would have to invent the claim downstream.',
  RIGHTS_DECIDED: 'A rights decision exists for the operation this admission performs. An undecided right is a refusal, never a default permission.',
  AUTHORITY_IS_NOT_THE_PROCESS: 'The ruling names an authority, and the authority is not a method of this system — not this gate, and not the rail that built the candidate. Promotion is an act; a process admitting on its own behalf is a write wearing a ruling’s clothes.',
  PROVENANCE_DECLARED: 'The candidate declares how it arrived — live capture or backfill — rather than leaving it to be worked out later. Provenance inferred from a clock gap is a guess about testimony, one waterline below testimony itself.',
  SOURCE_CLOCK_COHERENT: 'The source’s own publication time is present and not later than the moment this system obtained it. A record acquired before its source published it did not arrive the way it claims to have arrived, whatever it is labelled.',
  SUPERSESSION_IS_ABOUT_THIS_RECORD: 'A ruling named as superseded is about the same record. A ruling replaces a ruling about the same record or it replaces nothing, because a supersession pointing elsewhere would silently retire a decision nobody revisited.',
};

/** Origins that may never become evidence, from the engine boundary mapping. */
export const INADMISSIBLE_ORIGINS = ['ASSUMED', 'SIMULATED'] as const;

/**
 * What the candidate actually claims.
 *
 * Kept separate from the identity and the clocks because it is a different kind
 * of thing: the rest of a candidate says where this came from and when, and
 * this says what it asserts about the world. The gate needs both — a candidate
 * with impeccable provenance and no claim is not a record, it is a receipt for
 * an empty envelope.
 *
 * Its own subject id sits here rather than being derived from the canonical
 * identity. They are different identifiers: the canonical one is what the
 * corpus resolves across sources, the local one is what the source called it,
 * and writing one into the other's column silently breaks every join.
 */
export interface CandidateAssertion {
  /** What the source called the subject. Not the canonical identity. */
  subjectId: string | null;
  predicate: string | null;
  value: string | number | null;
  unit?: string;
  basis?: string;
}

export interface AdmissionCandidate {
  candidateId: string;
  buildId: string | null;
  /** The proposed record's identity, which survives admission unchanged. */
  recordId: string;
  subjectCanonicalId: string | null;
  /** What this candidate claims. A candidate that claims nothing is refused. */
  assertion: CandidateAssertion | null;
  /** Epistemic origin as the producer declared it. */
  origin: string | null;
  evidenceClass: { claimStrength: string | null; productionClass: string | null; interest: string | null } | null;
  provenance: { artifactDigest: string | null; capturedAt: string | null };
  /**
   * How the record arrived, declared by the candidate. Never inferred: no
   * threshold here decides that a gap between the clocks makes something
   * backfill, because inferred provenance is a guess about testimony rather
   * than testimony.
   */
  provenanceClass: 'LIVE_CAPTURE' | 'BACKFILLED' | null;
  /** When the source published it. Distinct from when this system obtained it. */
  sourceTime: string | null;
  /**
   * Conditions the rights decision or the source registration attached, as
   * declared. Never inferred, and never summarised: a condition this gate
   * paraphrased would be a condition nobody agreed to. An empty list means
   * none were declared, which is not the same as none applying.
   */
  conditions: readonly string[];
  validFrom: string | null;
  knownAt: string | null;
  rightsDecision: 'PERMITTED' | 'PROHIBITED' | 'UNDECIDED' | null;
}

/**
 * The ruling vocabulary the workbench already speaks, so a corpus admission
 * and a customer ruling say the same words. `ADMITTED_WITH_CONDITIONS` is
 * not a weaker admission: it is an admission whose conditions travel with it,
 * and a consumer that drops them has read it as the wrong word.
 */
export type AdmissionOutcome = 'ADMITTED' | 'ADMITTED_WITH_CONDITIONS' | 'REFUSED';

export const ADMITTING_OUTCOMES: readonly AdmissionOutcome[] = ['ADMITTED', 'ADMITTED_WITH_CONDITIONS'];

export function isAdmitting(outcome: AdmissionOutcome): boolean {
  return (ADMITTING_OUTCOMES as readonly string[]).includes(outcome);
}

export interface AdmissionRuling {
  candidateId: string;
  recordId: string;
  outcome: AdmissionOutcome;
  /** Carried verbatim from the candidate when the outcome is conditional; empty otherwise. */
  conditions: string[];
  /** A prior ruling on this same record that this one replaces, or null. */
  supersedesRulingId: string | null;
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

  // A candidate with no claim is not a record. Without this the write path has
  // to invent a predicate to satisfy its own schema, which is the gate
  // manufacturing the assertion it exists to rule on.
  const assertion = candidate.assertion;
  if (!assertion || !readable(assertion.subjectId) || !readable(assertion.predicate) || assertion.value === null || assertion.value === undefined || assertion.value === '') {
    fail('ASSERTION_PRESENT', 'The candidate states no subject, predicate or value, so there is nothing to admit. Impeccable provenance over an empty claim is a receipt for an empty envelope.');
  }

  if (candidate.rightsDecision !== 'PERMITTED') {
    fail('RIGHTS_DECIDED', `The rights decision is ${candidate.rightsDecision ?? 'absent'}. Only PERMITTED admits; undecided is a refusal and never a default permission.`);
  }

  if (candidate.provenanceClass !== 'LIVE_CAPTURE' && candidate.provenanceClass !== 'BACKFILLED') {
    fail('PROVENANCE_DECLARED', `Provenance is ${candidate.provenanceClass ?? 'undeclared'}. It is declared at entry or the candidate is refused; nothing here infers it from the clocks.`);
  }

  const sourced = instant(candidate.sourceTime);
  if (sourced === null) fail('SOURCE_CLOCK_COHERENT', 'No readable source time, so nothing says when the source published this.');
  else if (captured !== null && sourced > captured) fail('SOURCE_CLOCK_COHERENT', 'Obtained before the source published it. Whatever the label says, this did not arrive the way it claims to have arrived.');

  // The whole method namespace, not this gate's own name alone. The check used
  // to compare against ADMISSION_METHOD only, which stopped the gate naming
  // itself and stopped nothing else: a producing rail could pass its own
  // method id — `notationsos.self-admission.v1`, say — and admit what it had
  // just built. That is the exact act the check exists to refuse, and it was
  // getting through because the refusal was written against one identifier
  // instead of against the kind of thing an identifier like that is.
  //
  // No party is named in this namespace. An authority is a role or a person;
  // `notationsos.*` is how this repository names its own methods, so a value
  // in it is a process wearing a ruling's clothes whichever process it is.
  if (!readable(authority) || authority.trim().startsWith(METHOD_NAMESPACE)) {
    fail('AUTHORITY_IS_NOT_THE_PROCESS', `A ruling names an authority, and that authority is not a method of this system. ${authority?.trim() ?? 'An absent authority'} is in the ${METHOD_NAMESPACE} namespace, which is where methods are named and where no party is. Nothing admits on its own behalf.`);
  }

  return failed;
}

const ALL_CHECKS: readonly AdmissionCheck[] = [
  'EVIDENCE_ARTIFACT_BOUND', 'EVIDENCE_CLASS_COMPLETE', 'ORIGIN_ADMISSIBLE',
  'BOTH_CLOCKS', 'SUBJECT_IDENTIFIED', 'ASSERTION_PRESENT', 'RIGHTS_DECIDED',
  'AUTHORITY_IS_NOT_THE_PROCESS', 'PROVENANCE_DECLARED', 'SOURCE_CLOCK_COHERENT',
];

/** Rule on one candidate. Refusal is the default and every failure is named. */
export function admit(
  candidate: AdmissionCandidate,
  authority: string,
  ruledAt: string,
  supersedes: { rulingId: string; recordId: string } | null = null,
): AdmissionRuling {
  const failed = evaluate(candidate, authority);
  // A ruling replaces a ruling about the same record or it replaces nothing.
  if (supersedes && supersedes.recordId !== candidate.recordId) {
    failed.push({ check: 'SUPERSESSION_IS_ABOUT_THIS_RECORD', because: `The ruling named as superseded is about ${supersedes.recordId} and this candidate is about ${candidate.recordId}. A ruling replaces a ruling about the same record or it replaces nothing.` });
  }
  const failedChecks = new Set(failed.map((entry) => entry.check));
  const passed = ALL_CHECKS.filter((check) => !failedChecks.has(check));
  const conditions = failed.length ? [] : [...candidate.conditions];
  const outcome: AdmissionOutcome = failed.length ? 'REFUSED' : conditions.length ? 'ADMITTED_WITH_CONDITIONS' : 'ADMITTED';
  return {
    candidateId: candidate.candidateId,
    recordId: candidate.recordId,
    outcome,
    conditions,
    supersedesRulingId: failed.length ? null : supersedes?.rulingId ?? null,
    authority,
    ruledAt,
    passed,
    failed,
    because: failed.length
      ? `Refused on ${failed.length} of ${ALL_CHECKS.length} ${failed.length === 1 ? 'check' : 'checks'}: ${failed.map((entry) => entry.check).join(', ')}. Nothing is admitted because the rest passed.`
      : conditions.length
        ? `Admitted by ${authority} on all ${ALL_CHECKS.length} checks, under ${conditions.length} declared ${conditions.length === 1 ? 'condition' : 'conditions'} that travel with it. Dropping them reads this as the wrong word. This says the candidate may become a version; it does not say the claim is true.`
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
    .filter((ruling) => isAdmitting(ruling.outcome))
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
  'The entry stamp is not reconstructable. Source time, acquisition time and declared provenance are fixed by the admission that produced the row, because a record\u2019s honesty is decided when it enters and cannot be worked out about it later.',
  'Provenance is declared and never inferred. No threshold here reads a gap between the clocks as backfill, because provenance inferred from metadata is a guess about testimony rather than testimony.',
  'ADMITTED_WITH_CONDITIONS is not a weaker admission. Its conditions travel onto the row, and a consumer that drops them has read the ruling as the wrong word.',
  'A refusal is a record too. A candidate refused here has not been deleted, hidden or made unavailable; it stays on the rail with the reasons it failed.',
] as const;

/**
 * What the provenance column may say. The first two are stamped by this gate
 * and mean the row crossed it. `DEMONSTRATION` means it did not: committed
 * fixtures are seeded so the pages have something to show, and the column is
 * what stops them reading as admitted state. This gate cannot emit
 * `DEMONSTRATION`, and the seeder cannot emit the other two — the two
 * writers are disjoint by type, not by convention.
 */
export const RECORD_PROVENANCE = ['LIVE_CAPTURE', 'BACKFILLED', 'DEMONSTRATION'] as const;
export type RecordProvenance = (typeof RECORD_PROVENANCE)[number];

/** Provenance values a passed admission may stamp. Deliberately not all of them. */
export const ADMITTED_PROVENANCE: readonly RecordProvenance[] = ['LIVE_CAPTURE', 'BACKFILLED'];

/** Did this row cross the gate? The column answers, and nothing else has to. */
export function crossedTheGate(provenance: RecordProvenance): boolean {
  return (ADMITTED_PROVENANCE as readonly string[]).includes(provenance);
}

/* ── What a computation can never meet, whichever one is asking ── */

/**
 * Four of the eleven checks a computed finding cannot meet, and why.
 *
 * These sit here rather than with any one consumer because they are facts
 * about the gate, not about whatever is being read against it. A caller that
 * derives a value and wonders whether it may become a record gets the same
 * four answers for the same four reasons, and a second caller that worked
 * them out again would be a second chance to work them out differently.
 *
 * The distinction they carry is the one worth keeping: the other seven checks
 * a computation fails are plumbing — carry more fields and they pass. These
 * four are the corpus saying what a record is. Building past them would be
 * building the wrong thing well, so a consumer that reports a refusal wants to
 * say which kind it met.
 *
 * `admit` never reads this. It evaluates candidates and returns reasons of its
 * own; this is prose for the readers who ask the gate a question without
 * handing it a candidate, and a wrong sentence here cannot admit anything.
 */
/**
 * Narrowed through `Extract`, so a member that is not a real check resolves
 * away and the object literal below fails to compile with an excess key
 * rather than carrying a sentence about a check nobody asks.
 */
export type StructuralRefusal = Extract<AdmissionCheck, 'BOTH_CLOCKS' | 'SOURCE_CLOCK_COHERENT' | 'AUTHORITY_IS_NOT_THE_PROCESS' | 'PROVENANCE_DECLARED'>;

export const STRUCTURAL_REFUSAL: Record<StructuralRefusal, string> = {
  BOTH_CLOCKS:
    'A computation has two timestamps and neither is a clock the corpus asks about. When it began is not when anything was true; when it finished is not when this system came to know a fact about the world. A run over evidence from 1998 does not make a 1998 fact knowable in the moment the process exited, and reading execution time as knowledge time would date every derived finding to its own recomputation.',
  SOURCE_CLOCK_COHERENT:
    'A computation has no publication time, because nothing published it. The source clock belongs to whoever issued the evidence, and it travels with the evidence rather than with the run over it.',
  AUTHORITY_IS_NOT_THE_PROCESS:
    'An adapter cannot be the authority that admits its own output; that is a write wearing a ruling’s clothes. Only a person outside the run can meet this, and no plumbing supplies one.',
  PROVENANCE_DECLARED:
    `A candidate declares LIVE_CAPTURE or BACKFILLED and a computed finding is neither. The vocabulary has ${RECORD_PROVENANCE.length} members and no member for a derivation, which is the corpus saying what it is rather than a gap in it: it records what sources said, and a computation observed nothing. Declaring one of the two anyway would make a derivation indistinguishable from a capture at every later join.`,
};

/**
 * The route that does exist, so a structural refusal is not read as a dead end.
 *
 * Rule 7: promotion is an act at a boundary, with a record. The engine's output
 * became evidence because somebody stood behind it, and not because a mapping
 * was added somewhere.
 */
export const THE_ROUTE_THAT_EXISTS =
  'An operator reads the finding and asserts it under their own authority. The record’s source is then the operator, its provenance is the live capture of their declaration, and its clocks are theirs. The engine’s output became evidence because somebody stood behind it, which is what promotion at a boundary means.';

/* ── The entry stamp: the only shape a writer may accept ── */

/**
 * A row the records table may take. Its honesty is decided here, at the
 * moment of entry, and not reconstructed later: the three clocks and the
 * declared provenance are stamped by the admission that produced it, and
 * there is no constructor for this type that does not begin with an
 * ADMITTED ruling.
 *
 * That is the whole point of the shape. A writer that accepts only this
 * cannot be handed an unadmitted candidate, which is the gate `storage.ts`
 * says the store still needs.
 */
export interface AdmittedRow {
  recordId: string;
  subjectCanonicalId: string;
  /** What the source called the subject, kept distinct from the canonical identity. */
  subjectId: string;
  predicate: string;
  /** The claim itself, which the row exists to carry rather than to describe. */
  value: string | number;
  unit: string | null;
  basis: string | null;
  validFrom: string;
  validTo: string | null;
  knownAt: string;
  /** When the source published it. */
  sourceTime: string;
  /** When this system obtained it. */
  acquisitionTime: string;
  /** Declared by the candidate, never inferred here. */
  provenance: 'LIVE_CAPTURE' | 'BACKFILLED';
  admittedBy: string;
  ruledAt: string;
  outcome: AdmissionOutcome;
  /** Declared conditions, carried onto the row so downstream cannot lose them. */
  conditions: string[];
}

/**
 * The writable row for an admitted candidate, or null with the reason it is
 * not one. A refusal never yields a row: there is no partial write, and no
 * caller can obtain a row by ignoring an outcome it did not like.
 */
export function admittedRow(
  candidate: AdmissionCandidate,
  ruling: AdmissionRuling,
): { row: AdmittedRow | null; because: string } {
  if (ruling.candidateId !== candidate.candidateId) {
    return { row: null, because: `The ruling is for ${ruling.candidateId} and the candidate is ${candidate.candidateId}. A ruling does not travel between candidates.` };
  }
  if (!isAdmitting(ruling.outcome)) {
    return { row: null, because: `${ruling.candidateId} was refused, so there is no row. ${ruling.because}` };
  }
  return {
    row: {
      recordId: candidate.recordId,
      subjectCanonicalId: candidate.subjectCanonicalId!,
      subjectId: candidate.assertion!.subjectId!,
      predicate: candidate.assertion!.predicate!,
      value: candidate.assertion!.value!,
      unit: candidate.assertion!.unit ?? null,
      basis: candidate.assertion!.basis ?? null,
      validFrom: candidate.validFrom!,
      validTo: null,
      knownAt: candidate.knownAt!,
      sourceTime: candidate.sourceTime!,
      acquisitionTime: candidate.provenance.capturedAt!,
      provenance: candidate.provenanceClass!,
      admittedBy: ruling.authority,
      ruledAt: ruling.ruledAt,
      outcome: ruling.outcome,
      // Conditions are stamped at entry like every other part of the row's
      // honesty. A conditional admission whose conditions did not reach the
      // row would read, downstream, as an unconditional one.
      conditions: [...ruling.conditions],
    },
    because: `Stamped at entry by ${ruling.authority}: three clocks and a declared provenance, fixed at the moment of admission rather than worked out afterwards.`,
  };
}
