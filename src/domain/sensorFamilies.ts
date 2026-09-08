/**
 * Three sensor families, two convergences, and only one of them is the work.
 *
 * The convergence that is already free is the sensor one. Satellite and LiDAR
 * are two observation models over one state — wide, repetitive and metric
 * against narrow, sporadic and centimetric — and the estimator grammar fuses
 * them natively: different rows of H illuminating different subspaces. Nothing
 * new is needed for that but the state to fuse into.
 *
 * The convergence that is missing is the semantic one. Imagery segmentation
 * emits spectral classes and detector labels; point-cloud classification emits
 * ground, building, vegetation and wire; and neither emits the corpus's own
 * concepts. Fusing at the pixel and the point yields "there is a thing here",
 * not "this unit grew". The missing piece is a shared feature-to-concept
 * mapping, and it is the piece where all the judgment — and therefore all the
 * estate — lives.
 *
 * Meteorology joins as a third family and changes the shape rather than adding
 * a row. Weather is not another observation of the same static state: it is the
 * forcing that drives the state the other two observe, and it gates the sensors
 * themselves. A cloudy week is not missing data, it is explained missing data,
 * and an as-of answer over it should say so rather than fall silent.
 *
 * What is written here is the contract, because the contract is days of work
 * now and expensive to retrofit later, and because it is the interface every
 * later filter writes into. Nothing acquires an image, a point cloud or a
 * forecast; nothing fuses; nothing is registered as a source.
 */

/* ── The two convergences ── */

export const TWO_CONVERGENCES = {
  sensor: {
    state: 'FREE' as const,
    what: 'Satellite and LiDAR are two observation models over one state. Imagery constrains plan position and extent; LiDAR constrains elevation and structure. Complementary observability is what a filter is for, and no new machinery is required.',
    blockedBy: 'Nothing, except a state to fuse into. No estimator runs over corpus records.',
  },
  semantic: {
    state: 'THE_WORK' as const,
    what: 'Each family emits features in its own vocabulary, and neither emits corpus concepts. Until the vocabularies converge on a declared concept set, fact-level fusion is blocked however good the estimator is.',
    blockedBy: 'A shared feature-to-concept mapping, versioned and receipted, which does not exist.',
  },
} as const;

/* ── The families ── */

export type FamilyRole = 'OBSERVES_STRUCTURE' | 'FORCES_AND_GATES';

export interface SensorFamily {
  id: 'SATELLITE' | 'LIDAR' | 'METEOROLOGY';
  title: string;
  role: FamilyRole;
  /** What it constrains, in estimator terms. */
  constrains: string;
  /** The vocabulary it natively emits, which is not the corpus's. */
  nativeVocabulary: string;
  /** The frame fields a record from it must carry. */
  frameFields: readonly string[];
  here: string;
}

export const SENSOR_FAMILIES: readonly SensorFamily[] = [
  {
    id: 'SATELLITE',
    title: 'Satellite optical and radar',
    role: 'OBSERVES_STRUCTURE',
    constrains: 'Plan position, extent, surface state and their change over time. Wide, repetitive, metric, and cloud-vulnerable in the optical bands.',
    nativeVocabulary: 'Spectral classes and detector label sets, which are the detector’s vocabulary and its version’s, not the world’s.',
    frameFields: ['horizontal datum', 'acquisition instant', 'ground sample distance', 'sensor and processing level', 'detector model and version', 'cloud fraction'],
    here: 'No imagery source is registered and no scene is acquired. The measurement economy prices satellite instruments by resolution, latency, cost, sensitivity and false-alarm rate, and tasks none of them.',
  },
  {
    id: 'LIDAR',
    title: 'LiDAR',
    role: 'OBSERVES_STRUCTURE',
    constrains: 'Elevation and three-dimensional structure. Narrow, sporadic, centimetric, and unaffected by cloud.',
    nativeVocabulary: 'Point classes — ground, building, vegetation, wire — which is a different partition of the world from any spectral class set.',
    frameFields: ['horizontal datum', 'vertical datum', 'epoch', 'acquisition instant', 'point density', 'classification model and version'],
    here: 'No point cloud is acquired. The record contract carries a horizontal datum and no vertical datum at all, so the elevation frame this family lives in cannot yet be expressed.',
  },
  {
    id: 'METEOROLOGY',
    title: 'Meteorology',
    role: 'FORCES_AND_GATES',
    constrains: 'Nothing directly. It drives the state the other two observe, and it decides whether they can observe at all.',
    nativeVocabulary: 'Gridded reanalysis fields and station observations, on a product’s own grid, vertical convention and revision schedule.',
    frameFields: ['product and version', 'grid and resolution', 'reanalysis vintage', 'valid instant', 'issue instant for a forecast', 'interpolation method to a point'],
    here: 'No meteorological source is registered and nothing is acquired. Nothing gates an observation on weather, and no forcing term exists because no process model does.',
  },
];

/* ── Why meteorology is not a third sensor ── */

