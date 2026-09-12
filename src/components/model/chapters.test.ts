import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHAPTER_ROUTE_PATTERN, MODEL_CHAPTERS, chapterBySlug } from './chapters';

/**
 * The registry is what the contents figure and the routes read; the chapter
 * components are what the reader gets. They are held to each other here so a
 * section added to a chapter appears in the contents, and a section listed
 * in the contents is actually rendered, in that order.
 */
const COMPONENT = { firm: 'FirmChapter', substrate: 'SubstrateChapter', estimation: 'EstimationChapter', obligations: 'ObligationsChapter', standing: 'StandingChapter' } as const;

function renderedSections(slug: keyof typeof COMPONENT) {
  const source = readFileSync(resolve(__dirname, `${COMPONENT[slug]}.tsx`), 'utf8');
  return [...source.matchAll(/<Section title="([^"]+)" id="([^"]+)">/g)].map((match) => ({ id: match[2], title: match[1] }));
}

describe('the operating model chapters', () => {
  it('lists exactly the sections each chapter renders, in order', () => {
    for (const chapter of MODEL_CHAPTERS) {
      expect(renderedSections(chapter.slug as keyof typeof COMPONENT), chapter.slug).toEqual([...chapter.sections]);
    }
  });

  it('carries every section once, under one chapter', () => {
    const ids = MODEL_CHAPTERS.flatMap((chapter) => chapter.sections.map((section) => section.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(26);
  });

  it('routes chapter one at /model and the rest beneath it, and the rail rule reaches all of them', () => {
    expect(MODEL_CHAPTERS[0].href).toBe('/model');
    for (const chapter of MODEL_CHAPTERS.slice(1)) expect(chapter.href).toBe(`/model/${chapter.slug}`);
    for (const chapter of MODEL_CHAPTERS) expect(CHAPTER_ROUTE_PATTERN.test(chapter.href)).toBe(true);
    expect(CHAPTER_ROUTE_PATTERN.test('/model/substrate/deeper')).toBe(false);
    expect(chapterBySlug('nowhere')).toBeUndefined();
  });
});
