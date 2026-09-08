import { describe, expect, it } from 'vitest';
import { parseProjectionSpec } from '@/projection/spec';
import { CARAVAN_CORPUS } from '@/fixtures/caravan/release';
import { describeProjectionSource } from '@/projection/source';
import { ADOPTED, EARTH_ENGINE, EARTH_TWIN_ORIGIN, GEV_SIGNAL_SOURCES, GLOBAL_VIEW, LAYER_STATE_MEANING, NOT_ADOPTED, TERMS_CLASS_LABEL, TWIN_LAYERS, TWIN_NONCLAIMS, formatView, globeSpec, integrationBlockers, parseView, projectionOutcome } from './earth';

describe('the Earth Twin as data', () => {
  it('pins exactly what it is built from and names what it adopted and refused', () => {
    expect(EARTH_TWIN_ORIGIN.commit).toMatch(/^[a-f0-9]{40}$/);
    expect(EARTH_TWIN_ORIGIN.dataSourcesBlob).toMatch(/^[a-f0-9]{40}$/);
    expect(EARTH_TWIN_ORIGIN.codeLicense).toMatch(/MIT/);
    expect(EARTH_ENGINE).toMatchObject({ name: 'CesiumJS', version: '1.124.0', license: 'Apache-2.0', assetsPath: '/cesium/' });
    expect(ADOPTED.length).toBeGreaterThanOrEqual(3);
    expect(NOT_ADOPTED.join(' ')).toMatch(/without any key/);
    expect(NOT_ADOPTED.join(' ')).toMatch(/no source is acquired here/);
  });

  it('gives every layer a source, terms, what it draws and a state from the closed vocabulary; only bundled, computed and declared-corpus layers draw anything', () => {
    expect(TWIN_LAYERS.map((l) => l.id)).toEqual(['surface', 'sun', 'corpus', 'signals', 'notations']);
    for (const layer of TWIN_LAYERS) {
      expect(layer.source).toMatch(/\S/);
      expect(layer.terms).toMatch(/\S/);
      expect(layer.draws).toMatch(/\S/);
      expect(Object.keys(LAYER_STATE_MEANING)).toContain(layer.state);
    }
    expect(TWIN_LAYERS.filter((l) => !l.draws.startsWith('Nothing')).map((l) => l.id)).toEqual(['surface', 'sun', 'corpus']);
    expect(TWIN_LAYERS.find((l) => l.id === 'corpus')?.draws).toMatch(/declares/);
  });

  it('carries the twenty-one live sources of the pinned DATA_SOURCES.md as a registry, none integrated, each with terms and blockers', () => {
    expect(GEV_SIGNAL_SOURCES).toHaveLength(21);
    expect(new Set(GEV_SIGNAL_SOURCES.map((s) => s.id)).size).toBe(21);
    for (const source of GEV_SIGNAL_SOURCES) {
      expect(source.integrationState).toBe('NOT_INTEGRATED');
      expect(source.terms).toMatch(/\S/);
      expect(source.attribution).toMatch(/\S/);
      expect(Object.keys(TERMS_CLASS_LABEL)).toContain(source.termsClass);
      const blockers = integrationBlockers(source);
      expect(blockers.length).toBeGreaterThanOrEqual(3);
      expect(blockers[0]).toMatch(/No source registration/);
    }
    expect(integrationBlockers(GEV_SIGNAL_SOURCES.find((s) => s.id === 'opensky')!)).toHaveLength(4);
    expect(integrationBlockers(GEV_SIGNAL_SOURCES.find((s) => s.id === 'google-map-tiles')!).at(-1)).toMatch(/metered/);
    expect(integrationBlockers(GEV_SIGNAL_SOURCES.find((s) => s.id === 'usgs-earthquakes')!)).toHaveLength(3);
  });

  it('serializes a view into a bounded link and rejects anything that is not exactly a bounded view', () => {
    const view = { longitude: -97.7431, latitude: 30.2672, height: 1_200_000, heading: 12.5, pitch: -45 };
    const hash = formatView(view);
    expect(hash).toBe('v=-97.7431,30.2672,1200000,12.5,-45.0');
    expect(parseView(`#${hash}`)).toEqual(view);
    expect(parseView(formatView(GLOBAL_VIEW))).toEqual(GLOBAL_VIEW);
    expect(formatView({ ...GLOBAL_VIEW, heading: 359.99 })).toBe('v=0.0000,0.0000,12000000,0.0,-90.0');
    expect(formatView({ ...GLOBAL_VIEW, heading: -0.01 })).toBe('v=0.0000,0.0000,12000000,0.0,-90.0');
    expect(parseView(formatView({ ...GLOBAL_VIEW, heading: 359.99 }))).not.toBeNull();
    for (const bad of ['', '#', 'v=', 'v=1,2,3', 'v=181,0,1000000,0,-90', 'v=0,91,1000000,0,-90', 'v=0,0,999,0,-90', 'v=0,0,1000000,360,-90', 'v=0,0,1000000,0,1', 'v=0,0,1000000,0,-90,extra', 'v=NaN,0,1000000,0,-90', `v=0,0,1000000,0,-90${'0'.repeat(100)}`, 'v=0,0,1e6,0,-90']) expect(parseView(bad), bad).toBeNull();
  });

  it('asks the projection compiler for one record on the globe under the release’s own commitments, and reads its answer without inventing geometry', () => {
    const descriptor = describeProjectionSource(CARAVAN_CORPUS.releases[0].releaseId);
    const spec = globeSpec(descriptor.source, 'REC-0101', { knownAt: descriptor.knownAt, validAt: '2026-08-03T10:00:00Z' });
    expect(parseProjectionSpec(spec).view).toEqual({ mode: 'GLOBE', coordinateSemantics: 'GEODETIC', representation: 'GLOBAL_3D' });
    expect(projectionOutcome(200, { status: 'UNAVAILABLE', error: 'GEOMETRY_NOT_AVAILABLE' })).toMatchObject({ state: 'UNAVAILABLE', code: 'GEOMETRY_NOT_AVAILABLE' });
    expect(projectionOutcome(200, { status: 'READY', error: null }).state).toBe('READY');
    expect(projectionOutcome(404, { error: 'SELECTION_NOT_AVAILABLE' })).toMatchObject({ state: 'REFUSED', code: 'SELECTION_NOT_AVAILABLE' });
    expect(projectionOutcome(503, {})).toMatchObject({ state: 'REFUSED', code: 'PROJECTION_UNAVAILABLE' });
    expect(TWIN_NONCLAIMS.join(' ')).toMatch(/No position is invented/);
  });
});

