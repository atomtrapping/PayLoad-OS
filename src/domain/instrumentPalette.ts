/**
 * What the colour channel is carrying, measured rather than judged by eye.
 *
 * The instrument language declares that hue is a channel: on an air-traffic
 * screen it says which class of traffic, here it says how a thing came to be
 * known. A channel can only say one thing at a time. This module asks whether
 * it does.
 *
 * THE ESTATE HAS SIX COLOUR VOCABULARIES, NOT ONE
 *
 * Brand chrome, identifiers, ruling status, assurance level, invariant result
 * and the epistemic scale each name their own hues, and they were each chosen
 * on their own. Nothing until now measured them against each other. Measured,
 * twenty-six declared meanings resolve to eleven distinguishable hues, so the
 * channel is oversubscribed better than two to one and a reader who sees a
 * colour cannot recover which vocabulary is speaking.
 *
 * That is the estate's own error class arriving at the pixel: a coincidence
 * read as evidence. Three vocabularies drawing their favourable outcome in one
 * green invites the reading that admitted, verified and passed are one fact.
 * They are three facts about three different things, and the palette is the
 * only layer that says otherwise.
 *
 * WHAT THIS MODULE DOES, AND WHAT IT DELIBERATELY DOES NOT
 *
 * It does not repaint anything. A hue is a design decision and belongs to
 * whoever owns the surface. What it does is make every sharing DECLARED rather
 * than accidental — the same move the estate makes everywhere else — by
 * holding the partition the palette actually has and the reading of each part.
 * A family is either ONE_MEANING (the members say the same thing and the estate
 * intends one hue) or MANY_MEANINGS (they do not, and it stands recorded until
 * somebody rules). Today one family of eleven is ONE_MEANING.
 *
 * Because the declaration is the measured partition, it fails in both
 * directions. A new token that lands inside an existing family fails the
 * build until somebody says which reading it takes. A hue that is separated
 * later leaves its declaration stale, and that fails too, so a fix cannot
 * leave a false record of a tension behind it. The decision is forced rather
 * than defaulted, which is what the exhaustive `Record` does one layer up.
 *
 * THE METRIC IS STATED, NOT ASSUMED
 *
 * Distance is CIELAB dE*76 against the D65 white point. It is the crude member
 * of the family — dE*00 corrects it for the eye's non-uniformity in the blues
 * and near neutrals — and it is chosen because the question here is not "are
 * these a perfect match" but "could a reader take one for the other", where
 * the coarse metric is sufficient and cheap to reproduce in one function that
 * anyone can check. The floor is a declared threshold, not a perceptual law:
 * below it two hues are held to be one signal on this estate.
 */

/**
 * The separation at which two hues are held to be different signals here.
 *
 * dE*76 of about 2.3 is the classical just-noticeable difference for two
 * patches touching each other. Nothing on these surfaces touches: a status
 * chip and a navigation underline sit a screen apart, recalled from memory
 * rather than compared side by side, over a near-black ground, at eleven
 * pixels. Twenty is roughly an order above the JND and is the point at which
 * the estate is willing to say a reader recalling one would not reach for the
 * other. It is a decision, and it is written here so that it is arguable.
 */
export const SEPARATION_FLOOR = 20;

/** What a hue-bearing token is for. CHROME says nothing about the content it decorates. */
export type PaletteRole = 'CHROME' | 'MEANING';

export interface PaletteToken {
  /** The CSS custom property, exactly as globals.css declares it. */
  readonly token: string;
  /** The vocabulary it belongs to. Tokens in one vocabulary are meant to be told apart. */
  readonly vocabulary: string;
  readonly role: PaletteRole;
  /** What a reader who sees this hue is entitled to conclude. */
  readonly says: string;
}

/**
 * Every hue-bearing token on the workspace ground, and what it claims.
 *
 * The print block's overrides are out of scope: paper is a different ground
 * with its own contrast problem, and its hues are re-chosen there for ink.
 */
