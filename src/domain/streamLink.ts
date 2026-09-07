/**
 * A reading of the stream is a link.
 *
 * The page already accepts one: release, subject, predicate, both instants
 * and the as-of question all arrive as search parameters. What it did not do
 * is hand one back, so a reader who found something could describe it but
 * not send it. This closes that, and the rule it enforces is the reason it
 * is worth a module rather than a template string.
 *
 * **The question is always written, never defaulted.** A link carrying
 * knownAt and no question is ambiguous under the two-question law: the same
 * instant answers "what the source had published by then" and "what this
 * system held then", and those are different questions with different
 * answers. A link that omitted it would mean whatever the default happened
 * to be on the day it was opened, which is how a shared reading becomes a
 * different reading without anyone editing it.
 *
 * The feed URL and this link are not the same thing and neither replaces the
 * other. The feed URL reproduces the answer for a machine; this reproduces
 * the reading for a person, including which question was asked.
 */

/** Every parameter the stream page reads. Adding one here without adding it to the page is a lie a test catches. */
export const STREAM_LINK_PARAMS = ['release', 'subject', 'predicate', 'validAt', 'knownAt', 'question', 'record'] as const;
export type StreamLinkParam = (typeof STREAM_LINK_PARAMS)[number];

export interface StreamReading {
  release: string;
  subject: string;
  predicate: string;
  validAt: string;
  knownAt: string;
  /** Written even when it is the default, because a default is not a statement. */
  question: string;
  /** The record a reader had open, when one was. */
  record?: string;
}

export const STREAM_LINK_PATH = '/stream';

/**
 * The link for one reading. Parameters are written in a fixed order so the
 * same reading always produces the same link — two readers comparing links
 * are comparing readings, not query-string orderings.
 */
export function streamLink(reading: StreamReading): string {
  const values: Record<StreamLinkParam, string | undefined> = {
    release: reading.release,
    subject: reading.subject,
    predicate: reading.predicate,
    validAt: reading.validAt,
    knownAt: reading.knownAt,
    question: reading.question,
    record: reading.record,
  };
  const missing = (['release', 'subject', 'predicate', 'validAt', 'knownAt', 'question'] as StreamLinkParam[])
    .filter((key) => !values[key]?.trim());
  if (missing.length) {
    throw new Error(`A stream link states its whole reading: ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} missing. A link that leaves one out means whatever the default happened to be when it was opened.`);
  }
  const query = STREAM_LINK_PARAMS
    .filter((key) => values[key]?.trim())
    .map((key) => `${key}=${encodeURIComponent(values[key]!)}`)
    .join('&');
  return `${STREAM_LINK_PATH}?${query}`;
}

/** What a link says it is, read back. Unknown parameters are ignored rather than guessed at. */
export function readStreamLink(search: Readonly<Record<string, string | undefined>>): Partial<StreamReading> {
  const out: Partial<StreamReading> = {};
  for (const key of STREAM_LINK_PARAMS) {
    const value = search[key];
    if (typeof value === 'string' && value.trim()) out[key] = value;
  }
  return out;
}

export const STREAM_LINK_LOSS = [
  'The question is written even when it is the default, because a default is not a statement and a link that omitted it would mean whatever the default was on the day it was opened.',
  'A link reproduces a reading, not an answer. It names the release, so it survives a later one; it does not carry the records, which the corpus supplies when the link is followed.',
  'The feed URL and this link answer different needs. One reproduces the answer for a machine, the other the reading for a person, and neither is a substitute for the other.',
] as const;
