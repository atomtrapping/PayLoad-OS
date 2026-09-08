/**
 * The cross-line blocking keys, computed across three lines that now hold
 * records — and the resolution that still does not exist.
 *
 * The identity core states the moat as a claim: "a Tradewind position resolved
 * to a Landshark parcel exposure through a Caravan flow." Until Tradewind and
 * Landshark held anything, that claim could not even be exercised: the spatial
 * derivation said so in as many words, that the cross-line join "remains a
 * claim about a key rather than a demonstrated answer." Three corpora exist
 * now, so the keys can be run. This module runs them.
 *
 * WHAT IT DEMONSTRATES, AND WHAT IT REFUSES TO
 *
 * Two of the three join keys are PRESENT and are exercised here. The spatial
 * cell blocks two positions when their geohash cells agree at the coarser of
 * their two precisions — never at the finer, because a key is only as sharp as
 * the vaguer of the two sources. The time interval blocks them when their
 * validity intervals overlap.
 *
 * The third key, RESOLVED_ENTITY, is ABSENT, and running the first two does
 * not move it. `resolved` is the literal 0 and `resolutionState` is the
 * literal 'ABSENT', because a blocking key decides which pairs are worth
 * comparing and concludes nothing about any of them. A lot at a berth, a
 * delivery point written against that berth and the parcel the berth sits on
 * are three subjects in one cell over one interval. That is co-location. It is
 * not a relationship, it is not an identity, and calling it either would be
 * the cheapest way to manufacture a moat that is not there.
 *
 * So the honest reading of this module's output is: the blocking keys work
 * across lines, the corpus can now show that they do, and the join the firm
 * claims as its moat still requires the resolution decision object that
 * CROSS_LINE_JOIN.requires names first.
 *
 * TWO CLOCKS, KEPT APART
 *
 * Blocking is computed over VALID time — where the sources say the subjects
 * were — at a stated knowledge time. Overlapping in valid time is coincidence
 * in the world; overlapping in knowledge time is only coincidence in what was
 * known, and confusing the two invents causation from a reporting schedule.
 * The knowledge time bounds which records are considered and their standing;
 * it is never itself the overlap.
 */
import {
  LOCATION_POSITION_PREDICATE,
  currentRelease,
  deliverableRecords,
  recordStatusAt,
  type Corpus,
  type CorpusRecord,
} from './corpus';
import { spatialKeyFor, type KeyRefusal, type SpatialKey } from './spatialKey';
import type { Domain, ISODateTime, VisibilityClass } from './types';

export const CROSS_LINE_METHOD = 'notationsos.cross-line-blocking.v1';

/** What the two present keys say about a pair. Closed; none of them is a resolution. */
export type BlockingOutcome =
  /** Both keyed, cells agree at the coarser precision, validity intervals overlap. */
  | 'CO_LOCATED'
  /** Both keyed, and the cells differ at the coarser precision. */
  | 'NOT_CO_LOCATED'
  /** Both keyed and in one cell, but the intervals never overlap. Same place, different times. */
  | 'NO_TIME_OVERLAP'
  /** At least one position has no key, so no comparison is available at any resolution. */
  | 'NOT_KEYABLE';

export const BLOCKING_MEANING: Record<BlockingOutcome, string> = {
  CO_LOCATED: 'The two positions block together: their cells agree at the coarser of the two precisions and their validity intervals overlap. This says the pair is worth comparing. It says nothing about whether the subjects are related.',
  NOT_CO_LOCATED: 'The cells differ at the coarser precision, so the pair does not block. Nothing follows about the subjects beyond their declared positions being apart at that resolution.',
  NO_TIME_OVERLAP: 'One cell, no shared interval. The subjects were declared in the same place at different times, which is not co-location — it is the same place, twice.',
  NOT_KEYABLE: 'At least one position states no horizontal uncertainty, so it has no key and no comparison exists at any resolution. It is not co-located and it is not apart: it is unkeyable, and a default radius would have invented the answer.',
};

export interface LinePosition {
  domain: Domain;
  corpusId: string;
  releaseId: string;
  subjectId: string;
  subjectType: string;
  recordId: string;
  validFrom: ISODateTime;
  validTo?: ISODateTime;
  key: SpatialKey | null;
  /** The exact reason there is no key, when there is none. Never a default cell. */
  refusal: KeyRefusal | null;
}

