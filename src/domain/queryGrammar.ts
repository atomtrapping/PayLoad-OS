/**
 * The questions a customer actually asks, over structures that already exist.
 *
 * The served surface is four shapes — releases, records, as-of, retractions —
 * and all four are point or set lookups. The questions worth paying for are not:
 * *what changed about this carrier since March*, *what depends on the record you
 * just corrected*, *which of these facilities have no current inspection*. Those
 * are temporal joins over the correction tape, the supersession chain and the
 * dependency edges — three structures this corpus has, and a grammar it did not.
 *
 * This is the grammar. It adds no storage and no index; it composes what is
 * there into the shapes a buyer asks in, and it refuses the two questions that
 * cannot be answered honestly from a corpus.
 *
 * THE REFUSAL THAT MATTERS: YOU CANNOT ASK WHAT IS MISSING WITHOUT SAYING WHAT
 * SHOULD HAVE BEEN THERE
 *
 * "Which facilities lack a current inspection" is the question this whole
 * discipline exists for, and it is the one a corpus answers wrong by default.
 * A system that scans its own records for absences answers *missing from the
 * set I already hold*, which is circular — it can only ever return nothing,
 * because everything it knows about is something it knows about.
 *
 * So `whatIsMissing` requires the caller to supply the subjects that should
 * have been covered, and refuses without them. The corpus has no census. It can
 * say what it holds and what it does not hold; it cannot say what exists.
 *
 * And the three answers it gives are kept apart, because collapsing them is the
 * calmest lie in the business: HELD, HELD_THEN_WITHDRAWN, and NOT_HELD are
 * three different facts, and only the first is a statement about the world at
 * all. NOT_HELD is a statement about this corpus — the facility may be
 * inspected weekly by someone who never told us.
 */
import { estimateQueryCost, type CostClass } from './queryCost';
import type { Corpus, CorpusRecord, CorpusRelease, Retraction } from './corpus';
import { releaseRecords, releaseRetractions } from './corpus';
import { fanOut, type DependencyIndex, type FanOut } from './dependencyIndex';
import type { RetractionKind } from './corpus';
import type { ISODateTime } from './types';

export const GRAMMAR_METHOD = 'notationsos.query-grammar.v1';

/** The closed set. A question outside it is not asked here rather than approximated. */
export type QuestionShape = 'WHAT_CHANGED' | 'WHAT_DEPENDS_ON' | 'WHAT_IS_MISSING';

export const QUESTION_MEANING: Record<QuestionShape, string> = {
  WHAT_CHANGED: 'What this corpus learned about a subject between two knowledge instants: records that arrived, records a correction replaced, records a withdrawal removed. It is a change log of the corpus, not of the world — a fact that stayed true and was never restated produces no entry.',
  WHAT_DEPENDS_ON: 'What stands on a record, so a correction can reach it. Answered from the prepared dependency adjacency, which costs its own closure rather than the graph.',
  WHAT_IS_MISSING: 'Which of the subjects you name this corpus holds nothing for. It requires the subjects, because a corpus scanning itself for absences answers only about the set it already holds, which is circular.',
};

/* ── What changed ── */

export type ChangeKind = 'ARRIVED' | 'CORRECTED' | 'WITHDRAWN';

export const CHANGE_MEANING: Record<ChangeKind, string> = {
  ARRIVED: 'The record became knowable inside the window. Nothing is claimed about when the fact became true; that is its own clock.',
  CORRECTED: 'A later record replaced this one inside the window. The earlier record stays, and an as-of query before the correction still returns it.',
  WITHDRAWN: 'A withdrawal removed this record inside the window. Withdrawn is not false — it is the corpus ceasing to stand behind it, which is a different claim from asserting the opposite.',
};

export interface Change {
  kind: ChangeKind;
  recordId: string;
  predicate: string;
  at: ISODateTime;
  /** Set on CORRECTED: the record that replaced it. */
  replacedBy?: string;
  /** Set on WITHDRAWN: the retraction that removed it. */
  by?: string;
  because: string;
}

export interface ChangeLog {
  method: typeof GRAMMAR_METHOD;
  shape: 'WHAT_CHANGED';
  subjectId: string;
  window: { since: ISODateTime; knownBy: ISODateTime };
  changes: Change[];
  costClass: CostClass | null;
  because: string;
}

const within = (at: string, since: string, knownBy: string) => at > since && at <= knownBy;

/**
 * Pure: what this corpus learned about one subject between two knowledge
 * instants.
 *
 * A quiet subject produces an empty log, and an empty log means nothing was
 * restated — not that nothing happened. The corpus records what it was told.
 */
