/**
 * The globe as an instrument the operator flies, not a display a customer reads.
 *
 * Two different uses of one rendering stack. The display renders adjudicated
 * truth and must never imply more than the corpus asserts — its failure mode is
 * fabrication, and refusal is a rendering state there. The instrument renders
 * the factory floor: the admission queue, the contested subjects, the places the
 * corpus is ignorant of. Its failure mode is wasted motion, which is
 * recoverable, so it may be as dense and synthetic as helps an operator think.
 *
 * That exemption is from the display's epistemics and from nothing else. It is
 * the same exemption internal tooling has from an SLO: nobody adjudicates from
 * it. The write boundary is untouched, and two rules make the difference
 * structural rather than cultural.
 *
 * RULE ONE: IT NEVER WRITES
 *
 * The instrument navigates; the rails decide. No admission, no correction, no
 * merge, no release is initiated from the cockpit. This module imports nothing
 * that can write — `architecture.test.ts` already holds `src/db/admitRecords.ts`
 * as the only door to the records table, and a structural test here holds this
 * module to importing no store at all, so the guarantee is checked rather than
 * promised.
 *
 * The rule is about canonical state, not about HTTP verbs. The twin asks the
 * projection compiler for a placement with a POST, and that is a read expressed
 * as a request body; it changes nothing. What is forbidden is the act, not the
 * method.
 *
 * RULE TWO: IT LABELS ITS OWN CONVENIENCES
 *
 * An instrument may interpolate, smooth and aggregate for legibility — and must
 * say where it did. A dead-reckoned ghost between two fixes is useful and is not
 * an observation, and an operator reading a seamless picture is as misleadable
 * as anyone else. So `convenience` is required on every layer, `NONE` is a claim
 * that nothing was smoothed rather than an omission, and a test holds every
 * layer to declaring one. This is the self-report discipline turned one level
 * inward: the system reporting to its own operator obeys it too.
 *
 * IT READS THROUGH THE GATE
 *
 * A consequence of rule one rather than a third rule, and the reason the
 * integrity blocks stay where they are. The instrument takes the deliverable
 * set for a seat — the same rights and visibility gate the display reads
 * through — so it is a way of flying what a seat may see and never a way around
 * what it may not. An internal instrument that quietly read past the gate would
 * be a rights bypass wearing a cockpit, and the exemption granted here is from
 * the display's epistemics only.
 *
 * That costs the void layer its certainty, and the layer says so rather than
 * papering over it: from a given seat a subject with no position may be one the
 * release never positioned, or one it positioned and does not deliver here. The
 * instrument names both readings and resolves neither, because resolving it
 * would disclose the withholding it is not entitled to disclose.
 *
 * WHAT THE VOID LAYER IS FOR
 *
 * The layer worth the whole exercise. A subject the corpus positions can be
 * flown to; a subject it does not is a hole you cannot fly to, and listing those
 * holes is SILENCE-IS-NOT-ZERO rendered as terrain. An operator scanning
 * coverage sees where this seat is ignorant rather than where the world is
 * empty — the thing is somewhere, and nobody told us here.
 */
import type { AdmittedCount } from './compression';
import {
  LOCATION_POSITION_PREDICATE,
  deliverableRecords,
  recordStatusAt,
  type Corpus,
  type CorpusRelease,
} from './corpus';
import type { ISODateTime, VisibilityClass } from './types';

export const INSTRUMENT_METHOD = 'notationsos.operator-instrument.v1';

/** The two rules, as data, so a reader of the payload meets them rather than the prose. */
export const INSTRUMENT_RULES = Object.freeze([
  'It never writes. No admission, correction, merge or release is initiated from the instrument; it navigates and the rails decide. The rule is about the act and not the HTTP verb: asking the projection compiler for a placement is a read with a request body.',
  'It labels its own conveniences. An instrument may interpolate, smooth and aggregate for legibility, and must say where it did — an operator reading a seamless picture is as misleadable as anyone else.',
]);

/**
 * What a layer did to its numbers for legibility.
 *
 * Required on every layer. NONE is a claim that nothing was smoothed, not a
 * field somebody forgot, and a test holds every layer to declaring one — so the
 * first layer that interpolates has to say so to compile.
 */
