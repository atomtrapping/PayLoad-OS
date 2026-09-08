/**
 * The seam a collecting connector plugs into.
 *
 * The harvester's intake is bytes a caller posts. That is deliberate and it is
 * also the whole of the remaining distance: everything downstream — the
 * grammar, the resolver, the clocks, the gate, the receipt, the as-of query —
 * runs identically whether the bytes arrived by POST or by a scheduled fetch,
 * because none of them can tell the difference and none of them tries.
 *
 * What was missing is the shape of the thing that would fetch. Without it,
 * "light the source" is not one step: it is one step plus however much
 * integration nobody has scoped. This declares the contract so the step is
 * bounded — an operator implements one interface, registers it, and the rest of
 * the rail is already built and already tested.
 *
 * WHY NOTHING HERE COLLECTS
 *
 * `performsCollection` is a property a source declares, and the only source
 * registered in this repository declares it `false`. Collecting against a
 * regulator means the operator's credentials, the operator's IP, the operator's
 * reading of the source's terms of use and the operator's decision about rate
 * and cadence. None of those are this repository's to make, so the connector
 * that makes them is the operator's to write and to register.
 *
 * This module therefore has no network path either, and a test asserts that as
 * it does for the harvester. What it has is the interface, the registry, and an
 * honest count of how many registered sources actually collect — which is zero,
 * and which the served payload states rather than leaving to be discovered.
 */
import type { ISODateTime } from './types';
import type { CaptureDeclaration, JurisdictionId } from './statutoryHarvest';

export const INTAKE_METHOD = 'notationsos.statutory-intake.v1';

/** One document offered to the rail, with the declaration that travels with it. */
export interface OfferedDocument {
  declaration: CaptureDeclaration;
  text: string;
}

/**
 * What an operator's connector must implement.
 *
 * One method, and it returns documents rather than writing them: a source
 * offers, and the rail decides. A connector that admitted its own output would
 * be the collection stage ruling on itself, which is the same mistake the gate
 * refuses one stage later.
 */
export interface StatutoryCaptureSource {
  readonly id: string;
  readonly jurisdiction: JurisdictionId;
  /** The publication endpoint an operator would collect from. Recorded here, never visited by this repository. */
  readonly publicationUrl: string;
  /**
   * Whether this source reaches a regulator. False for everything registered
   * here, and the reason is a boundary rather than an omission: credentials,
   * terms of use, cadence and rate are the operator's decisions.
   */
  readonly performsCollection: boolean;
  /**
   * What the operator must settle before a collecting implementation is
   * legitimate. Stated per source so the work is visible rather than assumed.
   */
  readonly operatorPreconditions: readonly string[];
  /** Documents published at or after `since` that this source can offer. */
  offer(since: ISODateTime): Promise<OfferedDocument[]>;
}

/**
 * The only source registered here: the caller is the source.
 *
 * It collects nothing, offers nothing on its own, and exists so the registry
 * describes the real state of intake rather than being empty. The documents a
 * POST carries arrive through the route, not through this.
 */
export const SUPPLIED_BYTES_SOURCE: StatutoryCaptureSource = Object.freeze({
  id: 'supplied-bytes',
  jurisdiction: 'FL_OIR',
  publicationUrl: 'urn:payload:supplied-by-caller',
  performsCollection: false,
  operatorPreconditions: [
    'None. The caller supplies the bytes and carries whatever rights they had to obtain them.',
  ],
  offer: async () => [],
});

/**
 * What an operator connector for each jurisdiction would have to settle.
 *
 * Declared as data rather than prose so the remaining distance is countable.
 * None of these is a code problem; each is a decision only the operator can
 * make, which is why the connector is theirs and not this repository's.
 */
