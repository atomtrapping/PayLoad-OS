/**
 * The first workload: how much of what the corpus says rests on one source.
 *
 * It is deliberately arithmetic. No model, no threshold learned from anything,
 * nothing that could not be recomputed by hand from the same records — because
 * the point of the first one is to prove the path, and a path proved with a
 * fitted model proves the model instead.
 *
 * WHY THIS ONE
 *
 * It is the finding a buyer of evidence actually needs and the one a record
 * count cannot give them. "Eleven claims about this lot" sounds like coverage.
 * "Eleven claims about this lot, all eleven from the party that owns the lot"
 * is a different sentence, and it is the true one. Single-sourcing is not a
 * defect in the corpus; it is a property of the corpus that the corpus should
 * be able to state about itself, and a customer deciding how much weight to
 * put on a subject needs it before they decide anything else.
 *
 * It also feeds the loop directly. A subject resting on one source is exactly
 * where an independent source would most reduce uncertainty, so the same
 * computation that describes the corpus ranks what to acquire next. That is
 * the recursive step, and it falls out of a division rather than out of a
 * model.
 *
 * THE MEASURE
 *
 * The Herfindahl index over sources: the sum of squared shares. One source
 * holding everything gives 1; n sources holding an equal share each give 1/n.
 * It is chosen over "count of sources" because two sources at 50/50 and two at
 * 99/1 are different situations and a count cannot tell them apart.
 *
 * WHAT IT DOES NOT ESTABLISH
 *
 * That the concentrated subject is wrong, or that the diverse one is right.
 * Three sources copying one filing are three sources by this measure and one
 * by any measure that matters, and nothing in the corpus currently records
 * that a source derived its claim from another. The measure counts distinct
 * registered sources, which is what is knowable, and says so.
 */
import type { CorpusRecord } from '@/domain/corpus';
import type { WorkloadDefinition, ComputedClaim } from './engine';

export const CONCENTRATION_METHOD = 'notationsos.mining.evidence-concentration.v1';

/** What the measure counts, and what it cannot see. Carried with the result. */
export const CONCENTRATION_LIMIT =
  'Distinct registered sources, not independent ones. Three sources repeating one filing count as three here; the corpus does not record that a source derived its claim from another, so this measure cannot either.';

export interface ConcentrationDetail extends Record<string, unknown> {
  records: number;
  sources: number;
  /** Herfindahl index over sources: 1 when one source holds everything. */
  herfindahl: number;
  /** The share held by the largest single source. */
  largestShare: number;
  largestSource: string;
  singleSourced: boolean;
  limit: string;
}

/** Exact, so the result is the same on every machine that runs it. */
function ratio(numerator: number, denominator: number): number {
  return Math.round((numerator / denominator) * 1e6) / 1e6;
}

export function concentrationOf(records: readonly CorpusRecord[]): ConcentrationDetail {
  const bySource = new Map<string, number>();
  for (const record of records) {
    const source = record.provenance.sourceId;
    bySource.set(source, (bySource.get(source) ?? 0) + 1);
  }
  const total = records.length;
  const entries = [...bySource.entries()].sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : 1));
  const herfindahl = ratio(entries.reduce((sum, [, count]) => sum + count * count, 0), total * total);
  const [largestSource, largestCount] = entries[0];
  return {
    records: total,
    sources: entries.length,
    herfindahl,
    largestShare: ratio(largestCount, total),
    largestSource,
    singleSourced: entries.length === 1,
    limit: CONCENTRATION_LIMIT,
  };
}

/**
 * The workload. `minRecords` is a parameter rather than a constant because it
 * changes the identity of the computation: a concentration computed over
 * subjects with one record is a different finding from one computed over
 * subjects with three, and the spec fingerprint should say so.
 */
export function evidenceConcentrationWorkload(parameters: { minRecords: number } = { minRecords: 1 }): WorkloadDefinition {
  return {
    workloadId: 'evidence-concentration',
    miningKind: 'DESCRIPTIVE',
    producesClass: 'COMPUTED_RESULT',
    method: CONCENTRATION_METHOD,
    parameters,
    implementation: { id: 'notationsos.discovery', version: '0.1.0' },
    outputSchema: 'payload.derived.evidence-concentration.v1',
    /*
     * Fixed point, and it is true rather than aspirational: the measure is a
     * ratio of integer counts rounded to six places, so it reproduces byte for
     * byte on any machine. A workload that used a float reduction would have to
     * declare FLOATING_POINT and accept the weaker card grade that follows.
     */
    arithmetic: 'FIXED_POINT',

    select: (records) => records,

    compute(records, params): readonly ComputedClaim[] {
      const min = Number((params as { minRecords?: unknown }).minRecords ?? 1);
      const bySubject = new Map<string, CorpusRecord[]>();
      for (const record of records) {
        const list = bySubject.get(record.subjectId) ?? [];
        list.push(record);
        bySubject.set(record.subjectId, list);
      }
      return [...bySubject.entries()]
        .filter(([, group]) => group.length >= min)
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([subject, group]) => {
          const detail = concentrationOf(group);
          return {
            subject,
            claim: detail.singleSourced
              ? `All ${detail.records} retained claims about ${subject} rest on one source, ${detail.largestSource}.`
              : `${detail.records} retained claims about ${subject} rest on ${detail.sources} sources; the largest holds ${Math.round(detail.largestShare * 100)}%.`,
            readRecordIds: group.map((record) => record.recordId).sort(),
            detail,
          };
        });
    },
  };
}

/**
 * The gap the finding implies.
 *
 * A gap and a proposal are separate objects for the same reason a
 * recommendation and a decision are: noticing what is missing is not deciding
 * to go and get it. This returns the gap only, ranked by how much an
 * independent source would reduce the concentration, and something with
 * authority decides what to do about it.
 *
 * The reduction is what the index would fall to if one independent source
 * contributed one claim — arithmetic, not an estimate. A subject already
 * resting on many sources gets a small number and sorts to the bottom, which
 * is the ranking behaving correctly rather than a tuned weight.
 */
export interface EvidenceGap {
  subject: string;
  missing: string;
  expectedUncertaintyReduction: number;
}

export function gapsFrom(details: ReadonlyArray<{ subject: string; detail: ConcentrationDetail }>): readonly EvidenceGap[] {
  return details
    .map(({ subject, detail }) => {
      const counts = [detail.largestShare * detail.records, ...Array(detail.sources - 1).fill((detail.records - detail.largestShare * detail.records) / Math.max(detail.sources - 1, 1))];
      const total = detail.records + 1;
      const after = ratio([...counts, 1].reduce((sum, count) => sum + count * count, 0), total * total);
      return {
        subject,
        missing: `Every retained claim about ${subject} traces to ${detail.sources === 1 ? `one source, ${detail.largestSource}` : `${detail.sources} sources, ${Math.round(detail.largestShare * 100)}% of them to ${detail.largestSource}`}. No independent source covers it.`,
        expectedUncertaintyReduction: ratio(detail.herfindahl - after, 1),
      };
    })
    .filter((gap) => gap.expectedUncertaintyReduction > 0)
    .sort((a, b) => b.expectedUncertaintyReduction - a.expectedUncertaintyReduction || (a.subject < b.subject ? -1 : 1));
}