export function whatChanged(
  corpus: Corpus,
  release: CorpusRelease,
  q: { subjectId: string; since: ISODateTime; knownBy: ISODateTime },
): ChangeLog {
  const shell = {
    method: GRAMMAR_METHOD as typeof GRAMMAR_METHOD,
    shape: 'WHAT_CHANGED' as const,
    subjectId: q.subjectId,
    window: { since: q.since, knownBy: q.knownBy },
    costClass: estimateQueryCost('AS_OF', 0).costClass,
  };
  if (!(q.since < q.knownBy)) {
    return { ...shell, changes: [], because: `The window is not ordered: ${q.since} is not before ${q.knownBy}, so it spans nothing.` };
  }

  const mine = releaseRecords(corpus, release).filter(
    (record) => record.subjectId === q.subjectId || record.subjectCanonicalId === q.subjectId,
  );
  const byId = new Map(mine.map((record) => [record.recordId, record] as const));
  const retractions = releaseRetractions(corpus, release);
  const changes: Change[] = [];

  for (const record of mine) {
    if (within(record.knownAt, q.since, q.knownBy)) {
      changes.push({ kind: 'ARRIVED', recordId: record.recordId, predicate: record.predicate, at: record.knownAt, because: CHANGE_MEANING.ARRIVED });
    }
    if (record.supersededByRecordId) {
      const replacement: CorpusRecord | undefined = byId.get(record.supersededByRecordId)
        ?? corpus.records.find((entry) => entry.recordId === record.supersededByRecordId);
      if (replacement && within(replacement.knownAt, q.since, q.knownBy)) {
        changes.push({ kind: 'CORRECTED', recordId: record.recordId, predicate: record.predicate, at: replacement.knownAt, replacedBy: replacement.recordId, because: CHANGE_MEANING.CORRECTED });
      }
    }
    if (record.retractedByRetractionId) {
      const retraction: Retraction | undefined = retractions.find((entry) => entry.retractionId === record.retractedByRetractionId);
      if (retraction && retraction.kind === 'WITHDRAWAL' && within(retraction.issuedAt, q.since, q.knownBy)) {
        changes.push({ kind: 'WITHDRAWN', recordId: record.recordId, predicate: record.predicate, at: retraction.issuedAt, by: retraction.retractionId, because: CHANGE_MEANING.WITHDRAWN });
      }
    }
  }

  changes.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.recordId < b.recordId ? -1 : 1));
  return {
    ...shell,
    changes,
    because: changes.length === 0
      ? `Nothing about ${q.subjectId} was restated between ${q.since} and ${q.knownBy}. An empty log says this corpus learned nothing new in the window, not that nothing happened in the world.`
      : `${changes.length} ${changes.length === 1 ? 'change' : 'changes'} to ${q.subjectId} between ${q.since} and ${q.knownBy}. Each names its own instant, and a corrected record stays: an as-of query before the correction still returns the earlier answer.`,
  };
}

/* ── What depends on it ── */

export interface Dependents {
  method: typeof GRAMMAR_METHOD;
  shape: 'WHAT_DEPENDS_ON';
  recordIds: readonly string[];
  restatement: RetractionKind;
  reach: FanOut;
  costClass: CostClass | null;
  because: string;
}

/**
 * Pure: what stands on these records, so a correction can reach it.
 *
 * A thin naming over `fanOut`, and deliberately thin: the walk is already the
 * right shape and this exists so the question has the same surface as the other
 * two rather than being reachable only by knowing the index's own vocabulary.
 */
export function whatDependsOn(index: DependencyIndex, recordIds: readonly string[], restatement: RetractionKind): Dependents {
  const reach = fanOut(index, recordIds, restatement);
  return {
    method: GRAMMAR_METHOD,
    shape: 'WHAT_DEPENDS_ON',
    recordIds,
    restatement,
    reach,
    costClass: estimateQueryCost('DEPENDENCY_FAN_OUT', 0).costClass,
    because: `${reach.reached.length} ${reach.reached.length === 1 ? 'dependent' : 'dependents'} stand on ${recordIds.length} restated ${recordIds.length === 1 ? 'record' : 'records'}. ${reach.coverage}`,
  };
}

/* ── What is missing ── */

/**
 * Three answers, kept apart because collapsing them is the calmest lie here.
 * Only HELD is a statement about the world; the other two are statements about
 * this corpus.
 */
export type Holding = 'HELD' | 'HELD_THEN_WITHDRAWN' | 'NOT_HELD';

export const HOLDING_MEANING: Record<Holding, string> = {
  HELD: 'A record stands for this subject and predicate as of the instant asked about.',
  HELD_THEN_WITHDRAWN: 'A record stood and was withdrawn. That is not the same as never having held one, and it is not a claim that the fact is false.',
  NOT_HELD: 'This corpus holds nothing for that subject and predicate. It is a fact about the corpus and not about the subject — the thing may well be so, and nobody told us.',
};

