/**
 * The mining engine, actually run.
 *
 * Everything else in this layer describes what would be computed. This
 * computes it. One spec, three runs, over the three committed demonstration
 * corpora, deterministically, with no clock, no network and no database — so
 * the page that shows it renders the same bytes on every request and the
 * fingerprints below mean what fingerprints are supposed to mean.
 *
 * WHAT IT IS AND IS NOT EVIDENCE OF
 *
 * The records are the committed demonstration corpora. Every artifact here is
 * a true statement about that corpus and no statement at all about the world,
 * and it is marked so at every level rather than in a footnote. The point of
 * running it is not the findings; it is that the path from records to a
 * derived artifact with its lineage, its rights floor and its validation state
 * exists and can be inspected, rather than being asserted in prose.
 *
 * ONE SPEC, THREE RUNS
 *
 * The spec fingerprint is identical across all three because it is the
 * identity of the computation, not of the execution. The input fingerprints
 * are all different because the three corpora are different. That pair of
 * facts is the whole workload contract, visible: a re-run is not a second
 * result, and a different input is not a different computation.
 *
 * A COMPUTATION DOES NOT READ WHAT THE CORPUS TOOK BACK
 *
 * The input is `standingRecords`, not `corpus.records`. A withdrawn record is
 * not evidence of anything and a corrected record's original has been replaced
 * by the record that names it, so a run reading either is computing over
 * claims the corpus has retracted — and, for a correction, counting the same
 * claim twice while it does. Five records across the three lines are dropped
 * for exactly that reason, and each run carries which ones and under which
 * retraction rather than quietly narrowing.
 *
 * NOTHING IS VALIDATED AND NOTHING IS SERVED
 *
 * Both zeros are real. An artifact starts NOT_VALIDATED because a computation
 * exiting zero is a fact about the computation, and validation needs held-out
 * or independent evidence that a demonstration corpus does not have. A derived
 * claim is servable only once validated. So the run produces artifacts, the
 * artifacts stop there, and the count of served claims is zero for a reason
 * that is stated rather than for a reason that is absent.
 *
 * A GAP PRODUCES A PROPOSAL AND NOTHING ELSE
 *
 * The concentration measure ranks where an independent source would most
 * reduce uncertainty, which is the recursive step the flywheel turns on. What
 * comes out is a proposal standing at PROPOSED with no authorizing principal,
 * naming what to seek rather than somewhere to call. This module has no
 * endpoint, no connector and no credential, and the proposals it writes cannot
 * carry one.
 */
import type { Corpus, CorpusRecord } from '@/domain/corpus';
import type { Domain, ISODateTime } from '@/domain/types';
import { currentRelease, standingRecords, takenBackBy } from '@/domain/corpus';
import { FIXTURE_CORPORA } from '@/fixtures';
import { discoveryStanding, inheritedRights } from '@/domain/discoveryLayer';
import { runWorkload, specFingerprint, type ProducedArtifact, type WorkloadRunResult } from './engine';
import { evidenceConcentrationWorkload, gapsFrom, type ConcentrationDetail } from './evidenceConcentration';

/**
 * Subjects with at least two retained claims.
 *
 * A subject holding one record is single-sourced by arithmetic rather than by
 * concentration, and reporting it as a finding would pad the result with
 * tautologies. Two is the smallest number at which the measure is measuring
 * anything — and because a parameter is part of the computation's identity,
 * changing it later produces a different spec fingerprint rather than silently
 * replacing these results.
 */
export const DEMONSTRATION_PARAMETERS = { minRecords: 2 } as const;

export const DEMONSTRATION_BASIS =
  'Demonstration corpus. The records are committed, synthetic and marked fixture_only, so every artifact below is a true statement about that corpus and no statement at all about the world.';

export const NOT_VALIDATED_BECAUSE =
  'An artifact starts NOT_VALIDATED because a computation exiting zero is a fact about the computation, not about the world. Validation needs held-out records, an independent source or a historical observation to check against, and a demonstration corpus has none of the three.';

export const NOT_SERVED_BECAUSE =
  'A derived claim is servable only once validated, and none of these are. The count of served claims is zero because the path stops at the artifact, not because nobody has got round to serving them.';