export const WEATHER_ROLE = {
  asymmetry: 'Satellite and LiDAR constrain the state; meteorology drives it and gates the observations. Structure, motion and cause.',
  acts: [
    { quantity: 'Precipitation and snowpack', on: 'Stockpile volumes, river stages, flood exposure, road and rail access', slot: 'Process-model input, and a constraint family of its own.' },
    { quantity: 'Wind', on: 'Vessel speed, crane operations, flyability, generation, roof damage', slot: 'State-space coupling, and a term in the noise model of a position estimate.' },
    { quantity: 'Cloud and fog', on: 'Whether an optical sensor can observe at all', slot: 'Observation-model gating: the optical rows of H switch off above a cloud fraction.' },
    { quantity: 'Temperature extremes', on: 'Asphalt pours, rail speed restrictions, grid load, thermal expansion', slot: 'Validity bounds on operational facts.' },
    { quantity: 'Storm tracks', on: 'Berth occupancy, port closure, event onset', slot: 'The event clock, which is what a parametric trigger needs to be attestable.' },
  ],
  missedPoint: 'Weather gates the sensors, not only the world. That is the row people skip, and it is the one that changes what an absence means.',
} as const;

/**
 * Provenance applied to void. A gap in optical coverage over a site is not
 * silence; it is an absence with a cause, and the cause is recordable.
 */
export const ATTRIBUTED_ABSENCE = {
  rule: 'An absence caused by a gating condition is recorded with its cause. An as-of answer over a cloudy week returns “optical unavailable, cloud fraction 0.9”, never an empty result that reads as nothing happening.',
  why: 'An unexplained gap and an explained gap are different facts, and a change-detection series that cannot tell them apart invents events at the rate the weather sets.',
  here: 'The corpus already refuses rather than guessing, and states the reason on every refusal. Nothing yet attributes an absence to a physical cause, because nothing observes and nothing gates.',
} as const;

/**
 * The reanalysis is a witness, not the weather. A gridded value at a facility's
 * coordinates is a model output interpolated to a point: it has its own
 * observation model and its own uncertainty.
 */
export const REANALYSIS_IS_A_WITNESS = {
  rule: 'A reanalysis value is ingested as an observation with a noise model and a source lineage, never as ground truth. Interpolating a grid to a point is a derivation and carries the interpolation method and its error.',
  vintage: 'Reanalysis products revise. The analysis available at a past instant and the final reanalysis for that instant are different values, which is the same two-clock problem the corpus already solves: valid time is the weather’s, knowledge time is the product release’s.',
  archiveGated: 'Past forecasts are sparsely retained by their publishers. Whether to capture them is an operator decision with a rights and cost dimension, and nothing here acquires anything; it is recorded as a property of the source, not as a plan.',
  trap: 'Treating a grid cell as a measurement is how the frame problem arrives through the weather door: consistent within the product, wrong against the site.',
} as const;

/* ── The mapping, which is where the estate is ── */

export interface MappingStage {
  order: number;
  stage: 'FEATURE' | 'CONCEPT_MAPPING' | 'RECONCILIATION' | 'ADMISSION';
  what: string;
  /** The existing discipline this stage is an instance of. */
  sameAs: string;
  state: 'PARTIAL' | 'ABSENT';
}

export const CONCEPT_MAPPING: readonly MappingStage[] = [
  { order: 1, stage: 'FEATURE', what: 'Detector outputs per source and per model version, as candidate observations with noise models. A sensor is a model, so a detection is an assertion by a producer.', sameAs: 'The extraction interface: a vision model is an adapter like any other.', state: 'ABSENT' },
  { order: 2, stage: 'CONCEPT_MAPPING', what: 'Source-specific feature vocabularies mapped onto corpus concepts, as versioned mappings with receipts. Facility, stockyard, berth, canopy: named once, reached from every family.', sameAs: 'The normalization adapters, which already turn a source’s vocabulary into the corpus’s and record the method and version that did it.', state: 'ABSENT' },
  { order: 3, stage: 'RECONCILIATION', what: 'Where two families disagree — imagery says one building, LiDAR says two — the disagreement is encoded, not averaged. Cross-family disagreement is unusually informative because the error physics are independent.', sameAs: 'The disagreement layer, and the geometric verdict that already reports two positions that cannot both be right.', state: 'ABSENT' },
  { order: 4, stage: 'ADMISSION', what: 'Fused, concept-typed, uncertainty-carrying candidates cross the admission boundary, or they do not become facts.', sameAs: 'The admission ruling, which is called on the statutory harvester path and by the admit CLI, and which no candidate from this corpus has been put through.', state: 'ABSENT' },
];

export const CROSS_FAMILY_CORROBORATION = {
  claim: 'Two families with independent error physics agreeing on a fact is worth more than five syndicated sources agreeing on it.',
  why: 'Corroboration is only worth the independence behind it, and optical and ranging failures are genuinely independent in a way two licensees of one dataset are not.',
  connects: 'This is the independence weighting the invariant scoring already requires, with the one population where independence is physically rather than contractually true.',
} as const;

/* ── What the triad unlocks ── */

