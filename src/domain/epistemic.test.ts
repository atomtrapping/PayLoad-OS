/**
 * The scale is a projection, and the two mappings that carry doctrine.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EPISTEMIC_LOSS, EPISTEMIC_MEANING, EPISTEMIC_OF_BLOCKING, EPISTEMIC_OF_FIELD_PRESENCE, EPISTEMIC_OF_LAYER_STATE,
  EPISTEMIC_OF_PROJECTION, EPISTEMIC_OF_RECORD_STATUS, EPISTEMIC_STATES, EPISTEMIC_STROKE,
  epistemicOfReading, type Epistemic,
} from './epistemic';

describe('a retraction is drawn as a withdrawal and never as a refusal', () => {
  it('keeps WITHDRAWN-IS-NOT-FALSE at the rendering step, where it would be easiest to lose', () => {
    expect(EPISTEMIC_OF_RECORD_STATUS.RETRACTED).toBe('WITHDRAWN');
    expect(EPISTEMIC_OF_RECORD_STATUS.SUPERSEDED).toBe('WITHDRAWN');
    expect(EPISTEMIC_OF_RECORD_STATUS.RETRACTED).not.toBe('REFUSED');
    // And they are told apart by more than hue: a double rule, not a solid one.
    expect(EPISTEMIC_STROKE.WITHDRAWN).toBe('DOUBLE');
    expect(EPISTEMIC_STROKE.REFUSED).toBe('SOLID');
  });

  it('keeps the three absences of a document grammar apart', () => {
    expect(EPISTEMIC_OF_FIELD_PRESENCE.ABSENT).toBe('UNKNOWN');
    expect(EPISTEMIC_OF_FIELD_PRESENCE.MALFORMED).toBe('REFUSED');
    expect(EPISTEMIC_OF_FIELD_PRESENCE.AMBIGUOUS).toBe('REFUSED');
    expect(EPISTEMIC_OF_FIELD_PRESENCE.PRESENT).toBe('DECLARED');
  });
});

describe('an unreadable count is not a zero', () => {
  it('draws UNKNOWN for what could not be read and MEASURED for a zero that was', () => {
    expect(epistemicOfReading('UNKNOWN')).toBe('UNKNOWN');
    expect(epistemicOfReading(0)).toBe('MEASURED');
    expect(epistemicOfReading(1)).toBe('MEASURED');
    expect(EPISTEMIC_STROKE.UNKNOWN).toBe('DASHED');
  });
});

describe('the scale is complete and carries a second channel', () => {
  it('gives every state a meaning and a stroke', () => {
    for (const state of EPISTEMIC_STATES) {
      expect(EPISTEMIC_MEANING[state].length).toBeGreaterThan(0);
      expect(['SOLID', 'DASHED', 'DOUBLE']).toContain(EPISTEMIC_STROKE[state]);
    }
    expect(EPISTEMIC_STATES).toHaveLength(6);
  });

  it('uses every state it declares, so the scale has no ornamental member', () => {
    const used = new Set<Epistemic>([
      ...Object.values(EPISTEMIC_OF_RECORD_STATUS),
      ...Object.values(EPISTEMIC_OF_LAYER_STATE),
      ...Object.values(EPISTEMIC_OF_FIELD_PRESENCE),
      ...Object.values(EPISTEMIC_OF_PROJECTION),
      ...Object.values(EPISTEMIC_OF_BLOCKING),
      epistemicOfReading(0), epistemicOfReading('UNKNOWN'),
    ]);
    expect([...used].sort()).toEqual([...EPISTEMIC_STATES].sort());
  });
});

describe('a pair with no key reads as unknown, not as a refusal or a distance', () => {
  it('draws NOT_KEYABLE hollow rather than as either co-located or apart', () => {
    expect(EPISTEMIC_OF_BLOCKING.NOT_KEYABLE).toBe('UNKNOWN');
    expect(EPISTEMIC_OF_BLOCKING.NOT_KEYABLE).not.toBe('REFUSED');
    expect(EPISTEMIC_OF_BLOCKING.NOT_KEYABLE).not.toBe(EPISTEMIC_OF_BLOCKING.NOT_CO_LOCATED);
  });

  it('draws a blocking result as derived, so it never borrows the standing of a reading', () => {
    expect(EPISTEMIC_OF_BLOCKING.CO_LOCATED).toBe('DERIVED');
    expect(EPISTEMIC_OF_BLOCKING.NOT_CO_LOCATED).toBe('DERIVED');
    expect(EPISTEMIC_OF_BLOCKING.NO_TIME_OVERLAP).toBe('DERIVED');
    expect(Object.values(EPISTEMIC_OF_BLOCKING)).not.toContain('MEASURED');
  });
});

describe('the stylesheet draws the scale the module declares', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8');

  it('defines a token for every state, and no token for a state that does not exist', () => {
    const declared = [...css.matchAll(/--ep-([a-z]+):/g)].map((match) => match[1].toUpperCase());
    expect(declared.sort()).toEqual([...EPISTEMIC_STATES].sort());
  });

  it('gives the two hollow-and-doubled states their non-colour channel in CSS', () => {
    expect(css).toMatch(/\[data-epistemic='UNKNOWN'\][^}]*border-style: dashed/);
    expect(css).toMatch(/\[data-epistemic='WITHDRAWN'\][^}]*border-style: double/);
  });

  /** Decoration takes no hue: the frame, rule, grid and tick draw from neutral tokens. */
  it('draws its chrome in border tokens rather than in the epistemic scale', () => {
    const chrome = css.slice(css.indexOf('.hud-ground'), css.indexOf('.hud-readout'));
    expect(chrome).toMatch(/rgba\(255, 255, 255/);
    expect(chrome).not.toMatch(/--ep-(measured|derived|declared|refused|withdrawn)/);
  });
});

describe('what the scale gives up', () => {
  it('states its losses, beginning with not being a new vocabulary', () => {
    expect(EPISTEMIC_LOSS[0]).toMatch(/not a seventh vocabulary/);
    expect(EPISTEMIC_LOSS.join(' ')).toMatch(/never the only channel/);
    expect(EPISTEMIC_LOSS.join(' ')).toMatch(/Decoration takes no hue/);
  });
});