export type Convenience = 'NONE' | 'INTERPOLATED' | 'SMOOTHED' | 'AGGREGATED' | 'DEAD_RECKONED';

export const CONVENIENCE_MEANING: Record<Convenience, string> = {
  NONE: 'Counted from the release as it stands. Nothing was filled in, averaged or carried forward.',
  INTERPOLATED: 'Values between two the corpus holds were computed for legibility. The corpus asserts the ends, not the middle.',
  SMOOTHED: 'Noise was reduced for the eye. The shape is easier to read and is no longer the measurement.',
  AGGREGATED: 'Many records were reduced to one mark. The mark stands for a group and answers nothing about a member of it.',
  DEAD_RECKONED: 'A position was carried forward from the last fix on a declared course. It is a guess with a method, and it is not an observation.',
};

/** A reading the instrument cannot take from where it sits is UNKNOWN, never zero. */
export type Reading = number | 'UNKNOWN';

export interface OperatorLayer {
  id: string;
  label: string;
  /** What the operator is looking at when this layer is lit. */
  shows: string;
  reading: Reading;
  convenience: Convenience;
  because: string;
}

/** A subject this seat holds nothing spatial about. A hole, not an absence. */
export interface VoidSubject {
  canonicalId: string;
  subjectId: string;
  subjectType: string;
  /** Records this seat does hold for it, so the hole is specifically spatial. */
  recordsHeld: number;
  because: string;
}

export interface InstrumentReading {
  method: typeof INSTRUMENT_METHOD;
  releaseId: string;
  knownAt: ISODateTime;
  /** The seat flown from. Every layer is counted over what this seat may read, and no layer past it. */
  seat: VisibilityClass;
  layers: readonly OperatorLayer[];
  /** The ignorance layer, listed. Nothing here can be flown to; that is the point. */
  voids: readonly VoidSubject[];
  /** Deliberately false. An instrument is a way of looking, not a thing looked at. */
  isEvidence: false;
  /** Deliberately literal. Nothing here initiates an act on canonical state. */
  writes: 'NONE';
  rules: typeof INSTRUMENT_RULES;
  because: string;
}

const layer = (
  id: string, label: string, shows: string, reading: Reading, convenience: Convenience, because: string,
): OperatorLayer => ({ id, label, shows, reading, convenience, because });

/**
 * Pure: the corpus's own state from one seat, as an operator would fly it.
 *
 * `admitted` is passed rather than read, for the reason the compression
 * derivation settled: a `Corpus` value carries no admission status, and a
 * caller with no store access says UNKNOWN — which is a reading, not a zero.
 */