/* ── What the declared positions imply ── */

import { PLACEMENT_FRAME, PLACEMENT_VIEW, placementHeightM, placementViewFor, SELECTION_MEANING, SEPARATION_LOSS, SEPARATION_METHOD, SEPARATION_METRIC, formatLink, formatMetres, geodesicSeparationM, parseLink, positionSeparations, selectionFromLink, soleDeclaration } from './earth';
import type { GeodeticPosition } from './earth';

const LAT = 51.5, LON = -0.12;
/** ~400 m north at this latitude, and ~12 m north. */
const FAR = 0.0036, NEAR = 0.000108;

function at(positionRecordId: string, latitude: number, horizontalUncertaintyM: number | null, over: Partial<GeodeticPosition> = {}): GeodeticPosition {
  return {
    recordId: `rec-of-${positionRecordId}`,
    positionRecordId,
    canonicalId: `urn:record:${positionRecordId}`,
    subject: { subjectId: 'subject-a', canonicalId: 'urn:facility:one', subjectType: 'facility' },
    shape: { kind: 'POINT', datum: 'WGS84', longitude: LON, latitude, ...(horizontalUncertaintyM === null ? {} : { horizontalUncertaintyM }) },
    point: { datum: 'WGS84', longitude: LON, latitude, horizontalUncertaintyM },
    value: 'at the terminal',
    basis: 'stated in the filing',
    validity: { validFrom: '2026-01-01T00:00:00Z', validTo: null },
    knownAt: '2026-01-02T00:00:00Z',
    evidenceClass: { claimStrength: 'reported', productionClass: 'measured', interest: 'disinterested' },
    source: { sourceId: 'src-one', sourceName: 'Registry One' },
    statusAtKnownAt: 'CURRENT',
    ...over,
  };
}

