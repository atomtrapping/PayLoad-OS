import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectionSpec } from '@/projection/spec';
import { INSTRUMENT_METHOD, INSTRUMENT_RULES, type InstrumentReading } from '@/domain/operatorInstrument';
import { LOCATED_CLAIM_METHOD, WIRE_EVIDENCE_CLASS, type LocatedReading } from '@/domain/locatedClaims';
import { EarthTwin, type EarthRecord } from './EarthTwin';

// The engine is a fake injected through the loader: nothing here needs WebGL. The browser suite runs the real one.
const listeners: Array<() => void> = [];
const flyTo = vi.fn();
const setView = vi.fn();
const requestRender = vi.fn();
const entitiesAdd = vi.fn();
const entitiesRemoveAll = vi.fn();
const pick = vi.fn();
const clicks: Array<(movement: { position: unknown }) => void> = [];
const fromUrl = vi.fn(async () => ({ imagery: true }));
const ion = { defaultAccessToken: 'x' };
const viewers: FakeViewer[] = [];
class FakeViewer {
  scene = { globe: { enableLighting: false }, requestRender, pick };
  entities = { add: entitiesAdd, removeAll: entitiesRemoveAll };
  screenSpaceEventHandler = { setInputAction: (fn: (movement: { position: unknown }) => void) => clicks.push(fn) };
  clock = { shouldAnimate: true, currentTime: null as unknown };
  canvas = document.createElement('canvas');
  camera = {
    setView, flyTo,
    moveEnd: { addEventListener: (fn: () => void) => {
      listeners.push(fn);
      return () => { const index = listeners.indexOf(fn); if (index !== -1) listeners.splice(index, 1); };
    } },
    positionCartographic: { longitude: -1.7, latitude: 0.53, height: 1_200_000 }, heading: 0.2, pitch: -0.8,
  };
  destroy = vi.fn();
  constructor() { viewers.push(this); }
}
function fakeEngine(options: { imagery?: () => Promise<unknown>; preload?: () => Promise<void>; longitude?: number } = {}) {
  class Cartesian3 { constructor(public x = 0, public y = 0, public z = 0) {} static fromDegrees(lon: number, lat: number, h: number) { return new Cartesian3(lon, lat, h); } }
  class Matrix3 { static multiplyByVector(_m: unknown, v: Cartesian3) { return v; } }
  class Color {
    constructor(public css = '#000', public alpha = 1) {}
    static WHITE = new Color('#fff'); static BLACK = new Color('#000');
    static fromCssColorString(css: string) { return new Color(css); }
    withAlpha(alpha: number) { return new Color(this.css, alpha); }
  }
  return {
    Ion: ion,
    TileMapServiceImageryProvider: { fromUrl: options.imagery ?? fromUrl },
    buildModuleUrl: (p: string) => `/cesium/${p}`,
    ImageryLayer: class { constructor(public provider: unknown) {} },
    EllipsoidTerrainProvider: class {},
    Viewer: FakeViewer, Cartesian3, Matrix3, Color,
    Cartesian2: class { constructor(public x = 0, public y = 0) {} },
    LabelStyle: { FILL_AND_OUTLINE: 2 }, VerticalOrigin: { BOTTOM: 1 }, ScreenSpaceEventType: { LEFT_CLICK: 0 },
    JulianDate: { fromIso8601: (iso: string) => ({ iso }) },
    Math: { toDegrees: (r: number) => r * 180 / Math.PI, toRadians: (d: number) => d * Math.PI / 180 },
    Simon1994PlanetaryPositions: { computeSunPositionInEarthInertialFrame: () => new Cartesian3(1, 0, 0) },
    TimeInterval: class { constructor(public options: unknown) {} },
    Transforms: { computeIcrfToFixedMatrix: () => undefined, computeTemeToPseudoFixedMatrix: () => new Matrix3(), preloadIcrfFixed: options.preload ?? (async () => undefined) },
    Cartographic: { fromCartesian: () => ({ longitude: options.longitude ?? 0.5, latitude: 0.25 }) },
  } as unknown as typeof import('cesium');
}
const loadEngine = async () => fakeEngine();

const source: ProjectionSpec['source'] = { kind: 'CORPUS_RELEASE', corpusId: 'caravan', releaseId: 'REL-X', releaseDigest: 'a'.repeat(64), manifestCommitment: 'b'.repeat(64), snapshotDigest: `sha256:${'c'.repeat(64)}` };
const release = { releaseId: 'REL-X', corpusId: 'caravan', knownAt: '2026-09-01T12:00:00.000Z' };
const records: EarthRecord[] = [
  { recordId: 'REC-1', title: 'Gross quantity', subjectId: 'LOT-1', predicate: 'quantity.gross', validFrom: '2026-08-03T10:00:00Z' },
  { recordId: 'REC-2', title: 'Hidden', subjectId: 'LOT-2', predicate: 'x', validFrom: '2026-08-10T00:00:00Z', validTo: '2026-08-20T00:00:00Z' },
];

/**
 * A reading the twin renders and never produces. Shaped by hand rather than
 * derived, so a change to the derivation cannot quietly change what these
 * tests assert the component does with one.
 */
const instrument: InstrumentReading = {
  method: INSTRUMENT_METHOD,
  releaseId: 'REL-X',
  knownAt: '2026-09-01T12:00:00.000Z',
  seat: 'COUNTERPARTY_SHARED',
  layers: [
    { id: 'positioned', label: 'Positioned subjects', shows: 'Subjects this seat holds a standing position for.', reading: 1, convenience: 'NONE', because: '1 of 2 selectable subjects carry a standing position record this seat can read.' },
    { id: 'void', label: 'Coverage void', shows: 'Subjects this seat holds records about and no position for.', reading: 1, convenience: 'NONE', because: '1 subject has records and no position here.' },
    { id: 'admission-queue', label: 'Admission queue', shows: 'Candidates waiting on the gate.', reading: 'UNKNOWN', convenience: 'NONE', because: 'Not readable from here: an unreadable count is not a zero.' },
  ],
  voids: [{ canonicalId: 'urn:entity:lot/2', subjectId: 'LOT-2', subjectType: 'Lot', recordsHeld: 1, because: 'This seat holds 1 record about LOT-2 and no position for it.' }],
  isEvidence: false,
  writes: 'NONE',
  rules: INSTRUMENT_RULES,
  because: 'The release as this seat may read it.',
};

/**
 * Three located items, shaped by hand: a ledger correction at a berth, a
 * conflicting specimen drawn as a region, and a specimen with no radius that
 * is listed and not drawn. The readings are what the server would send; the
 * component draws and selects them and computes nothing.
 */
/** For the placement tests, which count entity calls: nothing located, so they keep meaning what they meant. */
const none: LocatedReading[] = [];

