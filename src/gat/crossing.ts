/**
 * The crossing: a GAT run put to the corpus's own two questions.
 *
 * The engine boundary is built and the evidence vocabularies are mapped, but
 * until now nothing had ever asked a GAT receipt what the estate asks every
 * computation. There are two questions and they are not the same question.
 *
 *   Is the run recoverable?  `computationCard.cardGrade` answers it, and the
 *   answer is a grade, not a permission.
 *
 *   May its output become a corpus record?  `admission.admit` is the authority
 *   that answers it, and the answer is a ruling made by an authority, never by
 *   a process. This module does not call it — it imports `CHECK_MEANING`,
 *   `RECORD_PROVENANCE` and the `AdmissionCheck` type, and reasons about what
 *   that gate would rule. The header used to read as though the call happened.
 *   One of the two questions goes through its real instrument (`cardGrade`);
 *   this one is answered against the gate's vocabulary rather than by it.
 *
 * A boundary that answers only the first has a computation nobody may cite. A
 * boundary that answers only the second has a citation nobody can re-run.
 *
 * THE STRUCTURAL ANSWER TO THE SECOND QUESTION IS NO, AND THAT IS THE GATE
 * WORKING
 *
 * `RECORD_PROVENANCE` has three members and none of them describes a computed
 * record: a candidate declares LIVE_CAPTURE or BACKFILLED, and DEMONSTRATION
 * does not cross the gate at all. A GAT finding is neither a capture nor a
 * backfill of one. That is not an omission in the vocabulary — it is the
 * vocabulary saying what the corpus is. The corpus records what sources said
 * about the world; a computation is not a source and observed nothing.
 *
 * So a run crosses into the computation-card ledger and never into the record
 * corpus. The path from an engine finding to a corpus record exists, and it
 * runs through a person: an operator who reads the finding and asserts it
 * under their own authority makes a record whose source is the operator. The
 * engine's output became evidence because somebody stood behind it, which is
 * rule 7 — promotion is an act at a boundary, with a record — and not because
 * a mapping was added here.
 *
 * WHAT THE BOUNDARY DROPS
 *
 * GAT records its numerical environment (`gat/runtime_diagnostics.py`,
 * `gat-execution-diagnostics-v1`): the BLAS and LAPACK builds, and the five
 * environment controls that decide dispatch. `GatRuntimeIdentity` carries none
 * of it. That matters here more than anywhere else, because `cardGrade`'s own
 * text names BLAS dispatch as the reason floating-point work is only
 * REPLAYABLE_HERE — this estate has already watched the same inputs give
 * different covariance bytes under a different dispatch while the means stayed
 * identical. The grade is right about the arithmetic and unevidenced about the
 * "here": nothing in the receipt says which envelope "here" was. The drop is
 * named rather than repaired, because the adapter's shape is not this module's
 * to change.
 *
 * This module reads. It writes no record, grants no permission, and is not an
 * authority for anything.
 */
import { CHECK_MEANING, RECORD_PROVENANCE, type AdmissionCheck } from '../domain/admission';
import { cardGrade, type CardVerdict, type ComputationArtifact } from '../domain/computationCard';
import type { GatReceipt } from './contracts';
import type { GatRuntimeIdentity } from './pin';

export const CROSSING_METHOD = 'notationsos.gat-crossing.v1';

/**
 * Who says any of this. Not the engine, and not an authority.
 *
 * The same footing as the evidence mapping next door: the engine declares its
 * own terms and has never declared what they become here, so the reading is
 * the consumer's and says so wherever it is met.
 */
export const CROSSING_DECLARED_BY = 'THE CONSUMER, reading a receipt; the engine has declared no crossing and this module is nobody’s authority';

/* ── The first question: is the run recoverable? ── */

/**
 * The engine's arithmetic, as the consumer reads it.
 *
 * GAT is float64 linear algebra over NumPy. The receipt does not declare an
 * arithmetic class, so this is read rather than carried, and the distinction
 * is kept because UNDECLARED and FLOATING_POINT earn the same grade by
 * different routes — one because the bytes are known not to travel, the other
 * because nobody said. Claiming the first when the second is true would grade
 * an unanswered question as an answered one.
 */
export const ENGINE_ARITHMETIC = 'FLOATING_POINT' as const;

