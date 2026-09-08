/**
 * A claim with coordinates, met by the corpus at those coordinates.
 *
 * A headline is a claim by a source at a publication time. It is never a fact:
 * it enters below the waterline like any other candidate, with an evidence
 * class (reported, asserted, interest unknown), a source, and both clocks. Its
 * geocode is itself an observation — a method produced coordinates and an
 * uncertainty from the text — and is carried as one, not as a property of the
 * event.
 *
 * What makes this the instrument's and not a news map is the second half. A
 * located claim is drawn against the corpus's own belief: the card at the
 * coordinates does not say what the source said, it says whether this system
 * corroborates it, conflicts with it, cannot evaluate it, or holds nothing
 * there at all. A headline that disagrees with the corpus is the most useful
 * object on the globe — the corpus is thin there, the source is wrong, or
 * something changed — and each of those is work.
 *
 * ONE VOCABULARY
 *
 * The four states ride on `CheckStatus`, which the case checks already use:
 * PASSED is corroborated, FAILED is conflicting, NOT_EVALUATED is
 * uncorroborated and NOT_APPLICABLE is not in coverage. `CORROBORATION_LABEL`
 * is a label map over that vocabulary, not a fifth closed set beside it. The
 * word is CORROBORATED rather than CONFIRMED because the estate already holds
 * that a single account is not corroborated by standing alone: a headline and
 * a record are two accounts agreeing, which is corroboration, and confirmation
 * would be a stronger word than two accounts earn.
 *
 * TWO CLOCKS, BOTH SHOWN
 *
 * A claim is checked twice: against what the corpus held when the claim was
 * captured, and against what it holds now. The two can differ, and when they
 * do the difference is the corpus learning something — a draft-survey figure
 * that corroborated a headline in August conflicts with it after the
 * weighbridge ticket became knowable. The card shows both readings and the
 * marker draws the current one. Collapsing them would be the backfill mistake
 * the as-of law exists to refuse.
 *
 * NEVER A FAKE PIN
 *
 * A geocode with no stated uncertainty is not placed. A point drawn without a
 * radius is a precision claim nobody made, and the spatial derivation already
 * refuses to key such a position; this follows it. An unplaceable claim is
 * listed with the reason and can still be selected, read and checked against
 * the corpus — it simply has nowhere to be flown to.
 *
 * NOTHING WRITES
 *
 * This module reads the corpus and returns readings. If a checked claim ought
 * to become a candidate, that is the intake rail's decision under its own
 * receipts; the card navigates and the rails decide.
 */
import {
  LOCATION_POSITION_PREDICATE,
  queryAsOf,
  recordStatusAt,
  releaseRecords,
  releaseRetractions,
  type AsOfRefusal,
  type Corpus,
  type CorpusRecord,
  type CorpusRelease,
  type RecordGeometry,
  type RecordStatus,
  type Retraction,
  type UncertaintyBounds,
} from './corpus';
import { representativePointOf } from './spatialKey';
import type { CaptureOrigin } from './statutoryHarvest';
import type { CheckStatus, EvidenceClass, ISODateTime } from './types';

export const LOCATED_CLAIM_METHOD = 'notationsos.located-claim.v1';

/** Where coordinates came from, carried as the observation it is. */
export interface Geocode {
  /**
   * The shape the coordinates name: a point, a boundary or a containing
   * rectangle. It is called a geocode because it locates something, not
   * because the answer is always a pin.
   */
  geometry: RecordGeometry;
  /** The method that produced the coordinates. A drafted specimen declares them; a geocoder would name its version. */
  method: string;
  because: string;
}

/** What a headline asserts, in the corpus's own terms — or null when it names no predicate this corpus holds. */
export interface Assertion {
  subjectId: string;
  predicate: string;
  value: string | number;
  /** The world time the assertion is about. */
  validAt: ISODateTime;
}

