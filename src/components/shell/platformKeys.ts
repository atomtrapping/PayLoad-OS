/**
 * Naming the modifier keys this machine actually has.
 *
 * The shell states its shortcuts where they are used, which is the right rule
 * and was being followed with the wrong words: every hint read `⌘K` and `Alt`,
 * on every machine. A reader on Linux or Windows has no ⌘ key, and a reader on
 * a Mac has Option rather than Alt — so a terminal that spends a great deal of
 * effort refusing to state what it has not established was stating, in its own
 * chrome, a key that is not on the keyboard in front of you.
 *
 * The behaviour is unchanged and was always right: the palette listens for
 * `metaKey || ctrlKey`, and `altKey` is what Option sets. Only the naming was
 * wrong, and only the naming is fixed here.
 *
 * WHAT AN UNKNOWN PLATFORM IS TOLD
 *
 * The server renders the same markup for every reader and cannot know which
 * keyboard is in front of any of them, so the first render names both keys —
 * `⌘/Ctrl K`. That is not a hedge and not a guess: the palette's listener takes
 * `metaKey || ctrlKey`, so both are true on either machine, and the reader is
 * told something correct rather than nothing. Once a browser has said which it
 * is, the hint narrows to the key that is actually there. It never widens back,
 * and it is never wrong on the way.
 *
 * A browser that answers neither field keeps the both-key form for good, which
 * is the right resting place: the shortcut still works and the reader is still
 * told how to reach it.
 */
import { useSyncExternalStore } from 'react';

export type Platform = 'APPLE' | 'OTHER' | 'UNKNOWN';

export interface PlatformKeys {
  /** What to print for the palette's modifier: the key that opens it here. */
  readonly mod: string;
  /** What to print for the rail's page-stepping modifier. */
  readonly alt: string;
  /**
   * The palette's chord as one printed token. A symbol sits against its letter
   * and a word does not: `⌘K` is how a Mac writes it and `CtrlK` is not a
   * thing anyone writes.
   */
  readonly paletteChord: string;
  readonly platform: Platform;
}

const KEYS: Record<Platform, PlatformKeys> = {
  APPLE: { mod: '⌘', alt: '⌥', paletteChord: '⌘K', platform: 'APPLE' },
  OTHER: { mod: 'Ctrl', alt: 'Alt', paletteChord: 'Ctrl K', platform: 'OTHER' },
  // Both, because both work. This is what the server renders and what a
  // browser that will not say keeps.
  UNKNOWN: { mod: '⌘/Ctrl', alt: 'Alt/⌥', paletteChord: '⌘/Ctrl K', platform: 'UNKNOWN' },
};

export const keysFor = (platform: Platform): PlatformKeys => KEYS[platform];

/** What both hints say to a reader who is not looking at the screen. Detection-free, because it names both. */
export const SHORTCUT_DESCRIPTION = {
  palette: 'Jump to a page. Keyboard shortcut: Command or Control K.',
  step: 'Alt or Option with the left and right arrows steps through the rail.',
} as const;

/**
 * Read the platform from a browser's own statement about itself.
 *
 * `navigator.platform` is deprecated and still the only thing every browser
 * answers, so the modern field is asked first and it is the fallback. Neither
 * is a fact about the keyboard — both are the browser's word for it — which is
 * why nothing here is written into a record and this lives beside the chrome.
 */
export function detectPlatform(agent: { userAgentData?: { platform?: string }; platform?: string } | undefined): Platform {
  if (!agent) return 'UNKNOWN';
  const stated = agent.userAgentData?.platform ?? agent.platform;
  if (typeof stated !== 'string' || stated === '') return 'UNKNOWN';
  // macOS, MacIntel, iPhone, iPad, iPod — and an iPad reporting MacIntel is
  // still an Apple keyboard layout, so one test covers both.
  return /^(mac|iphone|ipad|ipod)/i.test(stated) ? 'APPLE' : 'OTHER';
}

/**
 * The keys to print: both of them until a browser has said which one is here.
 *
 * `useSyncExternalStore` rather than state set from an effect, because that is
 * what this is: a read of something outside React that the server cannot see.
 * The server snapshot is the both-key form, so hydration matches; the client
 * snapshot is the machine's own answer, and React swaps to it in the same
 * commit rather than in a second render caused by a state write.
 *
 * The keyboard does not change under a running document, so the subscription is
 * a no-op — and the snapshot returns one of three frozen objects, never a fresh
 * one, which is what keeps a store with nothing to subscribe to from looping.
 */
const subscribe = () => () => {};
const clientKeys = () => keysFor(detectPlatform(typeof navigator === 'undefined' ? undefined : navigator));
const serverKeys = () => KEYS.UNKNOWN;

export function usePlatformKeys(): PlatformKeys {
  return useSyncExternalStore(subscribe, clientKeys, serverKeys);
}
