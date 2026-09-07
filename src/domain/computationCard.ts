/**
 * A computation as a card, not as a proof.
 *
 * The distinction is the whole module. A proof system answers *was this
 * computed correctly* by substituting cryptography for trust in the
 * operator. A punch card answers nothing of the kind: it is a frozen,
 * uniform, self-describing artifact that makes a computation sortable,
 * replayable and long-lived, and it introduces no trust assumption at all
 * because it asks the reader to believe nothing. A card from 1930 reads
 * today with a lamp; the question here is whether a computation from 2026
 * re-runs in 2060 from the artifact and a spec, with no access to the
 * machine that made it.
 *
 * So this grades artifacts, and grading is not endorsing. A card-grade
 * artifact says nothing whatever about whether its computation was right,
 * appropriate, or well-posed. It says the computation can be found again and
 * compared. Correctness lives where it always did — in the rulings, the
 * held-out references and the estate — and a card carries them across
 * decades rather than standing in for them.
 *
 * The arithmetic rule is not theoretical here. This system has already
 * observed it: in the GAT engine, changing only `OPENBLAS_CORETYPE` from
 * Haswell to Sandybridge changed covariance bytes while derived means stayed
 * byte-identical, which is why every number that engine reports carries a
 * declared execution envelope. Floating point does not fail the archival
 * test loudly; it fails it quietly, on another machine, years later.
 */

export const CARD_METHOD = 'notationsos.computation-card.v1';

/**
 * How the computation's numbers were produced, because it decides whether
 * the bytes reproduce anywhere but here.
 */
export type ArithmeticClass = 'FIXED_POINT' | 'FLOATING_POINT' | 'UNDECLARED';

/**
 * `CARD_GRADE`: re-runnable from the artifact alone, anywhere, to the same
 * bytes. `REPLAYABLE_HERE`: everything is pinned, but the arithmetic does not
 * promise the bytes elsewhere. `LOG_ONLY`: the artifact describes a
 * computation it cannot recover, which is a note about the past, not a
 * record of it.
 */
export type CardGrade = 'CARD_GRADE' | 'REPLAYABLE_HERE' | 'LOG_ONLY';

export const GRADE_MEANING: Record<CardGrade, string> = {
  CARD_GRADE: 'Re-runnable from this artifact and a spec, on a machine that does not exist yet, to the same bytes.',
  REPLAYABLE_HERE: 'Every input, version and output is pinned, so it re-runs here; nothing here promises the same bytes on another build.',
  LOG_ONLY: 'A description of a computation that cannot be recovered from it. Useful as a note, not as a record.',
};

export interface ArtifactInput {
  id: string;
  /** Content digest. Null means the input is named but not fixed. */
  digest: string | null;
  /** How the artifact refers to it. A location is not a reference a later reader can resolve. */
  reference: string;
}

export interface ComputationArtifact {
  artifactId: string;
  method: { id: string; version: string } | null;
  executor: { id: string; version: string } | null;
  arithmetic: ArithmeticClass;
  inputs: readonly ArtifactInput[];
  outputDigest: string | null;
}

export interface CardVerdict {
  grade: CardGrade;
  /** Exactly what stands between this artifact and the grade above it. */
  missing: string[];
  because: string;
}

const MOVING_TARGET = /(^|[^a-z])(latest|current|head|main|master|newest)([^a-z]|$)/i;
const LOCATION = /^(\/|\.{1,2}\/|~\/|[a-zA-Z]:\\)|:\/\//;
const INEXACT_VERSION = /[\^~*]|>=|<=|>|</;

/** A reference a reader in 2060 can resolve from the artifact, rather than from a machine. */
function referenceFault(input: ArtifactInput): string | null {
  if (!input.reference.trim()) return `input ${input.id} carries no reference at all`;
  if (LOCATION.test(input.reference)) return `input ${input.id} is referenced by location (${input.reference}), which names a machine rather than a content`;
  if (MOVING_TARGET.test(input.reference)) return `input ${input.id} is referenced by a moving target (${input.reference}), which will resolve to something else later`;
  return null;
}

/**
 * Grade one artifact. Nothing here inspects the computation itself; the
 * question is only whether the artifact carries enough to find it again.
 */
