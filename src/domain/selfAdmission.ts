/**
 * From a commit object read to a candidate the gate can rule on.
 *
 * `selfObservation` reads bytes and refuses to decide anything. This module
 * makes the decisions that stage deliberately left open — which subject an
 * object names, which of its fields become claims, what the clocks say — and
 * hands the result to the same `admit` every other rail uses. Nothing here is a
 * second gate, and nothing here relaxes the first one.
 *
 * WHICH FIELDS BECOME CLAIMS: THREE OF NINE
 *
 * Only the content-derived ones. `tree`, `parents` and `parentCount` are
 * functions of bytes that no party could have stated otherwise; the other six
 * are strings somebody wrote, and `selfObservation` already withheld them. A
 * rail that carried them this far and then asserted them would have made the
 * distinction decorative.
 *
 * THE SELF-REPORTED TIMESTAMP IS NEVER ASSERTED, AND IS STILL CHECKED
 *
 * This is the part worth reading twice. The committer's instant is testimony
 * from the party with the most interest in it, so it never becomes a claim. But
 * the gate's SOURCE_CLOCK_COHERENT check asks whether the source's own stated
 * publication time is later than the moment this system obtained the bytes —
 * and a commit dated in the future is exactly that incoherence. So the instant
 * is passed to the gate as `sourceTime`, used to test itself, and never
 * repeated as a fact.
 *
 * A commit stamped 2030 is refused. The corpus does not thereby assert that the
 * commit is from 2030; it asserts nothing about that object at all, which is
 * the correct outcome and a different thing from silently accepting the date.
 *
 * WHAT VALID TIME MEANS FOR AN IMMUTABLE OBJECT
 *
 * The proposition is `commit X has tree Y`, and it is true of the object's
 * content for as long as the object exists. Its onset is when the object came
 * into being — and the only party who says when that was is the one who made
 * it. Taking the committer's word for it would put a self-reported value in a
 * load-bearing position two paragraphs after refusing to assert it.
 *
 * So valid time is the capture instant, and it means exactly this: the object
 * store held this object with this content when this system read it. The corpus
 * makes no claim about earlier. A second capture of the same object yields the
 * same claim with a later onset, which is corroboration rather than
 * supersession, and the corpus holds both because a later reading does not
 * retract an earlier one.
 *
 * INTEREST, WHERE THE PARTY IS INTERESTED AND THE VALUE IS OUT OF ITS REACH
 *
 * The observer and the observed are the same organisation, which normally
 * disqualifies a claim. It does not here, and the reason is precise rather than
 * convenient: a maximally self-interested party cannot state a different tree
 * SHA for the same tree. The interest is real and the value is not the
 * producer's to choose, so `disinterested` is declared on the strength of what
 * the value is rather than on a claim about who read it. Every field where
 * interest could reach the value is withheld, one stage earlier.
 */
import { admit, admittedRow, isAdmitting, type AdmissionCandidate, type AdmissionRuling, type AdmittedRow } from './admission';
import { projectToCandidates, type DeclaredContext, type RailCandidate } from './candidateProjection';
import { resolveSubject, type Registration } from './identityResolution';
import { COMMIT_FIELDS, type CommitFieldName, type CommitObservation } from './selfObservation';
import type { ISODateTime } from './types';

export const SELF_ADMISSION_METHOD = 'notationsos.self-admission.v1';

/**
 * Field to corpus predicate, declared here and never derived from the field
 * name — the rule `candidateProjection` already applies to every other rail.
 * Only content-derived fields appear, and a test holds that.
 */
export const SELF_PREDICATE: Readonly<Record<string, string>> = {
  tree: 'repository.commit.tree',
  parents: 'repository.commit.parents',
  parentCount: 'repository.commit.parent_count',
};

/** The canonical subject a commit object names in this corpus. */
export const subjectFor = (objectName: string) => `notation://subject/git-commit/${objectName}`;

/**
 * The context the rail cannot supply and the parser must not decide.
 *
 * Every value is a declaration by whoever owns the source registration. The
 * rights decision in particular is the operator's: this is their repository,
 * and a system that defaulted it to PERMITTED would be deciding a right on
 * their behalf.
 */
export const SELF_OBSERVATION_CONTEXT: Omit<DeclaredContext, 'sourceTime' | 'provenanceClass'> = {
  origin: 'MEASURED',
  evidenceClass: { claimStrength: 'measured', productionClass: 'measured', interest: 'disinterested' },
  rightsDecision: 'PERMITTED',
  conditions: [
    'The operator owns this repository and permits the corpus to read its object store. That is a decision about these bytes and not a licence to read another repository.',
    'Content-derived values only. Nothing a committing party stated about itself is admitted from this source.',
  ],
  predicateFor: SELF_PREDICATE,
};

