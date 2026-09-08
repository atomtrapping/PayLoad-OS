import { describe, expect, it } from 'vitest';
import { SHORTCUT_DESCRIPTION, detectPlatform, keysFor } from './platformKeys';

describe('the browser is asked, and the modern field is asked first', () => {
  it('reads every Apple platform string either field can carry', () => {
    for (const stated of ['macOS', 'MacIntel', 'Mac68K', 'iPhone', 'iPad', 'iPod touch']) {
      expect(detectPlatform({ platform: stated }), stated).toBe('APPLE');
      expect(detectPlatform({ userAgentData: { platform: stated } }), stated).toBe('APPLE');
    }
  });

  it('reads everything else as everything else', () => {
    for (const stated of ['Linux x86_64', 'Win32', 'Windows', 'Android', 'FreeBSD amd64', 'Chrome OS']) {
      expect(detectPlatform({ platform: stated }), stated).toBe('OTHER');
    }
  });

  it('prefers navigator.userAgentData, which is the field that is not deprecated', () => {
    expect(detectPlatform({ userAgentData: { platform: 'macOS' }, platform: 'Win32' })).toBe('APPLE');
    expect(detectPlatform({ userAgentData: { platform: 'Windows' }, platform: 'MacIntel' })).toBe('OTHER');
  });

  it('says UNKNOWN rather than guessing when nothing has been said', () => {
    // A guess here prints a key that is not on the reader's keyboard, which is
    // the defect this module exists to remove rather than to relocate.
    expect(detectPlatform(undefined)).toBe('UNKNOWN');
    expect(detectPlatform({})).toBe('UNKNOWN');
    expect(detectPlatform({ platform: '' })).toBe('UNKNOWN');
    expect(detectPlatform({ userAgentData: {} })).toBe('UNKNOWN');
  });
});

describe('what each platform is told', () => {
  it('names the keys that are on that keyboard', () => {
    expect(keysFor('APPLE')).toMatchObject({ mod: '⌘', alt: '⌥' });
    expect(keysFor('OTHER')).toMatchObject({ mod: 'Ctrl', alt: 'Alt' });
  });

  it('names both keys while nothing has been said, because both work', () => {
    // Not a hedge: the palette listens for metaKey OR ctrlKey, so this is the
    // accurate statement under uncertainty rather than a fallback. It is what
    // the server renders, and what a browser that will not say keeps.
    expect(keysFor('UNKNOWN')).toMatchObject({ mod: '⌘/Ctrl', alt: 'Alt/⌥', paletteChord: '⌘/Ctrl K' });
  });

  it('writes the palette chord the way each platform writes it', () => {
    // A symbol sits against its letter and a word does not, so this is not the
    // modifier with a K appended: `CtrlK` is not a thing anyone writes.
    expect(keysFor('APPLE').paletteChord).toBe('⌘K');
    expect(keysFor('OTHER').paletteChord).toBe('Ctrl K');
  });

  it('names both keys to a reader who cannot see the screen, without detecting anything', () => {
    // The listeners take metaKey or ctrlKey, and altKey is what Option sets,
    // so both are true statements on either machine and neither needs a guess.
    expect(SHORTCUT_DESCRIPTION.palette).toMatch(/Command or Control/);
    expect(SHORTCUT_DESCRIPTION.step).toMatch(/Alt or Option/);
  });
});