export const PALETTE_TOKENS: readonly PaletteToken[] = Object.freeze([
  { token: '--accent', vocabulary: 'BRAND', role: 'CHROME', says: 'Nothing about the content. The page you are on, a primary action, a focus ring, a selected row.' },
  { token: '--accent-strong', vocabulary: 'BRAND', role: 'CHROME', says: 'Nothing about the content. The lit form of the brand hue on a pressed or primary control.' },
  { token: '--accent-dim', vocabulary: 'BRAND', role: 'CHROME', says: 'Nothing about the content. The brand hue held back where it must not compete.' },
  { token: '--info', vocabulary: 'IDENTIFIER', role: 'MEANING', says: 'This is an identifier or a reference, not a value somebody measured.' },
  { token: '--status-draft', vocabulary: 'RULING_STATUS', role: 'MEANING', says: 'A ruling exists in draft. Nobody has been asked to stand behind it.' },
  { token: '--status-evaluating', vocabulary: 'RULING_STATUS', role: 'MEANING', says: 'A ruling is under evaluation now.' },
  { token: '--status-pending', vocabulary: 'RULING_STATUS', role: 'MEANING', says: 'A ruling is awaited and has not been made.' },
  { token: '--status-admitted', vocabulary: 'RULING_STATUS', role: 'MEANING', says: 'The gate admitted this record.' },
  { token: '--status-conditional', vocabulary: 'RULING_STATUS', role: 'MEANING', says: 'The gate admitted this record with conditions. The conditions are unmet until discharged.' },
  { token: '--status-refused', vocabulary: 'RULING_STATUS', role: 'MEANING', says: 'The gate declined. No row was yielded and the reason travels with the refusal.' },
  { token: '--status-superseded', vocabulary: 'RULING_STATUS', role: 'MEANING', says: 'A later record took this one’s place. The support moved; it was not removed.' },
  { token: '--status-revoked', vocabulary: 'RULING_STATUS', role: 'MEANING', says: 'The ruling was revoked by the authority that made it.' },
  { token: '--assurance-unverified', vocabulary: 'ASSURANCE', role: 'MEANING', says: 'Nobody has checked this. Not a finding that it is wrong.' },
  { token: '--assurance-reviewed', vocabulary: 'ASSURANCE', role: 'MEANING', says: 'A party reviewed it and recorded that they did.' },
  { token: '--assurance-verified', vocabulary: 'ASSURANCE', role: 'MEANING', says: 'A party verified it against something outside the claim.' },
  { token: '--assurance-witnessed', vocabulary: 'ASSURANCE', role: 'MEANING', says: 'A party was present for it and their identity is carried.' },
  { token: '--check-passed', vocabulary: 'INVARIANT', role: 'MEANING', says: 'This invariant was evaluated and held.' },
  { token: '--check-failed', vocabulary: 'INVARIANT', role: 'MEANING', says: 'This invariant was evaluated and did not hold.' },
  { token: '--check-na', vocabulary: 'INVARIANT', role: 'MEANING', says: 'This invariant does not apply here. A determination, not an absence of one.' },
  { token: '--check-not-evaluated', vocabulary: 'INVARIANT', role: 'MEANING', says: 'This invariant was not evaluated. Fail-closed: it is not a pass.' },
  { token: '--ep-measured', vocabulary: 'EPISTEMIC', role: 'MEANING', says: 'Read from a source. Somebody observed this.' },
  { token: '--ep-derived', vocabulary: 'EPISTEMIC', role: 'MEANING', says: 'Computed here from records the corpus holds.' },
  { token: '--ep-declared', vocabulary: 'EPISTEMIC', role: 'MEANING', says: 'A party asserts it, and it is carried as their claim.' },
  { token: '--ep-unknown', vocabulary: 'EPISTEMIC', role: 'MEANING', says: 'Not readable from here. The absence of a reading.' },
  { token: '--ep-refused', vocabulary: 'EPISTEMIC', role: 'MEANING', says: 'A gate declined, and the reason travels with the refusal.' },
  { token: '--ep-withdrawn', vocabulary: 'EPISTEMIC', role: 'MEANING', says: 'Support was removed and nothing was put in its place.' },
]);

/** How the estate reads a set of tokens that a reader cannot tell apart. */
export type SharingReading =
  /** They say the same thing, and one hue for them is intended. */
  | 'ONE_MEANING'
  /** They say different things and are drawn alike anyway. Recorded, not accepted. */
  | 'MANY_MEANINGS'
  /** One token holds the hue alone. Nothing is shared, and a newcomer here is news. */
  | 'SOLE';

export interface HueFamily {
  readonly id: string;
  readonly reading: SharingReading;
  /** Why it reads that way. On MANY_MEANINGS, what a reader loses. */
  readonly because: string;
  /** Every token within the floor of the others, in the order globals.css declares them. */
  readonly tokens: readonly string[];
}

/**
 * The partition the palette actually has, with a reading for each part.
 *
 * Six families are shared and five are sole. One sharing is intended. The other
 * five are the estate's colour channel carrying more than one meaning, written
 * down here so that the next one cannot arrive without a decision.
 */
