/**
 * The repository as a source, and the one distinction that makes it admissible.
 *
 * Every rail before this one waited on a source it could not reach. The census
 * rail waits on an operator's FMCSA collection; the statutory rail begins at
 * bytes an operator supplies; the frontier wedges have no source at all. In
 * every case the boundary is the same and it is correct: collection against a
 * third party means that party's terms, the operator's credentials and the
 * operator's decision about cadence, and none of those are this repository's to
 * make.
 *
 * There is one system this repository can observe without crossing that
 * boundary, and it is itself. A git object store is bytes the operator already
 * holds, on local disk, under no terms of use, requiring no credential and no
 * network. Reading it is not collection. It is also the one source whose claims
 * a reader can check independently and completely: given the objects, anyone
 * can recompute every content-derived value below and get the same answer or
 * find this module wrong.
 *
 * A COMMIT OBJECT CARRIES TWO KINDS OF FACT IN THE SAME BYTES
 *
 * This is the whole reason the module exists, and getting it wrong would be a
 * more interesting failure than not building it at all.
 *
 *   tree 48358a9a…            a SHA-1 over the tree's own bytes
 *   parent 03336640…          a SHA-1 over the parent commit's own bytes
 *   author Claude <…> 1788888751 +0000
 *   committer Claude <…> 1788888751 +0000
 *   gpgsig -----BEGIN SSH SIGNATURE-----
 *
 *   Read the camera height in a unit that does not sit on a rounding boundary
 *
 * The first two lines are content addresses. Change one byte anywhere under
 * that tree and the name changes; you cannot state a tree SHA that is not the
 * tree's. Everything after them is a string somebody typed. Git does not check
 * that the author is who the line says, and `git commit --date` sets the
 * timestamp to any instant a caller likes, past or future. The message is
 * whatever was written about the work — which is testimony by the party with
 * the most interest in how the work is described.
 *
 * A system that admitted `tree` and `authoredAt` the same way would be
 * asserting that a claim and a computation are the same kind of thing, in a
 * corpus whose entire thesis is that they are not. So each field declares its
 * basis, and the basis travels with the observation to the gate rather than
 * being decided there.
 *
 * WHAT A SIGNATURE DOES AND DOES NOT SETTLE HERE
 *
 * The commits in this repository are SSH-signed, and the signature block is in
 * the bytes. Its presence is a fact about the object. Its validity is not
 * checkable from here: verification needs an allowed-signers file naming the
 * keys an operator trusts, and this repository holds no such file and should
 * not invent one. So a signature is observed as present and never as valid, and
 * `SIGNED_NOT_VERIFIED` is a third basis rather than a footnote on the second.
 *
 * FOUR ANSWERS, FOR THE SAME REASON THE STATUTORY GRAMMAR HAS FOUR
 *
 * PRESENT, ABSENT, MALFORMED, AMBIGUOUS. A commit object with two `tree`
 * headers is not a commit object with one; taking the first would settle a
 * contradiction on line order, which `identityResolution` already refuses to do
 * for identifiers and which this module refuses for the same reason.
 *
 * WHAT THIS MODULE DOES NOT DO
 *
 * It does not run git. It parses bytes it is handed, and a separate adapter
 * decides what to read and computes the digest over exactly what it read. It
 * does not verify a signature, resolve a subject, rule on a candidate or reach
 * a network, and a test asserts the last of those the way the statutory
 * harvester's does.
 */
import type { ISODateTime } from './types';

export const SELF_OBSERVATION_METHOD = 'notationsos.self-observation.v1';

/**
 * Where a value in a commit object comes from, which decides what may be
 * asserted about it downstream.
 */
export const OBSERVATION_BASIS = ['CONTENT_DERIVED', 'SELF_REPORTED', 'SIGNED_NOT_VERIFIED'] as const;
export type ObservationBasis = (typeof OBSERVATION_BASIS)[number];

export const BASIS_MEANING: Record<ObservationBasis, string> = {
  CONTENT_DERIVED:
    'A function of bytes. Anyone holding the objects recomputes this value and gets the same answer, or finds this parser wrong. No party could have stated it otherwise.',
  SELF_REPORTED:
    'A string the committing party wrote. Git does not check it: an author line names whoever the caller configured, and --date sets the timestamp to any instant. True or not, it is testimony from the party with the most interest in it.',
  SIGNED_NOT_VERIFIED:
    'A signature block is present in the bytes. Whether it verifies is not decidable here — that needs an allowed-signers file naming the keys the operator trusts, which this repository does not hold and must not invent.',
};

