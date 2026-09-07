import { describe, expect, it } from 'vitest';
import { CARAVAN_CORPUS } from '@/fixtures/caravan/release';
import { currentRelease, releaseRecords } from './corpus';
import { buildDependencyIndex, type DependencyEdge } from './dependencyIndex';
import {
  CHANGE_MEANING,
  GRAMMAR_LOSS,
  HOLDING_MEANING,
  QUESTION_MEANING,
  whatChanged,
  whatDependsOn,
  whatIsMissing,
} from './queryGrammar';

const release = currentRelease(CARAVAN_CORPUS);
const records = releaseRecords(CARAVAN_CORPUS, release);
const EARLY = '2026-01-01T00:00:00Z';
const LATE = release.knownAt;

describe('what changed about a subject', () => {
  it('logs a record arriving, with the knowledge instant it arrived at', () => {
    const subject = records[0].subjectId;
    const log = whatChanged(CARAVAN_CORPUS, release, { subjectId: subject, since: EARLY, knownBy: LATE });
    expect(log.shape).toBe('WHAT_CHANGED');
    expect(log.changes.length).toBeGreaterThan(0);
    expect(log.changes.some((change) => change.kind === 'ARRIVED')).toBe(true);
    for (const change of log.changes) expect(change.at > EARLY && change.at <= LATE).toBe(true);
  });

  /** The corpus carries one correction and one withdrawal; the log must find them. */
  it('logs a correction and a withdrawal as different kinds', () => {
    const kinds = new Set(
      [...new Set(records.map((record) => record.subjectId))]
        .flatMap((subjectId) => whatChanged(CARAVAN_CORPUS, release, { subjectId, since: EARLY, knownBy: LATE }).changes)
        .map((change) => change.kind),
    );
    expect(kinds.has('CORRECTED')).toBe(true);
    expect(kinds.has('WITHDRAWN')).toBe(true);
  });

  it('names the replacement on a correction and the retraction on a withdrawal', () => {
    const all = [...new Set(records.map((record) => record.subjectId))]
      .flatMap((subjectId) => whatChanged(CARAVAN_CORPUS, release, { subjectId, since: EARLY, knownBy: LATE }).changes);
    const corrected = all.find((change) => change.kind === 'CORRECTED')!;
    expect(corrected.replacedBy).toBeTruthy();
    expect(corrected.because).toContain('an as-of query before the correction still returns it');
    const withdrawn = all.find((change) => change.kind === 'WITHDRAWN')!;
    expect(withdrawn.by).toBeTruthy();
    expect(withdrawn.because).toContain('Withdrawn is not false');
  });

  it('orders the log by the instant each change became knowable', () => {
    const subject = records[0].subjectId;
    const instants = whatChanged(CARAVAN_CORPUS, release, { subjectId: subject, since: EARLY, knownBy: LATE }).changes.map((c) => c.at);
    expect([...instants].sort()).toEqual(instants);
  });

  /** An empty log is the corpus saying it learned nothing, not that nothing happened. */
  it('says an empty log is about the corpus, not about the world', () => {
    const log = whatChanged(CARAVAN_CORPUS, release, { subjectId: 'LOT-DOES-NOT-EXIST', since: EARLY, knownBy: LATE });
    expect(log.changes).toEqual([]);
    expect(log.because).toContain('not that nothing happened in the world');
  });

  it('narrows with the window rather than ignoring it', () => {
    const subject = records[0].subjectId;
    const wide = whatChanged(CARAVAN_CORPUS, release, { subjectId: subject, since: EARLY, knownBy: LATE }).changes.length;
    const narrow = whatChanged(CARAVAN_CORPUS, release, { subjectId: subject, since: LATE, knownBy: '2030-01-01T00:00:00Z' }).changes.length;
    expect(narrow).toBeLessThan(wide);
  });

  it('refuses a window that is not ordered', () => {
    const log = whatChanged(CARAVAN_CORPUS, release, { subjectId: records[0].subjectId, since: LATE, knownBy: EARLY });
    expect(log.changes).toEqual([]);
    expect(log.because).toContain('spans nothing');
  });

  it('names the cost class rather than letting a named question read as a cheap one', () => {
    expect(whatChanged(CARAVAN_CORPUS, release, { subjectId: records[0].subjectId, since: EARLY, knownBy: LATE }).costClass).toBe('SCAN');
  });
});

describe('what depends on a record', () => {
  const EDGES: readonly DependencyEdge[] = [
    { dependent: { kind: 'RELEASE', id: 'REL-1' }, dependsOn: 'REC-1', declaredAt: EARLY, because: 'carried in the release' },
    { dependent: { kind: 'RULING', id: 'RUL-1' }, dependsOn: 'REC-1', declaredAt: EARLY, because: 'relied on by the ruling' },
    { dependent: { kind: 'RULING', id: 'RUL-2' }, dependsOn: 'REC-2', declaredAt: EARLY, because: 'relied on by the ruling' },
  ];
  const index = buildDependencyIndex(EDGES);

  it('reaches what stands on the restated record and nothing else', () => {
    const answer = whatDependsOn(index, ['REC-1'], 'CORRECTION');
    expect(answer.shape).toBe('WHAT_DEPENDS_ON');
    expect(answer.reach.reached.map((entry) => entry.dependent.id).sort()).toEqual(['REL-1', 'RUL-1']);
  });

  it('carries the restatement kind through, because a correction and a withdrawal differ downstream', () => {
    expect(whatDependsOn(index, ['REC-1'], 'WITHDRAWAL').restatement).toBe('WITHDRAWAL');
    expect(whatDependsOn(index, ['REC-1'], 'CORRECTION').restatement).toBe('CORRECTION');
  });

  it('is the prepared walk, not a scan', () => {
    expect(whatDependsOn(index, ['REC-1'], 'CORRECTION').costClass).toBe('PREPARED_INDEX');
  });

  it('reaches nothing for a record nothing stands on, and says so', () => {
    const answer = whatDependsOn(index, ['REC-UNUSED'], 'CORRECTION');
    expect(answer.reach.reached).toEqual([]);
    expect(answer.because).toContain('0 dependents');
  });
});