export const UNREGISTERED_JURISDICTIONS: ReadonlyArray<{
  jurisdiction: JurisdictionId;
  regulator: string;
  publicationUrl: string;
  operatorPreconditions: readonly string[];
}> = Object.freeze([
  {
    jurisdiction: 'FL_OIR',
    regulator: 'Florida Office of Insurance Regulation',
    publicationUrl: 'https://www.floir.com/',
    operatorPreconditions: [
      'A read of the publication terms of use, and a decision that scheduled retrieval is within them.',
      'A declared cadence and rate, so collection is a stated policy rather than whatever a loop happened to do.',
      'A declared retention and republication right, which becomes the rights decision the gate checks.',
      'A named admission authority, because the gate refuses a ruling whose authority is the method.',
    ],
  },
  {
    jurisdiction: 'CA_CDI',
    regulator: 'California Department of Insurance',
    publicationUrl: 'https://www.insurance.ca.gov/',
    operatorPreconditions: [
      'The same four, and one more: many CDI bulletins address a class of insurers rather than a named carrier, so the operator must decide whether a class is a subject the corpus will carry. Until they do, those filings are correctly refused on SUBJECT_IDENTIFIED.',
    ],
  },
  {
    jurisdiction: 'TX_TDI',
    regulator: 'Texas Department of Insurance',
    publicationUrl: 'https://www.tdi.texas.gov/',
    operatorPreconditions: [
      'The same four, and one more: TDI orders commonly condition their effective date on an event rather than stating an instant, so the operator must decide whether an event-conditioned order gets a bracketed world time from a later observation or stays refused. Until they do, those filings are correctly refused on BOTH_CLOCKS.',
    ],
  },
]);

export const REGISTERED_SOURCES: readonly StatutoryCaptureSource[] = Object.freeze([SUPPLIED_BYTES_SOURCE]);

export interface IntakeStatus {
  method: typeof INTAKE_METHOD;
  registered: number;
  collecting: number;
  sources: ReadonlyArray<{ id: string; jurisdiction: JurisdictionId; performsCollection: boolean; publicationUrl: string; operatorPreconditions: readonly string[] }>;
  unregistered: typeof UNREGISTERED_JURISDICTIONS;
  because: string;
}

/**
 * Pure: how much of the intake actually collects.
 *
 * The answer is zero, and saying so is the point. A reader who wants to know
 * whether anything entered this chain that a tester did not post reads this
 * number and does not have to take anyone's word.
 */
export function intakeStatus(sources: readonly StatutoryCaptureSource[] = REGISTERED_SOURCES): IntakeStatus {
  const collecting = sources.filter((source) => source.performsCollection);
  return {
    method: INTAKE_METHOD,
    registered: sources.length,
    collecting: collecting.length,
    sources: sources.map((source) => ({
      id: source.id,
      jurisdiction: source.jurisdiction,
      performsCollection: source.performsCollection,
      publicationUrl: source.publicationUrl,
      operatorPreconditions: source.operatorPreconditions,
    })),
    unregistered: UNREGISTERED_JURISDICTIONS,
    because: collecting.length === 0
      ? `${sources.length} source${sources.length === 1 ? '' : 's'} registered and none collects. Every document this rail has processed was supplied by a caller, which is the honest state and not a defect: the connector that would reach a regulator carries the operator's credentials and the operator's reading of the source's terms, so it is theirs to write and to register. Everything downstream of intake is built and tested and cannot tell how the bytes arrived.`
      : `${collecting.length} of ${sources.length} registered sources collect: ${collecting.map((source) => source.id).join(', ')}. Documents from a collecting source are captures rather than supplied bytes, and must declare beganAs OPERATOR_CAPTURE.`,
  };
}

export const INTAKE_LOSS = [
  'This declares the shape of a collecting connector. It does not collect, and registering a source that does is the operator’s act.',
  'A source offers documents; the rail decides. A connector that admitted its own output would be the collection stage ruling on itself.',
  'The preconditions are decisions rather than code. Terms of use, cadence, retention rights and the admission authority cannot be defaulted by the party that benefits from the answer.',
  'Two of the three jurisdictions carry a further decision that is visible only because the rail already refuses correctly: whether a class of insurers is a subject, and whether an event-conditioned effective date can ever be bracketed. Both are open, and both currently resolve as refusals.',
] as const;