/**
 * Registrations binding object names to corpus subjects.
 *
 * GIT_OBJECT is the one identifier family in this system with no issuer, and it
 * is stronger for it. Every other family requires trusting a register: an NAIC
 * code means what the NAIC says it means, and a party that loses its registry
 * entry loses its identity. A git object name is the SHA-1 of the object's own
 * bytes, so two parties holding the same bytes compute the same name without
 * consulting anyone, and no authority can reassign it.
 *
 * That does not make the binding to a corpus subject automatic, and the
 * resolver is not relaxed for it. Which `notation://` subject a given object
 * names is still this corpus's decision and still needs a registration
 * carrying a knowledge time, and `resolveSubject` will not use one to answer a
 * question asked as of an instant before the corpus held it. What the
 * self-certifying name buys is that the evidence for the registration is the
 * object — which a reader recomputes — rather than a register entry that is not
 * checkable at all.
 */
export function registrationsFor(observations: readonly CommitObservation[]): Registration[] {
  return observations.map((observation) => ({
    family: 'GIT_OBJECT' as const,
    value: observation.objectName,
    canonicalId: subjectFor(observation.objectName),
    knownAt: observation.declaration.capturedAt,
    evidenceRecordId: `record:git-object:${observation.objectName}`,
  }));
}

/** What the caller must state to build. Nothing here is inferred from the observations. */
export interface SelfBuildRequest {
  buildId: string;
  /** Nothing captured later than this becomes a candidate. Bitemporal cutoff, applied before the gate sees anything. */
  knownThrough: ISODateTime;
  observations: readonly CommitObservation[];
  /** Declared per build, never inferred from a gap between the clocks. */
  provenanceClass: 'LIVE_CAPTURE' | 'BACKFILLED';
  registry?: readonly Registration[];
}

export interface SelfBuildMember {
  objectName: string;
  candidates: AdmissionCandidate[];
  skipped: Array<{ field: string; because: string }>;
  /** Fields read, withheld before the gate, and why. */
  withheld: readonly CommitFieldName[];
  resolution: ReturnType<typeof resolveSubject>;
}

export interface SelfCandidateBuild {
  method: typeof SELF_ADMISSION_METHOD;
  buildId: string;
  state: 'UNADMITTED';
  knownThrough: ISODateTime;
  members: SelfBuildMember[];
  excluded: Array<{ objectName: string; because: string }>;
  candidateCount: number;
  because: string;
}

/** The instant the source states it published, which is testimony used to test itself and never asserted. */
function statedSourceTime(observation: CommitObservation): string | null {
  const committed = observation.fields.find((entry) => entry.field === 'committedAt');
  return committed?.presence === 'PRESENT' && typeof committed.value === 'string' ? committed.value : null;
}

/** Content-derived, present fields as claims, in declaration order. */
function claimsOf(observation: CommitObservation): RailCandidate['claims'] {
  return observation.fields
    .filter((entry) => COMMIT_FIELDS[entry.field].basis === 'CONTENT_DERIVED')
    .map((entry) => ({
      field: entry.field,
      // A count stays a number so a root commit's zero survives: an empty
      // string would be skipped as absent, which is the distinction the parser
      // just went to the trouble of making.
      value: entry.presence === 'PRESENT'
        ? (Array.isArray(entry.value) ? entry.value.join(' ') : typeof entry.value === 'string' || typeof entry.value === 'number' ? entry.value : null)
        : null,
      basis: `${COMMIT_FIELDS[entry.field].basis}: ${entry.because}`,
    }));
}

/**
 * Pure: observations become candidates, under a knowledge horizon and against a
 * registry, and the build says UNADMITTED because producing candidates is not
 * admitting them.
 */