/** The state of one field in one parsed object. Four answers, never collapsed to two. */
export const FIELD_PRESENCE = ['PRESENT', 'ABSENT', 'MALFORMED', 'AMBIGUOUS'] as const;
export type FieldPresence = (typeof FIELD_PRESENCE)[number];

export const PRESENCE_MEANING: Record<FieldPresence, string> = {
  PRESENT: 'The header appears once and its value reads as the declared kind.',
  ABSENT: 'The header does not appear. The object says nothing about this, which is not the object saying none, zero or unknown.',
  MALFORMED: 'The header appears and its value does not read as the declared kind. That is a fact about this grammar as much as about the object, and it is not absence.',
  AMBIGUOUS: 'The header appears more than once with different values. Taking the first would settle a contradiction on line order.',
};

/** Every field this grammar reads out of a commit object, with the basis fixed per field. */
export const COMMIT_FIELDS = {
  tree: { basis: 'CONTENT_DERIVED', kind: 'OBJECT_NAME', what: 'The name of the tree this commit records, which is a SHA-1 over that tree’s own bytes.' },
  parents: { basis: 'CONTENT_DERIVED', kind: 'OBJECT_NAME_LIST', what: 'The names of the commits this one follows. Zero for a root commit, two or more for a merge.' },
  authorIdentity: { basis: 'SELF_REPORTED', kind: 'TEXT', what: 'The name and address on the author line, as configured by whoever ran the command. Git verifies neither.' },
  authoredAt: { basis: 'SELF_REPORTED', kind: 'INSTANT', what: 'The instant on the author line. Settable to any value, past or future, with git commit --date.' },
  committerIdentity: { basis: 'SELF_REPORTED', kind: 'TEXT', what: 'The name and address on the committer line. Rewritten by rebase and amend, and verified by nothing.' },
  committedAt: { basis: 'SELF_REPORTED', kind: 'INSTANT', what: 'The instant on the committer line. Settable through the environment like the author’s.' },
  message: { basis: 'SELF_REPORTED', kind: 'TEXT', what: 'What was written about the change, by the party with the most interest in how it is described.' },
  signature: { basis: 'SIGNED_NOT_VERIFIED', kind: 'PRESENCE', what: 'Whether a signature block is present. Never whether it verifies.' },
} as const;

export type CommitFieldName = keyof typeof COMMIT_FIELDS;

/** One field, read. `value` is null unless the presence is PRESENT. */
export interface ObservedField {
  field: CommitFieldName;
  presence: FieldPresence;
  basis: ObservationBasis;
  value: string | readonly string[] | boolean | null;
  because: string;
}

/**
 * What the operator declared about a capture, carried through rather than
 * inferred — the same rule the statutory harvest applies to `beganAs`.
 *
 * This module cannot tell a read of a real object store from a fixture with the
 * same bytes, because the bytes are the same. So it refuses to guess.
 */
export interface CaptureDeclaration {
  /** The repository the bytes were read from, as the operator names it. */
  repository: string;
  /** `git cat-file commit <name>` or an equivalent the operator states. Recorded, never executed here. */
  readBy: string;
  /** When the read happened, as the operator declares. This is knowledge time, not valid time. */
  capturedAt: ISODateTime;
  /** Whether these bytes came from an object store or from a committed fixture. Declared; never inferred. */
  beganAs: 'OBJECT_STORE_READ' | 'COMMITTED_SPECIMEN';
}

/** One commit object, parsed. */
export interface CommitObservation {
  method: typeof SELF_OBSERVATION_METHOD;
  /** The object's own name, supplied by the adapter that read it. Not parsed out of the body: a commit does not contain its own SHA. */
  objectName: string;
  declaration: CaptureDeclaration;
  /** The digest the adapter computed over exactly the bytes it read. */
  bytesDigest: string;
  fields: readonly ObservedField[];
  /** Fields whose value may be asserted about the subject, which is the content-derived ones alone. */
  assertable: readonly CommitFieldName[];
  /** Fields read and deliberately not offered as claims, with the reason. */
  withheld: ReadonlyArray<{ field: CommitFieldName; because: string }>;
  because: string;
}