const located: LocatedReading[] = [
  {
    method: LOCATED_CLAIM_METHOD,
    item: {
      kind: 'LEDGER_EVENT', eventId: 'RET-X', subjectId: 'LOT-1', affectedSubjectIds: ['LOT-1'],
      retraction: { retractionId: 'RET-X', kind: 'CORRECTION', issuedAt: '2026-08-25T14:00:00Z', releaseId: 'REL-X', affectedRecordIds: ['REC-1'], replacementRecordIds: ['REC-2'], reason: 'A correction, drafted for this test.', sourceId: 'test-source', visibility: 'COUNTERPARTY_SHARED' },
      geocode: { point: { kind: 'POINT', datum: 'WGS84', longitude: 4.025, latitude: 51.9497, horizontalUncertaintyM: 250 }, method: 'notationsos.geocode.declared-position.v1', because: 'LOT-1’s last declared position.' },
    },
    placement: { placed: true, radiusM: 250 },
    reading: null,
  },
  {
    method: LOCATED_CLAIM_METHOD,
    item: {
      kind: 'CLAIM', claimId: 'SPEC-T-1', headline: 'Port sources say lot 2 weighed in at 21.5 t',
      source: { sourceId: 'specimen-wire', displayName: 'Drafted specimen — not a publication' }, evidenceClass: WIRE_EVIDENCE_CLASS,
      publishedAt: '2026-08-27T06:00:00Z', capturedAt: '2026-08-27T06:30:00Z', beganAs: 'DRAFTED_SPECIMEN',
      geocode: { point: { kind: 'POINT', datum: 'WGS84', longitude: -46.313, latitude: -23.9535, horizontalUncertaintyM: 5000 }, method: 'notationsos.geocode.declared-specimen.v1', because: 'Declared by the drafter.' },
      asserts: { subjectId: 'LOT-2', predicate: 'quantity.gross', value: 21.5, validAt: '2026-08-10T00:00:00Z' },
    },
    placement: { placed: true, radiusM: 5000 },
    reading: {
      atCapture: { status: 'PASSED', label: 'CORROBORATED', knownAt: '2026-08-27T06:30:00Z', refusal: null, record: { recordId: 'REC-2', value: 21.5, unit: 't', status: 'CURRENT', validFrom: '2026-08-10T00:00:00Z', knownAt: '2026-08-11T00:00:00Z' }, because: '21.5 t equals REC-2’s 21.5 t.' },
      now: { status: 'FAILED', label: 'CONFLICTING', knownAt: '2026-09-01T12:00:00.000Z', refusal: null, record: { recordId: 'REC-2', value: 19.96, unit: 't', uncertainty: { low: 19.94, high: 19.98, semantics: 'stated' }, status: 'CURRENT', validFrom: '2026-08-10T00:00:00Z', knownAt: '2026-08-28T00:00:00Z' }, because: '21.5 t falls outside REC-2’s stated bounds [19.94, 19.98] t.' },
    },
  },
  {
    method: LOCATED_CLAIM_METHOD,
    item: {
      kind: 'CLAIM', claimId: 'SPEC-T-2', headline: 'Congestion reported somewhere near the yard',
      source: { sourceId: 'specimen-wire', displayName: 'Drafted specimen — not a publication' }, evidenceClass: WIRE_EVIDENCE_CLASS,
      publishedAt: '2026-08-28T05:30:00Z', capturedAt: '2026-08-28T06:00:00Z', beganAs: 'DRAFTED_SPECIMEN',
      geocode: { point: { kind: 'POINT', datum: 'WGS84', longitude: -46.313, latitude: -23.9535 }, method: 'notationsos.geocode.declared-specimen.v1', because: 'Declared with no uncertainty.' },
      asserts: null,
    },
    placement: { placed: false, because: 'The geocode states no horizontal uncertainty.' },
    reading: {
      atCapture: { status: 'NOT_APPLICABLE', label: 'NOT_IN_COVERAGE', knownAt: '2026-08-28T06:00:00Z', refusal: null, record: null, because: 'The headline names no predicate this corpus holds.' },
      now: { status: 'NOT_APPLICABLE', label: 'NOT_IN_COVERAGE', knownAt: '2026-09-01T12:00:00.000Z', refusal: null, record: null, because: 'The headline names no predicate this corpus holds.' },
    },
  },
];

function api(answer: (body: ProjectionSpec) => { status: number; json: unknown }) {
  const fetch = vi.fn(async (_url: string, init?: RequestInit) => { const body = JSON.parse(String(init?.body)) as ProjectionSpec; const reply = answer(body); return { status: reply.status, ok: reply.status === 200, json: async () => reply.json }; });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
const unavailable = { status: 200, json: { status: 'UNAVAILABLE', error: 'GEOMETRY_NOT_AVAILABLE' } };
/** One declared position, as the compiler returns it: the subject's own location.position record, with its class, both clocks and its source. */
function declared(recordId: string, positionRecordId: string, interest = 'disinterested', extra: Record<string, unknown> = {}) {
  return {
    recordId, positionRecordId, canonicalId: `caravan:${positionRecordId}`, subject: { subjectId: 'LOT-1', canonicalId: 'caravan:LOT-1', subjectType: 'Lot' },
    point: { datum: 'WGS84', longitude: 4.025, latitude: 51.9497, horizontalUncertaintyM: 250 }, value: '51.9497 N, 4.0250 E', basis: 'Port custody record',
    validity: { validFrom: '2026-08-15T06:00:00Z', validTo: '2026-08-18T00:00:00Z' }, knownAt: '2026-08-18T09:30:00Z',
    evidenceClass: { claimStrength: 'reported', productionClass: 'asserted', interest }, source: { sourceId: 'caravan:source:port-custody-system', sourceName: 'Port custody system' }, statusAtKnownAt: 'CURRENT', ...extra,
  };
}
const ready = (positions: unknown[], unplaced: string[] = []) => ({ status: 200, json: { status: 'READY', error: null, geometry: { datum: 'WGS84', positions, unplaced } } });


function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((accept, decline) => { resolve = accept; reject = decline; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  viewers.length = 0;
  fromUrl.mockReset().mockResolvedValue({ imagery: true });
  requestRender.mockReset();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); listeners.length = 0; clicks.length = 0; flyTo.mockReset(); setView.mockReset(); entitiesAdd.mockReset(); entitiesRemoveAll.mockReset(); pick.mockReset(); window.history.replaceState(null, '', '/earth'); });

