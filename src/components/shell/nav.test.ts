import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NAV_AREAS, locate } from './nav';

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

const APP = new URL('../../app', import.meta.url).pathname;
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