export function readInstrument(
  corpus: Corpus,
  release: CorpusRelease,
  admitted: AdmittedCount,
  seat: VisibilityClass = 'COUNTERPARTY_SHARED',
): InstrumentReading {
  // The gated set, and nothing wider. An instrument that read past the rights
  // gate would be a bypass wearing a cockpit; this one flies what the seat sees.
  const held = deliverableRecords(corpus, release, seat).records;

  // Positions this seat can stand on, grouped by the subject they are about.
  const positionsBySubject = new Map<string, number>();
  for (const record of held) {
    if (record.predicate !== LOCATION_POSITION_PREDICATE) continue;
    if (recordStatusAt(corpus, record, release.knownAt) === 'RETRACTED') continue;
    positionsBySubject.set(record.subjectCanonicalId, (positionsBySubject.get(record.subjectCanonicalId) ?? 0) + 1);
  }

  // Every subject the operator can select, whether or not it is positioned.
  const subjects = new Map<string, { subjectId: string; subjectType: string; records: number }>();
  for (const record of held) {
    const entry = subjects.get(record.subjectCanonicalId);
    if (entry) entry.records += 1;
    else subjects.set(record.subjectCanonicalId, { subjectId: record.subjectId, subjectType: record.subjectType, records: 1 });
  }

  const voids: VoidSubject[] = [...subjects.entries()]
    .filter(([canonicalId]) => !positionsBySubject.has(canonicalId))
    .map(([canonicalId, entry]) => ({
      canonicalId,
      subjectId: entry.subjectId,
      subjectType: entry.subjectType,
      recordsHeld: entry.records,
      because: `This seat holds ${entry.records} ${entry.records === 1 ? 'record' : 'records'} about ${entry.subjectId} and no position for it. Either the release never positioned it, or it positioned it and does not deliver that here — the instrument names both and resolves neither, because resolving it would disclose a withholding. Either way it cannot be flown to, and that is ignorance rather than emptiness.`,
    }))
    .sort((a, b) => (b.recordsHeld - a.recordsHeld) || (a.subjectId < b.subjectId ? -1 : 1));

  const contested = [...positionsBySubject.values()].filter((count) => count > 1).length;
  const restated = held.filter((record) => recordStatusAt(corpus, record, release.knownAt) !== 'CURRENT').length;

  const layers: OperatorLayer[] = [
    layer('positioned', 'Positioned subjects', 'Subjects this seat holds a standing position for. These are the ones you can fly to.',
      positionsBySubject.size, 'NONE',
      `${positionsBySubject.size} of ${subjects.size} selectable subjects carry a standing position record this seat can read.`),
    layer('void', 'Coverage void', 'Subjects this seat holds records about and no position for. Where the instrument is blind.',
      voids.length, 'NONE',
      `${voids.length} ${voids.length === 1 ? 'subject has' : 'subjects have'} records and no position here. Listed rather than drawn, because a hole has no coordinates — and read as ignorance rather than as emptiness.`),
    layer('contested', 'Contested position', 'Subjects with more than one standing declaration, which the twin compares rather than merges.',
      contested, 'NONE',
      contested === 0
        ? 'No subject carries two standing declarations, so nothing is contested and nothing is being averaged away.'
        : `${contested} ${contested === 1 ? 'subject carries' : 'subjects carry'} more than one standing declaration. The twin shows both and refuses to merge them.`),
    layer('restated', 'Restated', 'Records this seat no longer holds as current: superseded by a correction, or withdrawn.',
      restated, 'NONE',
      `${restated} of ${held.length} readable records are not CURRENT at ${release.knownAt}. They are still here — a restatement removes standing, not history.`),
    layer('admission-queue', 'Admission queue', 'Candidates waiting on the gate. The one reading the instrument cannot take from a page.',
      admitted === 'UNKNOWN' ? 'UNKNOWN' : admitted, 'NONE',
      admitted === 'UNKNOWN'
        ? 'Not readable from here: admission lives at the write boundary and this instrument holds no store connection. An unreadable count is not a zero.'
        : `${admitted} admitted records, supplied by a caller that can read the store.`),
  ];

  return {
    method: INSTRUMENT_METHOD,
    releaseId: release.releaseId,
    knownAt: release.knownAt,
    seat,
    layers,
    voids,
    isEvidence: false,
    writes: 'NONE',
    rules: INSTRUMENT_RULES,
    because: `The corpus's own state at ${release.knownAt} as a ${seat} seat may read it, arranged to be flown rather than read. ${positionsBySubject.size} subjects can be flown to and ${voids.length} cannot, which is the reading worth having: the second number is where this seat is ignorant, not where the world is empty.`,
  };
}

/** Layers whose numbers were touched for legibility, so an operator can see what to distrust. */
export function conveniencesTaken(reading: InstrumentReading): OperatorLayer[] {
  return reading.layers.filter((entry) => entry.convenience !== 'NONE');
}

export const INSTRUMENT_LOSS = [
  'This is a way of looking and not a thing looked at. Nothing here is evidence, nothing here is admissible, and no ruling may cite it.',
  'It never writes. The instrument navigates and the rails decide; a structural test holds this module to importing no store at all, so the guarantee is checked rather than promised.',
  'Every layer declares a convenience. NONE is a claim that nothing was smoothed, so the first layer that interpolates has to say so to compile — an operator reading a seamless picture is as misleadable as anyone else.',
  'It reads through the rights gate rather than around it. Every layer is counted over the deliverable set for the seat, so the instrument flies what a seat may see and is not a way past what it may not.',
  'The void layer lists subjects this seat holds no position for. It cannot draw them, because a hole has no coordinates, and it means ignorance rather than emptiness. It also cannot say which kind of hole it is — undeclared, or declared and withheld here — because saying would disclose the withholding.',
  'A reading the instrument cannot take is UNKNOWN. The admission queue is the standing example: it lives at the write boundary, and a page holds no store connection.',
] as const;