describe('EarthTwin', () => {
  it('says the globe is not shown, and why, when the engine assets are not on this origin', async () => {
    api(() => unavailable);
    render(<EarthTwin release={release} source={source} records={records} instrument={instrument} located={located} assetsReady={false} loadEngine={loadEngine} />);
    expect(screen.getByTestId('twin-status')).toHaveAttribute('data-state', 'UNAVAILABLE');
    expect(screen.getByTestId('earth-unavailable')).toHaveTextContent('npm run earth:assets');
    expect(screen.getByTestId('fly-global')).toBeDisabled();
    await waitFor(() => expect(screen.getByTestId('earth-projection')).toHaveAttribute('data-outcome', 'UNAVAILABLE'));
  });

  it('starts the engine keyless from bundled imagery, lists every layer with its state, asks the compiler for one record on the globe and shows its refusal without drawing', async () => {
    const fetch = api((body) => body.selection.recordIds[0] === 'REC-1' ? unavailable : { status: 404, json: { fixture_only: true, error: 'SELECTION_NOT_AVAILABLE' } });
    const user = userEvent.setup();
    render(<EarthTwin release={release} source={source} records={records} instrument={instrument} located={located} assetsReady loadEngine={loadEngine} />);
    await waitFor(() => expect(screen.getByTestId('twin-status')).toHaveAttribute('data-state', 'READY'));
    expect(ion.defaultAccessToken).toBe('');
    expect(fromUrl).toHaveBeenCalledWith('/cesium/Assets/Textures/NaturalEarthII');
    expect(setView).toHaveBeenCalledTimes(1);
    const layers = within(screen.getByTestId('earth-layers')).getAllByRole('listitem');
    expect(layers.map((l) => `${l.getAttribute('data-layer')}:${l.getAttribute('data-state')}`)).toEqual(['surface:BUNDLED', 'sun:COMPUTED', 'corpus:FIXTURE', 'signals:NOT_INTEGRATED', 'notations:UNAVAILABLE']);
    expect(document.querySelectorAll('[data-signal][data-integration="NOT_INTEGRATED"]')).toHaveLength(21);

    const projection = screen.getByTestId('earth-projection');
    await waitFor(() => expect(projection).toHaveAttribute('data-outcome', 'UNAVAILABLE'));
    expect(projection).toHaveAttribute('data-code', 'GEOMETRY_NOT_AVAILABLE');
    expect(projection).toHaveTextContent('invents none');
    const spec = JSON.parse(String(fetch.mock.calls[0][1]?.body)) as ProjectionSpec;
    expect(spec.view).toEqual({ mode: 'GLOBE', coordinateSemantics: 'GEODETIC', representation: 'GLOBAL_3D' });
    expect(spec.selection).toEqual({ recordIds: ['REC-1'], knownAt: release.knownAt, validAt: '2026-08-03T10:00:00Z' });
    expect(screen.getByTestId('earth-valid-at')).toHaveTextContent('2026-08-03 10:00:00 UTC');
    // The sub-solar point reads "computing…" until the engine mock settles, so
    // this is an asynchronous transition and has to be awaited like the others
    // in this file. Asserting it synchronously passes in isolation and flakes
    // under full-suite load, which is the worst of both.
    await waitFor(() => expect(screen.getByTestId('earth-subsolar')).toHaveTextContent('computed by CesiumJS'));
    expect(screen.getByTestId('earth-subsolar')).toHaveTextContent('TEME approximation');

    await user.selectOptions(screen.getByLabelText('Record'), 'REC-2');
    await waitFor(() => expect(projection).toHaveAttribute('data-outcome', 'REFUSED'));
    expect(projection).toHaveAttribute('data-code', 'SELECTION_NOT_AVAILABLE');
    expect(projection).toHaveTextContent('nothing withheld is disclosed');
    expect(screen.getByTestId('earth-valid-at')).toHaveTextContent('2026-08-10 00:00:00 UTC');
    expect(JSON.parse(String(fetch.mock.calls[1][1]?.body)).selection.validAt).toBe('2026-08-10T00:00:00Z');
  });

  it('keeps the view as a link: the camera writes a bounded hash when it stops, presets fly the camera, and a bad hash is ignored', async () => {
    api(() => unavailable);
    window.history.replaceState(null, '', '/earth#v=999,0,1,0,0');
    const user = userEvent.setup();
    render(<EarthTwin release={release} source={source} records={records} instrument={instrument} located={located} assetsReady loadEngine={loadEngine} />);
    await waitFor(() => expect(screen.getByTestId('twin-status')).toHaveAttribute('data-state', 'READY'));
    expect(screen.getByTestId('earth-link')).toHaveTextContent('#v=0.0000,0.0000,12000000,0.0,-90.0');
    act(() => { for (const listener of listeners) listener(); });
    expect(window.location.hash).toBe('#v=-97.4028,30.3668,1200000,11.5,-45.8');
    expect(screen.getByTestId('earth-camera')).toHaveTextContent('30.3668°, -97.4028° · 1,200 km');
    await user.click(screen.getByTestId('fly-global'));
    expect(flyTo).toHaveBeenCalledTimes(1);
    await user.click(screen.getByTestId('fly-subsolar'));
    expect(flyTo).toHaveBeenCalledTimes(2);
    // jsdom raises hashchange itself when the hash is set, as a browser does.
    window.location.hash = '#v=10.0000,20.0000,500000,90.0,-30.0';
    await waitFor(() => expect(screen.getByTestId('earth-link')).toHaveTextContent('#v=10.0000,20.0000,500000,90.0,-30.0'));
    expect(flyTo).toHaveBeenCalledTimes(3);
    window.location.hash = '#v=nonsense';
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(flyTo).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId('earth-link')).toHaveTextContent('#v=10.0000,20.0000,500000,90.0,-30.0');
    expect(flyTo.mock.calls[1][0].destination).toMatchObject({ x: expect.closeTo(28.6479, 3), y: expect.closeTo(14.3239, 3) });
  });

  it.each(['engine', 'imagery'] as const)('ignores a late rejected %s load after a replacement is ready', async (stage) => {
    api(() => unavailable);
    const pending = deferred<never>();
    const oldImagery = vi.fn(() => pending.promise);
    const oldLoader = stage === 'engine' ? () => pending.promise : async () => fakeEngine({ imagery: oldImagery });
    const { rerender } = render(<EarthTwin release={release} source={source} records={records} instrument={instrument} located={located} assetsReady loadEngine={oldLoader} />);
    if (stage === 'imagery') await waitFor(() => expect(oldImagery).toHaveBeenCalledOnce());
    rerender(<EarthTwin release={release} source={source} records={records} instrument={instrument} located={located} assetsReady loadEngine={loadEngine} />);
    await waitFor(() => expect(screen.getByTestId('twin-status')).toHaveAttribute('data-state', 'READY'));
    await act(async () => { pending.reject(new Error('superseded failure')); });
    expect(screen.getByTestId('twin-status')).toHaveAttribute('data-state', 'READY');
    expect(screen.queryByText('superseded failure')).not.toBeInTheDocument();
    expect(viewers).toHaveLength(1);
    expect(viewers[0].destroy).not.toHaveBeenCalled();
  });

  it.each(['engine', 'imagery'] as const)('ignores a late resolved %s load after a replacement is ready', async (stage) => {
    api(() => unavailable);
    const enginePending = deferred<typeof import('cesium')>();
    const imageryPending = deferred<unknown>();
    const oldImagery = vi.fn(() => imageryPending.promise);
    const oldLoader = stage === 'engine' ? () => enginePending.promise : async () => fakeEngine({ imagery: oldImagery });
    const { rerender } = render(<EarthTwin release={release} source={source} records={records} instrument={instrument} located={located} assetsReady loadEngine={oldLoader} />);
    if (stage === 'imagery') await waitFor(() => expect(oldImagery).toHaveBeenCalledOnce());
    rerender(<EarthTwin release={release} source={source} records={records} instrument={instrument} located={located} assetsReady loadEngine={loadEngine} />);
    await waitFor(() => expect(screen.getByTestId('twin-status')).toHaveAttribute('data-state', 'READY'));
    await act(async () => { enginePending.resolve(fakeEngine()); imageryPending.resolve({ imagery: true }); });
    expect(screen.getByTestId('twin-status')).toHaveAttribute('data-state', 'READY');
    expect(viewers).toHaveLength(1);
    expect(setView).toHaveBeenCalledOnce();
    expect(listeners).toHaveLength(1);
  });

  it('shows loading during replacement and initializes the replacement at the unchanged pinned world time', async () => {
    api(() => unavailable);
    const { rerender } = render(<EarthTwin release={release} source={source} records={records} instrument={instrument} located={located} assetsReady loadEngine={loadEngine} />);
    await waitFor(() => expect(screen.getByTestId('twin-status')).toHaveAttribute('data-state', 'READY'));
    const old = viewers[0];
    expect(old.clock.currentTime).toEqual({ iso: records[0].validFrom });
    const pending = deferred<typeof import('cesium')>();
    const nextLoader = () => pending.promise;
    rerender(<EarthTwin release={release} source={source} records={records} instrument={instrument} located={located} assetsReady loadEngine={nextLoader} />);
    expect(screen.getByTestId('twin-status')).toHaveAttribute('data-state', 'LOADING');
    expect(screen.getByTestId('fly-global')).toBeDisabled();
    expect(screen.getByTestId('fly-subsolar')).toBeDisabled();
    expect(screen.getByTestId('earth-subsolar')).toHaveTextContent('not computed');
    expect(old.destroy).toHaveBeenCalledOnce();
    await act(async () => { pending.resolve(fakeEngine()); });
    await waitFor(() => expect(screen.getByTestId('twin-status')).toHaveAttribute('data-state', 'READY'));
    expect(viewers).toHaveLength(2);
    expect(viewers[1].clock.currentTime).toEqual({ iso: records[0].validFrom });
    expect(viewers[1].clock.shouldAnimate).toBe(false);
    expect(listeners).toHaveLength(1);
    expect(screen.getByTestId('earth-subsolar')).toHaveTextContent('computed by CesiumJS');
  });

  it('disables a ready viewer when assets fail verification, and starts a fresh viewer when verified again', async () => {
    api(() => unavailable);
    const { rerender } = render(<EarthTwin release={release} source={source} records={records} instrument={instrument} located={located} assetsReady loadEngine={loadEngine} />);
    await waitFor(() => expect(screen.getByTestId('twin-status')).toHaveAttribute('data-state', 'READY'));
    const oldMoveEnd = listeners[0];
    rerender(<EarthTwin release={release} source={source} records={records} instrument={instrument} located={located} assetsReady={false} loadEngine={loadEngine} />);
    expect(screen.getByTestId('twin-status')).toHaveAttribute('data-state', 'UNAVAILABLE');
    expect(screen.getByTestId('earth-unavailable')).toHaveTextContent('missing or failed verification');
    expect(screen.getByTestId('earth-subsolar')).toHaveTextContent('not computed');
    expect(viewers[0].destroy).toHaveBeenCalledOnce();
    expect(listeners).toHaveLength(0);
    act(() => { oldMoveEnd(); window.dispatchEvent(new HashChangeEvent('hashchange')); });
    expect(window.location.hash).toBe('');
    expect(flyTo).not.toHaveBeenCalled();
    rerender(<EarthTwin release={release} source={source} records={records} instrument={instrument} located={located} assetsReady loadEngine={loadEngine} />);
    await waitFor(() => expect(screen.getByTestId('twin-status')).toHaveAttribute('data-state', 'READY'));
    expect(viewers).toHaveLength(2);
    expect(viewers[1].clock.currentTime).toEqual({ iso: records[0].validFrom });
  });

  it('destroys a partially initialized viewer immediately and recovers with another loader', async () => {
    api(() => unavailable);
    setView.mockImplementationOnce(() => { throw new Error('camera initialization failed'); });
    const { rerender, unmount } = render(<EarthTwin release={release} source={source} records={records} instrument={instrument} located={located} assetsReady loadEngine={loadEngine} />);
    await waitFor(() => expect(screen.getByTestId('twin-status')).toHaveAttribute('data-state', 'UNAVAILABLE'));
    expect(viewers[0].destroy).toHaveBeenCalledOnce();
    expect(listeners).toHaveLength(0);
    expect(screen.getByTestId('fly-global')).toBeDisabled();
    const nextLoader = async () => fakeEngine();
    rerender(<EarthTwin release={release} source={source} records={records} instrument={instrument} located={located} assetsReady loadEngine={nextLoader} />);
    await waitFor(() => expect(screen.getByTestId('twin-status')).toHaveAttribute('data-state', 'READY'));
    expect(viewers[1].clock.currentTime).toEqual({ iso: records[0].validFrom });
    unmount();
    expect(viewers[0].destroy).toHaveBeenCalledOnce();
    expect(viewers[1].destroy).toHaveBeenCalledOnce();
    expect(listeners).toHaveLength(0);
  });

  it.each(['resolve', 'reject'] as const)('ignores an engine %s after unmount', async (completion) => {
    api(() => unavailable);
    const pending = deferred<typeof import('cesium')>();
    const { unmount } = render(<EarthTwin release={release} source={source} records={records} instrument={instrument} located={located} assetsReady loadEngine={() => pending.promise} />);
    unmount();
    await act(async () => { if (completion === 'resolve') pending.resolve(fakeEngine()); else pending.reject(new Error('unmounted load')); });
    expect(viewers).toHaveLength(0);
    expect(fromUrl).not.toHaveBeenCalled();
    expect(listeners).toHaveLength(0);
  });

  it('does not let an old frame preload replace the current viewer’s sub-solar result', async () => {
    api(() => unavailable);
    const pending = deferred<void>();
    const firstLoader = async () => fakeEngine({ preload: () => pending.promise, longitude: 1 });
    const { rerender, unmount } = render(<EarthTwin release={release} source={source} records={records} instrument={instrument} located={located} assetsReady loadEngine={firstLoader} />);
    await waitFor(() => expect(screen.getByTestId('earth-subsolar')).toHaveTextContent('57.30°'));
    rerender(<EarthTwin release={release} source={source} records={records} instrument={instrument} located={located} assetsReady loadEngine={loadEngine} />);
    await waitFor(() => expect(screen.getByTestId('earth-subsolar')).toHaveTextContent('28.65°'));
    await act(async () => { pending.resolve(); });
    expect(screen.getByTestId('earth-subsolar')).toHaveTextContent('28.65°');
    expect(screen.getByTestId('earth-subsolar')).not.toHaveTextContent('57.30°');
    unmount();
    expect(viewers.every((viewer) => viewer.destroy.mock.calls.length === 1)).toBe(true);
  });

  it('initializes with the latest world time when the selected record changes while loading', async () => {
    api(() => unavailable);
    const pending = deferred<typeof import('cesium')>();
    const user = userEvent.setup();
    render(<EarthTwin release={release} source={source} records={records} instrument={instrument} located={located} assetsReady loadEngine={() => pending.promise} />);
    await user.selectOptions(screen.getByLabelText('Record'), 'REC-2');
    await act(async () => { pending.resolve(fakeEngine()); });
    expect(screen.getByTestId('twin-status')).toHaveAttribute('data-state', 'READY');
    expect(viewers[0].clock.currentTime).toEqual({ iso: records[1].validFrom });
  });

  it.each(['resolve', 'reject'] as const)('ignores an imagery %s after unmount', async (completion) => {
    api(() => unavailable);
    const pending = deferred<unknown>();
    const imagery = vi.fn(() => pending.promise);
    const { unmount } = render(<EarthTwin release={release} source={source} records={records} instrument={instrument} located={located} assetsReady loadEngine={async () => fakeEngine({ imagery })} />);
    await waitFor(() => expect(imagery).toHaveBeenCalledOnce());
    unmount();
    await act(async () => { if (completion === 'resolve') pending.resolve({ imagery: true }); else pending.reject(new Error('unmounted imagery')); });
    expect(viewers).toHaveLength(0);
    expect(listeners).toHaveLength(0);
  });

  it('removes listeners and destroys the viewer if renderer inspection fails after listener installation', async () => {
    api(() => unavailable);
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockImplementation(() => { throw new Error('context lost'); });
    const { unmount } = render(<EarthTwin release={release} source={source} records={records} instrument={instrument} located={located} assetsReady loadEngine={loadEngine} />);
    await waitFor(() => expect(screen.getByTestId('twin-status')).toHaveAttribute('data-state', 'UNAVAILABLE'));
    expect(viewers).toHaveLength(1);
    expect(viewers[0].destroy).toHaveBeenCalledOnce();
    expect(listeners).toHaveLength(0);
    act(() => { window.dispatchEvent(new HashChangeEvent('hashchange')); });
    expect(flyTo).not.toHaveBeenCalled();
    unmount();
    expect(viewers[0].destroy).toHaveBeenCalledOnce();
  });

  it.each(['releaseId', 'corpusId', 'releaseDigest', 'manifestCommitment', 'snapshotDigest', 'knownAt'] as const)('does not display an old answer when %s changes at the same record ID and world time', async (field) => {
    const pending = deferred<{ status: number; json: () => Promise<unknown> }>();
    const fetch = vi.fn()
      .mockResolvedValueOnce({ status: 200, json: async () => unavailable.json })
      .mockImplementationOnce(() => pending.promise);
    vi.stubGlobal('fetch', fetch);
    const { rerender } = render(<EarthTwin release={release} source={source} records={records} instrument={instrument} located={located} assetsReady={false} />);
    await waitFor(() => expect(screen.getByTestId('earth-projection')).toHaveAttribute('data-code', 'GEOMETRY_NOT_AVAILABLE'));
    const nextSource = { ...source };
    const nextRelease = { ...release };
    if (field === 'knownAt') nextRelease.knownAt = '2026-09-01T11:00:00.000Z';
    else if (field === 'releaseId') { nextSource.releaseId = 'REL-Y'; nextRelease.releaseId = 'REL-Y'; }
    else if (field === 'corpusId') { nextSource.corpusId = 'another-corpus'; nextRelease.corpusId = 'another-corpus'; }
    else nextSource[field] = field === 'snapshotDigest' ? `sha256:${'d'.repeat(64)}` : 'd'.repeat(64);
    rerender(<EarthTwin release={nextRelease} source={nextSource} records={records} instrument={instrument} located={located} assetsReady={false} />);
    expect(screen.getByTestId('earth-projection')).toHaveAttribute('data-outcome', 'ASKING');
    expect(screen.getByTestId('earth-projection')).not.toHaveAttribute('data-code');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    const request = JSON.parse(fetch.mock.calls[1][1].body);
    expect(request.source).toEqual(nextSource);
    expect(request.selection).toEqual({ recordIds: [records[0].recordId], validAt: records[0].validFrom, knownAt: nextRelease.knownAt });
    await act(async () => { pending.resolve({ status: 404, json: async () => ({ error: 'SELECTION_NOT_AVAILABLE' }) }); });
    expect(screen.getByTestId('earth-projection')).toHaveAttribute('data-code', 'SELECTION_NOT_AVAILABLE');
  });

  it('ignores a superseded projection response even if the transport finishes after abort', async () => {
    const oldBody = deferred<unknown>();
    const currentReply = deferred<{ status: number; json: () => Promise<unknown> }>();
    const fetch = vi.fn()
      .mockResolvedValueOnce({ status: 200, json: () => oldBody.promise })
      .mockImplementationOnce(() => currentReply.promise);
    vi.stubGlobal('fetch', fetch);
    const { rerender } = render(<EarthTwin release={release} source={source} records={records} instrument={instrument} located={located} assetsReady={false} />);
    await act(async () => {});
    rerender(<EarthTwin release={{ ...release, knownAt: '2026-09-01T11:00:00.000Z' }} source={{ ...source, snapshotDigest: `sha256:${'d'.repeat(64)}` }} records={records} instrument={instrument} located={located} assetsReady={false} />);
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => { oldBody.resolve({ status: 'READY' }); });
    expect(screen.getByTestId('earth-projection')).toHaveAttribute('data-outcome', 'ASKING');
    await act(async () => { currentReply.resolve({ status: 404, json: async () => ({ error: 'SOURCE_VERSION_MISMATCH' }) }); });
    expect(screen.getByTestId('earth-projection')).toHaveAttribute('data-code', 'SOURCE_VERSION_MISMATCH');
  });

  it('draws a record at every position its own subject declares, coloured by the declaring source, and flies there when the record is chosen', async () => {
    const fetch = api((body) => body.selection.recordIds[0] === 'REC-2'
      ? ready([declared('REC-2', 'REC-P1'), declared('REC-2', 'REC-P2', 'self_reported', { point: { datum: 'WGS84', longitude: -46.313, latitude: -23.9535, horizontalUncertaintyM: null }, source: { sourceId: 'caravan:source:meridian-yard-log', sourceName: null } })])
      : unavailable);
    const user = userEvent.setup();
    render(<EarthTwin release={release} source={source} records={records} instrument={instrument} located={none} assetsReady loadEngine={loadEngine} />);
    await waitFor(() => expect(screen.getByTestId('twin-status')).toHaveAttribute('data-state', 'READY'));
    const projection = screen.getByTestId('earth-projection');
    await waitFor(() => expect(projection).toHaveAttribute('data-outcome', 'UNAVAILABLE'));
    expect(entitiesAdd).not.toHaveBeenCalled();
    expect(screen.getByTestId('earth-placed')).toHaveAttribute('data-count', '0');

    await user.selectOptions(screen.getByLabelText('Record'), 'REC-2');
    await waitFor(() => expect(projection).toHaveAttribute('data-outcome', 'READY'));
    expect(projection).toHaveTextContent('2 declared positions');
    // The drawn positions are one list; what they imply about each other is another beside it.
    const positions = within(within(projection).getByRole('list', { name: 'Declared positions' })).getAllByRole('listitem');
    expect(positions.map((p) => `${p.getAttribute('data-position-record')}:${p.getAttribute('data-interest')}`)).toEqual(['REC-P1:disinterested', 'REC-P2:self_reported']);
    // Two accounts of one subject, one of which states no uncertainty: the question is not put, and no radius is assumed to put it.
    const reading = within(projection).getByTestId('position-separation');
    const subject = within(reading).getByText('caravan:LOT-1').closest('[data-separation-subject]');
    expect(subject).toHaveAttribute('data-separation-state', 'NOT_ASSESSABLE');
    expect(subject).toHaveTextContent('not assessable');
    expect(subject).toHaveTextContent('REC-P2 states no usable horizontal uncertainty');
    expect(subject).toHaveTextContent('No radius is assumed');
    expect(within(reading).getByTestId('separation-loss')).toHaveTextContent('Overlapping radii are not agreement');
    expect(reading).toHaveTextContent('WGS84_ELLIPSOIDAL_GEODESIC');
    expect(positions[0]).toHaveTextContent('Port custody system');
    expect(positions[0]).toHaveTextContent('±250 m · WGS84');
    expect(positions[1]).toHaveTextContent('caravan:source:meridian-yard-log');
    expect(positions[1]).toHaveTextContent('±? m');
    // Two entities, one per declaring source; the ring only where an uncertainty is stated; the colour is the interest's.
    await waitFor(() => expect(entitiesAdd).toHaveBeenCalledTimes(2));
    const drawn = entitiesAdd.mock.calls.map((call) => call[0]);
    expect(drawn.map((e) => e.id)).toEqual(['place:REC-P1', 'place:REC-P2']);
    expect(drawn[0].point.color).toMatchObject({ css: '#4ade80' });
    expect(drawn[0].ellipse).toMatchObject({ semiMajorAxis: 250, semiMinorAxis: 250 });
    expect(drawn[0].label.text).toBe('LOT-1 · 51.9497 N, 4.0250 E · disinterested\nREC-2 · Hidden');
    expect(drawn[1].point.color).toMatchObject({ css: '#fbbf24' });
    expect(drawn[1].ellipse).toBeUndefined();
    expect(entitiesRemoveAll).toHaveBeenCalled();
    expect(requestRender).toHaveBeenCalled();
    expect(screen.getByTestId('earth-placed')).toHaveAttribute('data-count', '1');
    // Choosing the record flew the camera to its first position at the placement height; nothing flew on first load.
    expect(flyTo).toHaveBeenCalledTimes(1);
    expect(flyTo.mock.calls[0][0].destination).toMatchObject({ x: 4.025, y: 51.9497, z: 1_000_000 });
    await user.click(within(positions[1]).getByRole('button', { name: 'Fly to it' }));
    expect(flyTo).toHaveBeenCalledTimes(2);
    expect(flyTo.mock.calls[1][0].destination).toMatchObject({ x: -46.313, y: -23.9535 });
    expect(fetch).toHaveBeenCalledTimes(2);

    // Back to a record without a position: its entities go, and nothing is kept for it.
    await user.selectOptions(screen.getByLabelText('Record'), 'REC-1');
    await waitFor(() => expect(projection).toHaveAttribute('data-outcome', 'UNAVAILABLE'));
    expect(screen.getByTestId('earth-placed')).toHaveAttribute('data-count', '1');
    expect(flyTo).toHaveBeenCalledTimes(2);
  });

  it('places every record of the release on request, each at its own validity start, and reports placed, unplaced and refused without inventing', async () => {
    const fetch = api((body) => {
      const id = body.selection.recordIds[0];
      if (id === 'REC-1' || id === 'REC-4') return ready([declared(id, 'REC-P1')]);
      if (id === 'REC-2') return unavailable;
      return { status: 404, json: { fixture_only: true, error: 'SELECTION_NOT_AVAILABLE' } };
    });
    const user = userEvent.setup();
    const more: EarthRecord[] = [...records, { recordId: 'REC-3', title: 'Withheld', subjectId: 'LOT-3', predicate: 'x', validFrom: '2026-08-12T00:00:00Z' }, { recordId: 'REC-4', title: 'Loading completed', subjectId: 'LOT-1', predicate: 'custody.loading_completed', validFrom: '2026-08-17T16:00:00Z' }];
    render(<EarthTwin release={release} source={source} records={more} instrument={instrument} located={none} assetsReady loadEngine={loadEngine} />);
    await waitFor(() => expect(screen.getByTestId('twin-status')).toHaveAttribute('data-state', 'READY'));
    await waitFor(() => expect(screen.getByTestId('earth-projection')).toHaveAttribute('data-outcome', 'READY'));
    expect(screen.queryByTestId('place-summary')).toBeNull();

    await user.click(screen.getByTestId('place-all'));
    const summary = await screen.findByTestId('place-summary');
    await waitFor(() => expect(screen.queryByText(/Asking the compiler… \d+ \/ \d+/)).toBeNull());
    expect(summary).toHaveAttribute('data-placed', '2');
    expect(summary).toHaveAttribute('data-unplaced', '1');
    expect(summary).toHaveAttribute('data-refused', '1');
    expect(summary).toHaveTextContent('2 placed at 2 positions');
    expect(summary).toHaveTextContent('REC-2');
    expect(summary).toHaveTextContent('REC-3 SELECTION_NOT_AVAILABLE');
    const placed = within(screen.getByRole('list', { name: 'Placed records' })).getAllByRole('listitem');
    expect(placed.map((item) => item.getAttribute('data-placed-record'))).toEqual(['REC-1', 'REC-4']);
    expect(screen.getByTestId('earth-placed')).toHaveAttribute('data-count', '2');
    // One request per record after the selected record's own, each at that record's validity start under the release's knowledge time.
    const asked = fetch.mock.calls.slice(1).map((call) => JSON.parse(String(call[1]?.body)) as ProjectionSpec).map((spec) => [spec.selection.recordIds[0], spec.selection.validAt, spec.selection.knownAt]);
    expect(asked).toEqual([['REC-1', '2026-08-03T10:00:00Z', release.knownAt], ['REC-2', '2026-08-10T00:00:00Z', release.knownAt], ['REC-3', '2026-08-12T00:00:00Z', release.knownAt], ['REC-4', '2026-08-17T16:00:00Z', release.knownAt]]);
    // Two records at one declared position share one point and one label: the position is what is drawn.
    const last = entitiesAdd.mock.calls.filter((call) => call[0].id === 'place:REC-P1').at(-1)![0];
    expect(entitiesAdd.mock.calls.slice(-1)[0][0].id).toBe('place:REC-P1');
    expect(last.label.text).toBe('LOT-1 · 51.9497 N, 4.0250 E · disinterested\n2 records · REC-1, REC-4');

    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.queryByTestId('place-summary')).toBeNull();
    expect(screen.getByTestId('earth-placed')).toHaveAttribute('data-count', '0');
    await waitFor(() => expect(entitiesRemoveAll.mock.calls.length).toBeGreaterThan(entitiesAdd.mock.calls.length - 1));
  });

  it('reads the placed geometry: two standing accounts a kilometre apart with ±250 m each cannot both be right, and a withdrawn one is set aside before the question is put', async () => {
    // One subject, three declarations: two that stand about a kilometre apart, and one withdrawn at this knowledge instant.
    const far = { point: { datum: 'WGS84', longitude: 4.025, latitude: 51.9587, horizontalUncertaintyM: 250 } };
    const fetch = api((body) => body.selection.recordIds[0] === 'REC-1'
      ? ready([declared('REC-1', 'REC-P1'), declared('REC-1', 'REC-P2', 'self_reported', far), declared('REC-1', 'REC-P3', 'unknown', { ...far, statusAtKnownAt: 'RETRACTED' })])
      : unavailable);
    const user = userEvent.setup();
    render(<EarthTwin release={release} source={source} records={records} instrument={instrument} located={located} assetsReady loadEngine={loadEngine} />);
    await waitFor(() => expect(screen.getByTestId('twin-status')).toHaveAttribute('data-state', 'READY'));
    await waitFor(() => expect(screen.getByTestId('earth-projection')).toHaveAttribute('data-outcome', 'READY'));

    const reading = within(screen.getByTestId('earth-projection')).getByTestId('position-separation');
    const subject = within(reading).getByText('caravan:LOT-1').closest('[data-separation-subject]')!;
    expect(subject).toHaveAttribute('data-separation-state', 'DISJOINT');
    expect(subject).toHaveTextContent('cannot both be right');
    // The distance is measured under the declared metric, not guessed from the numbers on screen.
    expect(subject).toHaveTextContent(/1001 m apart, against ±250 m and ±250 m — a combined 500 m/);
    expect(subject).toHaveTextContent('cannot contain one common point');
    // The withdrawn declaration took no part in the comparison and is named as excluded, not silently dropped.
    expect(within(subject as HTMLElement).getByRole('list', { name: 'Declarations compared' }).querySelectorAll('li')).toHaveLength(1);
    const aside = within(subject as HTMLElement).getByRole('list', { name: 'Declarations set aside' });
    expect(aside.querySelectorAll('[data-set-aside]')).toHaveLength(1);
    expect(aside).toHaveTextContent('REC-P3');
    expect(aside).toHaveTextContent('RETRACTED');
    expect(aside).toHaveTextContent('must not be relied on at all');

    // Across everything placed, the count is a finding of its own, and one declaration counts once however many records resolved it.
    await user.click(screen.getByTestId('place-all'));
    await waitFor(() => expect(screen.queryByText(/Asking the compiler… \d+ \/ \d+/)).toBeNull());
    const placedSeparations = await screen.findByTestId('placed-separations');
    expect(placedSeparations).toHaveAttribute('data-disagreeing', '1');
    expect(placedSeparations).toHaveTextContent('1 subject has more than one declared position.');
    expect(placedSeparations).toHaveTextContent('1 cannot all be right');
    expect(fetch).toHaveBeenCalled();
  });

  it('selects the record a drawn point was placed for when the point is clicked, and ignores clicks on nothing', async () => {
    api((body) => body.selection.recordIds[0] === 'REC-2' ? ready([declared('REC-2', 'REC-P1')]) : unavailable);
    const user = userEvent.setup();
    render(<EarthTwin release={release} source={source} records={records} instrument={instrument} located={none} assetsReady loadEngine={loadEngine} />);
    await waitFor(() => expect(screen.getByTestId('twin-status')).toHaveAttribute('data-state', 'READY'));
    expect(clicks).toHaveLength(1);
    const projection = screen.getByTestId('earth-projection');
    // Draw the second record's point, then go back to the first: the point stays, and it stands for the second record.
    await user.selectOptions(screen.getByLabelText('Record'), 'REC-2');
    await waitFor(() => expect(projection).toHaveAttribute('data-outcome', 'READY'));
    await waitFor(() => expect(entitiesAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 'place:REC-P1' })));
    await user.selectOptions(screen.getByLabelText('Record'), 'REC-1');
    await waitFor(() => expect(projection).toHaveAttribute('data-outcome', 'UNAVAILABLE'));
    expect(flyTo).toHaveBeenCalledTimes(1);
    pick.mockReturnValueOnce(undefined);
    act(() => { clicks[0]({ position: { x: 1, y: 1 } }); });
    expect(screen.getByLabelText('Record')).toHaveValue('REC-1');
    pick.mockReturnValueOnce({ id: { id: 'place:nothing-drawn' } });
    act(() => { clicks[0]({ position: { x: 1, y: 1 } }); });
    expect(screen.getByLabelText('Record')).toHaveValue('REC-1');
    pick.mockReturnValueOnce({ id: { id: 'place:REC-P1' } });
    act(() => { clicks[0]({ position: { x: 1, y: 1 } }); });
    expect(screen.getByLabelText('Record')).toHaveValue('REC-2');
    await waitFor(() => expect(projection).toHaveAttribute('data-outcome', 'READY'));
    // A click on the globe does not move the camera: the viewer already looks at what was clicked.
    expect(flyTo).toHaveBeenCalledTimes(1);
  });

  it('opens the record a link named, and refuses rather than defaulting when the release does not offer it', async () => {
    api(() => unavailable);
    // A link naming an offered record opens it.
    window.history.replaceState(null, '', '/earth#v=4.0250,51.9497,1000000,0.0,-90.0&r=REC-2');
    const { unmount } = render(<EarthTwin release={release} source={source} records={records} instrument={instrument} located={located} assetsReady loadEngine={loadEngine} />);
    await waitFor(() => expect(screen.getByTestId('twin-status')).toHaveAttribute('data-state', 'READY'));
    expect((screen.getByLabelText('Record') as HTMLSelectElement).value).toBe('REC-2');
    expect(screen.queryByTestId('link-selection-refused')).toBeNull();
    unmount();

    // A link naming a record this release does not offer selects nothing and
    // says so. Silently showing the default would look like success.
    window.history.replaceState(null, '', '/earth#v=4.0250,51.9497,1000000,0.0,-90.0&r=REC-NOT-HERE');
    render(<EarthTwin release={release} source={source} records={records} instrument={instrument} located={located} assetsReady loadEngine={loadEngine} />);
    await waitFor(() => expect(screen.getByTestId('twin-status')).toHaveAttribute('data-state', 'READY'));
    const refused = screen.getByTestId('link-selection-refused');
    expect(refused).toHaveAttribute('data-named', 'REC-NOT-HERE');
    expect(refused.textContent).toMatch(/a default would look like success/);
  });
});

