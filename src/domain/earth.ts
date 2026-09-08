/**
 * The NotationsOS Earth Twin: the CesiumJS instrument of the projection
 * fabric, a geodetic realization surface for whatever NotationsOS can place
 * on the Earth. It is built on God's Eye View's globe stack and borrows its
 * discipline: every layer names its source and its state, a modeled or
 * missing thing is labelled as such, and a view is a link. It runs keyless
 * and offline: the Earth's surface comes from imagery bundled with the
 * engine, day and night are computed from the twin's clock, and nothing is
 * fetched from anywhere but this origin. Browser-safe; nothing here renders.
 */
import { ENGINE_ROLE } from './projection';
import type { CorroborationWord } from './locatedClaims';
import type { ProjectionSpec } from '@/projection/spec';
import type { GeodeticPosition, ProjectionGeometry } from '@/projection/compile';
import type { Interest } from './types';
import type { RecordGeometry } from './corpus';
import { spatialKeyFor } from './spatialKey';

export type { GeodeticPosition } from '@/projection/compile';

/** What the twin is built from, pinned exactly. */
export const EARTH_TWIN_ORIGIN = {
  name: "God's Eye View",
  repository: 'https://github.com/notationsystems/gods-eye-view',
  commit: '6d83bb6008738db2aa067284586be04ea0c5eabb',
  committedAt: '2026-08-31T20:25:02Z',
  codeLicense: 'MIT, source code only; bundled and fetched data keep their own terms',
  dataSourcesPath: 'DATA_SOURCES.md',
  dataSourcesBlob: '68241fbef4c51796e43cc5a172b91131f5305941',
} as const;

export const EARTH_ENGINE = {
  name: 'CesiumJS',
  version: '1.124.0',
  license: 'Apache-2.0',
  role: ENGINE_ROLE.CesiumJS,
  /** Served from this origin under /cesium after `npm run earth:assets`; never from a CDN. */
  assetsPath: '/cesium/',
} as const;

/** What was taken from God's Eye View and what was deliberately not. */
export const ADOPTED = [
  'The CesiumJS globe with the widget chrome off and the credit line kept visible.',
  'Layer discipline: each layer names its source, its terms and its state; modeled, computed and missing states are labelled, never implied.',
  'A view is a link: the camera serializes into the URL hash, bounded and validated, and a bad value is rejected rather than clamped.',
  'The named list of public world signals it reads from, carried here as a registry with their terms, not as connectors.',
] as const;
export const NOT_ADOPTED = [
  'Google Photorealistic 3D Tiles and every other keyed or metered provider: the twin runs without any key.',
  'Live feeds (aircraft, vessels, satellites, earthquakes, cameras, traffic, weather, news): no source is acquired here; each would enter through the acquisition rail under a registration and a rights decision.',
  'Bundled third-party datasets under non-permissive terms (submarine cables, CC BY-NC-SA): not copied.',
  'Voice control and the realtime agent.',
] as const;

export type LayerState = 'BUNDLED' | 'COMPUTED' | 'FIXTURE' | 'UNAVAILABLE' | 'NOT_INTEGRATED';
export const LAYER_STATE_MEANING: Record<LayerState, string> = {
  BUNDLED: 'Shipped with the engine and served from this origin; nothing is fetched elsewhere.',
  COMPUTED: 'Derived by the engine from the twin’s clock; not observed, not a source.',
  FIXTURE: 'Read from the committed demonstration through the projection compiler.',
  UNAVAILABLE: 'Asked for and refused, with the reason shown; nothing is drawn in its place.',
  NOT_INTEGRATED: 'A named source with its terms, no connector, no rights decision, no acquisition.',
};

export interface TwinLayer {
  id: 'surface' | 'sun' | 'corpus' | 'signals' | 'notations';
  label: string;
  state: LayerState;
  source: string;
  terms: string;
  draws: string;
}

export const TWIN_LAYERS: readonly TwinLayer[] = [
  { id: 'surface', label: 'Earth surface', state: 'BUNDLED', source: 'Natural Earth II imagery bundled with CesiumJS 1.124.0, on the WGS84 ellipsoid with no terrain', terms: 'Natural Earth: public domain. CesiumJS: Apache-2.0.', draws: 'The globe, at the resolution the bundled tiles carry (coarse; no streets, no buildings).' },
  { id: 'sun', label: 'Day and night', state: 'COMPUTED', source: 'The sun’s position at the twin’s world-time instant, computed by CesiumJS', terms: 'Computation, not data.', draws: 'Lighting and the terminator; the sub-solar point as a view preset.' },
  { id: 'corpus', label: 'Corpus records', state: 'FIXTURE', source: 'The projection compiler over one exact release, view GLOBE / GEODETIC / GLOBAL_3D', terms: 'Rights, visibility and both times enforced by the compiler; the twin inherits its refusals.', draws: 'A selected record at every position its subject’s own location.position record declares, under the same gate, coloured by the declaring source’s interest, with the stated horizontal uncertainty as a ring. A record whose subject declares none is listed as unplaced with the compiler’s refusal; nothing is inferred from another subject.' },
  { id: 'signals', label: 'World signals', state: 'NOT_INTEGRATED', source: `The public signal sources God's Eye View reads (DATA_SOURCES.md at ${EARTH_TWIN_ORIGIN.commit.slice(0, 7)})`, terms: 'Per source, as recorded; several exclude commercial operation.', draws: 'Nothing: no connector exists and no rights decision has been requested. The registry is inspectable.' },
  { id: 'notations', label: 'Authored marks', state: 'UNAVAILABLE', source: 'The notation state kernel', terms: 'Authored local state; not evidence.', draws: 'Nothing: the kernel’s closed command set carries no geodetic position for a notation or a relation.' },
];