export interface LocatedClaim {
  kind: 'CLAIM';
  claimId: string;
  headline: string;
  source: { sourceId: string; displayName: string };
  evidenceClass: EvidenceClass;
  /** When the source published it. Source time. */
  publishedAt: ISODateTime;
  /** When this system obtained it. Acquisition time; never before publication. */
  capturedAt: ISODateTime;
  /** Declared, never inferred: a drafted specimen and a captured wire item look the same on the page. */
  beganAs: CaptureOrigin;
  geocode: Geocode;
  asserts: Assertion | null;
}

/** An event from the corpus's own ledger, placed at its subject's declared position. The best source there is. */
export interface LedgerEvent {
  kind: 'LEDGER_EVENT';
  eventId: string;
  retraction: Retraction;
  /** The subject of the first affected record; the card names all of them. */
  subjectId: string;
  affectedSubjectIds: string[];
  /** From the subject's own position record, current at the instant the retraction was issued. Null when the subject has none. */
  geocode: Geocode | null;
}

export type LocatedItem = LocatedClaim | LedgerEvent;

/** The evidence class a wire item arrives with. Reported by a source, asserted rather than measured, interest unknown. */
export const WIRE_EVIDENCE_CLASS: EvidenceClass = Object.freeze({ claimStrength: 'reported', productionClass: 'asserted', interest: 'unknown' });

export type CorroborationWord = 'CORROBORATED' | 'CONFLICTING' | 'UNCORROBORATED' | 'NOT_IN_COVERAGE';

/** A label map over the check vocabulary, held exhaustive by the compiler. */
export const CORROBORATION_LABEL: Record<CheckStatus, CorroborationWord> = {
  PASSED: 'CORROBORATED',
  FAILED: 'CONFLICTING',
  NOT_EVALUATED: 'UNCORROBORATED',
  NOT_APPLICABLE: 'NOT_IN_COVERAGE',
};

export const CORROBORATION_MEANING: Record<CheckStatus, string> = {
  PASSED: 'The corpus holds a record that agrees with the claim within the record’s own stated bounds. Two accounts agree; neither is confirmed by the other.',
  FAILED: 'The corpus holds a record the claim falls outside of. One of them is wrong, or something changed, and either is work.',
  NOT_EVALUATED: 'The corpus holds something on the point and cannot compare it: the record states no bounds and the values differ, or the only record was withdrawn. No tolerance is assumed.',
  NOT_APPLICABLE: 'The corpus holds nothing that answers the claim from this seat. That is where this system is ignorant, not where the claim is false.',
};

/**
 * The record a claim was checked against, in the fields the check used. Not
 * the whole as-of answer: a refusal carries the records it considered and why,
 * and that list can name records this seat is not shown. The card gets what it
 * needs to say and nothing the gate withheld.
 */
export interface CheckedRecord {
  recordId: string;
  value: string | number;
  unit?: string;
  uncertainty?: UncertaintyBounds;
  status: RecordStatus;
  validFrom: ISODateTime;
  validTo?: ISODateTime;
  knownAt: ISODateTime;
}

export interface Corroboration {
  status: CheckStatus;
  label: CorroborationWord;
  /** The knowledge time the check was bounded by. */
  knownAt: ISODateTime;
  /** The corpus's refusal, code and reason only, when it refused. */
  refusal: { code: AsOfRefusal['code']; reason: string } | null;
  /** The record the claim was compared with, when the corpus answered. */
  record: CheckedRecord | null;
  because: string;
}

export interface ClaimReading {
  /** Against what the corpus held when the claim was captured. */
  atCapture: Corroboration;
  /** Against what the corpus holds at the release cutoff. The marker draws this one. */
  now: Corroboration;
}

export type Placement =
  | { placed: true; radiusM: number }
  | { placed: false; because: string };

/** One located item as the twin receives it: the item, whether it can be drawn, and — for a claim — its two readings. */
export interface LocatedReading {
  method: typeof LOCATED_CLAIM_METHOD;
  item: LocatedItem;
  placement: Placement;
  reading: ClaimReading | null;
}

