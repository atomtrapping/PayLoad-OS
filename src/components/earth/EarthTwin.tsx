'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ProjectionSpec } from '@/projection/spec';
import { ADOPTED, CLOCK_MEANING, SUPERSEDED_TONE, EARTH_ENGINE, EARTH_TWIN_ORIGIN, EVENT_TONE, GEV_SIGNAL_SOURCES, GLOBAL_VIEW, LAYER_STATE_MEANING, NOT_ADOPTED, PLACEMENT_TONE, placementViewFor, TERMS_CLASS_LABEL, TWIN_LAYERS, TWIN_NONCLAIMS, formatView, formatLink, parseLink, selectionFromLink, globeSpec, integrationBlockers, parseView, placementLabel, positionSeparations, soleDeclaration, projectionOutcome, SEPARATION_LOSS, SEPARATION_METHOD, SEPARATION_METRIC, formatMetres, cameraHeightLabel, type GeodeticPosition, type PositionConsistency, type SubjectPositions, type LayerState, type ProjectionOutcome, type TwinView } from '@/domain/earth';
import { CONVENIENCE_MEANING, INSTRUMENT_RULES, conveniencesTaken, type InstrumentReading } from '@/domain/operatorInstrument';
import { Readout, Rule } from '@/components/hud/Instrument';
import { EPISTEMIC_OF_LAYER_STATE, EPISTEMIC_OF_PROJECTION } from '@/domain/epistemic';
import { CORROBORATION_MEANING, type LocatedReading } from '@/domain/locatedClaims';
import { geometryVertices, type RecordGeometry } from '@/domain/corpus';
import { representativePointOf } from '@/domain/spatialKey';
import { fmtUtc } from '@/lib/format';

type CesiumModule = typeof import('cesium');
type Viewer = import('cesium').Viewer;

export interface EarthRecord {
  recordId: string; title: string; subjectId: string; predicate: string; validFrom: string; validTo?: string;
  /**
   * The release declares a position record for this record's subject. A hint
   * for which record to open on, never a promise that the compiler will place
   * it — the compiler decides, on the exact version and the asked-for clocks.
   */
  positionDeclared?: boolean;
}
export interface EarthTwinProps {
  release: { releaseId: string; corpusId: string; knownAt: string };
  source: ProjectionSpec['source'];
  records: EarthRecord[];
  /**
   * The operator's readout of the release's own spatial state, computed on the
   * server for the twin's seat. Read-only by construction: it is a value, and
   * the component has no path from it to a write.
   */
  instrument: InstrumentReading;
  /**
   * The ledger's events and the checked claims, each met by the corpus at its
   * coordinates. Computed on the server under the twin's seat; the component
   * draws them and can select them, and has no path from any of it to a write.
   */
  located: LocatedReading[];
  /** False means the event layer was not evaluated, not that no events exist. */
  eventsAvailable?: boolean;
  /** Whether the local engine asset package passed verification (scripts/earth-assets.mjs). */
  assetsReady: boolean;
  /** How the engine is obtained; the default loads its prebuilt module from this origin. Tests inject a fake. */
  loadEngine?: () => Promise<CesiumModule>;
}

/**
 * The engine is an asset of this origin, like its workers and imagery: its
 * prebuilt module is loaded at runtime from /cesium/index.js rather than
 * bundled, so there is exactly one copy of it and no bundler can split it.
 */
export async function loadEngineFromOrigin(): Promise<CesiumModule> {
  const url = `${EARTH_ENGINE.assetsPath}index.js`;
  return await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url) as CesiumModule;
}

type Status = { state: 'LOADING' } | { state: 'READY'; renderer: string } | { state: 'UNAVAILABLE'; reason: string; remedy: string };
type EngineInstance = { id: symbol; Cesium: CesiumModule; viewer: Viewer };
type SunPoint = { longitude: number; latitude: number; precise: boolean };
const ASSETS_UNAVAILABLE: Status = { state: 'UNAVAILABLE', reason: 'The local engine asset package is missing or failed verification.', remedy: 'Run npm run earth:assets (it runs before dev and build), then reload. If preparation fails, preserve the existing bundle and follow docs/EARTH_TWIN.md.' };
/** What is drawn for one record: the positions the compiler resolved for it, with the record's own title and validity start. */
interface Placement { title: string; validFrom: string; positions: GeodeticPosition[] }
interface PlaceSummary { placed: number; positions: number; unplaced: string[]; refused: Array<{ recordId: string; code: string }> }
const ENTITY_PREFIX = 'place:';
const EVENT_PREFIX = 'event:';

const locatedId = (entry: LocatedReading) => entry.item.kind === 'CLAIM' ? entry.item.claimId : entry.item.eventId;
const locatedGeometry = (entry: LocatedReading) => entry.item.kind === 'CLAIM' ? entry.item.geocode.geometry : entry.item.geocode?.geometry;
const locatedPoint = (entry: LocatedReading) => { const geometry = locatedGeometry(entry); return geometry ? representativePointOf(geometry) : undefined; };
/**
 * The ring of a shape as a flat degree array, or null for a point.
 *
 * A shape is drawn as the shape. An uncertainty ring is drawn instead only for
 * a point, where the radius is the whole of what the source said about extent;
 * drawing both over a boundary would state the extent twice and imply the
 * larger of them is the claim.
 */
function ringDegrees(geometry: RecordGeometry): number[] | null {
  if (geometry.kind === 'POINT') return null;
  return geometryVertices(geometry).flatMap((vertex) => [vertex.longitude, vertex.latitude]);
}
const locatedWord = (entry: LocatedReading): keyof typeof EVENT_TONE => entry.item.kind === 'LEDGER_EVENT' ? 'LEDGER' : (entry.reading?.now.label ?? 'NOT_IN_COVERAGE');
/** The label at the coordinates: identifier and current reading, then the headline, cut so it reads as a label and not a paragraph. */
function eventLabel(entry: LocatedReading): string {
  if (entry.item.kind === 'LEDGER_EVENT') return `${entry.item.eventId} · ${entry.item.retraction.kind}`;
  const head = entry.item.headline.length > 44 ? `${entry.item.headline.slice(0, 43)}…` : entry.item.headline;
  return `${entry.item.claimId} · ${entry.reading?.now.label ?? 'NOT_IN_COVERAGE'}\n${head}`;
}

const muted = { color: 'var(--text-secondary)' };
const faint = { color: 'var(--text-muted)' };

const KEY_LABEL = { NONE: 'no key', FREE_KEY: 'free key', OPTIONAL_KEY: 'optional key', METERED_KEY: 'metered key' } as const;

/**
 * One inspector section.
 *
 * `folded` makes it a disclosure that starts closed. Two sections earn it —
 * the layer list and the twenty-one-source registry — because between them
 * they were most of the column's height, and a reader arriving to look at a
 * globe had to scroll past both to reach what is on it. Folding them loses
 * nothing: the summary carries the count, so the registry still says
 * twenty-one named and none integrated with the section shut.
 */