export type TermsClass = 'PUBLIC_DOMAIN' | 'OPEN_DATABASE' | 'ATTRIBUTION' | 'COURTESY' | 'NON_COMMERCIAL' | 'PERSONAL_NON_COMMERCIAL' | 'PROPRIETARY_OWN_KEY';
export const TERMS_CLASS_LABEL: Record<TermsClass, string> = {
  PUBLIC_DOMAIN: 'public domain',
  OPEN_DATABASE: 'ODbL, attribution and share-alike on data',
  ATTRIBUTION: 'attribution required',
  COURTESY: 'courtesy attribution, no formal licence stated',
  NON_COMMERCIAL: 'non-commercial; operational use needs an agreement',
  PERSONAL_NON_COMMERCIAL: 'personal, non-commercial use only',
  PROPRIETARY_OWN_KEY: 'proprietary; your own key and billing',
};
export type KeyRequirement = 'NONE' | 'FREE_KEY' | 'OPTIONAL_KEY' | 'METERED_KEY';

export interface SignalSource {
  id: string;
  name: string;
  supplies: string;
  termsClass: TermsClass;
  terms: string;
  attribution: string;
  key: KeyRequirement;
  integrationState: 'NOT_INTEGRATED';
}

const COMMON_BLOCKERS = [
  'No source registration exists for it in NotationsOS.',
  'No rights decision has been requested for any purpose, operation or audience.',
  'No connector exists on the acquisition rail; nothing has been captured or receipted.',
] as const;

/** Why a source in the registry is not on the globe. Terms that exclude commercial operation add a fourth reason. */
export function integrationBlockers(source: SignalSource): string[] {
  const blockers: string[] = [...COMMON_BLOCKERS];
  if (source.termsClass === 'NON_COMMERCIAL' || source.termsClass === 'PERSONAL_NON_COMMERCIAL') blockers.push('Its terms exclude commercial operation without a separate agreement.');
  if (source.key === 'METERED_KEY') blockers.push('It is metered against an operator’s own key and billing; the twin runs without any key.');
  return blockers;
}

/**
 * The live sources God's Eye View reads, as its DATA_SOURCES.md records them
 * at the pinned commit. This is a registry of names and terms, not
 * connectors: none is contacted, selected or collected by NotationsOS.
 */
