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
 *   that answers it. This module does not call it: it imports the gate's
 *   vocabulary and reasons about what that gate would rule. One of the two
 *   questions goes through its real instrument; this one is answered against
 *   the gate's terms rather than by it, and says so here rather than reading
 *   as though the call happened.
 *
 * A boundary that answers only the first has a computation nobody may cite. A
 * boundary that answers only the second has a citation nobody can re-run.
 *
 * THE STRUCTURAL ANSWER TO THE SECOND QUESTION IS NO, AND THAT IS THE GATE
 * WORKING
 *
 * Four checks cannot be met by a computation whatever it carries, and those
 * four sentences are the gate's rather than this module's: `STRUCTURAL_REFUSAL`
 * in `src/domain/admission.ts`, quoted here, because a restatement is a second
 * chance to say it differently. So a run crosses into the computation-card
 * ledger and never into the record corpus, and the route that does exist runs
 * through a person — rule 7, promotion as an act at a boundary.
 *
 * WHAT THE BOUNDARY DROPS
 *
 * `cardGrade` names BLAS dispatch as the reason floating-point work is only
 * REPLAYABLE_HERE, and this estate has watched the same inputs give different
 * covariance bytes under a different dispatch while the means stayed
 * identical. GAT records that dispatch environment and `GatRuntimeIdentity`
 * carries none of it, so the grade is right about the arithmetic and
 * unevidenced about the "here". `ENVELOPE_DROPPED` names what was lost, and
 * names it rather than repairing it: the adapter's shape is not this
 * module's to change.
 *
 * This module reads. It writes no record, grants no permission, and is not an
 * authority for anything.
 */
import { CHECK_MEANING, STRUCTURAL_REFUSAL, THE_ROUTE_THAT_EXISTS, type AdmissionCheck } from '../domain/admission';
import { cardGrade, type CardVerdict, type ComputationArtifact } from '../domain/computationCard';
import type { GatReceipt } from './contracts';
import type { GatRuntimeIdentity } from './pin';

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
 * the interpreter and its libraries. Each is carried by content digest, so a
 * later reader resolves a reference rather than a location on a machine that
 * will not exist.
 *
 * The output digest is the retained report's, and a run whose report was
 * dropped grades LOG_ONLY — correctly: a computation whose result was not kept
 * is a note that it happened.
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

/**
 * Facts that decide the bytes, recorded by the engine and carried by nothing.
 *
 * Named as `gat-execution-diagnostics-v1` emits them. That contract is not in
 * this tree, so this list is a reading of the engine's side and cannot be
 * checked against it from here — which is exactly why the tripwire is on the
 * side that is here: `crossing.test.ts` pins the field count of
 * `GatRuntimeIdentity`, so a field added to the identity forces someone to
 * re-read this list rather than leaving it quietly wrong.
 *
 * A fact that describes a run rather than deciding it is not on the list. The
 * qualified-NumPy note is the example: it says which wheel was validated, and
 * two runs that disagree about it still produce the same bytes.
 */
export const ENVELOPE_DROPPED: readonly string[] = Object.freeze([
  'implementation',
  'byteorder',
  'libraries.blas',
  'libraries.lapack',
  'controls.OPENBLAS_CORETYPE',
  'controls.OPENBLAS_NUM_THREADS',
  'controls.OMP_NUM_THREADS',
  'controls.MKL_CBWR',
  'controls.NPY_DISABLE_CPU_FEATURES',
]);

/**
 * What a REPLAYABLE_HERE grade is and is not evidenced by.
 *
 * A qualification on the grade rather than a downgrade of it: downgrading
 * would be this module overruling the grader on evidence the grader never
 * claimed to have.
 */
export function replayQualification(runtime: GatRuntimeIdentity | null): string {
  if (!runtime) return 'No runtime identity was recorded at all, so "here" names nothing and a replay has no envelope to reproduce.';
  return `The runtime is pinned to ${runtime.pythonVersion} / NumPy ${runtime.numpyVersion} on ${runtime.platform} ${runtime.architecture}, and ${ENVELOPE_DROPPED.length} facts that decide the bytes did not cross: ${ENVELOPE_DROPPED.join(', ')}. A replay reproduces this run only where those happened to match, and nothing in the receipt says what they were.`;
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
 * kinds — a contingent failure is a thing to build, a structural one is not.
 */
export function admissionStanding(receipt: GatReceipt): CheckReading[] {
  const rights = receipt.deriveDecision;
  const structural = (check: keyof typeof STRUCTURAL_REFUSAL, alsoBecause: string): CheckReading =>
    ({ check, standing: 'UNMET_STRUCTURAL', because: `${alsoBecause} ${STRUCTURAL_REFUSAL[check]}` });
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
    structural('BOTH_CLOCKS', 'The receipt has two timestamps and neither is a clock the corpus asks about.'),
    structural('SOURCE_CLOCK_COHERENT', 'Nothing on the receipt is a publication time.'),
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
    structural('AUTHORITY_IS_NOT_THE_PROCESS', 'The receipt names an authority for processing permission and none for admission, which is correct and is why this stays unmet.'),
    structural('PROVENANCE_DECLARED', 'A GAT finding is a derivation, not an observation.'),
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
  theRouteThatExists: typeof THE_ROUTE_THAT_EXISTS;
  declaredBy: typeof CROSSING_DECLARED_BY;
}

/** One receipt, both questions, with neither answer standing in for the other. */
export function readCrossing(receipt: GatReceipt): CrossingReading {
  return {
    card: cardGrade(computationArtifactFor(receipt)),
    replay: replayQualification(receipt.runtime),
    gate: admissionStanding(receipt),
    mayBecomeARecord: false,
    theRouteThatExists: THE_ROUTE_THAT_EXISTS,
    declaredBy: CROSSING_DECLARED_BY,
  };
}

/** The checks that no amount of carrying more fields will meet. */
export function structuralRefusals(receipt: GatReceipt): CheckReading[] {
  return admissionStanding(receipt).filter((reading) => reading.standing === 'UNMET_STRUCTURAL');
}

export const CROSSING_LOSS = [
  'Two questions, kept apart. A grade says whether a run can be found again; a ruling says whether its output may be cited as a record. Answering either with the other is how a system ends up citing what it cannot re-run, or re-running what nobody may cite.',
  `The structural no is the gate working, and it is the gate's sentence rather than this module's: all ${Object.keys(STRUCTURAL_REFUSAL).length} structural refusals are quoted from STRUCTURAL_REFUSAL in the admission module, where a second reader asking the same question meets the same answer.`,
  `The reading covers every check the corpus asks — ${Object.keys(CHECK_MEANING).length} of them — and a twelfth arriving there fails the test here until it has been read.`,
  'The boundary drops the envelope. GAT records its BLAS build and the five dispatch controls; GatRuntimeIdentity carries none of them, and REPLAYABLE_HERE turns on a "here" the receipt does not describe. Named rather than repaired: the adapter’s shape is not this module’s to change.',
  'And the naming is unverifiable from here, which is also said out loud. ENVELOPE_DROPPED reads a diagnostics contract that is not in this tree, so the tripwire sits on the side that is: the field count of GatRuntimeIdentity, pinned in the test, so growing the identity forces a re-read of the list rather than leaving it quietly wrong.',
  `Whose reading this is: ${CROSSING_DECLARED_BY}.`,
] as const;