describe('what is missing — and the refusal that makes it answerable', () => {
  const predicate = records[0].predicate;

  /**
   * The question the whole discipline exists for, and the one a corpus answers
   * wrong by default: scanning itself for absences can only ever return nothing.
   */
  it('refuses to look for absences without being told what should have been there', () => {
    const answer = whatIsMissing(CARAVAN_CORPUS, release, { subjectIds: [], predicate, knownBy: LATE });
    expect(answer.coverage).toBeNull();
    expect(answer.because).toContain('circular and always empty');
    expect(answer.because).toContain('no census');
  });

  it('refuses without a predicate, because there is nothing to be missing', () => {
    const answer = whatIsMissing(CARAVAN_CORPUS, release, { subjectIds: ['LOT-5B-221'], predicate: '  ', knownBy: LATE });
    expect(answer.coverage).toBeNull();
  });

  it('answers for every subject named, including the ones it holds nothing for', () => {
    const known = records[0].subjectId;
    const answer = whatIsMissing(CARAVAN_CORPUS, release, { subjectIds: [known, 'LOT-NOBODY-TOLD-US-ABOUT'], predicate, knownBy: LATE });
    if (answer.coverage === null) throw new Error(answer.because);
    expect(answer.coverage).toHaveLength(2);
    expect(answer.coverage.find((entry) => entry.subjectId === known)!.holding).toBe('HELD');
    expect(answer.coverage.find((entry) => entry.subjectId === 'LOT-NOBODY-TOLD-US-ABOUT')!.holding).toBe('NOT_HELD');
    expect(answer.notHeld).toBe(1);
  });

  /** Only HELD says anything about the world. The other two are about the corpus. */
  it('says a NOT_HELD is about the corpus and not about the subject', () => {
    const answer = whatIsMissing(CARAVAN_CORPUS, release, { subjectIds: ['LOT-NOBODY-TOLD-US-ABOUT'], predicate, knownBy: LATE });
    if (answer.coverage === null) throw new Error(answer.because);
    expect(answer.because).toContain('nothing here says the thing is not so, only that nobody told us');
    expect(HOLDING_MEANING.NOT_HELD).toContain('fact about the corpus and not about the subject');
    expect(HOLDING_MEANING.HELD_THEN_WITHDRAWN).toContain('not the same as never having held one');
  });

  it('keeps a withdrawal apart from never having held anything', () => {
    const withdrawn = records.find((record) => record.retractedByRetractionId);
    expect(withdrawn, 'the demonstration corpus should carry a withdrawal').toBeTruthy();
    const answer = whatIsMissing(CARAVAN_CORPUS, release, { subjectIds: [withdrawn!.subjectId], predicate: withdrawn!.predicate, knownBy: LATE });
    if (answer.coverage === null) throw new Error(answer.because);
    expect(answer.coverage[0].holding).toBe('HELD_THEN_WITHDRAWN');
    expect(answer.notHeld).toBe(0);
  });

  /** Bitemporal: a withdrawal the corpus did not yet know about has not happened yet. */
  it('still holds a record at an instant before its withdrawal was issued', () => {
    const withdrawn = records.find((record) => record.retractedByRetractionId)!;
    const retraction = CARAVAN_CORPUS.retractions.find((entry) => entry.retractionId === withdrawn.retractedByRetractionId)!;
    const before = new Date(Date.parse(retraction.issuedAt) - 1000).toISOString();
    const answer = whatIsMissing(CARAVAN_CORPUS, release, { subjectIds: [withdrawn.subjectId], predicate: withdrawn.predicate, knownBy: before });
    if (answer.coverage === null) throw new Error(answer.because);
    expect(answer.coverage[0].holding).toBe('HELD');
  });

  it('holds nothing for a record that was not yet knowable', () => {
    const answer = whatIsMissing(CARAVAN_CORPUS, release, { subjectIds: [records[0].subjectId], predicate, knownBy: EARLY });
    if (answer.coverage === null) throw new Error(answer.because);
    expect(answer.coverage[0].holding).toBe('NOT_HELD');
  });
});

describe('the grammar states what it is', () => {
  it('gives every question shape a meaning, including why the missing one needs subjects', () => {
    expect(Object.keys(QUESTION_MEANING).sort()).toEqual(['WHAT_CHANGED', 'WHAT_DEPENDS_ON', 'WHAT_IS_MISSING']);
    expect(QUESTION_MEANING.WHAT_IS_MISSING).toContain('circular');
    expect(QUESTION_MEANING.WHAT_CHANGED).toContain('not of the world');
    for (const meaning of Object.values(CHANGE_MEANING)) expect(meaning.length).toBeGreaterThan(0);
  });

  it('states that naming a question does not make it cheap', () => {
    const joined = GRAMMAR_LOSS.join(' ');
    expect(joined).toContain('adds no storage and no index');
    expect(joined).toContain('Naming a question does not make it cheap');
    expect(joined).toContain('circular');
  });
});