export function buildSelfCandidates(request: SelfBuildRequest): SelfCandidateBuild {
  const registry = request.registry ?? registrationsFor(request.observations);
  const members: SelfBuildMember[] = [];
  const excluded: SelfCandidateBuild['excluded'] = [];

  for (const observation of request.observations) {
    const capturedAt = observation.declaration.capturedAt;
    if (capturedAt > request.knownThrough) {
      excluded.push({
        objectName: observation.objectName,
        because: `Captured at ${capturedAt}, later than the horizon of ${request.knownThrough}. A build asked about a knowledge instant does not see what the corpus learned after it.`,
      });
      continue;
    }

    const resolution = resolveSubject([{ family: 'GIT_OBJECT', value: observation.objectName }], registry, capturedAt);
    const rail: RailCandidate = {
      candidateId: `self:${observation.objectName}`,
      buildId: request.buildId,
      identity: { sourceRecordId: observation.objectName, canonicalId: resolution.canonicalId },
      knownAt: capturedAt,
      capturedAt,
      artifactDigest: observation.bytesDigest,
      // The object store held this object with this content when it was read.
      // Not when the object was made: only its author says that.
      validTime: { state: 'OBSERVED', from: capturedAt },
      claims: claimsOf(observation),
    };

    const projection = projectToCandidates(rail, {
      ...SELF_OBSERVATION_CONTEXT,
      provenanceClass: request.provenanceClass,
      sourceTime: statedSourceTime(observation),
    });

    members.push({
      objectName: observation.objectName,
      candidates: projection.candidates,
      skipped: projection.skipped,
      withheld: observation.withheld.map((entry) => entry.field),
      resolution,
    });
  }

  const candidateCount = members.reduce((total, member) => total + member.candidates.length, 0);
  return {
    method: SELF_ADMISSION_METHOD,
    buildId: request.buildId,
    state: 'UNADMITTED',
    knownThrough: request.knownThrough,
    members,
    excluded,
    candidateCount,
    because: `${members.length} of ${request.observations.length} observations are within the horizon of ${request.knownThrough} and produced ${candidateCount} candidates; ${excluded.length} were excluded by the cutoff. Only content-derived fields became claims. The build is UNADMITTED: producing candidates is not admitting them, and nothing here rules on its own output.`,
  };
}

export interface SelfAdmissionReceipt {
  method: typeof SELF_ADMISSION_METHOD;
  buildId: string;
  authority: string;
  ruledAt: ISODateTime;
  knownThrough: ISODateTime;
  counts: { observations: number; excludedByCutoff: number; candidates: number; admitted: number; refused: number; rows: number };
  refusalTally: Array<{ check: string; count: number }>;
  rulings: AdmissionRuling[];
  rows: AdmittedRow[];
  because: string;
}

/**
 * Rule on every candidate in a build.
 *
 * The authority is the caller's and the gate checks it: a build cannot admit
 * itself, and passing this method's own name is refused on
 * AUTHORITY_IS_NOT_THE_PROCESS. That the source is this repository changes
 * nothing about who may admit from it — a system observing itself still cannot
 * be the party that rules its own observations into the corpus.
 */
export function admitSelfBuild(build: SelfCandidateBuild, authority: string, ruledAt: ISODateTime): SelfAdmissionReceipt {
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
  return {
    method: SELF_ADMISSION_METHOD,
    buildId: build.buildId,
    authority,
    ruledAt,
    knownThrough: build.knownThrough,
    counts: {
      observations: build.members.length + build.excluded.length,
      excludedByCutoff: build.excluded.length,
      candidates: candidates.length,
      admitted,
      refused: rulings.length - admitted,
      rows: rows.length,
    },
    refusalTally,
    rulings,
    rows,
    because: candidates.length === 0
      ? 'No candidate reached the gate, so nothing was admitted and nothing was refused. An empty build is not a clean one.'
      : `${admitted} of ${candidates.length} candidates admitted by ${authority}, ${rulings.length - admitted} refused${refusalTally.length ? ` (most often on ${refusalTally[0].check}, ${refusalTally[0].count} times)` : ''}. Admission says the object store held these objects with this content when it was read. It does not say the commits were good, that their tests passed, or that their messages describe what they did.`,
  };
}

export const SELF_ADMISSION_LOSS = [
  'An admitted row says the object store held this object with this content when the corpus read it. It says nothing about when the object was made: the only party who states that is the one who made it, and this rail does not take a party’s word for its own clock.',
  'A second capture of the same object produces the same claim with a later onset. That is corroboration and not supersession, and the corpus holds both, because a later reading does not retract an earlier one.',
  'The committer’s instant is used to test itself and never repeated. A commit dated in the future is refused on SOURCE_CLOCK_COHERENT; a commit dated in the past is admitted without the corpus asserting that date.',
  'Interest is declared disinterested because the value is out of the producer’s reach, not because the producer has no stake. The observer and the observed are the same organisation; every field where that could change a value is withheld one stage earlier.',
  'Three of nine fields are claims. The other six are read, carried and withheld, so a reader can see what was in the bytes without the corpus having asserted it.',
  'A tree is named and never walked. Nothing here states what is in the tree, what changed between two commits, or whether the objects a commit names are present in the store at all.',
  'The rights decision is the operator’s and is declared per build. It is about this repository’s bytes and is not a licence to read another.',
] as const;