export const TRIAD_DERIVATIONS = [
  { id: 'CHANGE_VS_WEATHER', what: 'Change detection conditioned on weather. Throughput apparently collapsed at a terminal: distress, or a fog week? Weather is the null model, and the residual after conditioning is the signal.', needs: 'All three families, and a declared climatological baseline.', why: 'Without it, false events arrive at the rate the weather sets, and every false event costs the signal layer its credibility.' },
  { id: 'CONSERVATION_WITH_LEAKS', what: 'Flow conservation with the storage term absorbing weather: rain swells a stockpile, wind scatters it, snow hides it.', needs: 'The constraint stack, plus a meteorological forcing term.', why: 'Without the leak terms the residual conflates measurement error with rain, and the constraint gets blamed for the weather.' },
  { id: 'SEASONAL_BASELINE', what: 'Activity against a climatological norm rather than raw activity, so a comparison across months means something.', needs: 'A versioned climatology declared as a prior with its product, era and grid.', why: 'A baseline that is an ambient assumption rather than a declared prior is the quietest way to smuggle a model into a fact.' },
  { id: 'HEIGHTS_AND_VOLUMES', what: 'Heights from photogrammetry anchored by ranging ground truth, and volumes from cross-sections and area, both with error bars from the two sensors’ own noise models.', needs: 'Both structural families and one vertical datum.', why: 'The measurement economy can then price when a satellite estimate suffices and when the site needs a pass.' },
  { id: 'REGISTRATION_AS_STATE', what: 'The misalignment between two families’ frames, estimated once as a state rather than assumed away.', needs: 'Both families over one site, and the registration machinery that already exists as a synthetic preview.', why: 'Estimating it once tightens every later joint derivation, and pretending it is zero is the characteristic fusion error.' },
] as const;

/** The trap that makes fusion silently wrong rather than loudly wrong. */
export const VERTICAL_DATUM_TRAP = {
  trap: 'Two families referencing different vertical data — ellipsoidal height against an orthometric height above a geoid — are each internally consistent and wrong against each other by tens of metres.',
  rule: 'A vertical datum is a required field wherever an elevation appears, and a transform between two of them is a declared object with evidence, not an offset applied in a script.',
  here: 'The record contract carries a horizontal datum and no elevation at all, so the trap is not yet reachable. It becomes reachable on the day the first elevation is recorded, which is why the field belongs in the contract before that day.',
} as const;

export const SENSOR_SEQUENCE: readonly string[] = [
  'The concept mapping and its frame fields first, because it is the interface every later filter writes into and it costs days now against a rewrite later.',
  'The vertical datum as a required field wherever an elevation appears, before the first elevation is recorded.',
  'Meteorological vocabulary in the same contract: forcing quantities, climatology version, and the availability-gating fields that make an absence attributable.',
  'Ingestion, fusion and the storm-event ledger behind corpus volume and an operator’s acquisition decisions, none of which are made here.',
];

/* ── What exists ── */

export interface SensorStanding {
  registeredSources: Record<SensorFamily['id'], number>;
  conceptMappings: number;
  elevationsInCorpus: number;
  /** Why the number above is what it is. It is a property of the contract, not a reading. */
  elevationsBecause: string;
  verticalDatumField: 'ABSENT';
  statement: string;
}

/**
 * Pure: the honest inventory, which is empty, and the one contract gap it exposes.
 *
 * It takes no corpus, and that is the finding rather than an oversight. Every
 * number here is a property of a contract: no source of any family is
 * registered, no concept mapping exists, and the geometry union has no height
 * field on any of its three shapes. The elevation figure used to be written as
 * a filter over `corpus.records` for a `'height'` key that no member of
 * RecordGeometry declares — a predicate that could never match, behind an
 * `as unknown as Record<string, unknown>` cast that let it compile. Reading a
 * corpus to produce a constant is how a constant comes to look like evidence.
 */
export function sensorStanding(): SensorStanding {
  // Not a count. RecordGeometry is GeodeticPoint | GeodeticPolygon |
  // GeodeticExtent and none of the three declares a height, so this is a
  // property of the contract rather than of the records in it. It used to be
  // written as a filter for `'height' in geometry` behind an
  // `as unknown as Record<string, unknown>` cast — the cast being what let a
  // structurally impossible predicate compile. A constant dressed as a count
  // reads as evidence, and it is not.
  const elevations = 0;
  return {
    registeredSources: { SATELLITE: 0, LIDAR: 0, METEOROLOGY: 0 },
    conceptMappings: 0,
    elevationsInCorpus: elevations,
    elevationsBecause: 'The geometry contract has no height field on any of its three shapes, so no record can carry an elevation. This is a property of the contract, not a count over the corpus.',
    verticalDatumField: 'ABSENT',
    statement: 'No source from any of the three families is registered, and no concept mapping exists. The record contract carries a horizontal datum and no vertical datum, and no record carries an elevation — so the frame field that would prevent the characteristic fusion error costs nothing to add today and a migration to add later.',
  };
}
