/**
 * The parser, read against this repository's own object store.
 *
 * The specimens are three real commits, and the first test is the one that
 * makes the rest worth having: each specimen's object name is recomputed from
 * its bytes by git's own rule. A fixture that asserted its own name would be a
 * claim; one that recomputes it is a check anybody can repeat. This is the
 * property that makes the repository admissible as a source at all, and it is
 * asserted before anything else is.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  BASIS_MEANING, COMMIT_FIELDS, FIELD_PRESENCE, OBSERVATION_BASIS, PRESENCE_MEANING,
  SELF_OBSERVATION_LOSS, SELF_OBSERVATION_METHOD, observeCommit,
  type CaptureDeclaration, type CommitFieldName, type CommitObservation,
} from './selfObservation';
import { COMMIT_SPECIMENS, SPECIMEN_DECLARATION } from '@/fixtures/self/commits';

const read = (observation: CommitObservation, name: CommitFieldName) => observation.fields.find((entry) => entry.field === name)!;

const observe = (bytes: string, over: Partial<CaptureDeclaration> = {}) =>
  observeCommit(bytes, '0'.repeat(40), { ...SPECIMEN_DECLARATION, ...over }, `sha256:${'0'.repeat(64)}`);

/** Git's own rule for an object's name: sha1 over "commit <byte length>\0" and the body. */
function gitObjectName(bytes: string): string {
  const body = Buffer.from(bytes, 'utf8');
  return createHash('sha1').update(Buffer.concat([Buffer.from(`commit ${body.length}\0`), body])).digest('hex');
}

describe('the specimens are checkable, which is the whole reason this source is usable', () => {
  it('recomputes each specimen’s object name from its own bytes', () => {
    expect(COMMIT_SPECIMENS.length).toBe(3);
    for (const specimen of COMMIT_SPECIMENS) {
      expect(gitObjectName(specimen.bytes), specimen.shape).toBe(specimen.objectName);
    }
  });

  it('recomputes each specimen’s capture digest over exactly those bytes', () => {
    for (const specimen of COMMIT_SPECIMENS) {
      expect(`sha256:${createHash('sha256').update(specimen.bytes, 'utf8').digest('hex')}`).toBe(specimen.bytesDigest);
    }
  });

  it('declares the specimens as specimens, because the parser cannot tell them from a live read', () => {
    expect(SPECIMEN_DECLARATION.beganAs).toBe('COMMITTED_SPECIMEN');
  });
});

describe('a content address is read as a content address', () => {
  it('reads the tree of every specimen as a present, content-derived object name', () => {
    for (const specimen of COMMIT_SPECIMENS) {
      const tree = read(observe(specimen.bytes), 'tree');
      expect(tree.presence, specimen.shape).toBe('PRESENT');
      expect(tree.basis).toBe('CONTENT_DERIVED');
      expect(tree.value).toMatch(/^[0-9a-f]{40}$/);
    }
  });

  it('splits a root commit into "names no parent" and "follows zero"', () => {
    // Two propositions, not one rendering of the same one. There is no parent
    // name to assert, and the object does state that it follows nothing —
    // which is a value. Collapsing them would make "names none" and "says
    // nothing" the same answer, one level above where the four presences
    // already refuse to.
    const root = COMMIT_SPECIMENS.find((s) => s.shape.startsWith('A root'))!;
    const observation = observe(root.bytes);
    expect(read(observation, 'parents').presence).toBe('ABSENT');
    expect(read(observation, 'parentCount').presence).toBe('PRESENT');
    expect(read(observation, 'parentCount').value).toBe(0);
    expect(read(observation, 'parentCount').because).toMatch(/value rather than a silence/);
  });

  it('reads two parents as two, because a parent header repeats legitimately', () => {
    // Contrast with `tree`, where a repeat is a contradiction. The difference
    // is in the format, so the grammar carries it rather than applying one rule
    // to both.
    const merge = COMMIT_SPECIMENS.find((s) => s.shape.startsWith('A merge'))!;
    const parents = read(observe(merge.bytes), 'parents');
    expect(parents.presence).toBe('PRESENT');
    expect((parents.value as readonly string[]).length).toBe(2);
    for (const name of parents.value as readonly string[]) expect(name).toMatch(/^[0-9a-f]{40}$/);
    expect(read(observe(merge.bytes), 'parentCount').value).toBe(2);
  });
});