function Part({ title, right, children, testId, folded }: { title: string; right?: ReactNode; children: ReactNode; testId?: string; folded?: boolean }) {
  const id = `earth-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  // The state word rides in the rule after the hairline, so a folded section
  // still reads its one fact with the section shut.
  const heading = <h3 id={id}>{title}{right !== undefined && <span className="hud-bar-state">{right}</span>}</h3>;
  if (folded) {
    return (
      <details className="inspector-section inspector-fold" data-testid={testId}>
        <summary>{heading}</summary>
        <div className="inspector-fold-body">{children}</div>
      </details>
    );
  }
  return <section className="inspector-section" aria-labelledby={id} data-testid={testId}>{heading}{children}</section>;
}

/**
 * A layer's state, drawn from the epistemic scale rather than a map of its
 * own. The map this replaced drew UNAVAILABLE in the refusal red: a layer the
 * engine cannot supply is an absence, not a gate declining, and the scale
 * keeps those apart with a dashed grey.
 */
/**
 * The card for a located item: the receipt in miniature.
 *
 * For a claim — what was claimed, by whom, when published, when captured, how
 * it was located, and where the corpus stands beside it at both knowledge
 * times. For a ledger event — the retraction itself, at its subject's last
 * declared position. Its every control is a selection or a flight, and a test
 * holds the whole set to that.
 */
function LocatedCard({ entry, records, engineReady, flyTo, onSelectRecord }: {
  entry: LocatedReading; records: EarthRecord[]; engineReady: boolean; flyTo: (target: TwinView) => void; onSelectRecord: (id: string) => void;
}) {
  const point = locatedPoint(entry);
  const word = locatedWord(entry);
  const tone = `var(${EVENT_TONE[word].cssVar})`;
  const where = point ? `${point.latitude.toFixed(4)}°, ${point.longitude.toFixed(4)}°` : null;
  const flyHere = () => { if (point) flyTo({ longitude: point.longitude, latitude: point.latitude, ...placementViewFor(locatedGeometry(entry)) }); };
  if (entry.item.kind === 'LEDGER_EVENT') {
    const item = entry.item;
    const selectable = [...item.retraction.affectedRecordIds, ...(item.retraction.replacementRecordIds ?? [])].filter((id) => records.some((r) => r.recordId === id));
    return (
      <div className="hud-panel flex flex-col gap-1.5 text-[12px]" data-epistemic="WITHDRAWN" data-testid="event-card" data-event={item.eventId} data-state={item.retraction.kind}>
        <div className="hud-bar"><span>{item.eventId}</span><span className="hud-bar-state" style={{ color: tone }}>{item.retraction.kind}</span></div>
        <div style={{ color: 'var(--text-heading)' }}>{item.retraction.reason}</div>
        <div className="hud-stamp hud-stamp-lead">
          <span data-k="ISSUED">{fmtUtc(item.retraction.issuedAt, { seconds: true })}</span>
          {item.retraction.sourceId && <span data-k="SOURCE">{item.retraction.sourceId}</span>}
          <span data-k="SUBJECTS">{item.affectedSubjectIds.join(', ')}</span>
          <span data-k="AFFECTS">{item.retraction.affectedRecordIds.join(', ')}</span>
          {item.retraction.replacementRecordIds?.length ? <span data-k="REPLACES WITH">{item.retraction.replacementRecordIds.join(', ')}</span> : null}
        </div>
        <Readout label="Where" layout="row" state={entry.placement.placed ? 'DECLARED' : 'UNKNOWN'} value={entry.placement.placed && where ? `${where} · ±${entry.placement.radiusM} m` : 'UNKNOWN'} />
        <div style={faint}>{item.geocode?.because ?? (entry.placement.placed ? '' : entry.placement.because)}</div>
        <div className="flex flex-wrap items-center gap-2">
          {entry.placement.placed && point && <button type="button" className="btn btn-sm" disabled={!engineReady} onClick={flyHere}>Fly to it</button>}
          {selectable.map((id) => <button key={id} type="button" className="btn btn-sm btn-quiet" onClick={() => onSelectRecord(id)} data-event-record={id}>Select {id}</button>)}
        </div>
      </div>
    );
  }
  const item = entry.item;
  const reading = entry.reading;
  const held = reading?.now.record;
  const bounds = held?.uncertainty && (held.uncertainty.low !== undefined || held.uncertainty.high !== undefined) ? ` [${held.uncertainty.low ?? '−∞'}, ${held.uncertainty.high ?? '+∞'}]` : '';
  return (
    <div className="hud-panel flex flex-col gap-1.5 text-[12px]" data-epistemic="DECLARED" data-testid="event-card" data-event={item.claimId} data-state={word}>
      <div className="hud-bar"><span>{item.claimId}</span><span className="hud-bar-state" style={{ color: tone }}>{word}</span></div>
      <div className="text-[13px]" style={{ color: 'var(--text-heading)' }}>{item.headline}</div>
      <div className="hud-stamp hud-stamp-lead">
        <span data-k="SOURCE">{item.source.displayName}</span>
        <span data-k="PUBLISHED">{fmtUtc(item.publishedAt, { seconds: true })}</span>
        <span data-k="CAPTURED">{fmtUtc(item.capturedAt, { seconds: true })}</span>
        <span data-k="BEGAN AS">{item.beganAs}</span>
        <span data-k="CLASS">{item.evidenceClass.claimStrength} / {item.evidenceClass.productionClass} / {item.evidenceClass.interest}</span>
      </div>
      <Readout label="Geocode" layout="row" state={entry.placement.placed ? 'DECLARED' : 'UNKNOWN'} testId="event-geocode"
        value={entry.placement.placed && where ? `${where} · ±${entry.placement.radiusM} m` : `${where ?? ''} · radius not stated · not drawn`} />
      <div style={faint}>{item.geocode.because}{!entry.placement.placed && ` ${entry.placement.because}`}</div>
      <Readout label="Asserts" layout="row" state="DECLARED" testId="event-asserts"
        value={item.asserts ? `${item.asserts.subjectId} · ${item.asserts.predicate} · ${item.asserts.value} @ ${fmtUtc(item.asserts.validAt)}` : 'names no predicate this corpus holds'} />
      {reading && <>
        <Rule label="Against the corpus" right={word} />
        <div className="flex flex-col gap-0.5" data-testid="event-reading-now" data-state={reading.now.label}>
          <Readout label="Now" layout="row" value={<span style={{ color: `var(${EVENT_TONE[reading.now.label].cssVar})` }}>{reading.now.label}</span>} />
          <div style={faint}>{reading.now.because}</div>
        </div>
        <div className="flex flex-col gap-0.5" data-testid="event-reading-capture" data-state={reading.atCapture.label}>
          <Readout label="At capture" layout="row" value={<span style={{ color: `var(${EVENT_TONE[reading.atCapture.label].cssVar})` }}>{reading.atCapture.label}</span>} />
          <div style={faint}>{reading.atCapture.because}</div>
        </div>
        {reading.now.label !== reading.atCapture.label && <div style={muted} data-testid="event-clocks-differ">The two clocks disagree: the corpus learned something between {fmtUtc(reading.atCapture.knownAt)} and {fmtUtc(reading.now.knownAt)}.</div>}
        <div style={faint}>{CORROBORATION_MEANING[reading.now.status]}</div>
        {held && (
          <div className="hud-stamp">
            <span data-k="RECORD">{held.recordId}</span>
            <span data-k="HELD">{held.value}{held.unit ? ` ${held.unit}` : ''}{bounds}</span>
            <span data-k="STANDING">{held.status}</span>
            <span data-k="KNOWN">{fmtUtc(held.knownAt, { seconds: true })}</span>
          </div>
        )}
      </>}
      <div className="flex flex-wrap items-center gap-2">
        {entry.placement.placed && point && <button type="button" className="btn btn-sm" disabled={!engineReady} onClick={flyHere}>Fly to it</button>}
        {held && records.some((r) => r.recordId === held.recordId) && <button type="button" className="btn btn-sm btn-quiet" onClick={() => onSelectRecord(held.recordId)} data-event-record={held.recordId}>Select {held.recordId}</button>}
      </div>
    </div>
  );
}

function StatePill({ state }: { state: LayerState }) {
  return <span className="pill text-[10px] px-1.5" data-epistemic={EPISTEMIC_OF_LAYER_STATE[state]} title={LAYER_STATE_MEANING[state]}>{state.replace('_', ' ')}</span>;
}

/**
 * The accent follows the same two tiers the rest of the estate uses.
 * `DISJOINT` is a decision — these accounts cannot both be right — and is
 * accented as one. `NOT_ASSESSABLE` is unresolved and takes the amber that
 * means the question was not answered. `OVERLAPPING` is deliberately plain:
 * it is not a positive finding, and colouring it as one would say the
 * sources agree, which it does not say.
 */
const CONSISTENCY_TONE: Record<PositionConsistency, { color: string; label: string }> = {
  DISJOINT: { color: 'var(--status-refused)', label: 'cannot both be right' },
  NOT_ASSESSABLE: { color: 'var(--status-conditional)', label: 'not assessable' },
  OVERLAPPING: { color: 'var(--text-secondary)', label: 'no contradiction shown' },
};

/**
 * What the drawn points imply about each other. Drawing two positions says
 * nothing; this says the one thing the declarations support, under a named
 * metric and a named method, and prints what it is not.
 */
function DeclaredPositionReading({ groups }: { groups: SubjectPositions[] }) {
  if (!groups.length) return null;
  return (
    <div className="flex flex-col gap-1" data-testid="position-separation">
      {groups.map((group) => (
        <div key={group.canonicalId} className="surface p-2 flex flex-col gap-1" data-separation-subject={group.canonicalId} data-separation-state={group.state}>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="label-sm" style={{ color: CONSISTENCY_TONE[group.state].color }}>{CONSISTENCY_TONE[group.state].label}</span>
            <span className="id">{group.canonicalId}</span>
            <span style={faint}>{group.subjectIds.join(', ')}</span>
            <span style={faint} data-source-count={group.sourceIds.length}>
              {group.sourceIds.length} {group.sourceIds.length === 1 ? 'source' : 'sources'}
            </span>
          </div>
          <div style={muted}>{group.because}</div>
          {group.pairs.length > 0 && (
            <ul className="m-0 p-0 list-none flex flex-col gap-0.5" aria-label="Declarations compared">
              {group.pairs.map((pair) => (
                <li key={`${pair.a.positionRecordId}|${pair.b.positionRecordId}`} className="flex flex-col" data-pair-state={pair.state}>
                  <span><span className="id">{pair.a.positionRecordId}</span> <span style={faint}>against</span> <span className="id">{pair.b.positionRecordId}</span>{' '}
                    <span className="mono" style={{ color: CONSISTENCY_TONE[pair.state].color }}>{pair.separation.state === 'MEASURED' ? formatMetres(pair.separation.metres) : '—'}</span></span>
                  <span style={faint}>{pair.because}</span>
                </li>
              ))}
            </ul>
          )}
          {group.setAside.length > 0 && (
            <ul className="m-0 p-0 list-none flex flex-col gap-0.5" aria-label="Declarations set aside">
              {group.setAside.map((entry) => (
                <li key={entry.position.positionRecordId} data-set-aside={entry.position.positionRecordId}>
                  <span className="id">{entry.position.positionRecordId}</span> <span className="mono" style={{ color: 'var(--status-revoked)' }}>{entry.position.statusAtKnownAt}</span>{' '}
                  <span style={faint}>{entry.because}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      <div style={faint}>Method <span className="mono">{SEPARATION_METHOD}</span> · metric <span className="mono">{SEPARATION_METRIC}</span></div>
      <ul className="m-0 pl-4 list-disc flex flex-col gap-0.5" aria-label="What the separation does not say" data-testid="separation-loss">
        {SEPARATION_LOSS.map((line) => <li key={line} style={faint}>{line}</li>)}
      </ul>
    </div>
  );
}

/** The sun's ground point at an instant, from the engine's own ephemeris. Precise when the frame data has loaded; otherwise the TEME approximation the engine itself falls back to. */
function subSolarPoint(Cesium: CesiumModule, iso: string): { longitude: number; latitude: number; precise: boolean } | null {
  try {
    const time = Cesium.JulianDate.fromIso8601(iso);
    const inertial = Cesium.Simon1994PlanetaryPositions.computeSunPositionInEarthInertialFrame(time, new Cesium.Cartesian3());
    const icrf = Cesium.Transforms.computeIcrfToFixedMatrix(time, new Cesium.Matrix3());
    const matrix = icrf ?? Cesium.Transforms.computeTemeToPseudoFixedMatrix(time, new Cesium.Matrix3());
    const fixed = Cesium.Matrix3.multiplyByVector(matrix, inertial, new Cesium.Cartesian3());
    const carto = Cesium.Cartographic.fromCartesian(fixed);
    if (!carto) return null;
    return { longitude: Cesium.Math.toDegrees(carto.longitude), latitude: Cesium.Math.toDegrees(carto.latitude), precise: Boolean(icrf) };
  } catch { return null; }
}

function readView(Cesium: CesiumModule, viewer: Viewer): TwinView {
  const c = viewer.camera.positionCartographic;
  return { longitude: Cesium.Math.toDegrees(c.longitude), latitude: Cesium.Math.toDegrees(c.latitude), height: c.height, heading: Cesium.Math.toDegrees(viewer.camera.heading), pitch: Cesium.Math.toDegrees(viewer.camera.pitch) };
}

/**
 * The Earth Twin: a keyless, offline CesiumJS globe served from this origin,
 * with an inspector that says what every layer is, where it comes from, and
 * what it does not do. Nothing here fetches from anywhere but this origin;
 * nothing here invents a position.
 */
export function EarthTwin({ release, source, records, instrument, located, eventsAvailable = true, assetsReady, loadEngine = loadEngineFromOrigin }: EarthTwinProps) {
  const container = useRef<HTMLDivElement>(null);
  const credits = useRef<HTMLElement>(null);
  const engine = useRef<EngineInstance | null>(null);
  const session = useMemo(() => ({ assetsReady, loadEngine }), [assetsReady, loadEngine]);
  const [runtime, setRuntime] = useState<{ session: typeof session; status: Status; instance: symbol | null } | null>(null);
  // A replacement is loading immediately, before its effect runs. A completed
  // result from another asset/loader session can never make this session ready.
  const status: Status = !assetsReady ? ASSETS_UNAVAILABLE : runtime?.session === session ? runtime.status : { state: 'LOADING' };
  const activeInstance = status.state === 'READY' && runtime?.session === session ? runtime.instance : null;
  const [view, setView] = useState<TwinView>(GLOBAL_VIEW);
  const [linkable, setLinkable] = useState(true);
  // A link may name a record. If this release does not offer it, nothing is
  // selected in its place: a default would look like success while showing
  // something the link did not name.
  const linked = useMemo(() => selectionFromLink(
    typeof window === 'undefined' ? null : parseLink(window.location.hash),
    records.map((record) => record.recordId),
  ), [records]);
  /*
   * With no link naming one, open on a record whose subject the release
   * positions. The twin's whole question is where a record's subject was, and
   * landing on one the release cannot place showed an empty globe under a red
   * refusal — a true statement about that record, and a poor first question to
   * have asked on the reader's behalf. `positionDeclared` only says a position
   * record exists for the subject; the compiler still decides, so when nothing
   * is positioned this falls back to the first record and the refusal stands.
   */
  const opensOn = records.find((entry) => entry.positionDeclared)?.recordId ?? records[0]?.recordId ?? '';
  const [recordId, setRecordId] = useState(linked.recordId ?? opensOn);
  const [answer, setAnswer] = useState<{ key: string; outcome: ProjectionOutcome } | null>(null);
  const [sunResult, setSunResult] = useState<{ instance: symbol; validAt: string; point: SunPoint | null } | null>(null);
  const [copied, setCopied] = useState('');
  const [placements, setPlacements] = useState<Record<string, Placement>>({});
  const [placing, setPlacing] = useState<{ done: number; total: number } | null>(null);
  const [placeSummary, setPlaceSummary] = useState<PlaceSummary | null>(null);
  const flyOnResolve = useRef(false);
  /** The records each drawn point stands for, by entity id, so a click on the globe selects one of them. */
  const drawn = useRef(new Map<string, string[]>());
  /** Entity id → located item id, so a click on the globe selects the event drawn there. */
  const drawnEvents = useRef(new Map<string, string>());
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const selected = useRef(recordId);
  useEffect(() => { selected.current = recordId; }, [recordId]);
  const record = records.find((r) => r.recordId === recordId);
  const clock = useMemo(() => ({ knownAt: release.knownAt, validAt: record?.validFrom ?? release.knownAt }), [release.knownAt, record?.validFrom]);
  // The serialized request is both the wire body and its identity. Record ID
  // and world time alone do not bind knowledge time or the release commitments.
  const askKey = record ? JSON.stringify(globeSpec(source, record.recordId, clock)) : '';
  const outcome: ProjectionOutcome | { state: 'ASKING' } | { state: 'NONE' } = !record ? { state: 'NONE' } : answer?.key === askKey ? answer.outcome : { state: 'ASKING' };
  const sun = sunResult?.instance === activeInstance && sunResult?.validAt === clock.validAt ? sunResult.point : null;
  const worldTime = useRef(clock.validAt);
  // Initialization can finish after a record changes. Publish READY only after
  // assigning the most recent committed world time, not the loader's old one.
  useEffect(() => { worldTime.current = clock.validAt; }, [clock.validAt]);

  // Mount the engine once the assets are known to be on this origin; tear it down with the page.
  useEffect(() => {
    if (!session.assetsReady || !container.current) return;
    let cancelled = false;
    let viewer: Viewer | undefined;
    let instance: EngineInstance | null = null;
    let removeMoveEnd: (() => void) | undefined;
    const isCurrent = () => !cancelled && instance !== null && engine.current === instance;
    const onHashChange = () => {
      const current = instance;
      const target = parseView(window.location.hash);
      if (!isCurrent() || !current || !target) return;
      current.viewer.camera.flyTo({ destination: current.Cesium.Cartesian3.fromDegrees(target.longitude, target.latitude, target.height), orientation: { heading: current.Cesium.Math.toRadians(target.heading), pitch: current.Cesium.Math.toRadians(target.pitch), roll: 0 }, duration: 0 });
      setView(target);
    };
    const dispose = () => {
      window.removeEventListener('hashchange', onHashChange);
      removeMoveEnd?.();
      removeMoveEnd = undefined;
      if (engine.current === instance) engine.current = null;
      const ownedViewer = viewer;
      viewer = undefined;
      ownedViewer?.destroy();
    };
    (async () => {
      try {
        (window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = EARTH_ENGINE.assetsPath;
        const Cesium = await session.loadEngine();
        if (cancelled || !container.current) return;
        Cesium.Ion.defaultAccessToken = '';
        const imagery = await Cesium.TileMapServiceImageryProvider.fromUrl(Cesium.buildModuleUrl('Assets/Textures/NaturalEarthII'));
        if (cancelled || !container.current) return;
        viewer = new Cesium.Viewer(container.current, {
          baseLayer: new Cesium.ImageryLayer(imagery), terrainProvider: new Cesium.EllipsoidTerrainProvider(),
          timeline: false, animation: false, baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false, navigationHelpButton: false, fullscreenButton: false, vrButton: false, selectionIndicator: false, infoBox: false,
          creditContainer: credits.current ?? undefined, requestRenderMode: true, maximumRenderTimeChange: Infinity,
          contextOptions: { webgl: { preserveDrawingBuffer: true } },
        });
        viewer.scene.globe.enableLighting = true;
        viewer.clock.shouldAnimate = false;
        viewer.clock.currentTime = Cesium.JulianDate.fromIso8601(worldTime.current);
        instance = { id: Symbol('earth-viewer'), Cesium, viewer };
        engine.current = instance;
        const initial = parseView(window.location.hash) ?? GLOBAL_VIEW;
        viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(initial.longitude, initial.latitude, initial.height), orientation: { heading: Cesium.Math.toRadians(initial.heading), pitch: Cesium.Math.toRadians(initial.pitch), roll: 0 } });
        setView(initial);
        removeMoveEnd = viewer.camera.moveEnd.addEventListener(() => {
          if (!isCurrent() || !instance) return;
          const next = readView(Cesium, instance.viewer);
          setView(next);
          const hash = formatView(next);
          const ok = parseView(hash) !== null;
          setLinkable(ok);
          if (ok) window.history.replaceState(null, '', `#${hash}`);
        });
        // A link pasted into this page's address bar is a view too: a valid hash flies the camera there; an invalid one is ignored.
        window.addEventListener('hashchange', onHashChange);
        // A point on the globe is a record: clicking it selects the record it was drawn for.
        viewer.screenSpaceEventHandler.setInputAction((movement: { position: import('cesium').Cartesian2 }) => {
          if (!isCurrent() || !instance) return;
          const current = instance;
          const picked = current.viewer.scene.pick(movement.position) as { id?: { id?: unknown } } | undefined;
          const id = picked?.id?.id;
          const ids = typeof id === 'string' ? drawn.current.get(id) : undefined;
          if (ids?.length && !ids.includes(selected.current)) { flyOnResolve.current = false; setRecordId(ids[0]); }
          // A marker on the globe is a located item: clicking it opens its card. Selecting is not admitting.
          const eventId = typeof id === 'string' ? drawnEvents.current.get(id) : undefined;
          if (eventId) setSelectedEvent(eventId);
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
        const gl = viewer.canvas.getContext('webgl2') ?? viewer.canvas.getContext('webgl');
        const info = gl?.getExtension('WEBGL_debug_renderer_info');
        const renderer = gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : 'WebGL';
        setRuntime({ session, status: { state: 'READY', renderer }, instance: instance.id });
      } catch (failure) {
        dispose();
        if (!cancelled) setRuntime({ session, instance: null, status: { state: 'UNAVAILABLE', reason: failure instanceof Error ? failure.message : 'The engine could not start.', remedy: 'WebGL must be available in this browser and the engine assets under /cesium. Nothing else is shown in the globe’s place.' } });
      }
    })();
    return () => { cancelled = true; dispose(); };
  }, [session]);

  // The twin's world time drives the engine's clock and lighting, and the sub-solar point follows.
  useEffect(() => {
    const current = engine.current;
    if (!current || current.id !== activeInstance) return;
    const { Cesium, viewer } = current;
    const time = Cesium.JulianDate.fromIso8601(clock.validAt);
    viewer.clock.currentTime = time;
    viewer.scene.requestRender();
    setSunResult({ instance: current.id, validAt: clock.validAt, point: subSolarPoint(Cesium, clock.validAt) });
    // The precise Earth-orientation data is served from this origin with the engine; once it has loaded, the point is recomputed exactly.
    let stale = false;
    Cesium.Transforms.preloadIcrfFixed(new Cesium.TimeInterval({ start: time, stop: time })).then(() => { if (!stale && engine.current === current) setSunResult({ instance: current.id, validAt: clock.validAt, point: subSolarPoint(Cesium, clock.validAt) }); }).catch(() => { /* The approximation stands and says so. */ });
    return () => { stale = true; };
  }, [clock.validAt, activeInstance]);

  const flyTo = useCallback((target: TwinView) => {
    const current = engine.current;
    if (!current) return;
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    current.viewer.camera.flyTo({ destination: current.Cesium.Cartesian3.fromDegrees(target.longitude, target.latitude, target.height), orientation: { heading: current.Cesium.Math.toRadians(target.heading), pitch: current.Cesium.Math.toRadians(target.pitch), roll: 0 }, duration: reduced ? 0 : 1.2 });
  }, []);

  // The corpus is asked for one record on the globe under the release's own commitments. What it answers with is placed and drawn; nothing else is.
  useEffect(() => {
    if (!askKey || !record) return;
    const controller = new AbortController();
    const key = askKey;
    const asked = { recordId: record.recordId, title: record.title, validFrom: record.validFrom };
    fetch('/api/projections/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: key, signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (controller.signal.aborted) return;
        const outcome = projectionOutcome(response.status, body);
        setAnswer({ key, outcome });
        if (outcome.state === 'READY') {
          setPlacements((current) => ({ ...current, [asked.recordId]: { title: asked.title, validFrom: asked.validFrom, positions: outcome.positions } }));
          if (flyOnResolve.current && outcome.positions[0]) { flyOnResolve.current = false; flyTo({ longitude: outcome.positions[0].point.longitude, latitude: outcome.positions[0].point.latitude, ...placementViewFor(outcome.positions[0].shape) }); }
        } else {
          setPlacements((current) => { if (!(asked.recordId in current)) return current; const next = { ...current }; delete next[asked.recordId]; return next; });
        }
      })
      .catch(() => { if (!controller.signal.aborted) setAnswer({ key, outcome: { state: 'REFUSED', code: 'PROJECTION_UNAVAILABLE', detail: 'The projection service could not be reached on this origin.' } }); });
    return () => controller.abort();
  }, [askKey, record, flyTo]);

  // Everything placed is drawn: one point per declared position, coloured by the declaring source's interest, its stated uncertainty as a ring, the records placed there as the label.
  useEffect(() => {
    const current = engine.current;
    if (!current || current.id !== activeInstance) return;
    const { Cesium, viewer } = current;
    const groups = new Map<string, { position: GeodeticPosition; records: Array<{ recordId: string; title: string }> }>();
    for (const [recordId, placement] of Object.entries(placements)) {
      for (const position of placement.positions) {
        const group = groups.get(position.positionRecordId) ?? { position, records: [] };
        group.records.push({ recordId, title: placement.title });
        groups.set(position.positionRecordId, group);
      }
    }
    viewer.entities.removeAll();
    drawn.current = new Map();
    for (const [positionRecordId, { position, records: placed }] of groups) {
      const id = `${ENTITY_PREFIX}${positionRecordId}`;
      drawn.current.set(id, placed.map((entry) => entry.recordId).sort());
      // A position the release has replaced is drawn in the withdrawn hue and
      // carries no label. The subject keeps both declarations — the earlier
      // release still shows the centroid a boundary later superseded — and two
      // labels at one berth read as none.
      const standing = position.statusAtKnownAt === 'CURRENT';
      const tone = Cesium.Color.fromCssColorString(standing ? PLACEMENT_TONE[position.evidenceClass.interest].hex : SUPERSEDED_TONE.hex);
      const where = Cesium.Cartesian3.fromDegrees(position.point.longitude, position.point.latitude);
      const ring = ringDegrees(position.shape);
      viewer.entities.add({
        id, position: where,
        point: { pixelSize: 9, color: tone, outlineColor: Cesium.Color.BLACK.withAlpha(0.85), outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
        ...(standing ? { label: { text: placementLabel(position, drawn.current.get(id)!.map((recordId) => placed.find((entry) => entry.recordId === recordId)!)), font: '12px system-ui, sans-serif', fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK, outlineWidth: 3, style: Cesium.LabelStyle.FILL_AND_OUTLINE, verticalOrigin: Cesium.VerticalOrigin.BOTTOM, pixelOffset: new Cesium.Cartesian2(0, -12), showBackground: true, backgroundColor: Cesium.Color.fromCssColorString('#04040a').withAlpha(0.72), disableDepthTestDistance: Number.POSITIVE_INFINITY } } : {}),
        ...(ring === null && position.point.horizontalUncertaintyM
          ? { ellipse: { semiMajorAxis: position.point.horizontalUncertaintyM, semiMinorAxis: position.point.horizontalUncertaintyM, material: tone.withAlpha(0.18), outline: true, outlineColor: tone.withAlpha(0.8) } }
          : {}),
        ...(ring !== null
          ? {
              polygon: { hierarchy: new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(ring)), material: tone.withAlpha(0.22) },
              // A polygon's own `outline` is silently dropped by some WebGL
              // drivers, and a boundary with no visible edge is a smudge. The
              // ring is closed back to its first vertex here because the
              // record stores it implicitly closed.
              polyline: { positions: Cesium.Cartesian3.fromDegreesArray([...ring, ring[0], ring[1]]), width: 2, material: tone.withAlpha(0.95), clampToGround: true },
            }
          : {}),
      });
    }
    // Located items: the ledger's events and the checked claims, each drawn only
    // with a radius. The colour is the current reading; a conflict is drawn
    // loud — a bigger point and a heavier ring — because a claim that disagrees
    // with the corpus is the most useful object on the globe.
    drawnEvents.current = new Map();
    for (const entry of located) {
      const point = locatedPoint(entry);
      const geometry = locatedGeometry(entry);
      if (!entry.placement.placed || !point || !geometry) continue;
      const eventRing = ringDegrees(geometry);
      const word = locatedWord(entry);
      const tone = Cesium.Color.fromCssColorString(EVENT_TONE[word].hex);
      const loud = word === 'CONFLICTING';
      const id = `${EVENT_PREFIX}${locatedId(entry)}`;
      drawnEvents.current.set(id, locatedId(entry));
      // Only the selected item carries its label at the coordinates. Several
      // items can share one place — a berth collects a correction and three
      // headlines — and stacked labels read as none. The marker's colour says
      // the state for the rest; the list is the index; and the selected
      // label is the card at the coordinates.
      const selectedHere = locatedId(entry) === selectedEvent;
      viewer.entities.add({
        id, position: Cesium.Cartesian3.fromDegrees(point.longitude, point.latitude),
        point: { pixelSize: loud ? 12 : 8, color: tone, outlineColor: Cesium.Color.BLACK.withAlpha(0.85), outlineWidth: loud ? 3 : 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
        ...(selectedHere ? { label: { text: eventLabel(entry), font: '11px ui-monospace, Menlo, monospace', fillColor: tone, outlineColor: Cesium.Color.BLACK, outlineWidth: 3, style: Cesium.LabelStyle.FILL_AND_OUTLINE, verticalOrigin: Cesium.VerticalOrigin.BOTTOM, pixelOffset: new Cesium.Cartesian2(0, -14), showBackground: true, backgroundColor: Cesium.Color.fromCssColorString('#04040a').withAlpha(0.72), disableDepthTestDistance: Number.POSITIVE_INFINITY } } : {}),
        ...(eventRing === null
          ? { ellipse: { semiMajorAxis: entry.placement.radiusM, semiMinorAxis: entry.placement.radiusM, material: tone.withAlpha(loud ? 0.22 : 0.12), outline: true, outlineColor: tone.withAlpha(0.9), outlineWidth: loud ? 3 : 1 } }
          : {
              polygon: { hierarchy: new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(eventRing)), material: tone.withAlpha(loud ? 0.28 : 0.18) },
              polyline: { positions: Cesium.Cartesian3.fromDegreesArray([...eventRing, eventRing[0], eventRing[1]]), width: loud ? 3 : 2, material: tone.withAlpha(0.95), clampToGround: true },
            }),
      });
    }
    viewer.scene.requestRender();
  }, [placements, located, selectedEvent, activeInstance]);

  /** Across everything placed, which subjects have standing declarations that cannot all be right. One declaration counts once however many records resolved it. */
  const placedSeparations = useMemo(() => positionSeparations(Object.values(placements).flatMap((placement) => placement.positions)), [placements]);

  // The operator readout, taken apart for rendering. `conveniencesTaken` is the
  // rule-two filter: a layer that starts interpolating appears here without
  // anyone remembering to add it to a list.
  const conveniences = useMemo(() => conveniencesTaken(instrument), [instrument]);

  const placedEvents = useMemo(() => located.filter((entry) => entry.placement.placed).length, [located]);
  const selectedReading = useMemo(() => located.find((entry) => locatedId(entry) === selectedEvent) ?? null, [located, selectedEvent]);
  /** From the list: select, and fly if there is anywhere to fly to. A click on the globe selects without flying, like a record. */
  /** From a card: select the record it names. Navigation, and the record resolves in place rather than flying. */
  const selectRecordFromCard = (id: string) => { flyOnResolve.current = false; setRecordId(id); };
  const selectEvent = (entry: LocatedReading) => {
    setSelectedEvent(locatedId(entry));
    const point = locatedPoint(entry);
    if (entry.placement.placed && point) flyTo({ longitude: point.longitude, latitude: point.latitude, ...placementViewFor(locatedGeometry(entry)) });
  };
  const instrumentReading = useCallback((id: string) => String(instrument.layers.find((entry) => entry.id === id)?.reading ?? 'UNKNOWN'), [instrument]);

  /** Ask the compiler for every record of the release, each at its own validity start, and draw all that can be placed. Nothing is placed by anything but its own subject's declaration. */
  async function placeAll() {
    if (placing) return;
    setPlacing({ done: 0, total: records.length });
    const next: Record<string, Placement> = {};
    const summary: PlaceSummary = { placed: 0, positions: 0, unplaced: [], refused: [] };
    for (const [index, item] of records.entries()) {
      try {
        const response = await fetch('/api/projections/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(globeSpec(source, item.recordId, { knownAt: release.knownAt, validAt: item.validFrom })), cache: 'no-store' });
        const body = await response.json().catch(() => ({}));
        const outcome = projectionOutcome(response.status, body);
        if (outcome.state === 'READY') { next[item.recordId] = { title: item.title, validFrom: item.validFrom, positions: outcome.positions }; summary.placed += 1; summary.positions += outcome.positions.length; }
        else if (outcome.state === 'UNAVAILABLE') summary.unplaced.push(item.recordId);
        else summary.refused.push({ recordId: item.recordId, code: outcome.code });
      } catch { summary.refused.push({ recordId: item.recordId, code: 'PROJECTION_UNAVAILABLE' }); }
      setPlacing({ done: index + 1, total: records.length });
    }
    setPlacements(next);
    setPlaceSummary(summary);
    setPlacing(null);
  }

  async function copyLink() {
    const url = `${window.location.origin}/earth#${formatLink(view, recordId || null)}`;
    try { await navigator.clipboard.writeText(url); setCopied('Link copied.'); } catch { setCopied(url); }
  }

  const corpusLayer = TWIN_LAYERS.find((l) => l.id === 'corpus')!;
  return (
    <>
    <link rel="stylesheet" href={`${EARTH_ENGINE.assetsPath}Widgets/widgets.css`} precedence="default" />
    <div className="earth-layout" data-testid="earth-twin" data-status={status.state}>
      <div className="earth-stage" data-testid="earth-stage">
        <div ref={container} className="earth-canvas" aria-label="Earth Twin globe" role="img" />
        <div className="earth-hud" aria-live="polite">
          <span className="label-sm">Earth Twin</span>
          <span className="pill text-[10px] px-1.5" data-testid="twin-status" data-state={status.state} style={{ color: status.state === 'READY' ? 'var(--check-passed)' : status.state === 'LOADING' ? 'var(--status-pending)' : 'var(--status-refused)', borderColor: 'currentColor' }}>{status.state}</span>
          <span className="mono text-[11px]" style={faint} data-k="WORLD">{fmtUtc(clock.validAt, { seconds: true })}</span>
          <span className="mono text-[11px]" style={faint} data-k="PLACED" data-testid="earth-placed" data-count={Object.keys(placements).length}>{Object.keys(placements).length}</span>
          <span className="mono text-[11px]" style={faint} data-k="EVENTS" data-testid="earth-events" data-count={eventsAvailable ? placedEvents : undefined}>{eventsAvailable ? placedEvents : 'NOT_EVALUATED'}</span>
        </div>
        {status.state === 'UNAVAILABLE' && (
          <div className="earth-unavailable" role="alert" data-testid="earth-unavailable">
            <h2 className="m-0 text-[15px] font-semibold">The globe is not shown</h2>
            <p className="m-0 text-[12.5px]" style={muted}>{status.reason}</p>
            <p className="m-0 text-[12.5px]" style={muted}>{status.remedy}</p>
          </div>
        )}
        {/* A named region rather than a labelled div: the engine writes the
            licence attribution in here, and an aria-label on a plain div names
            nothing an assistive technology is allowed to read. */}
        <section ref={credits} className="earth-credits" aria-label="Engine and imagery credits" />
      </div>

      <aside className="inspector earth-inspector" aria-labelledby="earth-inspector-title" data-testid="earth-inspector">
        <div className="inspector-head">
          <div className="min-w-0">
            <div className="label-sm">Instrument · projection fabric</div>
            <h2 id="earth-inspector-title" className="m-0 text-[15px] font-semibold leading-snug" style={{ color: 'var(--text-heading)' }}>NotationsOS Earth Twin</h2>
            <div className="text-[12px] mt-0.5" style={faint}>{EARTH_ENGINE.name} {EARTH_ENGINE.version} · {EARTH_ENGINE.license} · keyless · served from this origin</div>
          </div>
        </div>
        <div className="inspector-body">
          <Part title="What this instrument is" testId="earth-instrument" folded
            right={status.state === 'READY' ? 'RUNNING' : status.state === 'LOADING' ? 'STARTING' : <span style={{ color: 'var(--status-refused)' }}>NOT RUNNING</span>}>
            <p className="m-0 text-[12.5px]" style={muted}><span className="font-medium" style={{ color: 'var(--text-heading)' }}>{EARTH_ENGINE.role.question}</span> {EARTH_ENGINE.role.role}</p>
            <dl className="kv m-0 text-[12px]">
              {/* The renderer string can run to a hundred characters on a software GPU; it belongs in the body, not the rule. */}
              <dt>Engine</dt><dd>{status.state === 'READY' ? <span data-testid="earth-renderer">{EARTH_ENGINE.name} on {status.renderer}</span> : status.state === 'LOADING' ? 'Starting…' : <span style={{ color: 'var(--status-refused)' }}>Not running</span>}</dd>
              <dt>Built on</dt><dd><a href={EARTH_TWIN_ORIGIN.repository} style={{ color: 'var(--info)' }}>{EARTH_TWIN_ORIGIN.name}</a> at <span className="mono">{EARTH_TWIN_ORIGIN.commit.slice(0, 12)}</span> · {EARTH_TWIN_ORIGIN.codeLicense}</dd>
              <dt>Source list</dt><dd><span className="mono">{EARTH_TWIN_ORIGIN.dataSourcesPath}</span> blob <span className="mono">{EARTH_TWIN_ORIGIN.dataSourcesBlob.slice(0, 12)}</span></dd>
            </dl>
            <details className="text-[12px]"><summary className="cursor-pointer">Adopted, and deliberately not</summary>
              <ul className="m-0 mt-1 pl-4 flex flex-col gap-0.5" style={muted}>{ADOPTED.map((a) => <li key={a}><span style={{ color: 'var(--check-passed)' }}>adopted</span> {a}</li>)}{NOT_ADOPTED.map((a) => <li key={a}><span style={{ color: 'var(--status-refused)' }}>not</span> {a}</li>)}</ul>
            </details>
            <ul className="m-0 p-0 list-none flex flex-col gap-0.5 text-[11.5px]" style={faint} aria-label="What the twin does not claim" data-testid="earth-nonclaims">{TWIN_NONCLAIMS.map((n) => <li key={n}><span aria-hidden="true">✕</span> {n}</li>)}</ul>
          </Part>

          <Part title="Layers" testId="earth-layers" folded>
            <ul className="m-0 p-0 list-none flex flex-col gap-1.5">
              {TWIN_LAYERS.map((layer) => (
                <li key={layer.id} className="surface-inset p-2 text-[12px] flex flex-col gap-0.5" data-layer={layer.id} data-state={layer.state}>
                  <div className="flex items-baseline justify-between gap-2"><span className="font-medium" style={{ color: 'var(--text-heading)' }}>{layer.label}</span><StatePill state={layer.state} /></div>
                  <div style={muted}>{layer.source}</div>
                  <div style={faint}><span className="label-sm">terms</span> {layer.terms}</div>
                  <div style={faint}><span className="label-sm">draws</span> {layer.draws}</div>
                </li>
              ))}
            </ul>
          </Part>

          <Part title="Time" testId="earth-time">
            <div className="flex flex-col gap-1 text-[12px]">
              <Readout label="Known at" layout="row" value={<span className="ts">{fmtUtc(clock.knownAt, { seconds: true })}</span>} />
              <Readout label="World time" layout="row" testId="earth-valid-at" value={<span className="ts">{fmtUtc(clock.validAt, { seconds: true })}</span>} />
              {/* Computed by the engine, so DERIVED when it is; UNKNOWN when there is no engine to compute it. */}
              <Readout label="Sub-solar" layout="row" testId="earth-subsolar" state={sun ? 'DERIVED' : 'UNKNOWN'}
                value={sun
                  ? <><span className="mono">{sun.latitude.toFixed(2)}°, {sun.longitude.toFixed(2)}°</span> <span style={faint}>· computed by {EARTH_ENGINE.name}{sun.precise ? '' : ' (TEME approximation until the frame data loads)'}</span></>
                  : (status.state === 'READY' ? 'computing…' : 'not computed: the engine is not running')} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn btn-sm" disabled={!sun || status.state !== 'READY'} onClick={() => sun && flyTo({ ...GLOBAL_VIEW, longitude: sun.longitude, latitude: sun.latitude })} data-testid="fly-subsolar">Fly to the sub-solar point</button>
            </div>
            <details className="text-[11.5px]" style={faint}><summary className="cursor-pointer">What the clocks mean</summary>
              <dl className="kv m-0 mt-1">
                <dt>Known at</dt><dd>{CLOCK_MEANING.knownAt}</dd>
                <dt>World time</dt><dd>{CLOCK_MEANING.validAt} It follows the selected record’s validity start.</dd>
              </dl>
            </details>
          </Part>

          <Part title="Corpus on the globe" testId="earth-corpus"
            right={outcome.state === 'ASKING' || outcome.state === 'NONE' ? outcome.state : <span data-epistemic={EPISTEMIC_OF_PROJECTION[outcome.state]}>{outcome.state}</span>}>
            <div className="hud-stamp hud-stamp-lead">
              <span data-k="RELEASE">{release.releaseId}</span>
              <span data-k="VIEW">GLOBE / GEODETIC / GLOBAL_3D</span>
              <span data-k="VIEWER">COUNTERPARTY_SHARED</span>
            </div>
            {records.length ? (
              <div className="flex flex-col gap-1">
                <label htmlFor="earth-record" className="text-[12px]">Record</label>
                <select id="earth-record" className="surface-inset px-2 py-1.5 text-[12.5px] w-full" value={recordId} onChange={(event) => { flyOnResolve.current = true; setRecordId(event.target.value); }}>
                  {records.map((r) => <option key={r.recordId} value={r.recordId}>{r.recordId} · {r.title}</option>)}
                </select>
                {record && <div className="text-[11.5px]" style={faint}>{record.subjectId} · {record.predicate} · valid from {fmtUtc(record.validFrom)}{record.validTo ? ` to ${fmtUtc(record.validTo)}` : ', open'}</div>}
              </div>
            ) : <p className="m-0 text-[12px]" style={faint}>The release carries no records.</p>}
            {linked.standing === 'NOT_OFFERED' && (
              <div className="surface-inset p-2 text-[12px]" style={{ color: 'var(--status-conditional)' }} data-testid="link-selection-refused" data-named={linked.named ?? undefined}>
                {linked.because}
              </div>
            )}
            <div className="surface-inset p-2 text-[12px] flex flex-col gap-1" data-testid="earth-projection" data-outcome={outcome.state} data-code={'code' in outcome ? outcome.code : undefined}>
              {outcome.state === 'ASKING' && <span style={faint}>Asking the projection compiler…</span>}
              {outcome.state === 'NONE' && <span style={faint}>Nothing selected.</span>}
              {outcome.state === 'READY' && <><span style={{ color: 'var(--check-passed)' }}>READY</span><span style={muted}>{outcome.detail}</span>
                <ul className="m-0 p-0 list-none flex flex-col gap-1" aria-label="Declared positions">
                  {outcome.positions.map((position) => (
                    <li key={position.positionRecordId} className="hud-panel flex flex-col gap-1" data-position-record={position.positionRecordId} data-interest={position.evidenceClass.interest}>
                      {/* The interest is the one thing the colour on the globe says, so it is the one thing coloured here. */}
                      <div className="hud-bar"><span>{position.positionRecordId}</span><span className="hud-bar-state" style={{ color: PLACEMENT_TONE[position.evidenceClass.interest].hex }}>{PLACEMENT_TONE[position.evidenceClass.interest].label} · {position.statusAtKnownAt}</span></div>
                      <div className="mono text-[13px]" style={{ color: 'var(--text-heading)' }}>{position.value} <span style={faint}>· ±{position.point.horizontalUncertaintyM ?? '?'} m · {position.point.datum}</span></div>
                      <div style={faint}>{position.basis}</div>
                      <div className="hud-stamp" style={{ marginTop: 2, paddingTop: 4 }}>
                        <span data-k="SOURCE" className="break-all">{position.source.sourceName ?? position.source.sourceId}</span>
                        <span data-k="CLASS">{position.evidenceClass.claimStrength} / {position.evidenceClass.productionClass} / {position.evidenceClass.interest}</span>
                        <span data-k="VALID">{fmtUtc(position.validity.validFrom)} → {position.validity.validTo ? fmtUtc(position.validity.validTo) : 'open'}</span>
                        <span data-k="KNOWN">{fmtUtc(position.knownAt)}</span>
                      </div>
                      <div><button type="button" className="btn btn-sm" disabled={status.state !== 'READY'} onClick={() => flyTo({ longitude: position.point.longitude, latitude: position.point.latitude, ...placementViewFor(position.shape) })}>Fly to it</button></div>
                    </li>
                  ))}
                </ul>
                <div className="hud-stamp" data-testid="earth-legend">
                  <span data-k="WHERE">as declared over the interval, not where it is now</span>
                  <span data-k="COLOUR">the declaring source’s interest, or withdrawn where the release has replaced the declaration</span>
                  <span data-k="RING">a point’s stated uncertainty</span>
                  <span data-k="OUTLINE">a boundary or extent as the source published it, drawn instead of a ring because the shape is already the extent claim</span>
                </div>
                <DeclaredPositionReading groups={positionSeparations(outcome.positions)} />
                {soleDeclaration(outcome.positions) && (
                  <span style={faint} data-testid="sole-declaration">{soleDeclaration(outcome.positions)}</span>
                )}</>}
              {outcome.state === 'UNAVAILABLE' && <><span className="mono" style={{ color: 'var(--status-refused)' }}>{outcome.code}</span><span style={muted}>{outcome.detail}</span><span style={faint}>{corpusLayer.draws}</span></>}
              {outcome.state === 'REFUSED' && <><span className="mono" style={{ color: 'var(--status-refused)' }}>{outcome.code}</span><span style={muted}>{outcome.detail}</span></>}
            </div>
          </Part>

          <Part title="Placed on the globe" testId="earth-placements" right={Object.keys(placements).length > 0 ? `${Object.keys(placements).length} drawn` : undefined}>
            <details className="text-[11.5px]" style={faint}><summary className="cursor-pointer">How every record is placed</summary>
              <p className="m-0 mt-1">Every record of the release, each asked for at its own validity start, drawn wherever its subject’s own position record declares. The label carries each record’s value and the declaring source’s interest; the twin’s world time stays the selected record’s.</p>
            </details>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn btn-sm btn-primary" disabled={status.state !== 'READY' || Boolean(placing) || !records.length} onClick={() => void placeAll()} data-testid="place-all">Place every record</button>
              {placing && <span className="text-[12px]" style={faint} role="status">Asking the compiler… {placing.done} / {placing.total}</span>}
              {Object.keys(placements).length > 0 && !placing && <button type="button" className="btn btn-sm" onClick={() => { setPlacements({}); setPlaceSummary(null); }}>Clear</button>}
            </div>
            {placeSummary && (
              <div className="surface-inset p-2 text-[12px] flex flex-col gap-1" data-testid="place-summary" data-placed={placeSummary.placed} data-unplaced={placeSummary.unplaced.length} data-refused={placeSummary.refused.length}>
                <div><span style={{ color: 'var(--check-passed)' }}>{placeSummary.placed} placed</span> at {placeSummary.positions} {placeSummary.positions === 1 ? 'position' : 'positions'} · <span style={{ color: 'var(--status-conditional)' }}>{placeSummary.unplaced.length} unplaced</span> · <span style={{ color: 'var(--status-refused)' }}>{placeSummary.refused.length} refused</span></div>
                {placeSummary.unplaced.length > 0 && <div style={faint}>Unplaced, no declared position for the subject: <span className="mono break-all">{placeSummary.unplaced.join(', ')}</span></div>}
                {placeSummary.refused.length > 0 && <div style={faint}>Refused by the compiler: {placeSummary.refused.map((r) => <span key={r.recordId} className="mono mr-2">{r.recordId} {r.code}</span>)}</div>}
                {placedSeparations.length > 0 && (
                  <div data-testid="placed-separations" data-disagreeing={placedSeparations.filter((group) => group.state === 'DISJOINT').length}>
                    <span style={muted}>{placedSeparations.length} {placedSeparations.length === 1 ? 'subject has' : 'subjects have'} more than one declared position.</span>{' '}
                    <span style={{ color: 'var(--status-refused)' }}>{placedSeparations.filter((group) => group.state === 'DISJOINT').length} cannot all be right</span>{' · '}
                    <span style={{ color: 'var(--status-conditional)' }}>{placedSeparations.filter((group) => group.state === 'NOT_ASSESSABLE').length} not assessable</span>{' · '}
                    <span style={muted}>{placedSeparations.filter((group) => group.state === 'OVERLAPPING').length} with no contradiction shown</span>
                    <DeclaredPositionReading groups={placedSeparations} />
                  </div>
                )}
              </div>
            )}
            {Object.keys(placements).length > 0 && (
              <ul className="m-0 p-0 list-none flex flex-col gap-0.5 text-[12px]" aria-label="Placed records">
                {Object.entries(placements).map(([id, placement]) => <li key={id} className="flex flex-wrap items-baseline gap-x-2" data-placed-record={id}><button type="button" className="btn btn-sm btn-quiet" aria-pressed={id === recordId} onClick={() => { flyOnResolve.current = true; setRecordId(id); if (id === recordId && placement.positions[0]) flyTo({ longitude: placement.positions[0].point.longitude, latitude: placement.positions[0].point.latitude, ...placementViewFor(placement.positions[0].shape) }); }}>{id}</button><span style={muted}>{placement.title}</span><span style={faint}>{placement.positions.map((p) => p.subject.subjectId).join(', ')} · {fmtUtc(placement.validFrom)}</span></li>)}
              </ul>
            )}
          </Part>

          <Part title="Events on the globe" testId="earth-events-panel" right={eventsAvailable ? `${placedEvents} placed, ${located.length - placedEvents} listed` : 'NOT_EVALUATED'}>
            <p className="m-0 text-[12px]" style={muted}>{eventsAvailable ? 'The ledger’s own events and the drafted specimen headlines, each met by the corpus at its coordinates. A marker’s colour is where the corpus stands beside the claim now; a conflict is drawn loud.' : 'Event and headline layers have not been evaluated for this exact-release scope. An empty display does not establish the absence of events. Use the record picker for permitted spatial observations.'}</p>
            <ul className="m-0 p-0 list-none flex flex-col gap-0.5 text-[12px]" aria-label="Located events" data-testid="event-list">
              {located.map((entry) => {
                const id = locatedId(entry);
                const word = locatedWord(entry);
                return (
                  <li key={id} className="flex flex-wrap items-baseline gap-x-2" data-event-item={id} data-event-state={word} data-placed={entry.placement.placed}>
                    <button type="button" className="btn btn-sm btn-quiet mono" aria-pressed={id === selectedEvent} onClick={() => selectEvent(entry)} data-event-select={id}>{id}</button>
                    <span className="mono text-[10.5px] tracking-wider" style={{ color: `var(${EVENT_TONE[word].cssVar})` }}>{word}</span>
                    {!entry.placement.placed && <span className="mono text-[10.5px] tracking-wider" data-epistemic="UNKNOWN" style={{ border: 0 }}>NOT DRAWN</span>}
                    <span style={muted} className="min-w-0">{entry.item.kind === 'CLAIM' ? entry.item.headline : entry.item.retraction.kind.toLowerCase()} {entry.item.kind === 'LEDGER_EVENT' && <span style={faint}>· {entry.item.affectedSubjectIds.join(', ')}</span>}</span>
                  </li>
                );
              })}
            </ul>

            {selectedReading && <LocatedCard entry={selectedReading} records={records} engineReady={status.state === 'READY'} flyTo={flyTo} onSelectRecord={selectRecordFromCard} />}
          </Part>

          <Part title={`Operator instrument · ${instrumentReading('positioned')} flyable, ${instrumentReading('void')} void`} testId="earth-operator" folded>
            <p className="m-0 text-[12px]" style={muted}>The release’s own spatial state from this seat, arranged to be flown rather than read.</p>
            <ul className="m-0 p-0 list-none flex flex-col gap-1.5" aria-label="Instrument layers" data-testid="operator-layers">
              {instrument.layers.map((entry) => (
                <li key={entry.id} className="hud-panel text-[12px] flex flex-col gap-1" data-operator-layer={entry.id} data-reading={String(entry.reading)} data-convenience={entry.convenience}>
                  {/* Every layer is counted from records the corpus holds, so the
                      state is DERIVED — and Readout overrides it to UNKNOWN on a
                      reading no caller was able to take. */}
                  <Readout label={entry.label} value={entry.reading} state="DERIVED" layout="row" />
                  <div style={muted}>{entry.shows}</div>
                  <div style={faint}>{entry.because}</div>
                </li>
              ))}
            </ul>

            <div className="text-[12px] flex flex-col gap-0.5" data-testid="operator-conveniences" data-taken={conveniences.length}>
              <Rule label="Conveniences taken" right={conveniences.length === 0 ? 'NONE' : `${conveniences.length} declared`} />
              {conveniences.length === 0
                ? <span style={muted}>None. Every reading above is counted from the release as it stands: nothing was interpolated, smoothed, aggregated or carried forward.</span>
                : <ul className="m-0 pl-4">{conveniences.map((entry) => <li key={entry.id} style={muted}><span className="mono">{entry.convenience.replace('_', ' ').toLowerCase()}</span> on {entry.label} — {CONVENIENCE_MEANING[entry.convenience]}</li>)}</ul>}
            </div>

            {instrument.voids.length > 0 && (
              <div className="text-[12px] flex flex-col gap-1" data-testid="operator-voids" data-count={instrument.voids.length}>
                <Rule label="Where the instrument is blind" right={`${instrument.voids.length} void`} state="UNKNOWN" />
                <ul className="m-0 p-0 list-none flex flex-col gap-0.5" aria-label="Subjects with no position">
                  {instrument.voids.map((hole) => {
                    const first = records.find((entry) => entry.subjectId === hole.subjectId);
                    return (
                      <li key={hole.canonicalId} className="flex flex-wrap items-baseline gap-x-2" data-void-subject={hole.subjectId}>
                        <span className="mono" style={{ color: 'var(--text-heading)' }}>{hole.subjectId}</span>
                        <span style={faint}>{hole.subjectType} · {hole.recordsHeld} {hole.recordsHeld === 1 ? 'record' : 'records'} · no position</span>
                        {first && <button type="button" className="btn btn-sm btn-quiet" onClick={() => setRecordId(first.recordId)} data-void-select={hole.subjectId}>Select {first.recordId}</button>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <div className="text-[12px] flex flex-col gap-0.5" data-testid="operator-rules" data-writes={instrument.writes}>
              <Rule label="The two rules this instrument is held to" right="WRITES NONE" />
              <details className="text-[11.5px]" style={faint}><summary className="cursor-pointer">Read the rules</summary>
                <ol className="m-0 mt-1 pl-4 flex flex-col gap-0.5">{INSTRUMENT_RULES.map((rule) => <li key={rule}>{rule}</li>)}</ol>
              </details>
            </div>

            {/* The frame carries the provenance, where it cannot be cropped away
                from the readings it qualifies. */}
            <div className="hud-stamp" data-testid="operator-stamp">
              <span data-k="RELEASE">{instrument.releaseId}</span>
              <span data-k="SEAT">{instrument.seat}</span>
              <span data-k="KNOWN">{fmtUtc(instrument.knownAt, { seconds: true })}</span>
              <span data-k="EVIDENCE">NO</span>
            </div>
          </Part>

          <Part title={`World signals · ${GEV_SIGNAL_SOURCES.length} named, 0 integrated`} testId="earth-signals" folded>
            <p className="m-0 text-[12px]" style={muted}>The public signals {EARTH_TWIN_ORIGIN.name} reads, with their terms as its source list records them. Each would enter NotationsOS through the acquisition rail under a registration and a rights decision. None has.</p>
            <ul className="m-0 p-0 list-none flex flex-col gap-1" aria-label="Signal sources">
              {GEV_SIGNAL_SOURCES.map((s) => (
                <li key={s.id} className="surface-inset p-2 text-[12px]" data-signal={s.id} data-integration={s.integrationState}>
                  <details>
                    <summary className="cursor-pointer flex flex-wrap items-baseline gap-x-2"><span className="font-medium" style={{ color: 'var(--text-heading)' }}>{s.name}</span><span style={faint}>{s.supplies}</span><span className="label-sm ml-auto" style={{ color: 'var(--text-muted)' }}>{s.integrationState.replace('_', ' ')}</span></summary>
                    <dl className="kv m-0 mt-1 text-[11.5px]">
                      <dt>terms</dt><dd>{TERMS_CLASS_LABEL[s.termsClass]}: {s.terms}</dd>
                      <dt>attribution</dt><dd>{s.attribution}</dd>
                      <dt>key</dt><dd>{KEY_LABEL[s.key]}</dd>
                      <dt>why not here</dt><dd><ul className="m-0 pl-4">{integrationBlockers(s).map((b) => <li key={b}>{b}</li>)}</ul></dd>
                    </dl>
                  </details>
                </li>
              ))}
            </ul>
          </Part>

          <Part title="View" testId="earth-view">
            <dl className="kv m-0 text-[12px]">
              <dt>Camera</dt><dd className="mono" data-testid="earth-camera">{view.latitude.toFixed(4)}°, {view.longitude.toFixed(4)}° · {cameraHeightLabel(view.height)} · heading {view.heading.toFixed(1)}° · pitch {view.pitch.toFixed(1)}°</dd>
              <dt>Link</dt><dd>{linkable ? <span className="mono break-all" data-testid="earth-link">#{formatView(view)}</span> : <span style={faint}>This view cannot be linked: the camera is above the horizon.</span>}</dd>
            </dl>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn btn-sm" disabled={status.state !== 'READY'} onClick={() => flyTo(GLOBAL_VIEW)} data-testid="fly-global">Global</button>
              <button type="button" className="btn btn-sm" disabled={!linkable} onClick={() => void copyLink()}>Copy link</button>
              <span className="text-[11.5px] break-all" style={faint} role="status">{copied}</span>
            </div>
            <div className="hud-stamp">
              <span data-k="ORBIT">drag</span>
              <span data-k="ZOOM">scroll</span>
              <span data-k="LINK">the camera, in the hash, bounded and validated — a bad hash is ignored, never clamped</span>
            </div>
          </Part>
        </div>
      </aside>
    </div>
    </>
  );
}