export const GEV_SIGNAL_SOURCES: readonly SignalSource[] = [
  { id: 'google-map-tiles', name: 'Google Map Tiles API (Photorealistic 3D Tiles), Places, Geocoding', supplies: 'The photorealistic globe, scene context, nearby search', termsClass: 'PROPRIETARY_OWN_KEY', terms: 'Google Maps Platform ToS; content may not be cached, stored or rehosted', attribution: '"Google" / "Google Maps" logo, required while displayed', key: 'METERED_KEY', integrationState: 'NOT_INTEGRATED' },
  { id: 'opensky', name: 'OpenSky Network', supplies: 'Worldwide live aircraft state vectors', termsClass: 'NON_COMMERCIAL', terms: 'Non-commercial research and education licence; operational REST use can require a written agreement', attribution: 'Schäfer et al., "Bringing Up OpenSky", IPSN 2014; opensky-network.org', key: 'OPTIONAL_KEY', integrationState: 'NOT_INTEGRATED' },
  { id: 'adsb-lol-point', name: 'adsb.lol point API', supplies: 'Bounded live aircraft fallback around a point', termsClass: 'OPEN_DATABASE', terms: 'ODbL 1.0', attribution: 'adsb.lol contributors', key: 'NONE', integrationState: 'NOT_INTEGRATED' },
  { id: 'adsb-lol-traces', name: 'adsb.lol', supplies: 'Military aircraft and aircraft traces', termsClass: 'OPEN_DATABASE', terms: 'ODbL 1.0', attribution: '"adsb.lol" (ODbL)', key: 'NONE', integrationState: 'NOT_INTEGRATED' },
  { id: 'aisstream', name: 'AISStream.io', supplies: 'Live vessel positions (AIS)', termsClass: 'COURTESY', terms: 'Free, beta, no formal terms; AIS is a public broadcast', attribution: '"AISStream.io" (courtesy)', key: 'FREE_KEY', integrationState: 'NOT_INTEGRATED' },
  { id: 'celestrak', name: 'CelesTrak', supplies: 'Satellite orbital elements (TLE) for SGP4 propagation', termsClass: 'COURTESY', terms: 'US-government-origin data, no licence; citation requested', attribution: 'CelesTrak (celestrak.org), Dr. T.S. Kelso', key: 'NONE', integrationState: 'NOT_INTEGRATED' },
  { id: 'launch-library-2', name: 'The Space Devs, Launch Library 2 v2.3', supplies: 'Recent launch, payload, stage and recovery metadata', termsClass: 'COURTESY', terms: 'May be used and shared in any form; attribution encouraged; 15 unauthenticated calls per hour', attribution: '"Launch Library 2 — The Space Devs"', key: 'OPTIONAL_KEY', integrationState: 'NOT_INTEGRATED' },
  { id: 'usgs-earthquakes', name: 'USGS', supplies: 'Earthquakes', termsClass: 'PUBLIC_DOMAIN', terms: 'U.S. public domain', attribution: 'Data courtesy of the U.S. Geological Survey', key: 'NONE', integrationState: 'NOT_INTEGRATED' },
  { id: 'osm-overpass-roads', name: 'OpenStreetMap (Overpass API)', supplies: 'Road geometry for traffic', termsClass: 'OPEN_DATABASE', terms: 'ODbL 1.0', attribution: '© OpenStreetMap contributors', key: 'NONE', integrationState: 'NOT_INTEGRATED' },
  { id: 'tomtom-traffic', name: 'TomTom Traffic API (flow vector tiles)', supplies: 'Live congestion colouring', termsClass: 'PROPRIETARY_OWN_KEY', terms: 'TomTom for Developers terms; your own key and quota', attribution: 'Traffic flow data © TomTom', key: 'OPTIONAL_KEY', integrationState: 'NOT_INTEGRATED' },
  { id: 'osm-overpass-installations', name: 'OpenStreetMap (Overpass API)', supplies: 'Viewport-bounded mapped installation context', termsClass: 'OPEN_DATABASE', terms: 'ODbL 1.0', attribution: '© OpenStreetMap contributors (incomplete mapped context)', key: 'NONE', integrationState: 'NOT_INTEGRATED' },
  { id: 'osm-nominatim', name: 'OpenStreetMap (Nominatim)', supplies: 'Reverse-geocoded place labels', termsClass: 'OPEN_DATABASE', terms: 'ODbL 1.0 and the Nominatim usage policy', attribution: '© OpenStreetMap contributors', key: 'NONE', integrationState: 'NOT_INTEGRATED' },
  { id: 'open-meteo', name: 'Open-Meteo', supplies: 'Current weather observations', termsClass: 'ATTRIBUTION', terms: 'CC BY 4.0 with an adjacent-link attribution requirement', attribution: 'Weather data by Open-Meteo.com', key: 'NONE', integrationState: 'NOT_INTEGRATED' },
  { id: 'google-news-rss', name: 'Google News RSS', supplies: 'Locality-matched headlines', termsClass: 'PERSONAL_NON_COMMERCIAL', terms: 'Google News Terms of Service restrict use to personal, non-commercial use', attribution: 'Google News RSS and each linked publisher', key: 'NONE', integrationState: 'NOT_INTEGRATED' },
  { id: 'gdelt-doc', name: 'GDELT Project DOC 2.0', supplies: 'Fallback location-matched headlines', termsClass: 'ATTRIBUTION', terms: 'Unrestricted dataset use with citation and link required; articles keep publisher terms', attribution: 'GDELT Project and each linked publisher', key: 'NONE', integrationState: 'NOT_INTEGRATED' },
  { id: 'austin-open-data', name: 'City of Austin Open Data', supplies: 'CCTV camera catalog and frames', termsClass: 'ATTRIBUTION', terms: 'City of Austin Open Data Terms of Use', attribution: 'City of Austin, TX — data.austintexas.gov', key: 'NONE', integrationState: 'NOT_INTEGRATED' },
  { id: 'caltrans-cctv', name: 'Caltrans (cwwp2.dot.ca.gov)', supplies: 'CCTV camera catalogs and frames, California districts', termsClass: 'COURTESY', terms: 'Public Caltrans traffic camera data', attribution: 'Caltrans — cwwp2.dot.ca.gov (courtesy)', key: 'NONE', integrationState: 'NOT_INTEGRATED' },
  { id: 'tfl-jamcams', name: 'TfL Open Data (JamCams)', supplies: 'CCTV camera catalog and frames, London', termsClass: 'ATTRIBUTION', terms: 'TfL Open Data terms; attribution required', attribution: 'Powered by TfL Open Data. Contains OS data © Crown copyright and database rights', key: 'OPTIONAL_KEY', integrationState: 'NOT_INTEGRATED' },
  { id: 'gbfs', name: 'GBFS (Lyft / BCycle)', supplies: 'Bikeshare availability', termsClass: 'ATTRIBUTION', terms: 'Per feed, attribution only', attribution: 'The operator and its license_url', key: 'NONE', integrationState: 'NOT_INTEGRATED' },
  { id: 'radio-browser', name: 'Radio Browser', supplies: 'Geolocated internet-radio station directory', termsClass: 'PUBLIC_DOMAIN', terms: 'PDDL 1.0 directory data; each broadcaster’s stream terms apply', attribution: 'Radio Browser and the selected broadcaster', key: 'NONE', integrationState: 'NOT_INTEGRATED' },
  { id: 'reearth-terrain', name: 'Re:Earth Terrain (Mapterhorn)', supplies: 'Keyless terrain mesh and point heights', termsClass: 'ATTRIBUTION', terms: 'Terrain mesh CC BY 4.0; geoid EGM2008 (NGA, public domain)', attribution: 'Re:Earth Terrain / Mapterhorn (CC BY 4.0) / EGM2008 (NGA)', key: 'NONE', integrationState: 'NOT_INTEGRATED' },
];

