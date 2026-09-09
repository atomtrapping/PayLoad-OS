import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SurfaceLoading } from './SurfaceLoading';

describe('what a surface shows while it waits', () => {
  it('names what is being read, in a frame, as a status', () => {
    render(<SurfaceLoading reading="the corpus source, for each line’s release history." />);
    const panel = screen.getByRole('status');
    expect(panel).toHaveTextContent('the corpus source');
    expect(screen.getByTestId('surface-loading')).toBeTruthy();
  });

  it('says it is waiting rather than drawing a shape it does not have', () => {
    // A skeleton draws rows that are not there, and on these surfaces an empty
    // region is a fact about the corpus. A grey shape where a row will be is a
    // shape the reader has been told to expect and may not get.
    render(<SurfaceLoading reading="the case source." />);
    expect(screen.getByRole('status')).toHaveTextContent('An empty region on these surfaces is a fact about the corpus');
  });
});

/** Every loading boundary the router can reach. */
// `import.meta.url` is not a file URL under jsdom, which is where a .tsx test
// runs; the suite's root is the repository, so the path is taken from there.
const APP = resolve(process.cwd(), 'src/app');
function loadingFiles(dir: string, prefix = ''): Array<{ route: string; source: string }> {
  const found: Array<{ route: string; source: string }> = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) { if (!entry.startsWith('_')) found.push(...loadingFiles(full, `${prefix}/${entry}`)); continue; }
    if (entry === 'loading.tsx') found.push({ route: prefix || '/', source: readFileSync(full, 'utf8') });
  }
  return found;
}

describe('a waiting surface names the source it is actually reading', () => {
  const files = loadingFiles(APP);

  it('has a boundary at the root and at the surfaces whose wait is worth naming', () => {
    const routes = files.map((file) => file.route).sort();
    expect(routes).toContain('/');
    expect(routes.length).toBeGreaterThan(1);
  });

  it('draws every one of them with the same frame', () => {
    for (const file of files) expect(file.source, file.route).toMatch(/SurfaceLoading/);
  });

  it('names no source at the root, which cannot know which surface it stands in for', () => {
    // The one this replaced said "Loading case data from the current source…"
    // on every route in the application — including the release catalogue,
    // which reads the corpus, and the Earth Twin, which reads a release.
    const root = files.find((file) => file.route === '/')!;
    expect(root.source).not.toMatch(/case data|corpus source|local .*rail|release/i);
    expect(root.source).toMatch(/the current source/);
  });

  it('names one at every surface that has its own', () => {
    for (const file of files.filter((entry) => entry.route !== '/')) {
      const reading = /reading="([^"]+)"/.exec(file.source)?.[1];
      expect(reading, file.route).toBeTruthy();
      expect(reading, file.route).not.toBe('Reading from the current source.');
      expect(reading!.length, file.route).toBeGreaterThan(20);
    }
  });

  it('names case data only where the case source is what is read', () => {
    // The defect this rules out is a fallback that tells a reader it is
    // fetching something it is not.
    const caseSourced = ['/rulings', '/cases'];
    for (const file of files.filter((entry) => /case/i.test(entry.source))) {
      expect(caseSourced, `${file.route} claims to read case data`).toContain(file.route);
    }
  });
});
