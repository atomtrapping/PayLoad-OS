/**
 * The palette declaration measured against the stylesheet that ships.
 *
 * The module holds the rule and the reading; globals.css holds the hues. The
 * test is what joins them, so a hue that changes cannot leave the reading
 * behind. Node only — it reads a file.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DECLARED_FAMILIES, PALETTE_LOSS, PALETTE_TOKENS, SEPARATION_FLOOR, deltaE, measuredFamilies, paletteFaults, toLab } from './instrumentPalette';

/**
 * The hues the workspace ground actually declares.
 *
 * Only top-level `:root` blocks, which is what makes this correct rather than
 * approximately correct: the print override sits inside `@media print` and
 * re-chooses every status hue for ink on paper. Reading it here would measure
 * two grounds as one palette and report collisions that no screen has.
 */
function workspaceHues(): Map<string, string> {
  const css = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8').split('\n');
  const hues = new Map<string, string>();
  let inRoot = false;
  for (const line of css) {
    if (line.startsWith(':root {')) inRoot = true;
    else if (inRoot && line.startsWith('}')) inRoot = false;
    else if (inRoot) {
      const declaration = /^\s+(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{6});/.exec(line);
      if (declaration) hues.set(declaration[1], declaration[2].toLowerCase());
    }
  }
  return hues;
}

/** The hue-bearing tokens, which is every token this module claims to govern. */
function governedHues(): Map<string, string> {
  const all = workspaceHues();
  const governed = new Map<string, string>();
  for (const { token } of PALETTE_TOKENS) {
    const hue = all.get(token);
    if (hue) governed.set(token, hue);
  }
  // Anything in a governed vocabulary that the module forgot to declare must
  // still reach paletteFaults, or the check would pass by omission.
  const prefixes = ['--accent', '--info', '--status-', '--assurance-', '--check-', '--ep-'];
  for (const [token, hue] of all) {
    if (prefixes.some((prefix) => token.startsWith(prefix))) governed.set(token, hue);
  }
  return governed;
}

describe('the metric', () => {
  it('measures a colour against itself as zero and refuses what is not a colour', () => {
    expect(deltaE('#d4af37', '#d4af37')).toBe(0);
    expect(() => toLab('#abc')).toThrow(/six-digit hex/);
    expect(() => toLab('rebeccapurple')).toThrow(/six-digit hex/);
  });

  it('places black and white the full lightness range apart', () => {
    const [black] = toLab('#000000');
    const [white] = toLab('#ffffff');
    expect(black).toBeCloseTo(0, 6);
    expect(white).toBeCloseTo(100, 6);
  });

  it('is symmetric, because confusion is', () => {
    expect(deltaE('#4cc48a', '#3df08f')).toBeCloseTo(deltaE('#3df08f', '#4cc48a'), 12);
  });
});

describe('the partition', () => {
  it('is transitive: a chain of confusable hues is one signal end to end', () => {
    // The ends are past the floor from each other and would be two signals on
    // their own; each neighbour pair is inside it. Single linkage answers one
    // family, which is the claim: confusion carries along the chain.
    const chain = new Map([['--a', '#5a5a5a'], ['--b', '#767676'], ['--c', '#949494']]);
    expect(deltaE('#5a5a5a', '#949494')).toBeGreaterThan(SEPARATION_FLOOR);
    expect(deltaE('#5a5a5a', '#767676')).toBeLessThan(SEPARATION_FLOOR);
    expect(deltaE('#767676', '#949494')).toBeLessThan(SEPARATION_FLOOR);
    expect(measuredFamilies(chain)).toEqual([['--a', '--b', '--c']]);
  });

  it('separates hues past the floor', () => {
    const apart = new Map([['--a', '#3df08f'], ['--b', '#ff7a5c']]);
    expect(measuredFamilies(apart)).toEqual([['--a'], ['--b']]);
  });
});