/**
 * The receipt as something `cardGrade` can grade.
 *
 * Four inputs, because four things decide the bytes: the evidence, the
 * acquisition it came through, the engine source tree, and the pin that fixes
 * the interpreter and its libraries. Each is carried by content digest, which
 * is what makes them references a later reader can resolve rather than
 * locations on a machine that will not exist.
 *
 * The output digest is the retained report's. A run whose report was not
 * retained has no output to compare a replay against, and grades LOG_ONLY for
 * exactly that reason — which is correct: a computation whose result was
 * dropped is a note that it happened.
 */
export function computationArtifactFor(receipt: GatReceipt): ComputationArtifact {
  const { engine, request } = receipt;
  return {
    artifactId: `gat:${request.requestId}`,
    method: { id: 'payload.gat-ifc-audit', version: engine.adapterVersion },
    executor: { id: engine.repository, version: engine.commit },
    arithmetic: ENGINE_ARITHMETIC,
    inputs: [
      { id: 'evidence', digest: request.source.evidence.contentDigest, reference: request.source.evidence.contentDigest },
      { id: 'acquisition', digest: request.source.acquisition.digest, reference: request.source.acquisition.digest },
      { id: 'engine-source-tree', digest: engine.sourceTreeDigest, reference: engine.sourceTreeDigest },
      { id: 'engine-pin', digest: engine.pinDigest, reference: engine.pinDigest },
    ],
    outputDigest: receipt.report?.contentDigest ?? null,
  };
}

/* ── What the boundary drops on the way across ── */

export interface EnvelopeFact {
  /** The fact, as `gat-execution-diagnostics-v1` names it. */
  fact: string;
  /** Whether `GatRuntimeIdentity` carries it across the boundary. */
  carried: boolean;
  /** Why it decides the bytes, for the facts that do. */
  decidesBytes: boolean;
}

/**
 * Everything the engine records about its numerical environment, and whether
 * it survives the crossing.
 *
 * Ordered as the diagnostics contract emits them, so the two can be read side
 * by side. `decidesBytes` is the consumer's reading of which facts change a
 * result rather than describe one: an interpreter implementation and a byte
 * order do, a qualified-version note does not.
 */
export const ENVELOPE_FACTS: readonly EnvelopeFact[] = Object.freeze([
  { fact: 'python', carried: true, decidesBytes: true },
  { fact: 'implementation', carried: false, decidesBytes: true },
  { fact: 'numpy', carried: true, decidesBytes: true },
  { fact: 'qualified_numpy', carried: false, decidesBytes: false },
  { fact: 'system', carried: true, decidesBytes: true },
  { fact: 'machine', carried: true, decidesBytes: true },
  { fact: 'byteorder', carried: false, decidesBytes: true },
  { fact: 'libraries.blas', carried: false, decidesBytes: true },
  { fact: 'libraries.lapack', carried: false, decidesBytes: true },
  { fact: 'controls.OPENBLAS_CORETYPE', carried: false, decidesBytes: true },
  { fact: 'controls.OPENBLAS_NUM_THREADS', carried: false, decidesBytes: true },
  { fact: 'controls.OMP_NUM_THREADS', carried: false, decidesBytes: true },
  { fact: 'controls.MKL_CBWR', carried: false, decidesBytes: true },
  { fact: 'controls.NPY_DISABLE_CPU_FEATURES', carried: false, decidesBytes: true },
]);

/** The facts that decide the bytes and do not survive the crossing. */
export function envelopeDropped(): string[] {
  return ENVELOPE_FACTS.filter((entry) => !entry.carried && entry.decidesBytes).map((entry) => entry.fact);
}

/**
 * What a REPLAYABLE_HERE grade on a GAT run is and is not evidenced by.
 *
 * The grade is earned on the arithmetic, which is read correctly. The word it
 * turns on is "here", and the receipt does not say which envelope that was.
 * Stated as a qualification on the grade rather than as a downgrade, because
 * downgrading it would be this module overruling the grader on evidence the
 * grader never claimed to have.
 */