describe('what the twin opens on', () => {
  /**
   * The twin's whole question is where a record's subject was. Opening on one
   * the release cannot place showed an empty globe under a red refusal — true
   * about that record, and a poor first question to have asked for the reader.
   */
  it('opens on a record whose subject the release positions, not merely the first', () => {
    const mixed: EarthRecord[] = [
      { recordId: 'REC-NOPOS', title: 'Moisture', subjectId: 'SAMPLE-1', predicate: 'condition.moisture', validFrom: '2026-08-01T00:00:00Z', positionDeclared: false },
      { recordId: 'REC-POS', title: 'Gross quantity', subjectId: 'LOT-1', predicate: 'quantity.gross', validFrom: '2026-08-03T10:00:00Z', positionDeclared: true },
    ];
    render(<EarthTwin release={release} source={source} records={mixed} instrument={instrument} located={located} assetsReady loadEngine={loadEngine} />);
    expect(screen.getByLabelText('Record')).toHaveValue('REC-POS');
  });

  /** When the release positions nothing, the refusal is the honest landing state. */
  it('falls back to the first record when no subject is positioned', () => {
    const none: EarthRecord[] = [
      { recordId: 'REC-A', title: 'Moisture', subjectId: 'SAMPLE-1', predicate: 'condition.moisture', validFrom: '2026-08-01T00:00:00Z', positionDeclared: false },
      { recordId: 'REC-B', title: 'Other', subjectId: 'SAMPLE-2', predicate: 'x', validFrom: '2026-08-02T00:00:00Z', positionDeclared: false },
    ];
    render(<EarthTwin release={release} source={source} records={none} instrument={instrument} located={located} assetsReady loadEngine={loadEngine} />);
    expect(screen.getByLabelText('Record')).toHaveValue('REC-A');
  });

  it('still honours a link that names a record, positioned or not', () => {
    // A link is a view and, optionally, a record; a bare `r=` is not a link at all.
    window.location.hash = '#v=0.0000,0.0000,12000000,0.0,-90.0&r=REC-NOPOS';
    const mixed: EarthRecord[] = [
      { recordId: 'REC-NOPOS', title: 'Moisture', subjectId: 'SAMPLE-1', predicate: 'condition.moisture', validFrom: '2026-08-01T00:00:00Z', positionDeclared: false },
      { recordId: 'REC-POS', title: 'Gross quantity', subjectId: 'LOT-1', predicate: 'quantity.gross', validFrom: '2026-08-03T10:00:00Z', positionDeclared: true },
    ];
    render(<EarthTwin release={release} source={source} records={mixed} instrument={instrument} located={located} assetsReady loadEngine={loadEngine} />);
    expect(screen.getByLabelText('Record')).toHaveValue('REC-NOPOS');
    window.location.hash = '';
  });
});