describe('the palette that ships', () => {
  it('carries every governed token, and the module declares every one it carries', () => {
    const hues = governedHues();
    expect(hues.size).toBe(PALETTE_TOKENS.length);
    for (const { token } of PALETTE_TOKENS) expect(hues.get(token)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('has exactly the families this module declares, in both directions', () => {
    expect(paletteFaults(governedHues())).toEqual([]);
  });

  it('is oversubscribed: more declared meanings than distinguishable hues', () => {
    const families = measuredFamilies(governedHues());
    expect(families).toHaveLength(DECLARED_FAMILIES.length);
    expect(PALETTE_TOKENS.length).toBeGreaterThan(families.length);
  });

  it('holds brand chrome and the conditional ruling in one hue, which is the load-bearing tension', () => {
    const hues = governedHues();
    // Not "close": the same bytes. The middle tier of the two-tier accent rule
    // is the navigation underline.
    expect(hues.get('--status-conditional')).toBe(hues.get('--accent'));
    const gold = DECLARED_FAMILIES.find((family) => family.id === 'GOLD');
    expect(gold?.reading).toBe('MANY_MEANINGS');
    expect(gold?.tokens).toContain('--status-conditional');
    expect(gold?.tokens).toContain('--accent');
  });

  it('records the favourable-outcome green as a tension, because overlap is plain and never green', () => {
    const green = DECLARED_FAMILIES.find((family) => family.id === 'GREEN');
    expect(green?.reading).toBe('MANY_MEANINGS');
    expect(green?.tokens).toEqual(['--status-admitted', '--assurance-verified', '--check-passed']);
    expect(green?.because).toMatch(/absence of contradiction is not presence of support/);
  });

  it('keeps one sharing intended, so the reading is a judgement and not a blanket', () => {
    const intended = DECLARED_FAMILIES.filter((family) => family.reading === 'ONE_MEANING');
    expect(intended.map((family) => family.id)).toEqual(['BLUE']);
  });
});

describe('the declaration itself', () => {
  it('names every governed token exactly once, across the families and the token list', () => {
    const inFamilies = DECLARED_FAMILIES.flatMap((family) => family.tokens);
    expect(new Set(inFamilies).size).toBe(inFamilies.length);
    expect([...inFamilies].sort()).toEqual(PALETTE_TOKENS.map((entry) => entry.token).sort());
  });

  it('gives every family a reason a reader can argue with', () => {
    for (const family of DECLARED_FAMILIES) expect(family.because.length).toBeGreaterThan(60);
  });

  it('marks a sole family as SOLE and a shared one as read', () => {
    for (const family of DECLARED_FAMILIES) {
      if (family.tokens.length === 1) expect(family.reading).toBe('SOLE');
      else expect(family.reading).not.toBe('SOLE');
    }
  });

  it('says the chrome tokens say nothing about content', () => {
    const chrome = PALETTE_TOKENS.filter((entry) => entry.role === 'CHROME');
    expect(chrome.map((entry) => entry.token)).toEqual(['--accent', '--accent-strong', '--accent-dim']);
    for (const entry of chrome) expect(entry.says).toMatch(/^Nothing about the content\./);
  });

  it('states the metric and the floor in what it claims to hold', () => {
    expect(PALETTE_LOSS.join(' ')).toMatch(/dE\*76/);
    expect(PALETTE_LOSS.join(' ')).toMatch(new RegExp(`floor ${SEPARATION_FLOOR}`));
    expect(PALETTE_LOSS.join(' ')).toMatch(/repaints nothing/);
  });
});

describe('a fault is reported rather than passed over', () => {
  it('reports a token the palette carries and the module does not declare', () => {
    const hues = governedHues();
    hues.set('--status-invented', '#123456');
    expect(paletteFaults(hues).map((fault) => fault.kind)).toContain('UNDECLARED_TOKEN');
  });

  it('reports a new sharing when a hue is moved into an existing family', () => {
    const hues = governedHues();
    hues.set('--ep-withdrawn', hues.get('--status-superseded')!);
    const faults = paletteFaults(hues);
    expect(faults.map((fault) => fault.kind)).toContain('UNDECLARED_SHARING');
    expect(faults.some((fault) => fault.tokens.includes('--ep-withdrawn') && fault.tokens.includes('--status-superseded'))).toBe(true);
  });

  it('reports a stale record when a declared tension is resolved', () => {
    const hues = governedHues();
    // The fix this module exists to provoke: give the conditional ruling its
    // own hue, clear of the brand gold. The GOLD family stops being the
    // partition, and the record of it becomes a claim that is no longer true.
    hues.set('--status-conditional', '#c86bd8');
    const faults = paletteFaults(hues);
    expect(faults.map((fault) => fault.kind)).toContain('STALE_SHARING');
    expect(faults.some((fault) => fault.because.includes('GOLD'))).toBe(true);
  });
});