export interface BlockingPair {
  left: LinePosition;
  right: LinePosition;
  outcome: BlockingOutcome;
  /** The coarser of the two precisions — the resolution the comparison was actually made at. */
  comparedAtPrecision: number | null;
  comparedCell: string | null;
  /** The shared validity interval, when there is one. Valid time, never knowledge time. */
  overlap: { from: ISODateTime; to: ISODateTime | null } | null;
  because: string;
}

export interface LineStanding {
  domain: Domain;
  corpusId: string;
  releaseId: string;
  positions: number;
  keyed: number;
  unkeyable: number;
}

export interface CrossLineStanding {
  method: typeof CROSS_LINE_METHOD;
  /** The knowledge time the corpora were read at. Bounds which records exist and their standing. */
  knownAt: ISODateTime;
  seat: VisibilityClass;
  lines: LineStanding[];
  /** Cross-line pairs only. Two positions from one line are not a cross-line join. */
  pairs: BlockingPair[];
  coLocated: number;
  /**
   * Deliberately the literal 0, and a test holds it there. Running the two
   * present keys resolves nothing; RESOLVED_ENTITY needs the resolution
   * decision object the identity core names, and this module cannot produce it.
   */
  resolved: 0;
  resolutionState: 'ABSENT';
  because: string;
}

const ts = (value: ISODateTime) => Date.parse(value);

/** Half-open [from, to). An absent `validTo` is open-ended. */
function overlapOf(a: LinePosition, b: LinePosition): { from: ISODateTime; to: ISODateTime | null } | null {
  const aTo = a.validTo === undefined ? Number.POSITIVE_INFINITY : ts(a.validTo);
  const bTo = b.validTo === undefined ? Number.POSITIVE_INFINITY : ts(b.validTo);
  const aFrom = ts(a.validFrom);
  const bFrom = ts(b.validFrom);
  if (aFrom >= bTo || bFrom >= aTo) return null;
  const from = aFrom >= bFrom ? a.validFrom : b.validFrom;
  const to = aTo <= bTo ? (a.validTo ?? null) : (b.validTo ?? null);
  return { from, to };
}

/** Every position the seat may read from one corpus, keyed or refused a key. */
export function linePositions(corpus: Corpus, seat: VisibilityClass = 'COUNTERPARTY_SHARED'): LinePosition[] {
  const release = currentRelease(corpus);
  const held = deliverableRecords(corpus, release, seat).records;
  return held
    .filter((record: CorpusRecord) => record.predicate === LOCATION_POSITION_PREDICATE
      && recordStatusAt(corpus, record, release.knownAt) === 'CURRENT')
    .map((record) => {
      const outcome = spatialKeyFor(record.geometry);
      return {
        domain: corpus.domain,
        corpusId: corpus.corpusId,
        releaseId: release.releaseId,
        subjectId: record.subjectId,
        subjectType: record.subjectType,
        recordId: record.recordId,
        validFrom: record.validFrom,
        ...(record.validTo === undefined ? {} : { validTo: record.validTo }),
        key: outcome.keyed ? outcome.key : null,
        refusal: outcome.keyed ? null : outcome.refusal,
      };
    })
    .sort((a, b) => (a.recordId < b.recordId ? -1 : 1));
}

