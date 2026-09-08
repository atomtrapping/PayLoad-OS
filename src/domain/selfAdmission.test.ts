/**
 * The rail, run against this repository's own commits.
 *
 * This is the first source in the repository that reaches the gate on bytes
 * nobody had to be asked for. The tests that matter most are the ones that fail
 * closed: a self-reported field must never become a claim, a commit dated in
 * the future must be refused, and the build must not be able to admit itself.
 */
import { describe, expect, it } from 'vitest';

import { ADMISSION_METHOD, isAdmitting } from './admission';
import { COMMIT_FIELDS, observeCommit, type CommitObservation } from './selfObservation';
import {
  SELF_ADMISSION_LOSS, SELF_ADMISSION_METHOD, SELF_OBSERVATION_CONTEXT, SELF_PREDICATE,
  admitSelfBuild, buildSelfCandidates, registrationsFor, subjectFor,
} from './selfAdmission';
import { COMMIT_SPECIMENS, SPECIMEN_DECLARATION } from '@/fixtures/self/commits';

const HORIZON = '2026-09-08T18:00:00.000Z';
const RULED_AT = '2026-09-08T18:00:00.000Z';
const AUTHORITY = 'role:corpus-steward';

const observed = (): CommitObservation[] =>
  COMMIT_SPECIMENS.map((specimen) => observeCommit(specimen.bytes, specimen.objectName, SPECIMEN_DECLARATION, specimen.bytesDigest));

const build = (over: Partial<Parameters<typeof buildSelfCandidates>[0]> = {}) =>
  buildSelfCandidates({ buildId: 'build-self-1', knownThrough: HORIZON, observations: observed(), provenanceClass: 'LIVE_CAPTURE', ...over });

const rule = (authority = AUTHORITY) => admitSelfBuild(build(), authority, RULED_AT);

describe('the first source in this repository that reaches the gate on its own bytes', () => {
  it('admits every content-derived claim from three real commits', () => {
    const receipt = rule();
    expect(receipt.counts.observations).toBe(3);
    expect(receipt.counts.candidates).toBe(8);
    expect(receipt.counts.admitted).toBe(8);
    expect(receipt.counts.refused).toBe(0);
    expect(receipt.counts.rows).toBe(8);
    expect(receipt.refusalTally).toEqual([]);
  });

  it('writes a row whose value is the tree SHA a reader can recompute', () => {
    const receipt = rule();
    const root = COMMIT_SPECIMENS.find((specimen) => specimen.shape.startsWith('A root'))!;
    const row = receipt.rows.find((entry) => entry.recordId === `self:${root.objectName}#tree`)!;
    expect(row.subjectCanonicalId).toBe(subjectFor(root.objectName));
    expect(row.subjectId).toBe(root.objectName);
    expect(row.predicate).toBe('repository.commit.tree');
    // The tree header of that exact object, and nothing was invented to get it.
    expect(row.value).toBe(root.bytes.match(/^tree ([0-9a-f]{40})$/m)![1]);
  });

  it('admits with conditions rather than unconditionally, because the context declares two', () => {
    for (const ruling of rule().rulings) {
      expect(isAdmitting(ruling.outcome)).toBe(true);
      expect(ruling.outcome).toBe('ADMITTED_WITH_CONDITIONS');
    }
    expect(SELF_OBSERVATION_CONTEXT.conditions.length).toBe(2);
  });
});

describe('a self-reported field never becomes a claim, at any stage', () => {
  it('declares a predicate only for content-derived fields', () => {
    for (const field of Object.keys(SELF_PREDICATE)) {
      expect(COMMIT_FIELDS[field as keyof typeof COMMIT_FIELDS].basis, field).toBe('CONTENT_DERIVED');
    }
    // And for every one of them, so nothing content-derived is quietly dropped.
    const derived = Object.entries(COMMIT_FIELDS).filter(([, declared]) => declared.basis === 'CONTENT_DERIVED').map(([name]) => name);
    expect(Object.keys(SELF_PREDICATE).sort()).toEqual(derived.sort());
  });

  it('writes no row whose predicate mentions an author, a message or a time', () => {
    const predicates = rule().rows.map((row) => row.predicate);
    expect(predicates).not.toContain('repository.commit.message');
    for (const predicate of predicates) expect(predicate).toMatch(/^repository\.commit\.(tree|parents|parent_count)$/);
  });

  it('never offers a self-reported field to the projection, so it cannot be skipped for want of a predicate', () => {
    // Two independent barriers stop these fields: this rail does not offer
    // them, and no predicate is declared for them. A test that only watched
    // the second would pass with the first removed — it did, until this one.
    // What is skipped here is skipped for want of a VALUE, never a predicate.
    for (const member of build().members) {
      const skippedFields = member.skipped.map((entry) => entry.field);
      for (const field of ['message', 'authorIdentity', 'authoredAt', 'committerIdentity', 'committedAt', 'signature']) {
        expect(skippedFields, `${field} reached the projection`).not.toContain(field);
      }
      for (const entry of member.skipped) expect(entry.because, entry.field).toMatch(/states no value/);
    }
  });

  it('carries the withheld fields on the build so a reader sees what was read and not asserted', () => {
    for (const member of build().members) {
      expect([...member.withheld].sort()).toEqual(['authorIdentity', 'authoredAt', 'committedAt', 'committerIdentity', 'message', 'signature']);
    }
  });

  it('puts no committer name or message text anywhere in an admitted row', () => {
    const serialized = JSON.stringify(rule().rows);
    expect(serialized).not.toContain('noreply@anthropic.com');
    expect(serialized).not.toContain('Scaffold Payload OS');
  });
});

