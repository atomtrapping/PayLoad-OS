/**
 * A selection is a link.
 *
 * An inspector that opens on a row and cannot be sent to anyone is half an
 * inspector: the reader can see the thing and not say which thing they saw.
 * Spatial Inquiry settled the shape — `#space=S-3`, read on load, written on
 * every choice — and this is that shape as one codec, so the surfaces that
 * carry a selection do not each invent an encoding a reader has to learn twice.
 *
 * THE HASH RATHER THAN THE QUERY
 *
 * A hash is a client fact. Writing one does not re-run a server component, so
 * selecting rows down a register costs nothing and reloads nothing, and the
 * server render never depends on which row a particular reader had open. A
 * query parameter would be a different decision — visible to the server, and
 * therefore part of what the page is — and the surfaces that take one (the
 * as-of stream, the scoped product) take it deliberately.
 *
 * A LINK IS NOT A PARSER
 *
 * Everything here is total. A malformed escape reads as its own raw text
 * rather than throwing, a duplicated key takes its first occurrence so two
 * readers of one link see one thing, and a key present with no value reads as
 * nothing selected rather than as a selection of the empty string. What a hash
 * names is still the page's to accept: this returns what is written, and the
 * surface decides whether it holds such a thing.
 */

/** Decode one component without letting a bad escape take the page down. */
function decode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    // `%zz` is not an escape. It is text, and it will simply match nothing.
    return value;
  }
}

/**
 * The key/value pairs a hash carries.
 *
 * Tolerant of the leading `#`, of an empty hash, and of junk between the
 * separators; strict about nothing, because a URL arrives from outside and the
 * page's own guard is where a value is judged.
 */
export function readHash(hash: string): Map<string, string> {
  const entries = new Map<string, string>();
  const body = hash.replace(/^#/, '');
  if (body === '') return entries;
  for (const part of body.split('&')) {
    if (part === '') continue;
    const at = part.indexOf('=');
    if (at <= 0) continue;
    const key = decode(part.slice(0, at));
    const value = decode(part.slice(at + 1));
    // The first occurrence wins: a link with a key twice is malformed, and two
    // readers of one link must still see the same thing.
    if (value !== '' && !entries.has(key)) entries.set(key, value);
  }
  return entries;
}

/** The value a hash gives one key, or null. */
export const readHashValue = (hash: string, key: string): string | null => readHash(hash).get(key) ?? null;

/**
 * The hash text for a selection, without the `#`.
 *
 * Keys keep the order they were given, so one page always writes its selection
 * the same way and two links to the same thing are the same string. Empty and
 * absent are the same thing here — neither is written — because a URL carrying
 * `notation=` selects nothing while looking like it selects something.
 */
export function formatHash(entries: Readonly<Record<string, string | null | undefined>>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(entries)) {
    if (value === null || value === undefined || value === '') continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  }
  return parts.join('&');
}
