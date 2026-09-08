/**
 * One scale for what kind of knowledge a rendered thing is.
 *
 * The instrument references all use colour as a channel: on an air-traffic
 * screen the hue says which class of traffic, on a LiDAR return it says
 * elevation. It never says "this panel is important". This module is that
 * channel for NotationsOS, and what it carries is the distinction the whole
 * system exists to keep — how a thing came to be known.
 *
 * IT IS A PROJECTION, NOT A SEVENTH VOCABULARY
 *
 * The estate already has closed vocabularies: record status, layer state, field
 * presence, projection outcome, the admitted reading. Adding a parallel set of
 * states beside them would be exactly the drift the operating rules forbid —
 * one vocabulary, and it is the registry's. So this scale is declared as a
 * mapping FROM those vocabularies, every member spelled out as a
 * `Record<Vocabulary, Epistemic>`. The compiler holds each map exhaustive,
 * which is stronger than a test would: adding a state to the domain does not
 * fail a check somewhere, it fails to build until somebody decides how the new
 * state is drawn. The decision is forced rather than defaulted.
 *
 * The mappings are the interesting part, and two of them are load-bearing:
 *
 * RETRACTED is WITHDRAWN, never REFUSED. A retraction removes support and puts
 * nothing in its place; a refusal is a gate declining. Drawing them in one
 * colour would flatten WITHDRAWN-IS-NOT-FALSE at the last step, after every
 * layer beneath it kept them apart.
 *
 * An unreadable count is UNKNOWN, never a measured zero. UNKNOWN is the only
 * state drawn hollow and dashed, because it is the absence of a reading rather
 * than a reading of absence.
 */
import type { BlockingOutcome } from './crossLineJoin';
import type { ConsoleState } from './console';
import type { RecordStatus } from './corpus';
import type { LayerState, ProjectionOutcome } from './earth';
import type { FieldPresence } from './statutoryHarvest';

export type Epistemic = 'MEASURED' | 'DERIVED' | 'DECLARED' | 'UNKNOWN' | 'REFUSED' | 'WITHDRAWN';

export const EPISTEMIC_STATES: readonly Epistemic[] = Object.freeze([
  'MEASURED', 'DERIVED', 'DECLARED', 'UNKNOWN', 'REFUSED', 'WITHDRAWN',
]);

export const EPISTEMIC_MEANING: Record<Epistemic, string> = {
  MEASURED: 'Read from a source. Somebody observed this and the corpus retained what they said.',
  DERIVED: 'Computed here from records the corpus holds. Reproducible from the same inputs, and not itself an observation.',
  DECLARED: 'A party asserts it. Recorded as their claim, carried with their identity, and not checked against anything.',
  UNKNOWN: 'Not readable from here. An unreadable count is not a zero, so this is drawn hollow and never as a digit.',
  REFUSED: 'A gate declined, and the reason travels with the refusal. A refusal never yields a row.',
  WITHDRAWN: 'Support was removed and nothing was put in its place. This is not an adverse finding and not a refusal.',
};

/**
 * The second channel. Colour is never alone: each state also carries a stroke
 * treatment in CSS and this word in the markup, so the scale survives a
 * monochrome screen, a colour-blind reader and a printed page.
 */
export const EPISTEMIC_STROKE: Record<Epistemic, 'SOLID' | 'DASHED' | 'DOUBLE'> = {
  MEASURED: 'SOLID', DERIVED: 'SOLID', DECLARED: 'SOLID',
  UNKNOWN: 'DASHED', REFUSED: 'SOLID', WITHDRAWN: 'DOUBLE',
};

/** A record's standing at a knowledge time. RETRACTED is WITHDRAWN and never REFUSED. */
export const EPISTEMIC_OF_RECORD_STATUS: Record<RecordStatus, Epistemic> = {
  CURRENT: 'MEASURED',
  SUPERSEDED: 'WITHDRAWN',
  RETRACTED: 'WITHDRAWN',
};

/** What a twin layer is drawn from. FIXTURE is DECLARED: a demonstration asserts, it does not observe. */
export const EPISTEMIC_OF_LAYER_STATE: Record<LayerState, Epistemic> = {
  BUNDLED: 'MEASURED',
  COMPUTED: 'DERIVED',
  FIXTURE: 'DECLARED',
  UNAVAILABLE: 'UNKNOWN',
  NOT_INTEGRATED: 'UNKNOWN',
};

