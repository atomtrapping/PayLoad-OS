import { describe, expect, it } from 'vitest';
import { CARD_LOSS, CARD_METHOD, DIVERGENCE_MEANING, GRADE_MEANING, cardGrade, divergenceOf, gradeAll, lineageGrade, type ComputationArtifact } from './computationCard';

const D1 = 'a'.repeat(64), D2 = 'b'.repeat(64), OUT = 'c'.repeat(64);

function artifact(over: Partial<ComputationArtifact> = {}): ComputationArtifact {
  return {
    artifactId: 'art-1',
    method: { id: 'notationsos.clearance', version: '1.4.0' },
    executor: { id: 'gat', version: '3.2.1' },
    arithmetic: 'FIXED_POINT',
    inputs: [{ id: 'in-a', digest: D1, reference: `sha256:${D1}` }],
    outputDigest: OUT,
    ...over,
  };
}

describe('a computation as a card, not as a proof', () => {
  it('grades an artifact card grade when it can be re-run from itself alone', () => {
    const verdict = cardGrade(artifact());
    expect(verdict.grade).toBe('CARD_GRADE');
    expect(verdict.missing).toEqual([]);
    expect(verdict.because).toMatch(/a machine that does not exist yet/);
    // And says immediately that this is not an endorsement.
    expect(verdict.because).toMatch(/says nothing about whether the computation was right/);
    expect(CARD_METHOD).toMatch(/\.v1$/);
    expect(GRADE_MEANING.CARD_GRADE).toMatch(/same bytes/);
  });

  it('drops floating point to replayable-here, citing the drift this system already observed', () => {
    const floating = cardGrade(artifact({ arithmetic: 'FLOATING_POINT' }));
    expect(floating.grade).toBe('REPLAYABLE_HERE');
    expect(floating.because).toMatch(/different covariance bytes under a different BLAS dispatch/);
    expect(floating.because).toMatch(/under a declared execution envelope and not by the artifact alone/);
    const undeclared = cardGrade(artifact({ arithmetic: 'UNDECLARED' }));
    expect(undeclared.grade).toBe('REPLAYABLE_HERE');
    expect(undeclared.because).toMatch(/arithmetic class is not declared/);
    expect(CARD_LOSS.join(' ')).toMatch(/Floating point does not fail loudly/);
  });

  it('refuses a reference a later reader could not resolve, and names each fault', () => {
    const byPath = cardGrade(artifact({ inputs: [{ id: 'in-a', digest: D1, reference: '/var/data/scan.las' }] }));
    expect(byPath.grade).toBe('LOG_ONLY');
    expect(byPath.missing.join(' ')).toMatch(/referenced by location .*which names a machine rather than a content/);

    const byUrl = cardGrade(artifact({ inputs: [{ id: 'in-a', digest: D1, reference: 'https://example.test/scan.las' }] }));
    expect(byUrl.grade).toBe('LOG_ONLY');

    const moving = cardGrade(artifact({ inputs: [{ id: 'in-a', digest: D1, reference: 'release/latest' }] }));
    expect(moving.missing.join(' ')).toMatch(/moving target/);

    const unfixed = cardGrade(artifact({ inputs: [{ id: 'in-a', digest: null, reference: `sha256:${D1}` }] }));
    expect(unfixed.missing.join(' ')).toMatch(/named but not fixed by a digest/);

    expect(cardGrade(artifact({ inputs: [] })).missing.join(' ')).toMatch(/no inputs are declared/);
    expect(cardGrade(artifact({ outputDigest: null })).missing.join(' ')).toMatch(/could not be compared against anything/);
  });

  it('treats a version range as no version at all', () => {
    expect(cardGrade(artifact({ executor: { id: 'gat', version: '^3.2.1' } })).missing.join(' ')).toMatch(/is a range, and a range is not a version/);
    expect(cardGrade(artifact({ method: { id: 'm', version: 'latest' } })).missing.join(' ')).toMatch(/moving target/);
    expect(cardGrade(artifact({ method: { id: 'm', version: '  ' } })).missing.join(' ')).toMatch(/named without a version/);
    expect(cardGrade(artifact({ executor: null })).missing.join(' ')).toMatch(/the executor is not named/);
  });

  it('orders the card-grade first, so a reader sees what survives before what does not', () => {
    const graded = gradeAll([
      artifact({ artifactId: 'art-log', outputDigest: null }),
      artifact({ artifactId: 'art-float', arithmetic: 'FLOATING_POINT' }),
      artifact({ artifactId: 'art-card' }),
    ]);
    expect(graded.map((row) => row.artifact.artifactId)).toEqual(['art-card', 'art-float', 'art-log']);
  });

  it('says a grade is not an endorsement and no proof is wanted', () => {
    const loss = CARD_LOSS.join(' ');
    expect(loss).toMatch(/A grade is not an endorsement/);
    expect(loss).toMatch(/No proof is involved and none is wanted/);
    expect(loss).toMatch(/asks to be re-run, which is a stronger thing to offer an auditor and a weaker thing to claim/);
    expect(loss).toMatch(/An artifact can be card grade and describe a computation nobody should have run/);
    expect(loss).toMatch(/Not everything should be a card/);
  });
});