const readable = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const instantOf = (value: string): number | null => { const ms = Date.parse(value); return Number.isFinite(ms) ? ms : null; };

/**
 * A geocode is drawn only with a radius. Without one, the honest rendering is
 * no rendering: listed, selectable, checked, and nowhere to fly to.
 */
export function placementOf(geocode: Geocode | null): Placement {
  if (!geocode) return { placed: false, because: 'No position: the subject has no declared position record, so there are no coordinates to draw at.' };
  const { longitude, latitude } = representativePointOf(geocode.geometry);
  const { horizontalUncertaintyM } = geocode.geometry;
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return { placed: false, because: 'The coordinates are outside the datum’s range, so they name no point on the ellipsoid.' };
  }
  if (horizontalUncertaintyM === undefined || !Number.isFinite(horizontalUncertaintyM) || horizontalUncertaintyM <= 0) {
    return { placed: false, because: 'The geocode states no horizontal uncertainty. A shape drawn without a stated accuracy would be a precision claim nobody made — a bare pin has no size at all, and a bare boundary asserts its own edges are exact — so it is listed and not drawn.' };
  }
  return { placed: true, radiusM: horizontalUncertaintyM };
}

/**
 * Take a supplied claim, or refuse it with the reason. Refusals are values, as
 * the harvest rail returns them: a caller cannot obtain a claim by ignoring
 * an outcome it did not like.
 */
export function validateClaim(value: LocatedClaim): { claim: LocatedClaim; because: string } | { claim: null; because: string } {
  if (!readable(value.claimId)) return { claim: null, because: 'The claim declares no identifier.' };
  if (!readable(value.headline)) return { claim: null, because: 'The claim has no headline; there is nothing to check.' };
  if (!readable(value.source?.sourceId) || !readable(value.source?.displayName)) return { claim: null, because: 'The claim names no source. A claim with no source is a sentence.' };
  if (value.beganAs !== 'OPERATOR_CAPTURE' && value.beganAs !== 'DRAFTED_SPECIMEN') {
    return { claim: null, because: 'The claim does not declare whether it is a captured wire item or a drafted specimen. This module cannot tell them apart and will not guess.' };
  }
  const published = readable(value.publishedAt) ? instantOf(value.publishedAt) : null;
  const captured = readable(value.capturedAt) ? instantOf(value.capturedAt) : null;
  if (published === null || captured === null) return { claim: null, because: 'A publication time and a capture time are both required and at least one is missing or unreadable.' };
  if (captured < published) return { claim: null, because: `The capture time ${value.capturedAt} precedes the publication time ${value.publishedAt}. This system cannot have obtained a headline before its source published it; the claim is incoherent and refused at the boundary.` };
  if (!value.geocode || !value.geocode.geometry || !readable(value.geocode.method)) return { claim: null, because: 'The claim carries no geocode with a method. Coordinates with no method are a guess with no author.' };
  if (value.asserts !== null) {
    const a = value.asserts;
    if (!readable(a.subjectId) || !readable(a.predicate) || (typeof a.value !== 'number' && !readable(a.value)) || instantOf(a.validAt) === null) {
      return { claim: null, because: 'The assertion is malformed: it must name a subject, a predicate, a value and a world time, or be null.' };
    }
  }
  return { claim: value, because: `Accepted as a ${value.beganAs} from ${value.source.displayName}, published ${value.publishedAt}, captured ${value.capturedAt}. Nothing here is believed; it is what the source said, kept beside where the corpus stands.` };
}