describe('separation between declared positions', () => {
  it('measures the WGS84 geodesic to the metre and names the metric it used', () => {
    const meridian = geodesicSeparationM({ longitude: 0, latitude: 0 }, { longitude: 0, latitude: 1 });
    const equator = geodesicSeparationM({ longitude: 0, latitude: 0 }, { longitude: 1, latitude: 0 });
    expect(meridian.state).toBe('MEASURED');
    expect(equator.state).toBe('MEASURED');
    if (meridian.state !== 'MEASURED' || equator.state !== 'MEASURED') return;
    // One degree of latitude and one of longitude at the equator on WGS84.
    expect(meridian.metres).toBeCloseTo(110574.389, 0);
    expect(equator.metres).toBeCloseTo(111319.491, 0);
    expect(SEPARATION_METRIC).toBe('WGS84_ELLIPSOIDAL_GEODESIC');
    expect(SEPARATION_METHOD).toMatch(/\.v1$/);
  });

  it('returns zero for coincident points and refuses where the solution does not converge, rather than returning the last iterate', () => {
    expect(geodesicSeparationM({ longitude: LON, latitude: LAT }, { longitude: LON, latitude: LAT })).toEqual({ state: 'MEASURED', metres: 0 });
    const antipodal = geodesicSeparationM({ longitude: 0, latitude: 0 }, { longitude: 179.7, latitude: 0.5 });
    expect(antipodal.state).toBe('NOT_ASSESSABLE');
    if (antipodal.state === 'NOT_ASSESSABLE') expect(antipodal.because).toMatch(/antipodal/);
    const broken = geodesicSeparationM({ longitude: Number.NaN, latitude: 0 }, { longitude: 0, latitude: 0 });
    expect(broken.state).toBe('NOT_ASSESSABLE');
  });

  it('calls two accounts disjoint only when the radii they state cannot contain one common point', () => {
    const [group] = positionSeparations([at('p-a', LAT, 5), at('p-b', LAT + FAR, 5)]);
    expect(group.state).toBe('DISJOINT');
    expect(group.canonicalId).toBe('urn:facility:one');
    expect(group.pairs).toHaveLength(1);
    expect(group.pairs[0].combinedRadiusM).toBe(10);
    expect(group.pairs[0].separation.state === 'MEASURED' && group.pairs[0].separation.metres).toBeGreaterThan(380);
    expect(group.pairs[0].because).toMatch(/cannot contain one common point/);
    expect(group.because).toMatch(/has not been settled/);
  });

  it('calls overlapping radii overlapping, and says in the loss that this is not agreement and not identity', () => {
    const [group] = positionSeparations([at('p-a', LAT, 30), at('p-b', LAT + NEAR, 30)]);
    expect(group.state).toBe('OVERLAPPING');
    expect(group.pairs[0].because).toMatch(/can contain one common point/);
    // Both declarations are from one source, so the finding says what that is.
    expect(group.because).toMatch(/one account restated, not accounts agreeing/);
    const loss = SEPARATION_LOSS.join(' ');
    expect(loss).toMatch(/Overlapping radii are not agreement/);
    expect(loss).toMatch(/never on its own a reason to treat two subjects as one/);
    expect(loss).toMatch(/no probability is computed/);
  });

  it('assumes no radius for a declaration that states none, and leaves the whole set untested rather than consistent', () => {
    const [group] = positionSeparations([at('p-a', LAT, null), at('p-b', LAT + NEAR, 30)]);
    expect(group.state).toBe('NOT_ASSESSABLE');
    expect(group.pairs[0].combinedRadiusM).toBeNull();
    expect(group.pairs[0].because).toMatch(/p-a states no usable horizontal uncertainty/);
    expect(group.pairs[0].because).toMatch(/No radius is assumed/);
    // A negative radius is not a radius either.
    const [nonsense] = positionSeparations([at('p-a', LAT, -5), at('p-b', LAT + NEAR, 30)]);
    expect(nonsense.state).toBe('NOT_ASSESSABLE');
  });

  it('sets aside a withdrawn or superseded declaration before comparing anything, and names why', () => {
    const groups = positionSeparations([
      at('p-a', LAT, 5),
      at('p-b', LAT + FAR, 5, { statusAtKnownAt: 'RETRACTED' }),
      at('p-c', LAT + FAR, 5, { statusAtKnownAt: 'SUPERSEDED' }),
    ]);
    expect(groups).toHaveLength(1);
    const [group] = groups;
    expect(group.compared.map((p) => p.positionRecordId)).toEqual(['p-a']);
    expect(group.setAside.map((s) => s.position.positionRecordId)).toEqual(['p-b', 'p-c']);
    expect(group.setAside[0].because).toMatch(/must not be relied on at all/);
    expect(group.setAside[1].because).toMatch(/already resolved and is not a contradiction/);
    // Without the set-aside the two would read as a contradiction; with it, there is nothing to contradict.
    expect(group.pairs).toHaveLength(0);
    expect(group.state).toBe('NOT_ASSESSABLE');
    expect(group.because).toMatch(/nothing standing for it to contradict/);
  });

  it('counts one declaration once however many records resolved it, groups by the resolved identity, and skips a subject with a single declaration', () => {
    const twice = [at('p-a', LAT, 5), at('p-a', LAT, 5, { recordId: 'rec-second' }), at('p-b', LAT + FAR, 5)];
    const [group] = positionSeparations(twice);
    expect(group.compared).toHaveLength(2);
    expect(group.pairs).toHaveLength(1);
    expect(group.subjectIds).toEqual(['subject-a']);
    expect(positionSeparations([at('p-a', LAT, 5)])).toEqual([]);
    const other = at('p-z', LAT + FAR, 5, { subject: { subjectId: 'subject-b', canonicalId: 'urn:facility:two', subjectType: 'facility' } });
    expect(positionSeparations([at('p-a', LAT, 5), other])).toEqual([]);
  });

  it('lets one disjoint pair decide the subject even when another pair could not be tested', () => {
    const [group] = positionSeparations([at('p-a', LAT, 5), at('p-b', LAT + FAR, 5), at('p-c', LAT + NEAR, null)]);
    expect(group.pairs.map((p) => p.state).sort()).toEqual(['DISJOINT', 'NOT_ASSESSABLE', 'NOT_ASSESSABLE']);
    expect(group.state).toBe('DISJOINT');
  });

  it('counts sources apart from declarations, so one source restating itself never reads as agreement', () => {
    // Three overlapping declarations, all from one source. Counting
    // declarations would call that a threefold agreement; counting sources
    // says what it is.
    const [one] = positionSeparations([
      at('p-a', LAT, 30), at('p-b', LAT + NEAR, 30), at('p-c', LAT - NEAR, 30),
    ]);
    expect(one.state).toBe('OVERLAPPING');
    expect(one.sourceIds).toEqual(['src-one']);
    expect(one.because).toMatch(/3 standing declarations from 1 source/);
    expect(one.because).toMatch(/one account restated, not accounts agreeing/);
    expect(one.because).toMatch(/Nothing corroborates anything here/);

    const other = { sourceId: 'src-two', sourceName: 'Registry Two' };
    const [two] = positionSeparations([at('p-a', LAT, 30), at('p-b', LAT + NEAR, 30, { source: other })]);
    expect(two.sourceIds).toEqual(['src-one', 'src-two']);
    expect(two.because).toMatch(/2 standing declarations from 2 sources/);
    // Even two sources agreeing is not corroboration, and the finding says so.
    expect(two.because).toMatch(/it is not corroboration/);
  });

  it('names a source that contradicts itself, and says nothing here can tell corroboration from syndication', () => {
    const [group] = positionSeparations([at('p-a', LAT, 5), at('p-b', LAT + FAR, 5)]);
    expect(group.state).toBe('DISJOINT');
    expect(group.because).toMatch(/Both are the same source, which has contradicted itself/);

    const other = { sourceId: 'src-two', sourceName: 'Registry Two' };
    const [across] = positionSeparations([at('p-a', LAT, 5), at('p-b', LAT + FAR, 5, { source: other })]);
    expect(across.because).not.toMatch(/contradicted itself/);

    // The limit is stated rather than worked around: two source ids are not
    // two observations, and a position record carries no lineage to tell.
    const loss = SEPARATION_LOSS.join(' ');
    expect(loss).toMatch(/Distinct sources are not independent sources/);
    expect(loss).toMatch(/declare twice and observe once/);
    expect(loss).toMatch(/nothing here can tell corroboration from syndication/);
    expect(loss).toMatch(/Agreement between sources is never counted as evidence/);
  });

  it('says why there is no reading, so silence is never mistaken for having looked', () => {
    // One declaration is not compared. Rendering nothing there is
    // indistinguishable from not having asked, so the absence carries its
    // reason — and the reason is a finding of its own.
    const alone = soleDeclaration([at('p-a', LAT, 30)]);
    expect(alone).toMatch(/1 declaration from 1 source/);
    expect(alone).toMatch(/nothing to compare/);
    expect(alone).toMatch(/not corroborated by standing alone/);

    // Two declarations of one identity are compared, so the reading speaks
    // and this line stays silent rather than doubling it.
    expect(soleDeclaration([at('p-a', LAT, 30), at('p-b', LAT + NEAR, 30)])).toBeNull();
    // Nothing declared at all is not this case either.
    expect(soleDeclaration([])).toBeNull();

    // Two identities with one declaration each: still nothing to compare,
    // and the count says so rather than implying a comparison happened.
    const other = at('p-z', LAT, 30, { subject: { subjectId: 'subject-b', canonicalId: 'urn:facility:two', subjectType: 'facility' } });
    const two = soleDeclaration([at('p-a', LAT, 30), other]);
    expect(two).toMatch(/2 declarations from 1 source, across 2 resolved identities/);
    expect(two).toMatch(/no identity here carries two/);
  });

  it('writes metres at the precision the measurement carries', () => {
    expect(formatMetres(0)).toBe('0.00 m');
    expect(formatMetres(4.567)).toBe('4.57 m');
    expect(formatMetres(400.3)).toBe('400 m');
    expect(formatMetres(12345)).toBe('12.3 km');
  });
});