describe('what a frozen artifact can and cannot isolate', () => {
  const replayed = { inputDigests: { 'in-a': D1 }, outputDigest: OUT };

  it('isolates changed inputs before asking anything else', () => {
    const reading = divergenceOf(artifact(), { inputDigests: { 'in-a': D2 }, outputDigest: OUT }, false);
    expect(reading.divergence).toBe('INPUTS_CHANGED');
    expect(reading.needsReference).toBe(false);
    expect(reading.because).toMatch(/in-a is not the input this artifact was frozen over/);
    expect(reading.because).toMatch(/not evidence about the new inputs/);
  });

  it('calls the same inputs landing elsewhere an unstable execution, not a finding about the world', () => {
    const reading = divergenceOf(artifact(), { inputDigests: { 'in-a': D1 }, outputDigest: D2 }, false);
    expect(reading.divergence).toBe('EXECUTION_UNSTABLE');
    expect(reading.needsReference).toBe(false);
    expect(reading.because).toMatch(/not reproducible where it claimed to be/);
    expect(reading.because).toMatch(/not a finding about the world/);
  });

  it('refuses to separate a changed world from a wrong model, because the artifact mirrors the model', () => {
    // The sharp limit: with everything pinned and fresh evidence still
    // disagreeing, exact execution of a wrong model looks exactly like
    // faithful execution against a world that moved.
    const reading = divergenceOf(artifact(), replayed, false);
    expect(reading.divergence).toBe('WORLD_OR_MODEL');
    expect(reading.needsReference).toBe(true);
    expect(reading.because).toMatch(/a frozen trace cannot tell those apart/);
    expect(DIVERGENCE_MEANING.WORLD_OR_MODEL).toMatch(/mirrors the model, not the world/);
    expect(CARD_LOSS.join(' ')).toMatch(/a changed world and a wrong model look identical/);
  });

  it('claims nothing about the world when no fresh evidence was offered', () => {
    const silent = divergenceOf(artifact(), replayed, null);
    expect(silent.divergence).toBe('NONE');
    expect(silent.because).toMatch(/No fresh evidence was offered, so nothing is claimed about the world/);
    expect(divergenceOf(artifact(), replayed, true).divergence).toBe('NONE');
  });
});

describe('a card is only as archivable as its weakest input', () => {
  it('takes the chain down to its worst graded link', () => {
    const two = artifact({ inputs: [
      { id: 'in-a', digest: D1, reference: `sha256:${D1}` },
      { id: 'in-b', digest: D2, reference: `sha256:${D2}` },
    ] });
    expect(cardGrade(two).grade).toBe('CARD_GRADE');
    const chain = lineageGrade(two, { 'in-a': 'CARD_GRADE', 'in-b': 'REPLAYABLE_HERE' });
    expect(chain.grade).toBe('REPLAYABLE_HERE');
    expect(chain.weakest).toEqual({ inputId: 'in-b', grade: 'REPLAYABLE_HERE' });
    expect(chain.because).toMatch(/only as archivable as its weakest input, however well it was frozen itself/);
  });

  it('does not raise a chain above the artifact itself', () => {
    const floating = artifact({ arithmetic: 'FLOATING_POINT' });
    expect(lineageGrade(floating, { 'in-a': 'CARD_GRADE' }).grade).toBe('REPLAYABLE_HERE');
  });

  it('treats an ungraded input as unknown rather than fine', () => {
    const chain = lineageGrade(artifact(), {});
    expect(chain.grade).toBe('LOG_ONLY');
    expect(chain.unknown).toEqual(['in-a']);
    expect(chain.because).toMatch(/An ungraded input is unknown rather than fine/);
    expect(CARD_LOSS.join(' ')).toMatch(/unknown, never fine/);
  });
});