export interface Coverage {
  subjectId: string;
  holding: Holding;
  recordId?: string;
  at?: ISODateTime;
}

export interface MissingAnswer {
  method: typeof GRAMMAR_METHOD;
  shape: 'WHAT_IS_MISSING';
  predicate: string;
  knownBy: ISODateTime;
  /** Every subject the caller named, with what the corpus holds for it. */
  coverage: readonly Coverage[];
  held: number;
  withdrawn: number;
  notHeld: number;
  because: string;
}

export interface MissingRefusal {
  coverage: null;
  because: string;
}

/**
 * Pure: which of the named subjects this corpus holds nothing for.
 *
 * The subjects are required. A corpus that scanned itself for absences would
 * answer about the set it already holds, which is circular and always empty —
 * everything it knows about is something it knows about. Asking what is missing
 * means saying what should have been there, and only the caller knows that.
 */
export function whatIsMissing(
  corpus: Corpus,
  release: CorpusRelease,
  q: { subjectIds: readonly string[]; predicate: string; knownBy: ISODateTime },
): MissingAnswer | MissingRefusal {
  if (!Array.isArray(q.subjectIds) || q.subjectIds.length === 0) {
    return { coverage: null, because: 'No subjects were named. This corpus has no census: asked to find absences in its own records it would answer about the set it already holds, which is circular and always empty. Naming what should have been covered is the question, not a parameter of it.' };
  }
  if (typeof q.predicate !== 'string' || q.predicate.trim() === '') {
    return { coverage: null, because: 'No predicate was named, so there is nothing to be missing.' };
  }

  const candidates = releaseRecords(corpus, release).filter(
    (record) => record.predicate === q.predicate && record.knownAt <= q.knownBy,
  );
  const retractions = releaseRetractions(corpus, release);

  const coverage: Coverage[] = q.subjectIds.map((subjectId) => {
    const mine = candidates.filter((record) => record.subjectId === subjectId || record.subjectCanonicalId === subjectId);
    if (mine.length === 0) return { subjectId, holding: 'NOT_HELD' };
    const standing = mine.filter((record) => {
      if (!record.retractedByRetractionId) return true;
      const retraction = retractions.find((entry) => entry.retractionId === record.retractedByRetractionId);
      // A withdrawal the corpus did not yet know about at this instant has not happened yet.
      return !(retraction && retraction.kind === 'WITHDRAWAL' && retraction.issuedAt <= q.knownBy);
    });
    if (standing.length === 0) {
      const last = mine[mine.length - 1];
      return { subjectId, holding: 'HELD_THEN_WITHDRAWN', recordId: last.recordId, at: last.knownAt };
    }
    const latest = standing.reduce((best, record) => (record.knownAt > best.knownAt ? record : best), standing[0]);
    return { subjectId, holding: 'HELD', recordId: latest.recordId, at: latest.knownAt };
  });

  const count = (holding: Holding) => coverage.filter((entry) => entry.holding === holding).length;
  const notHeld = count('NOT_HELD');
  return {
    method: GRAMMAR_METHOD,
    shape: 'WHAT_IS_MISSING',
    predicate: q.predicate,
    knownBy: q.knownBy,
    coverage,
    held: count('HELD'),
    withdrawn: count('HELD_THEN_WITHDRAWN'),
    notHeld,
    because: `Of ${q.subjectIds.length} named ${q.subjectIds.length === 1 ? 'subject' : 'subjects'}, this corpus holds ${q.predicate} for ${count('HELD')}, withdrew it for ${count('HELD_THEN_WITHDRAWN')}, and holds nothing for ${notHeld}. The ${notHeld === 1 ? 'last is a fact' : 'last are facts'} about this corpus rather than about ${notHeld === 1 ? 'that subject' : 'those subjects'}: nothing here says the thing is not so, only that nobody told us.`,
  };
}

export const GRAMMAR_LOSS = [
  'This adds no storage and no index. It composes the correction tape, the supersession chain and the dependency adjacency into the shapes a buyer asks in, and every one of them costs what the underlying read costs.',
  'A change log is a log of what the corpus learned. A fact that stayed true and was never restated produces no entry, and an empty log is not a quiet period in the world.',
  'What is missing cannot be asked without naming what should have been there. A corpus scanning itself for absences answers about the set it already holds, which is circular.',
  'NOT_HELD is about the corpus. HELD_THEN_WITHDRAWN is about the corpus ceasing to stand behind a record. Neither is a claim that the fact is false, and only HELD says anything about the world.',
  'Two of the three shapes are scans underneath. Naming a question does not make it cheap, and `queryCost` says which is which.',
] as const;