export const DECLARED_FAMILIES: readonly HueFamily[] = Object.freeze([
  {
    id: 'GOLD',
    reading: 'MANY_MEANINGS',
    because: 'Brand chrome and three meanings share one hue, and two of the tokens are byte-identical to the chrome. The load-bearing loss is the middle tier of the two-tier accent rule: ADMITTED_WITH_CONDITIONS is drawn amber precisely to say that nothing is settled, and it arrives in the same colour as the underline that says which page you are on. A reader cannot tell an unmet condition from a navigation state, and the tier that exists to withhold a conclusion is spent on decoration.',
    tokens: ['--accent', '--accent-strong', '--status-conditional', '--assurance-reviewed', '--ep-declared'],
  },
  {
    id: 'CYAN',
    reading: 'MANY_MEANINGS',
    because: 'An identifier, a ruling under evaluation, a witnessed assurance and a value computed here are one hue. The instrument language already recorded that links are cyan too, disambiguated only by an underline, which makes this family five readings deep. Computed-here and observed-by-a-witness are opposite ends of the epistemic question, and here they are the same colour.',
    tokens: ['--info', '--status-evaluating', '--assurance-witnessed', '--ep-derived'],
  },
  {
    id: 'GREY',
    reading: 'MANY_MEANINGS',
    because: 'Four different absences drawn as one. NOT_APPLICABLE is a determination that the invariant does not apply — somebody ruled — while UNKNOWN is no reading at all, and draft and unverified are lifecycle facts about who has looked. UNTESTED IS NOT AGREEMENT and NOT_ASSESSABLE IS NOT AGREEMENT are kept apart by every layer beneath and flattened here. UNKNOWN alone recovers itself, by the dashed stroke the epistemic scale gives it.',
    tokens: ['--status-draft', '--assurance-unverified', '--check-na', '--ep-unknown'],
  },
  {
    id: 'GREEN',
    reading: 'MANY_MEANINGS',
    because: 'Admitted, verified and passed in one green. Three vocabularies drawing their favourable outcome alike invites the reading that they agree, when they are three findings about three different things — a gate, a party and an invariant. This is the two-tier accent rule at the pixel: overlapping is plain and never green, because absence of contradiction is not presence of support, and a hue shared across vocabularies manufactures exactly that support.',
    tokens: ['--status-admitted', '--assurance-verified', '--check-passed'],
  },
  {
    id: 'CORAL',
    reading: 'MANY_MEANINGS',
    because: 'A gate declining, an invariant not holding and the epistemic state of a refusal. The mildest of the five, because the three are close in kind, and still a flattening: REFUSED IS NOT FALSE. A refusal yields no row and says nothing about the world; a failed invariant is a finding about the world. Drawn alike, the refusal reads as an adverse result.',
    tokens: ['--status-refused', '--check-failed', '--ep-refused'],
  },
  {
    id: 'BLUE',
    reading: 'ONE_MEANING',
    because: 'A ruling that is pending and an invariant that was not evaluated say the same thing: the evaluation has not happened, and fail-closed forbids reading either as a pass. One hue for one meaning is the channel working.',
    tokens: ['--status-pending', '--check-not-evaluated'],
  },
  { id: 'GOLD_DIM', reading: 'SOLE', because: 'The held-back brand hue, far enough from the gold family to be its own signal.', tokens: ['--accent-dim'] },
  { id: 'SIGNAL_GREEN', reading: 'SOLE', because: 'MEASURED holds its hue alone, clear of the outcome green by more than the floor.', tokens: ['--ep-measured'] },
  { id: 'VIOLET', reading: 'SOLE', because: 'WITHDRAWN holds its hue alone, and is double-ruled besides, so a retraction never reads as a refusal.', tokens: ['--ep-withdrawn'] },
  { id: 'LILAC', reading: 'SOLE', because: 'SUPERSEDED holds its hue alone. Near the withdrawn violet in kind and clear of it by the floor.', tokens: ['--status-superseded'] },
  { id: 'ROSE', reading: 'SOLE', because: 'A revoked ruling holds its hue alone, clear of the refusal coral.', tokens: ['--status-revoked'] },
]);

const HEX = /^#[0-9a-fA-F]{6}$/;