describe('a selection is a link, and one that cannot be honoured is refused', () => {
  const VIEW = { longitude: 4.025, latitude: 51.9497, height: 1_000_000, heading: 0, pitch: -90 };

  it('writes the selection beside the view, and a view-only link stays a view-only link', () => {
    expect(formatLink(VIEW, 'REC-2')).toBe(`${formatView(VIEW)}&r=REC-2`);
    expect(formatLink(VIEW, null)).toBe(formatView(VIEW));
    // Links written before selections existed still parse, and select nothing.
    expect(parseLink(formatView(VIEW))).toEqual({ view: VIEW, recordId: null });
    expect(parseLink(`#${formatLink(VIEW, 'REC-2')}`)).toEqual({ view: VIEW, recordId: 'REC-2' });
  });

  it('rejects a malformed hash whole rather than salvaging the half it understands', () => {
    // The view half is good and the record half is not: the link is refused,
    // not read as a view. Nothing is clamped or half-read.
    expect(parseLink(`${formatView(VIEW)}&r=has spaces`)).toBeNull();
    expect(parseLink(`${formatView(VIEW)}&r=`)).toBeNull();
    expect(parseLink(`${formatView(VIEW)}&r=A&r=B`)).toBeNull();
    expect(parseLink(`v=nonsense&r=REC-2`)).toBeNull();
    expect(parseLink(`${formatView(VIEW)}&r=${'x'.repeat(200)}`)).toBeNull();
    expect(() => formatLink(VIEW, 'has spaces')).toThrow(/is not written into one/);
  });

  it('refuses a link naming a record this release does not offer, rather than showing the default', () => {
    // A default would look exactly like success while showing something the
    // link did not name, and the reader would believe they saw the shared thing.
    const offered = ['REC-1', 'REC-2'];
    const missing = selectionFromLink({ view: VIEW, recordId: 'REC-9' }, offered);
    expect(missing.standing).toBe('NOT_OFFERED');
    expect(missing.recordId).toBeNull();
    expect(missing.named).toBe('REC-9');
    expect(missing.because).toMatch(/a default would look like success/);
    expect(missing.because).toMatch(/The link named REC-9/);

    expect(selectionFromLink({ view: VIEW, recordId: 'REC-2' }, offered))
      .toMatchObject({ standing: 'SELECTED', recordId: 'REC-2' });
    expect(selectionFromLink({ view: VIEW, recordId: null }, offered))
      .toMatchObject({ standing: 'NONE_NAMED', recordId: null });
    expect(selectionFromLink(null, offered)).toMatchObject({ standing: 'NONE_NAMED', recordId: null });
    expect(SELECTION_MEANING.NONE_NAMED).toMatch(/before selections were carried/);
  });
});

