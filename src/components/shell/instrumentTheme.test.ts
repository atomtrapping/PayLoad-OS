/** Static token checks, not a substitute for rendered accessibility testing. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8');
// Top-level screen roots only; print and responsive overrides are indented.
const tokens = new Map([...css.matchAll(/^:root\s*\{([\s\S]*?)^\}/gm)]
  .flatMap((root) => [...root[1].matchAll(/(--[a-z0-9-]+):\s*(#[a-f\d]{6});/gi)]
    .map((match) => [match[1], match[2]] as const)));

function rgb(token: string): number[] {
  const hex = tokens.get(token);
  if (!hex) throw new Error(`Missing opaque theme token: ${token}`);
  return [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
}

function contrast(foreground: number[], background: number[]): number {
  const luminance = (channels: number[]) => channels
    .map((c) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe('opaque instrument grounds and navigation contrast', () => {
  const grounds = ['void', 'primary', 'secondary', 'tertiary', 'raised', 'inset'];
  it.each(grounds)('keeps all four text roles legible on the %s ground', (ground) => {
    for (const role of ['primary', 'secondary', 'muted', 'heading']) {
      expect(contrast(rgb(`--text-${role}`), rgb(`--bg-${ground}`)), role).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(grounds)('retains readable status, assurance, check and epistemic labels on %s', (ground) => {
    const labels = [...tokens.keys()].filter((token) => /^--(status|assurance|check|ep)-/.test(token));
    expect(labels.length).toBeGreaterThan(20);
    for (const label of labels) {
      expect(contrast(rgb(label), rgb(`--bg-${ground}`)), label).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps dark navigation text readable on the chrome band and selected product', () => {
    for (const background of ['--chrome-rail', '--accent']) {
      expect(contrast(rgb('--chrome-ink'), rgb(background))).toBeGreaterThanOrEqual(7);
    }
  });

  it('retains secondary text contrast over the command palette selection tint', () => {
    const selected = rgb('--bg-raised').map((c, index) => c * 0.9 + rgb('--accent')[index] * 0.1);
    expect(contrast(rgb('--text-secondary'), selected)).toBeGreaterThanOrEqual(4.5);
  });
});