/* ═══ Time ═══ */

export interface TwinClock { knownAt: string; validAt: string }
export const CLOCK_MEANING = {
  knownAt: 'Knowledge time: the release cutoff. Nothing knowable later than this appears on the twin.',
  validAt: 'World time: the instant the Earth is shown at. Day and night are computed from it; the corpus is asked for what held then.',
} as const;

/* ═══ A view is a link ═══ */

export interface TwinView { longitude: number; latitude: number; height: number; heading: number; pitch: number }
/*
 * The whole Earth, framed to fill the stage rather than sit in it.
 *
 * At 26,000 km the globe subtended about 11° of a 60° field and occupied
 * roughly a third of the frame, most of the instrument being black. At
 * 12,000 km it subtends about 20°, so the disc spans two thirds — still the
 * whole planet, with margin for the terminator and for a placement flying in
 * from an edge.
 */
export const GLOBAL_VIEW: TwinView = { longitude: 0, latitude: 0, height: 12_000_000, heading: 0, pitch: -90 };
export const VIEW_BOUNDS = { height: { min: 1_000, max: 100_000_000 }, pitch: { min: -90, max: 0 } } as const;

const finite = (value: number, min: number, max: number) => Number.isFinite(value) && value >= min && value <= max;

/** `#v=lon,lat,height,heading,pitch`, fixed precision, always the same five numbers in the same order. Heading is written on [0, 360), so an engine heading a hair below a full turn is 0.0, not 360.0. */
export function formatView(view: TwinView): string {
  const heading = (((view.heading % 360) + 360) % 360).toFixed(1);
  return `v=${view.longitude.toFixed(4)},${view.latitude.toFixed(4)},${Math.round(view.height)},${heading === '360.0' ? '0.0' : heading},${view.pitch.toFixed(1)}`;
}