export const PROPOSAL_RULE =
  'A gap detection may produce an acquisition proposal and nothing else. The proposal names what to seek, never somewhere to call: it enters the acquisition fabric at its policy gate, and evidence returns through the one admission boundary.';

/** What one run of the spec read, refused to read, and produced. */
export interface DemonstrationRun {
  domain: Domain;
  corpusId: string;
  corpusTitle: string;
  releaseId: string;
  /** The knowledge time the run computed at, derived from the records. */
  knownAt: ISODateTime;
  /** Records still standing at that time, which is what it was allowed to read. */
  read: number;
  /** Records the corpus took back, each with the retraction that took it. */
  takenBack: readonly { recordId: string; retractionId: string; kind: 'CORRECTION' | 'WITHDRAWAL' }[];
  result: WorkloadRunResult;
}

export interface DemonstrationGap {
  gapId: string;
  artifactId: string;
  domain: Domain;
  subject: string;
  missing: string;
  expectedUncertaintyReduction: number;
  detectedAt: ISODateTime;
}

/** A proposal, and only ever a proposal. There is no field here for an endpoint. */
export interface DemonstrationProposal {
  proposalId: string;
  gapId: string;
  subject: string;
  /** What to seek, described. Never a host, a URL or a credential. */
  targetSource: string;
  proposedAt: ISODateTime;
  standing: 'PROPOSED';
  authorizedByKind: null;
  authorizedBy: null;
}

export interface DemonstrationMining {
  readonly fixture_only: true;
  readonly basis: string;
  /** One computation. The identity every run below shares. */
  readonly spec: {
    workloadId: string;
    miningKind: string;
    producesClass: string;
    method: string;
    parameters: Readonly<Record<string, unknown>>;
    implementation: { id: string; version: string };
    outputSchema: string;
    arithmetic: string;
    specFingerprint: string;
  };
  readonly runs: readonly DemonstrationRun[];
  readonly artifacts: readonly ProducedArtifact[];
  readonly gaps: readonly DemonstrationGap[];
  readonly proposals: readonly DemonstrationProposal[];
  /** The rights floor across every artifact: what may be done with all of it. */
  readonly rightsFloor: readonly string[];
  readonly counts: {
    runs: number;
    succeeded: number;
    recordsRead: number;
    recordsTakenBack: number;
    artifacts: number;
    singleSourced: number;
    validated: number;
    served: number;
    gaps: number;
    proposals: number;
    /** Derivations over admitted evidence. Separate, and still zero. */
    admittedDerivations: number;
  };
  readonly notValidatedBecause: string;
  readonly notServedBecause: string;
  readonly proposalRule: string;
}

/**
 * The clock, derived from the records rather than read from the machine.
 *
 * A run stamped with the wall clock would produce a different page on every
 * request and an input fingerprint that moved without any input moving. This
 * takes the latest thing the corpus knows and adds a fixed minute, so the run
 * happens after the corpus knew everything it reads and at the same instant
 * every time.
 */
function clockFor(records: readonly CorpusRecord[]): { startedAt: ISODateTime; completedAt: ISODateTime } {
  const latest = records.reduce((newest, record) => (record.knownAt > newest ? record.knownAt : newest), records[0].knownAt);
  const base = Date.parse(latest);
  return {
    startedAt: new Date(base + 60_000).toISOString(),
    completedAt: new Date(base + 64_000).toISOString(),
  };
}

/** What to seek. Described, because this layer has nowhere to call. */
function targetFor(detail: ConcentrationDetail): string {
  return detail.singleSourced
    ? `An independent registered source covering this subject, other than ${detail.largestSource}.`
    : `An independent registered source covering this subject, outside the ${Math.round(detail.largestShare * 100)}% held by ${detail.largestSource}.`;
}

/**
 * What this module hands to a reader: nothing. Named so the zero above is the
 * length of a set rather than a literal that would go on printing zero after
 * the set stopped being empty.
 */
const SERVED: readonly string[] = [];