function compareToRecord(claimValue: string | number, record: CorpusRecord): { status: CheckStatus; because: string } {
  const held = record.value;
  if (typeof claimValue === 'number' && typeof held === 'number') {
    const low = record.uncertainty?.low;
    const high = record.uncertainty?.high;
    const unit = record.unit ? ` ${record.unit}` : '';
    if (low !== undefined || high !== undefined) {
      const inside = (low === undefined || claimValue >= low) && (high === undefined || claimValue <= high);
      const bounds = `[${low ?? '−∞'}, ${high ?? '+∞'}]${unit}`;
      return inside
        ? { status: 'PASSED', because: `${claimValue}${unit} lies within ${record.recordId}’s stated bounds ${bounds} (${record.uncertainty?.semantics ?? 'bounds as stated'}).` }
        : { status: 'FAILED', because: `${claimValue}${unit} falls outside ${record.recordId}’s stated bounds ${bounds} (${record.uncertainty?.semantics ?? 'bounds as stated'}). The record holds ${held}${unit}.` };
    }
    if (claimValue === held) return { status: 'PASSED', because: `${claimValue}${unit} equals ${record.recordId}’s ${held}${unit}. The record states no bounds, so equality is the only agreement available to it.` };
    return { status: 'NOT_EVALUATED', because: `${claimValue}${unit} differs from ${record.recordId}’s ${held}${unit} by ${Math.abs(claimValue - held)}${unit}, and the record states no bounds. No tolerance is assumed, so this is neither agreement nor conflict.` };
  }
  const same = String(claimValue).trim().toLowerCase() === String(held).trim().toLowerCase();
  return same
    ? { status: 'PASSED', because: `The claim’s “${claimValue}” matches ${record.recordId}’s “${held}”.` }
    : { status: 'FAILED', because: `The claim’s “${claimValue}” does not match ${record.recordId}’s “${held}”. A categorical value has no tolerance; a different value is a different claim.` };
}

/** One check, bounded by one knowledge time. */
export function corroborateAt(corpus: Corpus, release: CorpusRelease, claim: LocatedClaim, knownAt: ISODateTime): Corroboration {
  if (!claim.asserts) {
    return { status: 'NOT_APPLICABLE', label: 'NOT_IN_COVERAGE', knownAt, refusal: null, record: null, because: 'The headline names no predicate this corpus holds, so there is nothing to check it against. It is kept as a located claim and stands beside the corpus, not inside it.' };
  }
  const answer = queryAsOf(corpus, release, {
    subjectId: claim.asserts.subjectId, predicate: claim.asserts.predicate,
    validAt: claim.asserts.validAt, knownAt, question: 'WHAT_WE_HELD',
  }, { enforceRights: true, viewer: 'COUNTERPARTY_SHARED' });
  if (answer.refusal) {
    const code = answer.refusal.code;
    const status: CheckStatus = code === 'RETRACTED' || code === 'QUESTION_NOT_ANSWERABLE' ? 'NOT_EVALUATED' : 'NOT_APPLICABLE';
    return { status, label: CORROBORATION_LABEL[status], knownAt, refusal: { code, reason: answer.refusal.reason }, record: null, because: `${code}: ${answer.refusal.reason}` };
  }
  if (!answer.record) {
    return { status: 'NOT_APPLICABLE', label: 'NOT_IN_COVERAGE', knownAt, refusal: null, record: null, because: 'The corpus returned neither a record nor a refusal, which is a hole this reading declines to paper over.' };
  }
  const r = answer.record;
  const record: CheckedRecord = {
    recordId: r.recordId, value: r.value, ...(r.unit === undefined ? {} : { unit: r.unit }), ...(r.uncertainty === undefined ? {} : { uncertainty: r.uncertainty }),
    status: answer.status ?? 'CURRENT', validFrom: r.validFrom, ...(r.validTo === undefined ? {} : { validTo: r.validTo }), knownAt: r.knownAt,
  };
  const compared = compareToRecord(claim.asserts.value, r);
  return { status: compared.status, label: CORROBORATION_LABEL[compared.status], knownAt, refusal: null, record, because: compared.because };
}

/** Both clocks. The marker draws `now`; the card shows both, because when they differ the corpus learned something. */
export function corroborate(corpus: Corpus, release: CorpusRelease, claim: LocatedClaim): ClaimReading {
  return {
    atCapture: corroborateAt(corpus, release, claim, claim.capturedAt),
    now: corroborateAt(corpus, release, claim, release.knownAt),
  };
}