const OBJECT_NAME = /^[0-9a-f]{40}$/;
/** `Name <address> <epoch seconds> <offset>`. The offset is the author's stated zone; the epoch alone fixes the instant. */
const IDENTITY_LINE = /^(.*?) <([^>]*)> (\d+) ([+-]\d{4})$/;

function field(name: CommitFieldName, presence: FieldPresence, value: ObservedField['value'], because: string): ObservedField {
  return { field: name, presence, basis: COMMIT_FIELDS[name].basis, value, because };
}

/**
 * Split a commit object into its header lines and its message.
 *
 * Git's format is header lines until the first empty line, then the message.
 * A header value may continue across lines, each continuation beginning with a
 * single space — which is how a signature block sits inside a header.
 */
function splitObject(bytes: string): { headers: Array<{ key: string; value: string }>; message: string; malformed: string | null } {
  const boundary = bytes.indexOf('\n\n');
  const headerText = boundary === -1 ? bytes : bytes.slice(0, boundary);
  const message = boundary === -1 ? '' : bytes.slice(boundary + 2);
  const headers: Array<{ key: string; value: string }> = [];

  for (const line of headerText.split('\n')) {
    if (line === '') continue;
    if (line.startsWith(' ')) {
      if (headers.length === 0) return { headers, message, malformed: 'The object begins with a continuation line, which belongs to a header that is not there.' };
      headers[headers.length - 1].value += `\n${line.slice(1)}`;
      continue;
    }
    const space = line.indexOf(' ');
    if (space <= 0) return { headers, message, malformed: `A header line carries no key and value: ${JSON.stringify(line.slice(0, 40))}.` };
    headers.push({ key: line.slice(0, space), value: line.slice(space + 1) });
  }
  return { headers, message, malformed: null };
}

/** Read one header that must appear at most once, refusing a repeat rather than choosing. */
function single(headers: ReadonlyArray<{ key: string; value: string }>, key: string): { presence: FieldPresence; value: string | null; because: string } {
  const found = headers.filter((entry) => entry.key === key);
  if (found.length === 0) return { presence: 'ABSENT', value: null, because: `No ${key} header.` };
  const distinct = [...new Set(found.map((entry) => entry.value))];
  if (distinct.length > 1) {
    return { presence: 'AMBIGUOUS', value: null, because: `${found.length} ${key} headers with ${distinct.length} different values. Choosing one would settle a contradiction on line order.` };
  }
  return { presence: 'PRESENT', value: distinct[0], because: `One ${key} header.` };
}