describe('the inspector folds what a reader arrives past', () => {
  /**
   * The layer list and the twenty-one-source registry were most of the column's
   * height. Folded, the counts stay in the summaries, so shutting them hides
   * the lists and not the facts.
   */
  it('starts with the layers and the signal registry closed, and keeps their counts visible', () => {
    render(<EarthTwin release={release} source={source} records={records} instrument={instrument} located={located} assetsReady loadEngine={loadEngine} />);
    const layers = screen.getByTestId('earth-layers');
    const signals = screen.getByTestId('earth-signals');
    expect(layers.tagName).toBe('DETAILS');
    expect(signals.tagName).toBe('DETAILS');
    expect((layers as HTMLDetailsElement).open).toBe(false);
    expect((signals as HTMLDetailsElement).open).toBe(false);
    expect(signals).toHaveTextContent('21 named, 0 integrated');
  });

  it('leaves the corpus panel open, because it is what the page is for', () => {
    render(<EarthTwin release={release} source={source} records={records} instrument={instrument} located={located} assetsReady loadEngine={loadEngine} />);
    expect(screen.getByTestId('earth-projection')).toBeVisible();
  });
});

describe('the operator instrument', () => {
  /**
   * Rule two, at the surface. The component reports what the reading declares
   * and adds nothing: a layer that starts interpolating appears in the
   * conveniences without anyone editing this component.
   */
  it('renders every layer with its reading, and shows an unreadable one as UNKNOWN rather than as zero', () => {
    render(<EarthTwin release={release} source={source} records={records} instrument={instrument} located={located} assetsReady loadEngine={loadEngine} />);
    const rows = within(screen.getByTestId('operator-layers')).getAllByRole('listitem');
    expect(rows.map((row) => `${row.getAttribute('data-operator-layer')}:${row.getAttribute('data-reading')}`)).toEqual(['positioned:1', 'void:1', 'admission-queue:UNKNOWN']);
    expect(rows.every((row) => row.getAttribute('data-convenience') === 'NONE')).toBe(true);
    expect(screen.getByTestId('operator-conveniences')).toHaveTextContent('nothing was interpolated, smoothed, aggregated or carried forward');
  });

  it('names a convenience the reading declares, so the label is a filter and not decoration', () => {
    const smoothed: InstrumentReading = { ...instrument, layers: [...instrument.layers, { id: 'ghost', label: 'Dead-reckoned track', shows: 'A carried-forward position.', reading: 4, convenience: 'DEAD_RECKONED', because: 'Carried forward from the last fix.' }] };
    render(<EarthTwin release={release} source={source} records={records} instrument={smoothed} located={located} assetsReady loadEngine={loadEngine} />);
    const taken = screen.getByTestId('operator-conveniences');
    expect(taken).toHaveAttribute('data-taken', '1');
    expect(taken).toHaveTextContent('dead reckoned');
    expect(taken).toHaveTextContent('It is a guess with a method, and it is not an observation.');
  });

  it('carries the headline reading in the summary, so shutting the section hides the lists and not the facts', () => {
    render(<EarthTwin release={release} source={source} records={records} instrument={instrument} located={located} assetsReady loadEngine={loadEngine} />);
    const panel = screen.getByTestId('earth-operator');
    expect(panel.tagName).toBe('DETAILS');
    expect((panel as HTMLDetailsElement).open).toBe(false);
    expect(panel).toHaveTextContent('1 flyable, 1 void');
    expect(panel).toHaveAttribute('data-testid', 'earth-operator');
  });

  /** Rule one at the surface: the void row navigates. Selecting is not admitting. */
  it('lists the subjects it cannot fly to and lets the operator select their records instead', async () => {
    const user = userEvent.setup();
    api(() => unavailable);
    render(<EarthTwin release={release} source={source} records={records} instrument={instrument} located={located} assetsReady loadEngine={loadEngine} />);
    const voids = screen.getByTestId('operator-voids');
    expect(voids).toHaveAttribute('data-count', '1');
    expect(voids).toHaveTextContent('LOT-2');
    expect(voids).toHaveTextContent('no position');
    await user.click(within(voids).getByRole('button', { name: 'Select REC-2' }));
    expect(screen.getByLabelText('Record')).toHaveValue('REC-2');
  });

  it('states the two rules it is held to, and that it writes nothing', () => {
    render(<EarthTwin release={release} source={source} records={records} instrument={instrument} located={located} assetsReady loadEngine={loadEngine} />);
    const rules = screen.getByTestId('operator-rules');
    expect(rules).toHaveAttribute('data-writes', 'NONE');
    expect(within(rules).getAllByRole('listitem')).toHaveLength(2);
    expect(rules).toHaveTextContent('It never writes.');
    expect(rules).toHaveTextContent('It labels its own conveniences.');
  });

  /**
   * The whole panel is a value the component received. Nothing in it is a
   * control over canonical state, so the section offers no button that is not
   * a selection.
   */
  it('offers no control but selection: every button in the panel changes what is looked at', () => {
    render(<EarthTwin release={release} source={source} records={records} instrument={instrument} located={located} assetsReady loadEngine={loadEngine} />);
    const buttons = within(screen.getByTestId('earth-operator')).getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual(['Select REC-2']);
  });
});