/**
 * The corpus's own ledger as located events: every retraction knowable by the
 * release, placed at its subject's own declared position as it stood when the
 * retraction was issued. A subject with no position gives an event with no
 * geocode, which is listed and not drawn.
 */
export function locateLedgerEvents(corpus: Corpus, release: CorpusRelease): LedgerEvent[] {
  const records = releaseRecords(corpus, release);
  const byId = new Map(records.map((record) => [record.recordId, record]));
  return releaseRetractions(corpus, release).map((retraction) => {
    const affected = retraction.affectedRecordIds.map((id) => byId.get(id)).filter((record): record is CorpusRecord => Boolean(record));
    const subjects = [...new Set(affected.map((record) => record.subjectId))];
    const first = affected[0];
    // The latest position the subject had declared by the time the retraction
    // was issued. Its validity may have ended before that instant: the event is
    // drawn where the subject was last declared to be, and where it was when
    // the retraction was issued is not held — which the geocode says.
    const position = first
      ? records
        .filter((record) => record.subjectCanonicalId === first.subjectCanonicalId && record.predicate === LOCATION_POSITION_PREDICATE
          && record.knownAt <= retraction.issuedAt && recordStatusAt(corpus, record, retraction.issuedAt) === 'CURRENT' && record.geometry)
        .sort((a, b) => (a.validFrom < b.validFrom ? 1 : -1))[0]
      : undefined;
    const geocode: Geocode | null = position?.geometry
      ? {
        geometry: position.geometry, method: 'notationsos.geocode.declared-position.v1',
        because: `${first!.subjectId}’s last declared position, ${position.recordId}, valid ${position.validFrom} → ${position.validTo ?? 'open'}. Where the subject was when ${retraction.retractionId} was issued is not held; this is where it was last declared to be.`,
      }
      : null;
    return {
      kind: 'LEDGER_EVENT', eventId: retraction.retractionId, retraction,
      subjectId: first?.subjectId ?? 'UNKNOWN', affectedSubjectIds: subjects, geocode,
    };
  });
}

/** Everything the twin draws and lists: the ledger's events, then the supplied claims, each with its placement and readings. */
export function locateAll(corpus: Corpus, release: CorpusRelease, claims: readonly LocatedClaim[]): LocatedReading[] {
  const events: LocatedReading[] = locateLedgerEvents(corpus, release).map((item) => ({
    method: LOCATED_CLAIM_METHOD, item, placement: placementOf(item.geocode), reading: null,
  }));
  const checked: LocatedReading[] = claims.map((claim) => ({
    method: LOCATED_CLAIM_METHOD, item: claim, placement: placementOf(claim.geocode), reading: corroborate(corpus, release, claim),
  }));
  return [...events, ...checked];
}

export const LOCATED_CLAIM_LOSS = [
  'A headline is a claim, never a fact. It enters as a candidate with an evidence class, a source and both clocks, and nothing here believes it; the card says where the corpus stands beside it.',
  'The four states are the check vocabulary the case checks already use, labelled for claims. CORROBORATED and not CONFIRMED, because two accounts agreeing is corroboration and a single account is not corroborated by standing alone.',
  'A claim is checked at two knowledge times and both are shown. The marker draws the current reading; the card shows what the corpus held when the claim was captured, because when the two differ the corpus learned something.',
  'A geocode with no stated uncertainty is not drawn, whatever its shape. A point without a radius is a precision claim nobody made, and a boundary without one asserts its own edges are exact; either way the claim is listed, selectable and checked, and has nowhere to be flown to.',
  'NOT_IN_COVERAGE is where this system is ignorant, not where the claim is false. It is the most honest state a corpus with nothing admitted can show, and it is expected to be the common one until the first real facts land.',
  'Nothing writes. If a checked claim ought to become a candidate, that is the intake rail’s decision under its own receipts; the card navigates and the rails decide.',
] as const;