/** A hash that is not exactly a bounded view is rejected whole; nothing is clamped or salvaged. */
export function parseView(hash: string): TwinView | null {
  const text = hash.startsWith('#') ? hash.slice(1) : hash;
  if (text.length > 96) return null;
  const match = /^v=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(\d+),(\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(text);
  if (!match) return null;
  const [longitude, latitude, height, heading, pitch] = match.slice(1).map(Number);
  if (!finite(longitude, -180, 180) || !finite(latitude, -90, 90) || !finite(height, VIEW_BOUNDS.height.min, VIEW_BOUNDS.height.max) || !finite(heading, 0, 360) || heading === 360 || !finite(pitch, VIEW_BOUNDS.pitch.min, VIEW_BOUNDS.pitch.max)) return null;
  return { longitude, latitude, height, heading, pitch };
}

/**
 * A selection is a link, and a link that cannot be honoured is refused.
 *
 * The view half has always been a link. The selection was not, so a shared
 * link put a reader at the same place looking at a different record — the
 * default one — with nothing saying so. That is the failure this closes, and
 * the refusal is the part worth stating:
 *
 * **A link naming a record this release does not offer is not a link to some
 * other record.** Falling back to the default would show a reader something
 * other than what the link named while looking exactly like success, which is
 * worse than refusing: the reader believes they are seeing the shared thing.
 * So the twin says the link named a record it cannot show, and shows nothing
 * in its place.
 *
 * A link with no `r=` is a view-only link, which is what every link written
 * before this existed is. Those stay valid and select nothing.
 */
export interface TwinLink { view: TwinView; recordId: string | null }

/** Record ids are opaque here; only their shape is checked, and a malformed one rejects the whole hash. */
const RECORD_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

/** `#v=lon,lat,height,heading,pitch` and, when something is selected, `&r=<recordId>`. */
export function formatLink(view: TwinView, recordId: string | null): string {
  const base = formatView(view);
  if (!recordId) return base;
  if (!RECORD_ID.test(recordId)) throw new Error(`A record id that cannot be written into a link is not written into one: ${recordId}`);
  return `${base}&r=${recordId}`;
}

/** Rejected whole, like the view: nothing is clamped, salvaged or half-read. */
export function parseLink(hash: string): TwinLink | null {
  const text = hash.startsWith('#') ? hash.slice(1) : hash;
  if (text.length > 176) return null;
  const [viewPart, ...rest] = text.split('&r=');
  if (rest.length > 1) return null;
  const view = parseView(viewPart);
  if (!view) return null;
  if (!rest.length) return { view, recordId: null };
  const recordId = rest[0];
  return RECORD_ID.test(recordId) ? { view, recordId } : null;
}

export type SelectionStanding = 'SELECTED' | 'NOT_OFFERED' | 'NONE_NAMED';

export const SELECTION_MEANING: Record<SelectionStanding, string> = {
  SELECTED: 'The link named a record this release offers, and it is the one shown.',
  NOT_OFFERED: 'The link named a record this release does not offer. Nothing is selected in its place: a default would look like success while showing something the link did not name.',
  NONE_NAMED: 'The link named no record. It is a view, which is what every link written before selections were carried is.',
};

/** What a link's selection amounts to against what this release actually offers. */
export function selectionFromLink(
  link: TwinLink | null,
  offered: readonly string[],
): { standing: SelectionStanding; recordId: string | null; named: string | null; because: string } {
  const named = link?.recordId ?? null;
  if (!named) return { standing: 'NONE_NAMED', recordId: null, named: null, because: SELECTION_MEANING.NONE_NAMED };
  if (offered.includes(named)) return { standing: 'SELECTED', recordId: named, named, because: SELECTION_MEANING.SELECTED };
  return { standing: 'NOT_OFFERED', recordId: null, named, because: `${SELECTION_MEANING.NOT_OFFERED} The link named ${named}.` };
}

/* ═══ The corpus, asked for honestly ═══ */

/** The GLOBE realization request for one explicit record, under the release's own commitments. */
export function globeSpec(source: ProjectionSpec['source'], recordId: string, clock: TwinClock, viewer: ProjectionSpec['viewer'] = 'COUNTERPARTY_SHARED'): ProjectionSpec {
  return {
    schema: 'payload.projection-spec.v1',
    source,
    selection: { recordIds: [recordId], knownAt: clock.knownAt, validAt: clock.validAt },
    view: { mode: 'GLOBE', coordinateSemantics: 'GEODETIC', representation: 'GLOBAL_3D' },
    viewer,
  };
}

export type ProjectionOutcome =
  | { state: 'READY'; detail: string; positions: GeodeticPosition[]; unplaced: string[] }
  | { state: 'UNAVAILABLE'; code: string; detail: string }
  | { state: 'REFUSED'; code: string; detail: string };

/**
 * How a located item is drawn. The colour is the claim's current reading
 * against the corpus — the check vocabulary's own tokens — and a ledger event
 * takes the withdrawn hue, because a retraction is support removed. A conflict
 * is drawn loud: bigger point, heavier ring. A claim that disagrees with the
 * corpus is the most useful object on the globe.
 */
export const EVENT_TONE: Record<CorroborationWord | 'LEDGER', { hex: string; cssVar: string; label: string }> = {
  CORROBORATED: { hex: '#4cc48a', cssVar: '--check-passed', label: 'corroborated' },
  CONFLICTING: { hex: '#e26b5c', cssVar: '--check-failed', label: 'conflicting' },
  UNCORROBORATED: { hex: '#7fb0ff', cssVar: '--check-not-evaluated', label: 'uncorroborated' },
  NOT_IN_COVERAGE: { hex: '#8e8b83', cssVar: '--check-na', label: 'not in coverage' },
  LEDGER: { hex: '#b795f2', cssVar: '--ep-withdrawn', label: 'ledger event' },
};

/** How a placed record is drawn: the declaring source's interest, which the evidence class carries, is the one thing the colour says. */
export const PLACEMENT_TONE: Record<Interest, { label: string; hex: string }> = {
  disinterested: { label: 'disinterested source', hex: '#4ade80' },
  unknown: { label: 'source interest unknown', hex: '#60a5fa' },
  self_reported: { label: 'self-reported', hex: '#fbbf24' },
  negotiating_position: { label: 'negotiating position', hex: '#f87171' },
};

/**
 * A declaration the release has since replaced or withdrawn, drawn as one.
 *
 * It is still drawn, because the release declared it and the twin shows what
 * the release declares. It is not drawn in its source's interest colour,
 * because that colour answers "who said this" and this position's standing is
 * the more important thing about it. `--ep-withdrawn` is the scale's own
 * withdrawn hue, so a superseded position on the globe reads as the same state
 * a superseded row reads as in every table.
 */
export const SUPERSEDED_TONE = { label: 'superseded or retracted at this knowledge time', hex: '#b795f2', cssVar: '--ep-withdrawn' } as const;

/** The camera over a placed position: straight down from a regional height, so the point is at the centre of the view, the view's link is the point itself, and the bundled surface still shows where on Earth it is. The uncertainty ring becomes legible as one comes closer. */
export const PLACEMENT_VIEW = { height: 1_000_000, heading: 0, pitch: -90 } as const;

/**
 * The camera height that actually frames the thing being flown to.
 *
 * The fixed one-million-metre preset was written for a point, where the whole
 * of what the source claimed is a radius and the ring only has to become
 * legible on the way in. It does not survive a shape: a 291 m parcel at a
 * thousand kilometres is a sub-pixel speck, so a boundary carried all the way
 * through the record contract and the compiler would arrive on screen as the
 * dot it was supposed to replace.
 *
 * So the height is derived from the claim's own size — the stated uncertainty
 * plus, for a shape, its reach — with a floor so a survey mark does not put
 * the camera on the ground, and the regional preset as the ceiling so nothing
 * flies further out than it used to. The multiple is a legibility convenience
 * and nothing else: it is not a precision, and no reading is taken from it.
 */
export const PLACEMENT_FRAME = { multiple: 14, floorM: 1_200, ceilingM: PLACEMENT_VIEW.height } as const;

export function placementHeightM(boundedByM: number | null | undefined): number {
  if (typeof boundedByM !== 'number' || !Number.isFinite(boundedByM) || boundedByM <= 0) return PLACEMENT_VIEW.height;
  return Math.min(PLACEMENT_FRAME.ceilingM, Math.max(PLACEMENT_FRAME.floorM, boundedByM * PLACEMENT_FRAME.multiple));
}

/** The camera over one declared position, framed by what that position claims. */
export function placementViewFor(geometry: RecordGeometry | undefined): { height: number; heading: number; pitch: number } {
  const outcome = geometry ? spatialKeyFor(geometry) : null;
  return { ...PLACEMENT_VIEW, height: placementHeightM(outcome?.keyed ? outcome.key.boundedByM : null) };
}

/** One label per declared position: the subject, the declaration and its source's interest, then the records placed there. A record's identity is a record, so several records at one position share one point and one label. */
export function placementLabel(position: GeodeticPosition, records: ReadonlyArray<{ recordId: string; title: string }>): string {
  const head = `${position.subject.subjectId} · ${position.value} · ${position.evidenceClass.interest.replace('_', ' ')}`;
  if (records.length === 1) return `${head}\n${records[0].recordId} · ${records[0].title}`;
  const ids = records.map((record) => record.recordId);
  const shown = ids.slice(0, 3).join(', ');
  return `${head}\n${ids.length} records · ${shown}${ids.length > 3 ? ` +${ids.length - 3}` : ''}`;
}

const REFUSAL_MEANING: Record<string, string> = {
  SELECTION_NOT_AVAILABLE: 'The compiler would not select this record for this viewer at these instants: absent, hidden, ambiguous, not yet knowable, or outside its validity. It says which no more than that, so nothing withheld is disclosed.',
  KNOWLEDGE_AFTER_RELEASE: 'The knowledge instant is later than the release cutoff.',
  SOURCE_VERSION_MISMATCH: 'The pinned source snapshot no longer matches the committed release.',
  SOURCE_INTEGRITY_FAILED: 'The committed release failed its own integrity check.',
  SOURCE_NOT_AVAILABLE: 'No such release.',
  INVALID_PROJECTION_SPEC: 'The request did not fit the closed projection contract.',
};

/**
 * What the compiler's answer means for the twin.
 *
 * `READY` means the release declared a geodetic position for this record's
 * subject and the compiler resolved it. The comment here used to say geometry
 * "today never does" exist, which stopped being true when the three corpora
 * gained POINT, POLYGON and EXTENT records — and the whole placement UI below
 * is gated on this state, so the sentence was contradicted by its own callers.
 */
export function projectionOutcome(status: number, body: { status?: string; error?: string | null; geometry?: ProjectionGeometry | null }): ProjectionOutcome {
  if (status === 200 && body.status === 'READY') {
    const positions = body.geometry?.positions ?? [];
    return { state: 'READY', detail: `${positions.length} declared ${positions.length === 1 ? 'position' : 'positions'} for this record’s subject, under the release’s own gate; drawn where the source says the subject was.`, positions, unplaced: body.geometry?.unplaced ?? [] };
  }
  if (status === 200 && body.status === 'UNAVAILABLE') return { state: 'UNAVAILABLE', code: body.error ?? 'GEOMETRY_NOT_AVAILABLE', detail: 'The record is selectable, but the release declares no geodetic position for it. The compiler invents none and the twin draws none.' };
  const code = body.error ?? 'PROJECTION_UNAVAILABLE';
  return { state: 'REFUSED', code, detail: REFUSAL_MEANING[code] ?? 'The projection service refused the request.' };
}

export const TWIN_NONCLAIMS = [
  'No source is contacted: every request the twin makes stays on this origin.',
  'No position is invented: a record is drawn only where its own subject’s position record declares, and a record without one is not drawn.',
  'No signal is live: the registry names sources and their terms; it collects nothing.',
  'The globe is not evidence: bundled imagery and a computed sun are context, not observations.',
] as const;

/* ------------------------------------------------------------------ *
 * What the declared positions imply
 *
 * The twin draws every position a subject's sources declare. Drawing them
 * is not reading them: two points side by side answer nothing on their own.
 * This is the one derivation over that geometry that the declarations
 * themselves support — whether two standing accounts of where a subject is
 * can both be right — and it is deliberately the weakest claim that is
 * still useful. It measures a distance under a named metric, compares it
 * against the uncertainties the sources stated, and says one of three
 * things. It never assumes an uncertainty, never assumes a distribution,
 * and never treats a shared location as a reason to treat two subjects as
 * one thing.
 * ------------------------------------------------------------------ */

/** The method that decided, versioned so an answer can be traced to it. */
export const SEPARATION_METHOD = 'notationsos.position-separation.v1';
/**
 * The distance model, the geodesic and the three-valued consistency vocabulary
 * are spatial primitives rather than Earth Twin machinery, so they live in
 * ./spatialKey and are re-exported here: one implementation, one vocabulary,
 * used both by the twin's reading of a subject's own declarations and by the
 * cross-subject question the key exists to block for.
 */
import { geodesicSeparationM, formatMetres } from './spatialKey';
import type { PositionConsistency, SeparationOutcome } from './spatialKey';

export { SEPARATION_METRIC, geodesicSeparationM, formatMetres, CONSISTENCY_MEANING } from './spatialKey';
export type { SeparationOutcome, PositionConsistency } from './spatialKey';


export interface PositionPair {
  a: GeodeticPosition;
  b: GeodeticPosition;
  separation: SeparationOutcome;
  /** The sum of the two stated radii, or null when the test could not be put. */
  combinedRadiusM: number | null;
  state: PositionConsistency;
  because: string;
}

export interface SubjectPositions {
  /** The resolved identity these declarations are about; the grouping key. */
  canonicalId: string;
  subjectIds: string[];
  /**
   * The distinct sources behind the standing declarations. Declarations are
   * counted, sources are counted separately, and the two are never the same
   * number by accident: three declarations from one source is one account
   * restated, not three accounts agreeing.
   */
  sourceIds: string[];
  /** The declarations that stand at the asked-for knowledge instant. */
  compared: GeodeticPosition[];
  /** Declarations excluded before any comparison, each with why. */
  setAside: Array<{ position: GeodeticPosition; because: string }>;
  pairs: PositionPair[];
  state: PositionConsistency;
  because: string;
}

const SET_ASIDE_REASON: Partial<Record<GeodeticPosition['statusAtKnownAt'], string>> = {
  RETRACTED: 'Withdrawn at this knowledge instant: it must not be relied on at all, so it is not a competing account of where the subject is.',
  SUPERSEDED: 'Superseded at this knowledge instant: a later declaration replaced it, so the difference between them is already resolved and is not a contradiction.',
};

function radiusOf(position: GeodeticPosition): number | null {
  const radius = position.point.horizontalUncertaintyM;
  if (radius === null || radius === undefined) return null;
  return Number.isFinite(radius) && radius >= 0 ? radius : null;
}

function pairOf(a: GeodeticPosition, b: GeodeticPosition): PositionPair {
  const separation = geodesicSeparationM(a.point, b.point);
  if (separation.state === 'NOT_ASSESSABLE') return { a, b, separation, combinedRadiusM: null, state: 'NOT_ASSESSABLE', because: separation.because };
  const radiusA = radiusOf(a), radiusB = radiusOf(b);
  const missing = [radiusA === null ? a.positionRecordId : null, radiusB === null ? b.positionRecordId : null].filter((id): id is string => id !== null);
  if (missing.length) {
    return { a, b, separation, combinedRadiusM: null, state: 'NOT_ASSESSABLE',
      because: `${missing.join(' and ')} state${missing.length === 1 ? 's' : ''} no usable horizontal uncertainty. No radius is assumed for a declaration that does not carry one, so the two cannot be tested against each other.` };
  }
  const combinedRadiusM = radiusA! + radiusB!;
  const disjoint = separation.metres > combinedRadiusM;
  return { a, b, separation, combinedRadiusM, state: disjoint ? 'DISJOINT' : 'OVERLAPPING',
    because: `${formatMetres(separation.metres)} apart, against ±${radiusA} m and ±${radiusB} m — a combined ${formatMetres(combinedRadiusM)}. The two stated radii ${disjoint ? 'cannot contain one common point' : 'can contain one common point'}.` };
}

/**
 * Group every declared position by the identity it was resolved to and ask,
 * of each subject with more than one declaration, whether the standing ones
 * can all be right. Positions are deduplicated by their own record id: the
 * same declaration resolved for several selected records is one declaration.
 */
export function positionSeparations(positions: readonly GeodeticPosition[]): SubjectPositions[] {
  const byCanonical = new Map<string, Map<string, GeodeticPosition>>();
  for (const position of positions) {
    const key = position.subject.canonicalId;
    const declared = byCanonical.get(key) ?? new Map<string, GeodeticPosition>();
    if (!declared.has(position.positionRecordId)) declared.set(position.positionRecordId, position);
    byCanonical.set(key, declared);
  }
  const groups: SubjectPositions[] = [];
  for (const [canonicalId, declared] of [...byCanonical.entries()].sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0))) {
    const all = [...declared.values()].sort((x, y) => (x.positionRecordId < y.positionRecordId ? -1 : x.positionRecordId > y.positionRecordId ? 1 : 0));
    if (all.length < 2) continue;
    const compared: GeodeticPosition[] = [];
    const setAside: SubjectPositions['setAside'] = [];
    for (const position of all) {
      const because = SET_ASIDE_REASON[position.statusAtKnownAt];
      if (because) setAside.push({ position, because });
      else compared.push(position);
    }
    const pairs: PositionPair[] = [];
    for (let i = 0; i < compared.length; i += 1) for (let j = i + 1; j < compared.length; j += 1) pairs.push(pairOf(compared[i], compared[j]));
    const subjectIds = [...new Set(all.map((position) => position.subject.subjectId))].sort();
    const sourceIds = [...new Set(compared.map((position) => position.source.sourceId))].sort();
    const one = sourceIds.length === 1;
    const counted = `${compared.length} standing ${compared.length === 1 ? 'declaration' : 'declarations'} from ${sourceIds.length} ${sourceIds.length === 1 ? 'source' : 'sources'}`;
    let state: PositionConsistency;
    let because: string;
    if (compared.length < 2) {
      state = 'NOT_ASSESSABLE';
      because = `${all.length} declarations, of which one stands at this knowledge instant. There is nothing standing for it to contradict.`;
    } else if (pairs.some((pair) => pair.state === 'DISJOINT')) {
      state = 'DISJOINT';
      because = `${counted}, of which at least one pair cannot both be right. Where this subject is has not been settled, and nothing here settles it.${one ? ' Both are the same source, which has contradicted itself.' : ''}`;
    } else if (pairs.some((pair) => pair.state === 'NOT_ASSESSABLE')) {
      state = 'NOT_ASSESSABLE';
      because = `${counted}, of which at least one pair could not be tested. The set is not shown to be consistent.`;
    } else {
      state = 'OVERLAPPING';
      because = one
        ? `${counted}, so this is one account restated, not accounts agreeing. Nothing corroborates anything here.`
        : `${counted} whose stated uncertainties can all be satisfied by one position. That is the whole of the finding, and it is not corroboration.`;
    }
    groups.push({ canonicalId, subjectIds, sourceIds, compared, setAside, pairs, state, because });
  }
  return groups;
}