export function demonstrationMining(corpora: readonly Corpus[] = FIXTURE_CORPORA): DemonstrationMining {
  const definition = evidenceConcentrationWorkload({ ...DEMONSTRATION_PARAMETERS });
  const runs: DemonstrationRun[] = [];
  const gaps: DemonstrationGap[] = [];
  const proposals: DemonstrationProposal[] = [];

  for (const corpus of corpora) {
    const release = currentRelease(corpus);
    const { startedAt, completedAt } = clockFor(corpus.records);
    const standing = standingRecords(corpus, startedAt);
    const takenBack = takenBackBy(corpus, startedAt);

    /*
     * The real rights, read from the release's own schedules. A source with no
     * schedule contributes nothing, which empties the intersection — the safe
     * direction, and the one a missing schedule should push in.
     */
    const rightsOf = (record: CorpusRecord): readonly string[] => {
      const schedule = release.sources.find((source) => source.sourceId === record.provenance.sourceId);
      return schedule ? [...schedule.permittedUses].sort() : [];
    };

    const result = runWorkload(definition, standing, {
      runId: `DEMO-${corpus.domain}`, startedAt, completedAt, rightsOf,
    });
    runs.push({
      domain: corpus.domain,
      corpusId: corpus.corpusId,
      corpusTitle: corpus.title,
      releaseId: release.releaseId,
      knownAt: startedAt,
      read: standing.length,
      takenBack,
      result,
    });

    /* A gap belongs to the artifact that found it, so the two are zipped by subject within this run. */
    const bySubject = new Map(result.artifacts.map((artifact) => [artifact.subject, artifact]));
    const found = gapsFrom(result.artifacts.map((artifact) => ({
      subject: artifact.subject, detail: artifact.detail as ConcentrationDetail,
    })));
    for (const gap of found) {
      const artifact = bySubject.get(gap.subject);
      if (!artifact) continue;
      const gapId = `${artifact.artifactId}-G`;
      gaps.push({
        gapId,
        artifactId: artifact.artifactId,
        domain: corpus.domain,
        subject: gap.subject,
        missing: gap.missing,
        expectedUncertaintyReduction: gap.expectedUncertaintyReduction,
        detectedAt: completedAt,
      });
      proposals.push({
        proposalId: `${gapId}-P`,
        gapId,
        subject: gap.subject,
        targetSource: targetFor(artifact.detail as ConcentrationDetail),
        proposedAt: completedAt,
        standing: 'PROPOSED',
        authorizedByKind: null,
        authorizedBy: null,
      });
    }
  }

  const artifacts = runs.flatMap((run) => run.result.artifacts);
  return {
    fixture_only: true,
    basis: DEMONSTRATION_BASIS,
    spec: {
      workloadId: definition.workloadId,
      miningKind: definition.miningKind,
      producesClass: definition.producesClass,
      method: definition.method,
      parameters: definition.parameters,
      implementation: definition.implementation,
      outputSchema: definition.outputSchema,
      arithmetic: definition.arithmetic,
      specFingerprint: specFingerprint(definition),
    },
    runs,
    artifacts,
    gaps: [...gaps].sort((a, b) => b.expectedUncertaintyReduction - a.expectedUncertaintyReduction || (a.gapId < b.gapId ? -1 : 1)),
    proposals,
    rightsFloor: inheritedRights(artifacts.map((artifact) => artifact.rights)),
    counts: {
      runs: runs.length,
      succeeded: runs.filter((run) => run.result.status === 'SUCCEEDED').length,
      recordsRead: runs.reduce((total, run) => total + run.read, 0),
      recordsTakenBack: runs.reduce((total, run) => total + run.takenBack.length, 0),
      artifacts: artifacts.length,
      singleSourced: artifacts.filter((artifact) => (artifact.detail as ConcentrationDetail).singleSourced).length,
      /*
       * Both zeros are counted rather than written down. The first counts
       * artifacts whose validation state is anything but NOT_VALIDATED, so it
       * moves the moment one is validated; the second is the length of the set
       * this module serves, which is empty because it serves nothing.
       */
      validated: artifacts.filter((artifact) => artifact.validation !== 'NOT_VALIDATED').length,
      served: SERVED.length,
      gaps: gaps.length,
      proposals: proposals.length,
      admittedDerivations: discoveryStanding().derivations,
    },
    notValidatedBecause: NOT_VALIDATED_BECAUSE,
    notServedBecause: NOT_SERVED_BECAUSE,
    proposalRule: PROPOSAL_RULE,
  };
}