describe('located events on the globe', () => {
  const ready = async () => waitFor(() => expect(screen.getByTestId('twin-status')).toHaveAttribute('data-state', 'READY'));
  const drawnEvents = () => {
    const byId = new Map<string, { id: string; point: { pixelSize: number }; ellipse?: { semiMajorAxis: number } }>();
    for (const [entity] of entitiesAdd.mock.calls as Array<[{ id: string; point: { pixelSize: number }; ellipse?: { semiMajorAxis: number } }]>) if (String(entity.id).startsWith('event:')) byId.set(entity.id, entity);
    return byId;
  };

  it('draws only the items with a radius, draws the conflict loud, and counts the drawn ones in the strip', async () => {
    api(() => unavailable);
    render(<EarthTwin release={release} source={source} records={records} instrument={instrument} located={located} assetsReady loadEngine={loadEngine} />);
    await ready();
    const events = drawnEvents();
    expect([...events.keys()].sort()).toEqual(['event:RET-X', 'event:SPEC-T-1']);
    expect(events.get('event:SPEC-T-1')?.point.pixelSize).toBe(12);
    expect(events.get('event:SPEC-T-1')?.ellipse?.semiMajorAxis).toBe(5000);
    expect(events.get('event:RET-X')?.point.pixelSize).toBe(8);
    expect(screen.getByTestId('earth-events')).toHaveAttribute('data-count', '2');
    expect(screen.getByTestId('earth-events-panel')).toHaveTextContent('2 placed, 1 listed');
  });

  /** READY is the status pill; the markers are an effect behind it. A click before the effect flushes finds nothing, so the precondition is stated. */
  const drawn = async () => { await ready(); await waitFor(() => expect(drawnEvents().size).toBe(2)); };

  it('labels only the selected item at its coordinates, because five items share the berth and stacked labels read as none', async () => {
    const user = userEvent.setup();
    api(() => unavailable);
    render(<EarthTwin release={release} source={source} records={records} instrument={instrument} located={located} assetsReady loadEngine={loadEngine} />);
    await drawn();
    const labelled = () => [...drawnEvents().values()].filter((entity) => 'label' in entity).map((entity) => entity.id);
    expect(labelled()).toEqual([]);
    entitiesAdd.mockClear();
    await user.click(screen.getByRole('button', { name: 'SPEC-T-1' }));
    await waitFor(() => expect(labelled()).toEqual(['event:SPEC-T-1']));
  });

  it('opens the card when a marker on the globe is clicked, and does not fly', async () => {
    api(() => unavailable);
    render(<EarthTwin release={release} source={source} records={records} instrument={instrument} located={located} assetsReady loadEngine={loadEngine} />);
    await drawn();
    flyTo.mockClear();
    pick.mockReturnValue({ id: { id: 'event:SPEC-T-1' } });
    act(() => { clicks[0]({ position: {} }); });
    const card = screen.getByTestId('event-card');
    expect(card).toHaveAttribute('data-event', 'SPEC-T-1');
    expect(card).toHaveAttribute('data-state', 'CONFLICTING');
    expect(card).toHaveAttribute('data-epistemic', 'DECLARED');
    expect(screen.getByTestId('event-reading-now')).toHaveAttribute('data-state', 'CONFLICTING');
    expect(screen.getByTestId('event-reading-capture')).toHaveAttribute('data-state', 'CORROBORATED');
    expect(screen.getByTestId('event-clocks-differ')).toHaveTextContent('The two clocks disagree');
    expect(card).toHaveTextContent('falls outside REC-2’s stated bounds');
    expect(flyTo).not.toHaveBeenCalled();
  });

  it('selects from the list and flies to a placed item, and to nowhere for one with no radius', async () => {
    const user = userEvent.setup();
    api(() => unavailable);
    render(<EarthTwin release={release} source={source} records={records} instrument={instrument} located={located} assetsReady loadEngine={loadEngine} />);
    await ready();
    flyTo.mockClear();
    await user.click(screen.getByRole('button', { name: 'SPEC-T-1' }));
    expect(flyTo).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('event-card')).toHaveAttribute('data-event', 'SPEC-T-1');
    await user.click(screen.getByRole('button', { name: 'SPEC-T-2' }));
    expect(flyTo).toHaveBeenCalledTimes(1);
    const card = screen.getByTestId('event-card');
    expect(card).toHaveAttribute('data-event', 'SPEC-T-2');
    expect(card).toHaveAttribute('data-state', 'NOT_IN_COVERAGE');
    expect(screen.getByTestId('event-geocode')).toHaveAttribute('data-epistemic', 'UNKNOWN');
    expect(screen.getByTestId('event-geocode')).toHaveTextContent('radius not stated · not drawn');
    expect(screen.getByTestId('event-asserts')).toHaveTextContent('names no predicate this corpus holds');
    expect(screen.queryByRole('button', { name: 'Fly to it' })).toBeNull();
  });

  it('lets a card select the record it was checked against, or the records a retraction touched: navigation, not admission', async () => {
    const user = userEvent.setup();
    api(() => unavailable);
    render(<EarthTwin release={release} source={source} records={records} instrument={instrument} located={located} assetsReady loadEngine={loadEngine} />);
    await ready();
    await user.click(screen.getByRole('button', { name: 'SPEC-T-1' }));
    // Scoped to the card: the operator instrument's void list offers the same record.
    await user.click(within(screen.getByTestId('event-card')).getByRole('button', { name: 'Select REC-2' }));
    expect(screen.getByLabelText('Record')).toHaveValue('REC-2');
    await user.click(screen.getByRole('button', { name: 'RET-X' }));
    const card = screen.getByTestId('event-card');
    expect(card).toHaveAttribute('data-state', 'CORRECTION');
    expect(card).toHaveAttribute('data-epistemic', 'WITHDRAWN');
    await user.click(within(card).getByRole('button', { name: 'Select REC-1' }));
    expect(screen.getByLabelText('Record')).toHaveValue('REC-1');
  });

  /** Rule one at this surface: every control in the section selects or flies. */
  it('offers no control but selection and flight', async () => {
    const user = userEvent.setup();
    api(() => unavailable);
    render(<EarthTwin release={release} source={source} records={records} instrument={instrument} located={located} assetsReady loadEngine={loadEngine} />);
    await ready();
    await user.click(screen.getByRole('button', { name: 'SPEC-T-1' }));
    const labels = within(screen.getByTestId('earth-events-panel')).getAllByRole('button').map((button) => button.textContent ?? '');
    expect(labels.length).toBeGreaterThanOrEqual(5);
    expect(labels.every((label) => /^(RET-X|SPEC-T-\d|Fly to it|Select REC-\d)$/.test(label))).toBe(true);
  });
});