/** One pair, at the coarser of the two precisions. */
export function blockPair(left: LinePosition, right: LinePosition): BlockingPair {
  const base = { left, right, comparedAtPrecision: null, comparedCell: null, overlap: null } as const;
  if (!left.key || !right.key) {
    const which = !left.key && !right.key ? 'Neither position states' : `${!left.key ? left.recordId : right.recordId} states no`;
    return {
      ...base, outcome: 'NOT_KEYABLE',
      because: `${which} a horizontal uncertainty (${(left.refusal ?? right.refusal) as KeyRefusal}), so there is no key and no comparison at any resolution. A default radius would have invented the answer.`,
    };
  }
  // A key is only as sharp as the vaguer of the two sources.
  const precision = Math.min(left.key.precision, right.key.precision);
  const leftCell = left.key.cell.slice(0, precision);
  const rightCell = right.key.cell.slice(0, precision);
  if (leftCell !== rightCell) {
    return {
      ...base, outcome: 'NOT_CO_LOCATED', comparedAtPrecision: precision, comparedCell: null,
      because: `At precision ${precision}, the coarser of ${left.key.precision} and ${right.key.precision}, the cells differ (${leftCell} against ${rightCell}). The pair does not block.`,
    };
  }
  const overlap = overlapOf(left, right);
  if (!overlap) {
    return {
      ...base, outcome: 'NO_TIME_OVERLAP', comparedAtPrecision: precision, comparedCell: leftCell,
      because: `Both positions key to ${leftCell} at precision ${precision}, and their validity intervals never overlap: ${left.validFrom} → ${left.validTo ?? 'open'} against ${right.validFrom} → ${right.validTo ?? 'open'}. The same place at different times is not co-location.`,
    };
  }
  return {
    outcome: 'CO_LOCATED', left, right, comparedAtPrecision: precision, comparedCell: leftCell, overlap,
    because: `Both positions key to ${leftCell} at precision ${precision}, the coarser of ${left.key.precision} and ${right.key.precision}, and their validity intervals overlap from ${overlap.from} to ${overlap.to ?? 'open'}. The pair blocks, which makes it worth comparing and establishes nothing else: ${left.subjectId} and ${right.subjectId} remain two subjects in two lines with no resolution between them.`,
  };
}

/**
 * Pure: run the two present keys across every cross-line pair the corpora
 * offer, and report what they can and cannot conclude.
 */
export function crossLineStanding(corpora: readonly Corpus[], seat: VisibilityClass = 'COUNTERPARTY_SHARED'): CrossLineStanding {
  const byLine = corpora.map((corpus) => ({ corpus, positions: linePositions(corpus, seat) }));
  const lines: LineStanding[] = byLine.map(({ corpus, positions }) => ({
    domain: corpus.domain,
    corpusId: corpus.corpusId,
    releaseId: currentRelease(corpus).releaseId,
    positions: positions.length,
    keyed: positions.filter((p) => p.key).length,
    unkeyable: positions.filter((p) => !p.key).length,
  }));

  const pairs: BlockingPair[] = [];
  for (let i = 0; i < byLine.length; i += 1) {
    for (let j = i + 1; j < byLine.length; j += 1) {
      for (const left of byLine[i].positions) {
        for (const right of byLine[j].positions) pairs.push(blockPair(left, right));
      }
    }
  }
  const coLocated = pairs.filter((pair) => pair.outcome === 'CO_LOCATED').length;
  const knownAt = byLine.map(({ corpus }) => currentRelease(corpus).knownAt).sort().at(-1) ?? '1970-01-01T00:00:00.000Z';

  return {
    method: CROSS_LINE_METHOD,
    knownAt,
    seat,
    lines,
    pairs,
    coLocated,
    resolved: 0,
    resolutionState: 'ABSENT',
    because: `${lines.length} lines, ${lines.reduce((n, line) => n + line.positions, 0)} declared positions, ${pairs.length} cross-line pairs tested. ${coLocated} block together and 0 are resolved. The blocking keys work across lines and the join does not exist: co-location decides which pairs are worth comparing, and a resolution decision object — evidence, method, version, both clocks, undoable without rewriting history — is what would carry two identifiers to one subject. Nothing here produces one.`,
  };
}

export const CROSS_LINE_LOSS = [
  'Co-location is not a relationship. Two subjects blocking to one cell over one interval have been placed near each other at a resolution, and nothing more has been established about either of them.',
  'The comparison is made at the coarser of the two precisions, never the finer. A key is only as sharp as the vaguer of the two sources, and blocking at the finer resolution would claim a sharpness one of them never stated.',
  'A position with no stated horizontal uncertainty is NOT_KEYABLE, which is neither co-located nor apart. It is kept as published and given no default radius, because a default would invent the answer the source declined to give.',
  'Blocking is computed over valid time at a stated knowledge time. Overlapping in valid time is coincidence in the world; overlapping in knowledge time is only coincidence in what was known, and confusing the two invents causation from a reporting schedule.',
  'resolved is the literal 0 and resolutionState is the literal ABSENT. Running the two present keys does not move the third: RESOLVED_ENTITY needs a resolution decision object, and this module cannot produce one and does not pretend to.',
] as const;