export function replayQualification(runtime: GatRuntimeIdentity | null): string {
  const dropped = envelopeDropped();
  if (!runtime) return 'No runtime identity was recorded at all, so "here" names nothing and a replay has no envelope to reproduce.';
  return `The runtime is pinned to ${runtime.pythonVersion} / NumPy ${runtime.numpyVersion} on ${runtime.platform} ${runtime.architecture}, and ${dropped.length} facts that decide the bytes did not cross: ${dropped.join(', ')}. A replay reproduces this run only where those happened to match, and nothing in the receipt says what they were.`;
}

/* ── The second question: may the output become a corpus record? ── */

export type CheckStanding =
  /** The receipt carries what the check asks for. */
  | 'MET'
  /** Not carried today, and carrying it is a question of plumbing. */
  | 'UNMET_CONTINGENT'
  /** Cannot be met by a computation at all, whatever is carried. */
  | 'UNMET_STRUCTURAL'
  /** Nothing here bears on it, and a standing would be invented. */
  | 'NOT_IN_QUESTION';

export interface CheckReading {
  check: AdmissionCheck;
  standing: CheckStanding;
  because: string;
}

/**
 * Every gate check, read against one receipt.
 *
 * Fail-closed throughout: a check this module cannot evaluate from the receipt
 * is unmet, never absent and never a pass. The value is in the two unmet
 * kinds. A contingent failure is a thing to build; a structural one is the
 * corpus telling a computation what it is, and building past it would be
 * building the wrong thing well.
 */
export function admissionStanding(receipt: GatReceipt): CheckReading[] {
  const rights = receipt.deriveDecision;
  return [
    {
      check: 'EVIDENCE_ARTIFACT_BOUND',
      standing: receipt.sourceVerified ? 'MET' : 'UNMET_CONTINGENT',
      because: receipt.sourceVerified
        ? 'The request names the evidence by content digest and the bytes were verified against it at execution. This is the one check a computation meets easily, because pointing at bytes is what an engine does.'
        : 'The source was not verified at execution, so the run cannot point at the bytes it read.',
    },
    {
      check: 'EVIDENCE_CLASS_COMPLETE',
      standing: 'UNMET_CONTINGENT',
      because: 'The receipt carries no evidence kind for any individual finding, so no candidate drawn from it has three axes to declare. The mapping that would supply them exists next door; nothing applies it to a claim, because no claim has been named yet.',
    },
    {
      check: 'ORIGIN_ADMISSIBLE',
      standing: 'UNMET_CONTINGENT',
      because: 'The origin is per claim and the receipt is per run. ASSUMED and SIMULATED findings are inadmissible and the receipt does not say which findings are which, so fail-closed makes the whole run unevaluated rather than admissible in part.',
    },
    {
      check: 'ASSERTION_PRESENT',
      standing: 'UNMET_CONTINGENT',
      because: 'A receipt asserts nothing about the world. It names a report that carries findings, and drawing a subject, predicate and value out of that report is a step nobody has taken. Admitting the receipt itself would be admitting a receipt for an empty envelope.',
    },
    {
      check: 'BOTH_CLOCKS',
      standing: 'UNMET_STRUCTURAL',
      because: 'The receipt has two timestamps and neither is a clock the corpus asks about. `startedAt` is when the computation began, which is not when anything was true; `completedAt` is when it finished, which is not when this system came to know a fact about the world. A run over evidence from 1998 does not make a 1998 fact knowable in the moment the process exited, and reading execution time as knowledge time would date every derived finding to its own recomputation.',
    },
    {
      check: 'SOURCE_CLOCK_COHERENT',
      standing: 'UNMET_STRUCTURAL',
      because: 'A computation has no publication time, because nothing published it. The source clock belongs to whoever issued the evidence, and it travels with the evidence rather than with the run over it.',
    },
    {
      check: 'SUBJECT_IDENTIFIED',
      standing: 'UNMET_CONTINGENT',
      because: 'The engine names subjects by IFC GlobalId and STEP line number, which are scoped to one file. Both are names, not canonical identities, and resolving them is the registry’s work rather than the engine’s. UNRESOLVED here is a fact about the registry and never about the world.',
    },
    {
      check: 'RIGHTS_DECIDED',
      standing: rights && rights.state === 'ALLOWED' ? 'MET' : 'UNMET_CONTINGENT',
      because: rights
        ? `A derive decision exists and its state is ${rights.state}. It permits the computation over the source, which is a different operation from admitting the result, and a decision covering one has never covered the other.`
        : 'No derive decision is recorded on the receipt, and an undecided right is a refusal rather than a default permission.',
    },
    {
      check: 'AUTHORITY_IS_NOT_THE_PROCESS',
      standing: 'UNMET_STRUCTURAL',
      because: 'The receipt names an authority for processing permission and none for admission, which is correct and is why this stays unmet. An adapter cannot be the authority that admits its own output; that is a write wearing a ruling’s clothes. Only a person outside the run can meet this, and no plumbing supplies one.',
    },
    {
      check: 'PROVENANCE_DECLARED',
      standing: 'UNMET_STRUCTURAL',
      because: `A candidate declares LIVE_CAPTURE or BACKFILLED and a computed finding is neither. The vocabulary has ${RECORD_PROVENANCE.length} members and no member for a derivation, which is the corpus saying what it is rather than a gap in it: it records what sources said, and a computation observed nothing. Declaring one of the two anyway would make a derivation indistinguishable from a capture at every later join.`,
    },
    {
      check: 'SUPERSESSION_IS_ABOUT_THIS_RECORD',
      standing: 'NOT_IN_QUESTION',
      because: 'No ruling is being replaced, because no ruling about this run exists. A standing here would be invented.',
    },
  ];
}