function linearize(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function pivot(ratio: number): number {
  return ratio > 216 / 24389 ? Math.cbrt(ratio) : (24389 / 27) * ratio / 116 + 16 / 116;
}

/** CIELAB under D65. Refuses anything that is not a six-digit hex rather than answering for it. */
export function toLab(hex: string): readonly [number, number, number] {
  if (!HEX.test(hex)) throw new Error(`A colour is measured from a six-digit hex and ${JSON.stringify(hex)} is not one.`);
  const [r, g, b] = [1, 3, 5].map((at) => linearize(parseInt(hex.slice(at, at + 2), 16) / 255));
  const x = pivot((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047);
  const y = pivot(r * 0.2126 + g * 0.7152 + b * 0.0722);
  const z = pivot((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/** dE*76 between two hexes. The metric is declared in this module's head. */
export function deltaE(a: string, b: string): number {
  const [la, aa, ba] = toLab(a);
  const [lb, ab, bb] = toLab(b);
  return Math.hypot(la - lb, aa - ab, ba - bb);
}

/**
 * The families the palette actually has: single linkage at the floor.
 *
 * Single linkage rather than a centroid because the question is transitive in
 * the way confusion is — if a reader cannot tell A from B and cannot tell B
 * from C, the channel has one signal across all three whatever A and C measure.
 * Tokens are returned in the order they were given, and families in the order
 * their first member appears, so the result is stable enough to compare
 * against a written declaration.
 */
export function measuredFamilies(hues: ReadonlyMap<string, string>): string[][] {
  const tokens = [...hues.keys()];
  const parent = new Map(tokens.map((token) => [token, token]));
  const find = (token: string): string => {
    let at = token;
    while (parent.get(at) !== at) at = parent.get(at)!;
    return at;
  };
  for (const [i, left] of tokens.entries()) {
    for (const right of tokens.slice(i + 1)) {
      if (deltaE(hues.get(left)!, hues.get(right)!) < SEPARATION_FLOOR) parent.set(find(left), find(right));
    }
  }
  const grouped = new Map<string, string[]>();
  for (const token of tokens) {
    const root = find(token);
    const family = grouped.get(root);
    if (family) family.push(token);
    else grouped.set(root, [token]);
  }
  return [...grouped.values()];
}

export type PaletteFaultKind =
  /** A token the palette carries that PALETTE_TOKENS does not declare, or the reverse. */
  | 'UNDECLARED_TOKEN'
  /** Tokens a reader cannot tell apart that no declared family holds together. */
  | 'UNDECLARED_SHARING'
  /** A declared family whose members have since separated. The record is stale. */
  | 'STALE_SHARING';

export interface PaletteFault {
  readonly kind: PaletteFaultKind;
  readonly tokens: readonly string[];
  readonly because: string;
}

/**
 * Every way the palette on disk and the declaration here disagree.
 *
 * Empty is the only passing answer, and both directions are faults. A new
 * sharing has to be read before it ships; a sharing that was resolved has to
 * stop being recorded as a tension, because a stale record of a problem is a
 * claim about the estate that is no longer true.
 */
export function paletteFaults(hues: ReadonlyMap<string, string>): PaletteFault[] {
  const faults: PaletteFault[] = [];
  const declaredTokens = new Set(PALETTE_TOKENS.map((entry) => entry.token));
  const missing = [...hues.keys()].filter((token) => !declaredTokens.has(token));
  const absent = [...declaredTokens].filter((token) => !hues.has(token));
  if (missing.length) faults.push({ kind: 'UNDECLARED_TOKEN', tokens: missing, because: 'The palette carries a hue this module does not declare, so nothing has said what a reader may conclude from it.' });
  if (absent.length) faults.push({ kind: 'UNDECLARED_TOKEN', tokens: absent, because: 'This module declares a token the palette no longer carries, so the declaration describes a surface that is gone.' });
  if (missing.length || absent.length) return faults;

  const key = (tokens: readonly string[]) => [...tokens].sort().join(' ');
  const declared = new Map(DECLARED_FAMILIES.map((family) => [key(family.tokens), family]));
  const measured = new Map(measuredFamilies(hues).map((family) => [key(family), family]));
  for (const [id, family] of measured) {
    if (!declared.has(id)) {
      faults.push({
        kind: 'UNDECLARED_SHARING',
        tokens: family,
        because: family.length > 1
          ? 'These hues are within the separation floor of each other and no declared family holds them together. Somebody has to say whether they are one meaning or many before this ships.'
          : 'This hue stands alone and no declared family names it. A sole hue is still a declaration, because a newcomer joining it is the thing this check exists to catch.',
      });
    }
  }
  for (const [id, family] of declared) {
    if (!measured.has(id)) {
      faults.push({
        kind: 'STALE_SHARING',
        tokens: family.tokens,
        because: `The declared family ${family.id} is not the partition the palette has. Either a hue moved and this record is stale, or a token joined and the reading has to be made again.`,
      });
    }
  }
  return faults;
}

export const PALETTE_LOSS = [
  'Hue is measured against a stated metric and a stated floor, not judged by eye. dE*76 under D65, floor 20 — an order above the just-noticeable difference, because nothing on these surfaces is compared side by side.',
  'Every sharing is declared and read. Twenty-six meanings across six vocabularies resolve to eleven hues; one of the six shared families is intended and five are the channel carrying more than one meaning.',
  'The declaration fails in both directions. A new token inside an existing family fails the build until somebody reads it, and a family that separates leaves a stale record that fails too — so a fix cannot leave a false tension behind it.',
  'This module repaints nothing. A hue is a design decision and belongs to whoever owns the surface; what is added here is that the sharing is stated rather than accidental.',
  'Colour is never the only channel, and the recorded tensions are survivable because of it — UNKNOWN is dashed, WITHDRAWN is double-ruled, every state carries its word in the markup. A tension in the hue is a loss of density, not a loss of the distinction.',
] as const;
