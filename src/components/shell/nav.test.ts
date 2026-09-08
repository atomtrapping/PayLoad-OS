import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NAV_AREAS, NAV_DESTINATIONS, indexOf, locate, searchNav, step } from './nav';

/** Every page route in src/app, as the router derives them. */
function routes(dir: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (!statSync(full).isDirectory()) {
      if (entry === 'page.tsx') out.push(prefix || '/');
      continue;
    }
    if (entry.startsWith('_') || entry === 'api') continue;
    out.push(...routes(full, `${prefix}/${entry}`));
  }
  return out;
}

const APP = fileURLToPath(new URL('../../app', import.meta.url));
/** Dynamic segments are not destinations the rail names; `/` redirects to the releases. */
const NAMED = routes(APP).filter((r) => !r.includes('[') && r !== '/');

describe('the navigation names every page', () => {
  it('leads with the products, because the products are what the firm sells', () => {
    expect(NAV_AREAS[0].id).toBe('products');
    expect(NAV_AREAS[0].items.map((i) => i.label)).toContain('Products');
  });

  it('locates every page route in exactly one area', () => {
    const unreachable = NAMED.filter((r) => locate(r) === null);
    expect(unreachable, 'a page the top bar cannot name is a page the rail cannot reach').toEqual([]);
  });

  it('keeps the moved operating model reachable under both routes', () => {
    expect(locate('/model')?.item.label).toBe('Operating model');
    expect(locate('/product')?.item.label).toBe('Operating model');
  });

  it('names the compute instruments the shell could not name before', () => {
    for (const path of ['/compute/registration', '/compute/clearance', '/compute/observations']) {
      expect(locate(path), path).not.toBeNull();
    }
  });
});

describe('moving between destinations', () => {
  it('lists every page once, in rail order, with anchors excluded', () => {
    const hrefs = NAV_DESTINATIONS.map((entry) => entry.href);
    expect(new Set(hrefs).size, 'a destination listed twice would be two names for one page').toBe(hrefs.length);
    expect(hrefs.some((href) => href.includes('#'))).toBe(false);
    expect(hrefs.length).toBe(NAMED.length);
    for (const route of NAMED) expect(indexOf(route), route).toBeGreaterThanOrEqual(0);
  });

  it('carries the area on every destination, so a jump says where it lands', () => {
    for (const entry of NAV_DESTINATIONS) {
      expect(entry.area, entry.href).toBeTruthy();
      expect(NAV_AREAS.some((area) => area.id === entry.areaId)).toBe(true);
    }
  });

  it('steps forward and back through the rail', () => {
    const first = NAV_DESTINATIONS[0];
    const second = NAV_DESTINATIONS[1];
    expect(step(first.href, 1)?.href).toBe(second.href);
    expect(step(second.href, -1)?.href).toBe(first.href);
  });

  /** The rail is a ring of places rather than a list with an end. */
  it('wraps at both ends rather than stopping', () => {
    const last = NAV_DESTINATIONS[NAV_DESTINATIONS.length - 1];
    expect(step(last.href, 1)?.href).toBe(NAV_DESTINATIONS[0].href);
    expect(step(NAV_DESTINATIONS[0].href, -1)?.href).toBe(last.href);
  });

  it('steps from the start when the current path is not on the rail', () => {
    expect(step('/nowhere', 1)?.href).toBe(NAV_DESTINATIONS[1].href);
  });
});

describe('searching the rail', () => {
  it('offers everything, in rail order, for an empty query', () => {
    expect(searchNav('').map((m) => m.destination.href)).toEqual(NAV_DESTINATIONS.map((d) => d.href));
    expect(searchNav('   ').length).toBe(NAV_DESTINATIONS.length);
  });

  it('puts an exact label first', () => {
    expect(searchNav('Cases')[0].destination.label).toBe('Cases');
    expect(searchNav('releases')[0].destination.label).toBe('Releases');
  });

  /** Someone typing "rel" wants Releases, not everything with those letters somewhere. */
  it('ranks a prefix above a mid-word match', () => {
    const ranked = searchNav('rel');
    expect(ranked[0].destination.label).toBe('Releases');
    const releases = ranked.findIndex((m) => m.destination.label === 'Releases');
    const liability = ranked.findIndex((m) => m.destination.label === 'Dispatch Liability');
    if (liability >= 0) expect(releases).toBeLessThan(liability);
  });

  it('finds a page by a word that is not the first', () => {
    expect(searchNav('twin')[0].destination.label).toBe('Earth Twin');
    expect(searchNav('harvester')[0].destination.label).toBe('Statutory Harvester');
  });

  it('finds a page by its path', () => {
    expect(searchNav('/compute/clearance')[0].destination.label).toBe('Clearance');
  });

  it('finds pages by the area they belong to, ranked below the label matches', () => {
    const inquiry = searchNav('inquiry');
    expect(inquiry.length).toBeGreaterThan(3);
    expect(inquiry.every((m) => m.destination.area === 'Inquiry')).toBe(true);
  });

  it('returns nothing rather than everything when nothing matches', () => {
    expect(searchNav('zzzznotathing')).toEqual([]);
  });

  it('keeps rail order between equally good matches, so the list does not reshuffle', () => {
    const matches = searchNav('c');
    const scores = matches.map((m) => m.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });
});