export interface CrossingReading {
  /** How the run grades as a computation. */
  card: CardVerdict;
  /** What qualifies that grade, given what the boundary dropped. */
  replay: string;
  /** Every gate check, read. */
  gate: readonly CheckReading[];
  /** Whether the output may become a corpus record. Structurally false today. */
  mayBecomeARecord: false;
  /** The route that does exist, so the answer is not read as a dead end. */
  theRouteThatExists: string;
  declaredBy: typeof CROSSING_DECLARED_BY;
}

/** One receipt, both questions, with neither answer standing in for the other. */
export function readCrossing(receipt: GatReceipt): CrossingReading {
  return {
    card: cardGrade(computationArtifactFor(receipt)),
    replay: replayQualification(receipt.runtime),
    gate: admissionStanding(receipt),
    mayBecomeARecord: false,
    theRouteThatExists: 'An operator reads the finding and asserts it under their own authority. The record’s source is then the operator, its provenance is the live capture of their declaration, and its clocks are theirs. The engine’s output became evidence because somebody stood behind it, which is what promotion at a boundary means, and not because this module mapped it across.',
    declaredBy: CROSSING_DECLARED_BY,
  };
}

/** The checks that no amount of carrying more fields will meet. */
export function structuralRefusals(receipt: GatReceipt): CheckReading[] {
  return admissionStanding(receipt).filter((reading) => reading.standing === 'UNMET_STRUCTURAL');
}

export const CROSSING_LOSS = [
  'Two questions, kept apart. A grade says whether a run can be found again; a ruling says whether its output may be cited as a record. Answering either with the other is how a system ends up citing what it cannot re-run, or re-running what nobody may cite.',
  'The structural no is the gate working. RECORD_PROVENANCE has no member for a derivation because the corpus records what sources said, and a computation is not a source. Adding a member for it would make a derivation indistinguishable from a capture at every join downstream.',
  'Execution time is not a clock the corpus asks about. A run over evidence from 1998 does not make a 1998 fact knowable at the moment the process exited, and reading completion time as knowledge time would date every derived finding to its own recomputation.',
  'The engine may not admit its own output, and no plumbing changes that. Only a person outside the run can meet AUTHORITY_IS_NOT_THE_PROCESS, and the route from a finding to a record runs through them standing behind it.',
  'The boundary drops the envelope. GAT records its BLAS build and the five dispatch controls; GatRuntimeIdentity carries none of them, and REPLAYABLE_HERE turns on a "here" the receipt does not describe. Named rather than repaired: the adapter’s shape is not this module’s to change.',
  `Whose reading this is: ${CROSSING_DECLARED_BY}.`,
] as const;

/** Every check the corpus asks, so a reader can see none was quietly dropped. */
export const CHECKS_READ: readonly AdmissionCheck[] = Object.freeze(
  Object.keys(CHECK_MEANING) as AdmissionCheck[],
);