describe('a claim is read as a claim, and never offered as a measurement', () => {
  const observation = observe(COMMIT_SPECIMENS[2].bytes);

  it('reads both instants as self-reported, because git lets a caller set them', () => {
    for (const name of ['authoredAt', 'committedAt'] as const) {
      const entry = read(observation, name);
      expect(entry.presence).toBe('PRESENT');
      expect(entry.basis).toBe('SELF_REPORTED');
      expect(entry.value).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  it('offers only content-derived fields as assertable, and withholds the rest with the reason', () => {
    expect([...observation.assertable].sort()).toEqual(['parentCount', 'parents', 'tree']);
    const withheldFields = observation.withheld.map((entry) => entry.field).sort();
    expect(withheldFields).toEqual(['authorIdentity', 'authoredAt', 'committedAt', 'committerIdentity', 'message', 'signature']);
    for (const entry of observation.withheld) expect(entry.because.length).toBeGreaterThan(0);
  });

  it('never lists a self-reported field as assertable, on any specimen', () => {
    for (const specimen of COMMIT_SPECIMENS) {
      for (const name of observeCommit(specimen.bytes, specimen.objectName, SPECIMEN_DECLARATION, specimen.bytesDigest).assertable) {
        expect(COMMIT_FIELDS[name].basis, `${name} on ${specimen.objectName.slice(0, 8)}`).toBe('CONTENT_DERIVED');
      }
    }
  });

  it('says a signature is present and never that it verifies', () => {
    const signature = read(observation, 'signature');
    expect(signature.value).toBe(true);
    expect(signature.basis).toBe('SIGNED_NOT_VERIFIED');
    expect(signature.because).toMatch(/allowed-signers file this repository does not hold/);
    expect(signature.because).not.toMatch(/\bvalid\b|\bverified\b/);
  });

  it('reads an unsigned commit as unsigned, which is also a fact about the bytes', () => {
    const unsigned = observe('tree ' + 'a'.repeat(40) + '\nauthor A <a@b> 1788888751 +0000\ncommitter A <a@b> 1788888751 +0000\n\nSubject\n');
    expect(read(unsigned, 'signature').value).toBe(false);
    expect(read(unsigned, 'signature').presence).toBe('PRESENT');
  });
});

describe('four answers, and a repeat is never broken by taking the first', () => {
  const tree = (value: string) => `tree ${value}`;

  it('refuses two different tree headers as ambiguous', () => {
    const bytes = `${tree('a'.repeat(40))}\n${tree('b'.repeat(40))}\nauthor A <a@b> 1 +0000\n\nx\n`;
    const field = read(observe(bytes), 'tree');
    expect(field.presence).toBe('AMBIGUOUS');
    expect(field.value).toBeNull();
    expect(field.because).toMatch(/line order/);
  });

  it('accepts two identical tree headers, because the same value twice is not a contradiction', () => {
    const bytes = `${tree('a'.repeat(40))}\n${tree('a'.repeat(40))}\nauthor A <a@b> 1 +0000\n\nx\n`;
    expect(read(observe(bytes), 'tree').presence).toBe('PRESENT');
  });

  it('reads an unreadable tree as malformed rather than absent', () => {
    // The object states a tree. This grammar cannot read it. That is a fact
    // about the grammar as much as the object, and it is not silence.
    const field = read(observe(`${tree('not-a-sha')}\nauthor A <a@b> 1 +0000\n\nx\n`), 'tree');
    expect(field.presence).toBe('MALFORMED');
    expect(field.value).toBeNull();
  });

  it('reads a missing tree as absent', () => {
    expect(read(observe('author A <a@b> 1 +0000\n\nx\n'), 'tree').presence).toBe('ABSENT');
  });

  it('reads an unparseable author line as malformed for both the identity and the instant', () => {
    const observation = observe(`${tree('a'.repeat(40))}\nauthor not an identity line\n\nx\n`);
    expect(read(observation, 'authorIdentity').presence).toBe('MALFORMED');
    expect(read(observation, 'authoredAt').presence).toBe('MALFORMED');
    expect(read(observation, 'authoredAt').because).toMatch(/does not read as/);
  });

  it('reads a non-numeric epoch as a malformed instant while the identity still reads', () => {
    const observation = observe(`${tree('a'.repeat(40))}\nauthor A <a@b> 99999999999999999999 +0000\n\nx\n`);
    expect(read(observation, 'authorIdentity').presence).toBe('PRESENT');
    expect(read(observation, 'authoredAt').presence).toBe('MALFORMED');
  });

  it('refuses a parent that is not an object name rather than carrying it', () => {
    const observation = observe(`${tree('a'.repeat(40))}\nparent nope\nauthor A <a@b> 1 +0000\n\nx\n`);
    expect(read(observation, 'parents').presence).toBe('MALFORMED');
    // The count goes with it: counting headers this grammar could not read
    // would be reporting a number over an unknown.
    expect(read(observation, 'parentCount').presence).toBe('MALFORMED');
  });

  it('reads an empty message as absent', () => {
    expect(read(observe(`${tree('a'.repeat(40))}\nauthor A <a@b> 1 +0000\n`), 'message').presence).toBe('ABSENT');
  });
});

describe('the message body is a message body', () => {
  it('does not read a header-shaped line in the message as a header', () => {
    // A commit message that begins "tree 0000…" is a message about a tree, not
    // a second tree header. The blank line is the boundary and it is the only
    // boundary.
    const real = 'a'.repeat(40);
    const observation = observe(`tree ${real}\nauthor A <a@b> 1 +0000\n\ntree ${'0'.repeat(40)}\nparent ${'1'.repeat(40)}\n`);
    expect(read(observation, 'tree').presence).toBe('PRESENT');
    expect(read(observation, 'tree').value).toBe(real);
    expect(read(observation, 'parents').presence).toBe('ABSENT');
    expect(read(observation, 'message').value).toContain(`tree ${'0'.repeat(40)}`);
  });

  it('reads a signature block across its continuation lines without losing the message after it', () => {
    const specimen = COMMIT_SPECIMENS[2];
    const observation = observeCommit(specimen.bytes, specimen.objectName, SPECIMEN_DECLARATION, specimen.bytesDigest);
    expect(read(observation, 'signature').value).toBe(true);
    expect(read(observation, 'message').presence).toBe('PRESENT');
    expect(String(read(observation, 'message').value)).not.toContain('SSH SIGNATURE');
  });

  it('marks every field malformed when the object opens with a continuation line', () => {
    const observation = observe(' orphaned continuation\ntree ' + 'a'.repeat(40) + '\n\nx\n');
    for (const entry of observation.fields) expect(entry.presence).toBe('MALFORMED');
    expect(observation.assertable).toEqual([]);
  });
});

describe('the module reads bytes and does nothing else', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/domain/selfObservation.ts'), 'utf8');
  const body = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('runs no command, opens no file and reaches no network', () => {
    // The adapter decides what to read and computes the digest. This module is
    // handed bytes, the same as the statutory grammar is.
    expect(body).not.toMatch(/child_process|execSync|spawn|node:fs|readFile|fetch\(|simple-git/);
  });

  it('states its method and reports on itself rather than ruling', () => {
    const observation = observeCommit(COMMIT_SPECIMENS[0].bytes, COMMIT_SPECIMENS[0].objectName, SPECIMEN_DECLARATION, COMMIT_SPECIMENS[0].bytesDigest);
    expect(observation.method).toBe(SELF_OBSERVATION_METHOD);
    expect(observation.because).toMatch(/rules on nothing/);
    expect(observation.declaration.beganAs).toBe('COMMITTED_SPECIMEN');
    expect(observation.objectName).toBe(COMMIT_SPECIMENS[0].objectName);
  });

  it('gives every basis and every presence a meaning, so none is ornamental', () => {
    for (const basis of OBSERVATION_BASIS) expect(BASIS_MEANING[basis].length).toBeGreaterThan(0);
    for (const presence of FIELD_PRESENCE) expect(PRESENCE_MEANING[presence].length).toBeGreaterThan(0);
    for (const declared of Object.values(COMMIT_FIELDS)) {
      expect(OBSERVATION_BASIS).toContain(declared.basis);
      expect(declared.what.length).toBeGreaterThan(0);
    }
  });

  it('says what an admitted observation would still not establish', () => {
    expect(SELF_OBSERVATION_LOSS.length).toBeGreaterThanOrEqual(6);
    const stated = SELF_OBSERVATION_LOSS.join(' ');
    expect(stated).toMatch(/not a measurement/);
    expect(stated).toMatch(/third party who could fix the clocks/);
  });
});