describe('the timestamp is used to test itself and never repeated', () => {
  /** The same bytes with the committer line moved to an instant after the capture. */
  function futureDated(): CommitObservation {
    const specimen = COMMIT_SPECIMENS[2];
    const bytes = specimen.bytes.replace(/^committer (.*) (\d+) ([+-]\d{4})$/m, 'committer $1 4102444800 $3');
    return observeCommit(bytes, specimen.objectName, SPECIMEN_DECLARATION, specimen.bytesDigest);
  }

  it('refuses a commit dated after the capture, on the source clock', () => {
    // git commit --date accepts any instant, so this is a real shape and not a
    // hypothetical. The gate catches it because the rail hands over the stated
    // time to be checked.
    const receipt = admitSelfBuild(build({ observations: [futureDated()] }), AUTHORITY, RULED_AT);
    expect(receipt.counts.admitted).toBe(0);
    expect(receipt.refusalTally.map((entry) => entry.check)).toContain('SOURCE_CLOCK_COHERENT');
  });

  it('asserts nothing about that object rather than accepting its date', () => {
    const receipt = admitSelfBuild(build({ observations: [futureDated()] }), AUTHORITY, RULED_AT);
    expect(receipt.rows).toEqual([]);
  });

  it('sets valid time to the capture, not to anything a committer stated', () => {
    const [candidate] = build().members[0].candidates;
    expect(candidate.validFrom).toBe(SPECIMEN_DECLARATION.capturedAt);
    expect(candidate.knownAt).toBe(SPECIMEN_DECLARATION.capturedAt);
    // The stated instant is carried for the check and is not the onset.
    expect(candidate.sourceTime).not.toBe(candidate.validFrom);
  });
});

describe('identity comes from the content, and still goes through the resolver', () => {
  it('binds each object name to a subject on a registration the reader can check', () => {
    const registrations = registrationsFor(observed());
    expect(registrations).toHaveLength(3);
    for (const registration of registrations) {
      expect(registration.family).toBe('GIT_OBJECT');
      expect(registration.canonicalId).toBe(subjectFor(registration.value));
      expect(registration.evidenceRecordId).toBe(`record:git-object:${registration.value}`);
    }
  });

  it('refuses to resolve against a registration the corpus did not yet hold', () => {
    // The bitemporal rule is not relaxed because the identifier certifies
    // itself: a binding knowable only later cannot answer a question asked now.
    const later = registrationsFor(observed()).map((entry) => ({ ...entry, knownAt: '2027-01-01T00:00:00.000Z' }));
    const withoutRegistry = build({ registry: later });
    for (const member of withoutRegistry.members) expect(member.resolution.outcome).toBe('UNRESOLVED');
    expect(admitSelfBuild(withoutRegistry, AUTHORITY, RULED_AT).refusalTally.map((entry) => entry.check)).toContain('SUBJECT_IDENTIFIED');
  });

  it('resolves nothing for an object no registration names', () => {
    const [first, ...rest] = observed();
    const partial = build({ observations: [first], registry: registrationsFor(rest) });
    expect(partial.members[0].resolution.outcome).toBe('UNRESOLVED');
  });
});

describe('the horizon and the authority are the caller’s, and both are enforced', () => {
  it('excludes an observation captured after the knowledge horizon', () => {
    const early = buildSelfCandidates({
      buildId: 'build-self-early', knownThrough: '2026-01-01T00:00:00.000Z',
      observations: observed(), provenanceClass: 'LIVE_CAPTURE',
    });
    expect(early.members).toHaveLength(0);
    expect(early.excluded).toHaveLength(3);
    expect(early.excluded[0].because).toMatch(/later than the horizon/);
    expect(early.candidateCount).toBe(0);
  });

  it('says an empty build is not a clean one', () => {
    const receipt = admitSelfBuild(build({ observations: [] }), AUTHORITY, RULED_AT);
    expect(receipt.counts.candidates).toBe(0);
    expect(receipt.because).toMatch(/An empty build is not a clean one/);
  });

  it('refuses when the authority is the admission method itself', () => {
    // Observing itself does not make this repository the party that may rule
    // its own observations into the corpus.
    const receipt = rule(ADMISSION_METHOD);
    expect(receipt.counts.admitted).toBe(0);
    expect(receipt.refusalTally.map((entry) => entry.check)).toContain('AUTHORITY_IS_NOT_THE_PROCESS');
  });

  it('leaves the build UNADMITTED, because producing candidates is not admitting them', () => {
    expect(build().state).toBe('UNADMITTED');
    expect(build().method).toBe(SELF_ADMISSION_METHOD);
    expect(build().because).toMatch(/nothing here rules on its own output/);
  });

  it('declares provenance per build rather than inferring it from a clock gap', () => {
    for (const candidate of build({ provenanceClass: 'BACKFILLED' }).members[0].candidates) {
      expect(candidate.provenanceClass).toBe('BACKFILLED');
    }
  });
});

describe('what an admitted row still does not settle', () => {
  it('says the corpus read the store, not when the object was made', () => {
    expect(SELF_ADMISSION_LOSS.length).toBeGreaterThanOrEqual(7);
    const stated = SELF_ADMISSION_LOSS.join(' ');
    expect(stated).toMatch(/does not take a party’s word for its own clock/);
    expect(stated).toMatch(/corroboration and not supersession/);
    expect(stated).toMatch(/A tree is named and never walked/);
  });

  it('does not claim the commits were good, or that anything about them passed', () => {
    expect(rule().because).toMatch(/does not say the commits were good, that their tests passed/);
  });
});
