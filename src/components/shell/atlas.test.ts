import { describe, expect, it } from 'vitest';
import { ATLAS_LOSS, readAtlas } from './atlas';
import { NAV_AREAS, NAV_DESTINATIONS, indexOf, step } from './nav';

describe('the figure is the registry and nothing else', () => {
  it('draws one band per area and one cell per destination, in registry order', () => {
    const atlas = readAtlas('/');
    expect(atlas.bands.map((band) => band.id)).toEqual(NAV_AREAS.map((area) => area.id));
    expect(atlas.areas).toBe(NAV_AREAS.length);
    // The flat order of the cells is the flat order of the rail, cell for cell.
    const drawn = atlas.bands.flatMap((band) => band.cells.map((cell) => cell.href));
    expect(drawn).toEqual(NAV_DESTINATIONS.map((destination) => destination.href));
    expect(atlas.destinations).toBe(drawn.length);
  });

  it('numbers every cell with its place in that order, from one', () => {
    const atlas = readAtlas('/');
    const positions = atlas.bands.flatMap((band) => band.cells.map((cell) => cell.position));
    expect(positions).toEqual(positions.map((_, index) => index + 1));
  });

  it('gains a band when the registry gains an area, with no change here', () => {
    // The point of deriving the figure: this test passes today and would pass
    // with an eighth area, because nothing below names an area or a count.
    for (const [index, band] of readAtlas('/').bands.entries()) {
      const area = NAV_AREAS[index];
      expect(band.number).toBe(index + 1);
      expect(band.label).toBe(area.label);
      expect(band.activity).toBe(area.activity);
      expect(band.count).toBe(band.cells.length);
    }
  });

  it('draws an anchor into a page already in the figure as no second cell', () => {
    // /candidates#cp-acquisitions is a way into a page the corpus band holds.
    // Drawing it would put one place in two cells and make the band's size a
    // count of links rather than of destinations.
    const anchors = NAV_AREAS.flatMap((area) => area.items).filter((item) => item.href.includes('#'));
    expect(anchors.length).toBeGreaterThan(0);
    const drawn = readAtlas('/').bands.flatMap((band) => band.cells.map((cell) => cell.href));
    for (const anchor of anchors) expect(drawn).not.toContain(anchor.href);
    expect(new Set(drawn).size).toBe(drawn.length);
  });

  it('reports the widest band, because that is what a row of the figure has to hold', () => {
    const atlas = readAtlas('/');
    expect(atlas.widest).toBe(Math.max(...atlas.bands.map((band) => band.count)));
    expect(atlas.bands.every((band) => band.count <= atlas.widest)).toBe(true);
  });
});

describe('where you are, marked once', () => {
  it('marks the destination you are on and no other', () => {
    for (const destination of NAV_DESTINATIONS) {
      const atlas = readAtlas(destination.href);
      const marked = atlas.bands.flatMap((band) => band.cells).filter((cell) => cell.here);
      expect(marked.map((cell) => cell.href), destination.href).toEqual([destination.href]);
      expect(atlas.bands.filter((band) => band.here)).toHaveLength(1);
      expect(atlas.here?.cell.href).toBe(destination.href);
      expect(atlas.here?.band.here).toBe(true);
    }
  });

  it('agrees with the rail about the neighbours in step order', () => {
    for (const destination of NAV_DESTINATIONS) {
      const atlas = readAtlas(destination.href);
      expect(atlas.previous?.href).toBe(step(destination.href, -1)?.href);
      expect(atlas.next?.href).toBe(step(destination.href, 1)?.href);
    }
  });

  it('wraps, because the rail is a ring rather than a list with an end', () => {
    const first = NAV_DESTINATIONS[0];
    const last = NAV_DESTINATIONS[NAV_DESTINATIONS.length - 1];
    expect(readAtlas(first.href).previous?.href).toBe(last.href);
    expect(readAtlas(last.href).next?.href).toBe(first.href);
  });

  it('puts a page beneath a destination on that destination, the same as the rail does', () => {
    // A case and the queue's own new-case action are under Cases; the rail
    // marks Cases current on both, and a map that disagreed with the rail about
    // where you are would be worse than no map.
    for (const path of ['/cases/new', '/cases/CASE-CAR-7C104', '/releases/REL-CAR-2026.09.01']) {
      const atlas = readAtlas(path);
      expect(atlas.here?.cell.href, path).toBe(indexOf(path) >= 0 ? NAV_DESTINATIONS[indexOf(path)].href : null);
      expect(atlas.here, path).not.toBeNull();
    }
  });

  it('says it does not know where you are rather than guessing, on a path the rail does not name', () => {
    for (const path of ['/nowhere', '/zzz/deep']) {
      const atlas = readAtlas(path);
      expect(atlas.here, path).toBeNull();
      // No position means no step from it. `step` would answer anyway, from an
      // assumed start; the atlas would rather say nothing than draw an arrow
      // it invented.
      expect(atlas.previous, path).toBeNull();
      expect(atlas.next, path).toBeNull();
      expect(atlas.bands.flatMap((band) => band.cells).some((cell) => cell.here), path).toBe(false);
    }
    // And the figure is still drawn: not knowing where you are is not a reason
    // to stop showing what there is.
    expect(readAtlas('/nowhere').destinations).toBe(NAV_DESTINATIONS.length);
  });
});

describe('what the drawing does not claim', () => {
  it('says a band’s size is a count of pages and not an importance', () => {
    const stated = ATLAS_LOSS.join(' ');
    expect(stated).toMatch(/count of pages and not an importance/);
    expect(stated).toMatch(/not stages of a workflow/);
    expect(stated).toMatch(/reads no store, no rail and no clock/);
  });

  it('reads nothing but the registry, which is what lets it claim nothing about the system', () => {
    // A figure that reached a store would be reporting on the system, and every
    // cell would then owe the reader a state. This one owes them a place.
    const twice = [readAtlas('/earth'), readAtlas('/earth')];
    expect(JSON.stringify(twice[0].bands)).toBe(JSON.stringify(twice[1].bands));
  });
});