/**
 * What a declared grammar found in a document. Three absences stay three:
 * ABSENT is UNKNOWN (the document said nothing), MALFORMED is REFUSED (it said
 * something this grammar declines to read), and AMBIGUOUS is REFUSED (it said
 * two things and settling that on document order is a tiebreak nobody
 * authorised).
 */
export const EPISTEMIC_OF_FIELD_PRESENCE: Record<FieldPresence, Epistemic> = {
  PRESENT: 'DECLARED',
  ABSENT: 'UNKNOWN',
  MALFORMED: 'REFUSED',
  AMBIGUOUS: 'REFUSED',
};

export const EPISTEMIC_OF_PROJECTION: Record<ProjectionOutcome['state'], Epistemic> = {
  READY: 'DERIVED',
  UNAVAILABLE: 'UNKNOWN',
  REFUSED: 'REFUSED',
};

/**
 * What running the two present join keys over a cross-line pair established.
 *
 * The three outcomes that ran are DERIVED: they are computed here from records
 * the corpus holds, reproducible from the same inputs, and none of them is an
 * observation of anything. A co-located pair is not measured, and drawing it as
 * measured would let a blocking result borrow the standing of a reading.
 *
 * NOT_KEYABLE is UNKNOWN, not REFUSED, and the difference is where the absence
 * lives. The key derivation does refuse — `spatialKeyFor` declines a position
 * whose source stated no precision, and the reason travels with it. But the
 * outcome being drawn is not the refusal, it is what the pair's co-location
 * reads as afterwards, and that is nothing: not co-located, not apart, no
 * reading at any resolution. UNKNOWN is the only state drawn hollow, which is
 * exactly right for a comparison that was never available.
 */
export const EPISTEMIC_OF_BLOCKING: Record<BlockingOutcome, Epistemic> = {
  CO_LOCATED: 'DERIVED',
  NOT_CO_LOCATED: 'DERIVED',
  NO_TIME_OVERLAP: 'DERIVED',
  NOT_KEYABLE: 'UNKNOWN',
};

/**
 * What a console row is.
 *
 * READ is MEASURED because a console reading is exactly that: a store or a
 * process variable was asked and answered, and the number is what was there.
 * UNREADABLE is UNKNOWN, which is the one that matters — it is the only state
 * drawn hollow, and a console is where the pull toward a confident zero is
 * strongest.
 *
 * DISABLED is DECLARED and deliberately not REFUSED. A refusal is a gate
 * declining a request; a rail an operator never enabled has declined nothing.
 * Drawing the two alike would put every unconfigured rail in refusal red on the
 * terminal's home page, and a reader who sees red on every visit stops reading
 * red at all.
 */
export const EPISTEMIC_OF_CONSOLE: Record<ConsoleState, Epistemic> = {
  READ: 'MEASURED',
  UNREADABLE: 'UNKNOWN',
  DISABLED: 'DECLARED',
  ABSENT: 'UNKNOWN',
};

/**
 * A count the caller may not have been able to take.
 *
 * The one place a number becomes a colour, and the rule is the compression
 * derivation's: 'UNKNOWN' is not zero, and zero is not unknown. A store that
 * answered zero measured a zero and is drawn as measured.
 */
export function epistemicOfReading(value: number | 'UNKNOWN'): Epistemic {
  return value === 'UNKNOWN' ? 'UNKNOWN' : 'MEASURED';
}

export const EPISTEMIC_LOSS = [
  'It is a projection of vocabularies that already exist, not a seventh vocabulary beside them. Each map is a Record over its vocabulary, so the compiler refuses to build until a new domain state is given a drawing, rather than letting it default to a colour.',
  'RETRACTED and SUPERSEDED draw as WITHDRAWN and never as REFUSED. A retraction removes support and puts nothing in its place; flattening it into a refusal at the rendering step would undo the distinction every layer beneath it kept.',
  'UNKNOWN is the absence of a reading and is drawn hollow and dashed. It never renders as a digit, and never as a dash that a reader could take for a zero.',
  'Colour is never the only channel. Every state also carries a stroke treatment and its own word in the markup, so the scale survives a monochrome screen and a colour-blind reader.',
  'Decoration takes no hue. A frame, a rule, a grid and a tick are drawn in the neutral border colours, because a surface that colours its chrome has spent the channel that was supposed to mean something.',
] as const;
