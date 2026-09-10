/**
 * Whose question `fixture_only` is.
 *
 * The failure this closes was live on the branch: the marker was derived from
 * `origin.kind === 'LIVE'` — a fact about the connection — while the same
 * committed demonstration corpus was separately being seeded into a live
 * PostgreSQL. Together those mean the identical synthetic records come out
 * marked when read from memory and unmarked when read from the database.
 *
 * Nothing about the material changed. Only where the bytes were sitting. A
 * system whose entire thesis is that a record must carry what it is cannot
 * lose that marker to a deployment decision.
 */
import { describe, expect, it } from 'vitest';
import { carriesDemonstrationMaterial, envelope } from './feedShapes';

const DEMONSTRATION = { fixture_only: true } as const;
const CAPTURED = { fixture_only: false } as const;

describe('the marker is a property of the material', () => {
  /* The exact case the connection-derived version got wrong. */
  it('marks demonstration rows however live the connection serving them is', () => {
    expect(carriesDemonstrationMaterial([DEMONSTRATION], false)).toBe(true);
    expect(carriesDemonstrationMaterial([DEMONSTRATION, DEMONSTRATION], false)).toBe(true);
  });

  it('clears the marker only when every answering row says it was captured', () => {
    expect(carriesDemonstrationMaterial([CAPTURED], true)).toBe(false);
    expect(carriesDemonstrationMaterial([CAPTURED, CAPTURED], true)).toBe(false);
  });

  /*
   * A mixed payload is a marked payload. One demonstration release among live
   * ones still means the reader is holding synthetic material, and the count of
   * live rows beside it does not make that less true.
   */
  it('marks a payload that carries any demonstration row at all', () => {
    expect(carriesDemonstrationMaterial([CAPTURED, DEMONSTRATION], false)).toBe(true);
    expect(carriesDemonstrationMaterial([DEMONSTRATION, CAPTURED], false)).toBe(true);
  });

  it('ignores rows that are absent rather than counting them either way', () => {
    expect(carriesDemonstrationMaterial([undefined, DEMONSTRATION, null], false)).toBe(true);
    expect(carriesDemonstrationMaterial([undefined, CAPTURED, null], true)).toBe(false);
  });
});

describe('where no row can answer', () => {
  /*
   * An empty list is not evidence of a live capture. It is the absence of
   * evidence, and this repository's standing rule about that applies to its own
   * payloads: silence is not a zero, and silence is not a capture either.
   */
  it('falls back to the source declaration, and falls safe', () => {
    expect(carriesDemonstrationMaterial([], true)).toBe(true);
    expect(carriesDemonstrationMaterial([], false)).toBe(false);
    expect(carriesDemonstrationMaterial([undefined, undefined], true)).toBe(true);
  });

  /* A row present but silent about itself has not said it was captured. */
  it('does not read a missing field as a captured record', () => {
    expect(carriesDemonstrationMaterial([{}], false)).toBe(false);
    expect(carriesDemonstrationMaterial([{ fixture_only: 'true' }], false)).toBe(false);
  });
});

describe('the envelope', () => {
  it('carries the marker and the notice when the material is a demonstration', () => {
    const body = envelope({ count: 0 }, undefined, { demonstration: true });
    expect(body).toMatchObject({ fixture_only: true, count: 0 });
    expect((body as { notice: string }).notice).toContain('Demonstration corpus');
  });

  it('omits both only on an explicit statement that the material was captured', () => {
    expect(envelope({ count: 0 }, undefined, { demonstration: false })).not.toHaveProperty('fixture_only');
  });

  /*
   * The default direction matters more than it looks. A caller that forgets to
   * say gets the marker, because an unmarked payload is the one that misleads.
   */
  it('marks a payload whose caller said nothing', () => {
    expect(envelope({ count: 0 })).toHaveProperty('fixture_only', true);
    expect(envelope({ count: 0 }, undefined, {})).toHaveProperty('fixture_only', true);
  });
});