describe('the camera frames what it flies to', () => {
  it('falls back to the regional preset when nothing states a size', () => {
    expect(placementHeightM(null)).toBe(PLACEMENT_VIEW.height);
    expect(placementHeightM(undefined)).toBe(PLACEMENT_VIEW.height);
    expect(placementHeightM(0)).toBe(PLACEMENT_VIEW.height);
    expect(placementViewFor(undefined).height).toBe(PLACEMENT_VIEW.height);
  });

  it('comes in close enough for a parcel and stays back for a vague position', () => {
    const parcel = placementViewFor({
      kind: 'POLYGON', datum: 'WGS84', horizontalUncertaintyM: 30,
      ring: [
        { longitude: 4.022838, latitude: 51.948394 },
        { longitude: 4.027162, latitude: 51.948394 },
        { longitude: 4.027162, latitude: 51.950467 },
        { longitude: 4.026288, latitude: 51.951006 },
        { longitude: 4.022838, latitude: 51.951006 },
      ],
    });
    // A ~290 m parcel is invisible at the old million-metre preset; this frames it.
    expect(parcel.height).toBeGreaterThan(1_200);
    expect(parcel.height).toBeLessThan(10_000);
    const vague = placementViewFor({ kind: 'POINT', datum: 'WGS84', longitude: 4.025, latitude: 51.9497, horizontalUncertaintyM: 5_000 });
    expect(vague.height).toBeGreaterThan(parcel.height);
    // Never nearer than the floor, and never further than it used to be.
    expect(placementHeightM(1)).toBe(PLACEMENT_FRAME.floorM);
    expect(placementHeightM(10_000_000)).toBe(PLACEMENT_VIEW.height);
  });

  it('keeps the heading and the straight-down pitch, so only the height is derived', () => {
    const framed = placementViewFor({ kind: 'POINT', datum: 'WGS84', longitude: 0, latitude: 0, horizontalUncertaintyM: 250 });
    expect(framed.heading).toBe(PLACEMENT_VIEW.heading);
    expect(framed.pitch).toBe(PLACEMENT_VIEW.pitch);
  });
});