export function cardGrade(artifact: ComputationArtifact): CardVerdict {
  const missing: string[] = [];

  if (!artifact.inputs.length) missing.push('no inputs are declared, so there is nothing to re-run it on');
  for (const input of artifact.inputs) {
    if (!input.digest) missing.push(`input ${input.id} is named but not fixed by a digest`);
    const fault = referenceFault(input);
    if (fault) missing.push(fault);
  }

  for (const [label, named] of [['method', artifact.method], ['executor', artifact.executor]] as const) {
    if (!named) { missing.push(`the ${label} is not named`); continue; }
    if (!named.version.trim()) missing.push(`the ${label} is named without a version`);
    else if (INEXACT_VERSION.test(named.version)) missing.push(`the ${label} version ${named.version} is a range, and a range is not a version`);
    else if (MOVING_TARGET.test(named.version)) missing.push(`the ${label} version ${named.version} is a moving target`);
  }

  if (!artifact.outputDigest) missing.push('no output digest, so a replay could not be compared against anything');

  if (missing.length) {
    return { grade: 'LOG_ONLY', missing, because: `${missing.length} thing${missing.length === 1 ? '' : 's'} stand between this artifact and a computation that can be recovered from it. Until they are fixed it is a note about the past, not a record of one.` };
  }

  if (artifact.arithmetic === 'FIXED_POINT') {
    return { grade: 'CARD_GRADE', missing: [], because: 'Every input is fixed by digest, every version is exact, the output is digested, and the arithmetic is fixed point, so the same bytes come back on a machine that does not exist yet. This says nothing about whether the computation was right.' };
  }

  const arithmetic = artifact.arithmetic === 'FLOATING_POINT'
    ? 'the arithmetic is floating point, and this system has already observed the same inputs give different covariance bytes under a different BLAS dispatch'
    : 'the arithmetic class is not declared, so nothing here says whether the bytes reproduce elsewhere';
  return {
    grade: 'REPLAYABLE_HERE',
    missing: [arithmetic],
    because: `Everything is pinned and it re-runs here, but ${arithmetic}. It is recoverable under a declared execution envelope and not by the artifact alone.`,
  };
}

/** Highest grade first, so a reader sees what is card-grade before what is not. */
export function gradeAll(artifacts: readonly ComputationArtifact[]): Array<{ artifact: ComputationArtifact; verdict: CardVerdict }> {
  const rank: Record<CardGrade, number> = { CARD_GRADE: 0, REPLAYABLE_HERE: 1, LOG_ONLY: 2 };
  return artifacts
    .map((artifact) => ({ artifact, verdict: cardGrade(artifact) }))
    .sort((x, y) => rank[x.verdict.grade] - rank[y.verdict.grade] || (x.artifact.artifactId < y.artifact.artifactId ? -1 : 1));
}

export const CARD_LOSS = [
  'A grade is not an endorsement. A card-grade artifact says its computation can be found again and compared; it says nothing about whether the computation was right, appropriate or well-posed.',
  'No proof is involved and none is wanted. Nothing here asks a reader to believe a computation because cryptography attests it; the artifact asks to be re-run, which is a stronger thing to offer an auditor and a weaker thing to claim.',
  'The test is archival, not cryptographic: can this be re-run from the artifact and a spec, on a machine that does not exist yet? A hash chain answers a different question, about tampering, and answers it cheaply.',
  'Floating point does not fail loudly. It fails on another machine, years later, and this system has already seen it: identical inputs, different BLAS dispatch, different covariance bytes, identical means.',
  'Grading inspects the artifact and never the computation. An artifact can be card grade and describe a computation nobody should have run.',
  'A grade is about one artifact. A chain is only as re-runnable as its weakest input, so lineageGrade takes the lineage as declared and an input naming no producing artifact makes the chain LOG_ONLY \u2014 unknown, never fine.',
  'A frozen trace isolates a divergence only partly. It separates changed inputs and unstable execution cleanly, and there it stops: with everything pinned and fresh evidence still disagreeing, a changed world and a wrong model look identical, because the artifact mirrors the model and not the world.',
  'Not everything should be a card. Reasoning paths that feed rulings earn one; projections and derived views are rebuilt from source instead, and paying card discipline for them buys nothing.',
] as const;

/**
 * A card is only as archivable as its weakest input.
 *
 * `cardGrade` asks whether *this* artifact can be re-run from itself. It says
 * nothing about the artifacts its inputs came from, and a computation over
 * inputs that are themselves only replayable-here is only replayable here:
 * the chain is re-runnable to the depth its worst link supports. This is the
 * pinning discipline applied recursively — pin the toolchain, not the top
 * version — and without it a CARD_GRADE artifact can sit on a LOG_ONLY
 * lineage and read as archival.
 *
 * Lineage is supplied by the caller and never inferred: an input whose
 * producing artifact is not named is unknown, not fine.
 */