/**
 * Why there is no reading, when there is none. A subject with a single
 * declaration is not compared, and silence there is indistinguishable from
 * not having looked. Absence gets its reason like everything else does, and
 * the reason is itself worth reading: one declaration from one source is the
 * weakest state the evidence has, and standing alone is not corroboration.
 */
export function soleDeclaration(positions: readonly GeodeticPosition[]): string | null {
  if (!positions.length) return null;
  if (positionSeparations(positions).length) return null;
  const declared = new Map<string, GeodeticPosition>();
  for (const position of positions) if (!declared.has(position.positionRecordId)) declared.set(position.positionRecordId, position);
  const sources = new Set([...declared.values()].map((position) => position.source.sourceId));
  const subjects = new Set([...declared.values()].map((position) => position.subject.canonicalId));
  const count = declared.size;
  return `${count} ${count === 1 ? 'declaration' : 'declarations'} from ${sources.size} ${sources.size === 1 ? 'source' : 'sources'}, across ${subjects.size} resolved ${subjects.size === 1 ? 'identity' : 'identities'}: no identity here carries two, so there is nothing to compare. A single account is not corroborated by standing alone.`;
}

/** What this derivation is and, more importantly, what a reader must not take it for. */
export const SEPARATION_LOSS = [
  'Separation is the geodesic on the WGS84 ellipsoid between two declared points. It is not a route, not a travelled distance, and not a distance through or around anything.',
  'The test is only whether the two stated uncertainty radii can contain one common point. The sources state a radius and no distribution, so no probability is computed and none is implied.',
  'Overlapping radii are not agreement. Two sources whose rings meet may still be describing different things, and a shared location is never on its own a reason to treat two subjects as one.',
  'A declaration that states no horizontal uncertainty is not compared and no radius is assumed for it. A pair that cannot be tested leaves the whole set untested, never consistent.',
  'A withdrawn or superseded declaration is set aside before any comparison, and named. Only what stands at the asked-for knowledge instant can contradict anything.',
  'The grouping key is the identity the compiler resolved, not proximity. Nothing here resolves an identity, and a disagreement is a question for adjudication, not an answer.',
  'Declarations are counted, and so are the sources behind them, because they are not the same number. Several declarations from one source are one account restated.',
  'Distinct sources are not independent sources. Two sources republishing one original measurement declare twice and observe once, and a position record carries no lineage that would show it, so nothing here can tell corroboration from syndication. Agreement between sources is never counted as evidence.',
] as const;