/** An epoch-seconds value on an identity line, as an instant. Converting it adds no information and asserts nothing about its truth. */
function instantFrom(epochSeconds: string): string | null {
  const seconds = Number(epochSeconds);
  if (!Number.isSafeInteger(seconds) || seconds < 0) return null;
  const at = new Date(seconds * 1000);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

function identityFields(
  headers: ReadonlyArray<{ key: string; value: string }>,
  key: 'author' | 'committer',
  identityField: CommitFieldName,
  instantField: CommitFieldName,
): ObservedField[] {
  const read = single(headers, key);
  if (read.presence !== 'PRESENT' || read.value === null) {
    return [field(identityField, read.presence, null, read.because), field(instantField, read.presence, null, read.because)];
  }
  const parsed = IDENTITY_LINE.exec(read.value);
  if (!parsed) {
    const because = `The ${key} line does not read as "Name <address> <epoch> <offset>". The object states a ${key}; this grammar cannot read it, which is not the same as the ${key} being absent.`;
    return [field(identityField, 'MALFORMED', null, because), field(instantField, 'MALFORMED', null, because)];
  }
  const [, name, address, epoch] = parsed;
  const instant = instantFrom(epoch);
  return [
    field(identityField, 'PRESENT', `${name} <${address}>`, `The ${key} line names ${name}. Git checked nothing about that.`),
    instant === null
      ? field(instantField, 'MALFORMED', null, `The ${key} line carries ${JSON.stringify(epoch)} where epoch seconds belong.`)
      : field(instantField, 'PRESENT', instant, `The ${key} line states ${instant}, which whoever ran the command chose.`),
  ];
}

/**
 * Pure: read one commit object's bytes into observations.
 *
 * `objectName` is supplied rather than parsed, because a commit object does not
 * contain its own name — the name is the SHA-1 of these bytes with their
 * header, and computing it is the adapter's job alongside the digest.
 */
export function observeCommit(bytes: string, objectName: string, declaration: CaptureDeclaration, bytesDigest: string): CommitObservation {
  const { headers, message, malformed } = splitObject(bytes);
  const fields: ObservedField[] = [];

  if (malformed !== null) {
    for (const name of Object.keys(COMMIT_FIELDS) as CommitFieldName[]) fields.push(field(name, 'MALFORMED', null, malformed));
  } else {
    const tree = single(headers, 'tree');
    fields.push(
      tree.presence === 'PRESENT' && tree.value !== null && !OBJECT_NAME.test(tree.value)
        ? field('tree', 'MALFORMED', null, `The tree header carries ${JSON.stringify(tree.value.slice(0, 48))}, which is not a 40-character object name.`)
        : field('tree', tree.presence, tree.value, tree.presence === 'PRESENT' ? 'A SHA-1 over the tree’s own bytes, recomputable by anyone holding the objects.' : tree.because),
    );

    // Parents repeat legitimately, so a repeat is data rather than ambiguity —
    // but a value that is not an object name still is not one.
    const parents = headers.filter((entry) => entry.key === 'parent').map((entry) => entry.value);
    const badParent = parents.find((value) => !OBJECT_NAME.test(value));
    fields.push(
      badParent !== undefined
        ? field('parents', 'MALFORMED', null, `A parent header carries ${JSON.stringify(badParent.slice(0, 48))}, which is not a 40-character object name.`)
        : field('parents', 'PRESENT', parents, parents.length === 0
          ? 'No parent: a root commit. Zero parents is a value, not an absence.'
          : `${parents.length} ${parents.length === 1 ? 'parent' : 'parents'}, each a SHA-1 over that commit’s own bytes.`),
    );

    fields.push(...identityFields(headers, 'author', 'authorIdentity', 'authoredAt'));
    fields.push(...identityFields(headers, 'committer', 'committerIdentity', 'committedAt'));

    fields.push(field('message', message === '' ? 'ABSENT' : 'PRESENT', message === '' ? null : message,
      message === '' ? 'The object carries no message body.' : 'What was written about the change, by the party that made it.'));

    const signed = headers.some((entry) => entry.key === 'gpgsig' || entry.key === 'gpgsig-sha256');
    fields.push(field('signature', 'PRESENT', signed,
      signed
        ? 'A signature block is present. Whether it verifies is not decidable here: that needs an allowed-signers file this repository does not hold.'
        : 'No signature block. That the object is unsigned is itself a fact about the bytes.'));
  }

  const assertable = fields
    .filter((entry) => entry.basis === 'CONTENT_DERIVED' && entry.presence === 'PRESENT')
    .map((entry) => entry.field);
  const withheld = fields
    .filter((entry) => entry.basis !== 'CONTENT_DERIVED')
    .map((entry) => ({ field: entry.field, because: BASIS_MEANING[entry.basis] }));

  return {
    method: SELF_OBSERVATION_METHOD,
    objectName,
    declaration,
    bytesDigest,
    fields,
    assertable,
    withheld,
    because: `${fields.length} fields read from ${objectName.slice(0, 12)}. ${assertable.length} may be asserted about the subject because their values are functions of bytes; ${withheld.length} are carried and withheld because a party stated them and nothing here checked. Reading a field is not admitting it, and this observation rules on nothing.`,
  };
}

export const SELF_OBSERVATION_LOSS = [
  'An admitted commit observation says these bytes are in the object store and this grammar read them correctly. It says nothing about whether the change was a good one, whether the tests passed, or whether the message describes what the diff did.',
  'A commit timestamp is not a measurement. Both instants in a commit object are set by whoever ran the command and are freely settable, so the corpus holds them as testimony from an interested party and never as an observation of when the work happened.',
  'An author line is not an identity. Git binds it to no key and no account; a signature would bind it to a key, and verifying that signature needs an allowed-signers file this repository does not hold.',
  'The third party who could fix the clocks is not here. A check run observing a commit at an instant would establish, from a party with no interest in it, that the object existed by then — and collecting that means the operator’s credentials against their forge, which is the same boundary every other source in this repository stops at.',
  'This grammar reads a commit object and nothing else. A tree is named and not walked, a diff is not computed, and no statement is made about what changed between two commits.',
  'Content-derived is not the same as true. A tree SHA is a fact about bytes somebody committed; that the bytes are correct, complete or authorised is a separate question the gate does not answer either.',
] as const;