export function lineageGrade(
  artifact: ComputationArtifact,
  lineage: Readonly<Record<string, CardGrade | undefined>>,
): { grade: CardGrade; weakest: { inputId: string; grade: CardGrade } | null; unknown: string[]; because: string } {
  const own = cardGrade(artifact).grade;
  const rank: Record<CardGrade, number> = { CARD_GRADE: 0, REPLAYABLE_HERE: 1, LOG_ONLY: 2 };

  const unknown = artifact.inputs.filter((input) => !lineage[input.id]).map((input) => input.id).sort();
  let weakest: { inputId: string; grade: CardGrade } | null = null;
  for (const input of artifact.inputs) {
    const grade = lineage[input.id];
    if (!grade) continue;
    if (!weakest || rank[grade] > rank[weakest.grade]) weakest = { inputId: input.id, grade };
  }

  if (unknown.length) {
    return { grade: 'LOG_ONLY', weakest, unknown,
      because: `${unknown.join(', ')} ${unknown.length === 1 ? 'names' : 'name'} no producing artifact, so the lineage cannot be graded. An ungraded input is unknown rather than fine, and a chain with an unknown link is re-runnable only as far as the link.` };
  }
  if (!weakest || rank[own] >= rank[weakest.grade]) {
    return { grade: own, weakest, unknown,
      because: `The artifact itself grades ${own}${weakest ? ` and no input grades worse` : ` and it has no graded inputs`}, so the chain grades ${own}.` };
  }
  return { grade: weakest.grade, weakest, unknown,
    because: `The artifact grades ${own}, but ${weakest.inputId} grades ${weakest.grade}, so the chain grades ${weakest.grade}. A computation is only as archivable as its weakest input, however well it was frozen itself.` };
}

/* ── What a frozen artifact can and cannot isolate ── */

/**
 * A frozen computation is the one side of a comparison that never jitters,
 * which makes a later divergence *partly* diagnosable. Partly, and the limit
 * is the point: the artifact is a perfect mirror of the model it ran, not of
 * the world. Exact execution of a wrong model looks more credible than
 * sloppy execution of a right one, so a divergence with everything pinned
 * cannot tell a changed world from a wrong model — and nothing here will
 * pretend otherwise. Only an independent reference can separate those two.
 */
export type Divergence =
  | 'NONE'
  | 'INPUTS_CHANGED'
  | 'EXECUTION_UNSTABLE'
  | 'WORLD_OR_MODEL';

export const DIVERGENCE_MEANING: Record<Divergence, string> = {
  NONE: 'The frozen artifact re-ran on the same inputs to the same output, and the fresh evidence agrees with it. Nothing to isolate.',
  INPUTS_CHANGED: 'The inputs are no longer the inputs the artifact was frozen over. Whatever else is true, this is not the same computation, and its result is not evidence about the new inputs.',
  EXECUTION_UNSTABLE: 'The same inputs re-ran to a different output. The computation is not reproducible where it claimed to be: an environment moved, or the artifact was altered. It is not a finding about the world.',
  WORLD_OR_MODEL: 'The computation replayed exactly, and fresh evidence still disagrees with it. Either the world moved or the model was wrong, and a frozen trace cannot tell those apart — it mirrors the model, not the world.',
};

export interface DivergenceReading {
  divergence: Divergence;
  /** Only an independent reference separates the last case; say so where it applies. */
  needsReference: boolean;
  because: string;
}

/**
 * Compare a frozen artifact against a replay and, where offered, against a
 * fresh observation of the thing it computed. Order matters: an input change
 * makes every later question moot, and an unstable execution makes a claim
 * about the world unavailable.
 */
export function divergenceOf(
  artifact: ComputationArtifact,
  replay: { inputDigests: Readonly<Record<string, string | null>>; outputDigest: string | null },
  freshEvidenceAgrees: boolean | null = null,
): DivergenceReading {
  const changed = artifact.inputs
    .filter((input) => (replay.inputDigests[input.id] ?? null) !== input.digest)
    .map((input) => input.id);
  if (changed.length) {
    return { divergence: 'INPUTS_CHANGED', needsReference: false,
      because: `${changed.join(', ')} ${changed.length === 1 ? 'is' : 'are'} not the input${changed.length === 1 ? '' : 's'} this artifact was frozen over. ${DIVERGENCE_MEANING.INPUTS_CHANGED}` };
  }
  if (replay.outputDigest !== artifact.outputDigest) {
    return { divergence: 'EXECUTION_UNSTABLE', needsReference: false,
      because: `The same inputs produced ${replay.outputDigest ?? 'no output'} where the artifact records ${artifact.outputDigest ?? 'none'}. ${DIVERGENCE_MEANING.EXECUTION_UNSTABLE}` };
  }
  if (freshEvidenceAgrees === null) {
    return { divergence: 'NONE', needsReference: false,
      because: 'The artifact replayed exactly on the inputs it was frozen over. No fresh evidence was offered, so nothing is claimed about the world.' };
  }
  if (freshEvidenceAgrees) {
    return { divergence: 'NONE', needsReference: false, because: DIVERGENCE_MEANING.NONE };
  }
  return { divergence: 'WORLD_OR_MODEL', needsReference: true, because: DIVERGENCE_MEANING.WORLD_OR_MODEL };
}
