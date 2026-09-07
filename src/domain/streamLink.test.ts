import { describe, expect, it } from 'vitest';
import { STREAM_LINK_LOSS, STREAM_LINK_PARAMS, STREAM_LINK_PATH, readStreamLink, streamLink } from './streamLink';

const READING = {
  release: 'REL-CAR-2026.09.01',
  subject: 'LOT-7C-104',
  predicate: 'condition.moisture',
  validAt: '2026-08-28T14:00:00Z',
  knownAt: '2026-09-01T00:00:00Z',
  question: 'WHAT_WE_HELD',
};

describe('a reading of the stream is a link', () => {
  it('writes the question even when it is the default, because a default is not a statement', () => {
    const link = streamLink(READING);
    expect(link).toContain('question=WHAT_WE_HELD');
    // The same instant answers two different questions; a link that left the
    // question out would mean whichever default was in force when opened.
    const other = streamLink({ ...READING, question: 'WHAT_THE_SOURCE_KNEW' });
    expect(other).toContain('question=WHAT_THE_SOURCE_KNEW');
    expect(other).not.toBe(link);
    expect(STREAM_LINK_LOSS.join(' ')).toMatch(/a default is not a statement/);
  });

  it('refuses to write a link that leaves part of the reading unstated', () => {
    for (const key of ['release', 'subject', 'predicate', 'validAt', 'knownAt', 'question'] as const) {
      expect(() => streamLink({ ...READING, [key]: '' })).toThrow(new RegExp(`${key}.*missing`));
    }
    expect(() => streamLink({ ...READING, question: '   ' })).toThrow(/whatever the default happened to be/);
  });

  it('produces the same link for the same reading, so two readers compare readings and not orderings', () => {
    expect(streamLink(READING)).toBe(streamLink({ ...READING }));
    const params = streamLink(READING).slice(`${STREAM_LINK_PATH}?`.length).split('&').map((p) => p.split('=')[0]);
    // A fixed order, and only parameters the page actually reads.
    expect(params).toEqual(['release', 'subject', 'predicate', 'validAt', 'knownAt', 'question']);
    for (const p of params) expect(STREAM_LINK_PARAMS as readonly string[]).toContain(p);
  });

  it('encodes values rather than trusting them to be url-safe', () => {
    const link = streamLink({ ...READING, predicate: 'condition.moisture & mass', subject: 'LOT/7C 104' });
    expect(link).toContain('predicate=condition.moisture%20%26%20mass');
    expect(link).toContain('subject=LOT%2F7C%20104');
    // And it round-trips through the reader the page uses.
    const search = Object.fromEntries(new URLSearchParams(link.split('?')[1]));
    expect(readStreamLink(search)).toMatchObject({ predicate: 'condition.moisture & mass', subject: 'LOT/7C 104' });
  });

  it('ignores what it was not told about rather than guessing', () => {
    expect(readStreamLink({ release: 'REL-1', nonsense: 'x', question: '' }))
      .toEqual({ release: 'REL-1' });
    expect(readStreamLink({})).toEqual({});
    expect(STREAM_LINK_LOSS.join(' ')).toMatch(/reproduces a reading, not an answer/);
    expect(STREAM_LINK_LOSS.join(' ')).toMatch(/neither is a substitute for the other/);
  });
});
