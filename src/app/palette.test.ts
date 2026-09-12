import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The estate's theme block clears Tailwind's default palette before it
// declares the named colours (`--color-*: initial`), so a default-palette
// utility written anywhere in the tree compiles to nothing. This test finds
// such a utility at the source, naming the file and the class, rather than
// letting it reach a build as a silently unstyled element.

const ROOT = join(__dirname, '..');

const PALETTE =
  'white|black|neutral|gray|slate|zinc|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const PREFIX =
  'bg|text|border|ring|divide|from|to|via|fill|stroke|accent|outline|decoration|placeholder|shadow|caret|inset-ring';
const DEFAULT_PALETTE_UTILITY = new RegExp(
  `(?:^|[\\s"'\`:])(?:[a-z-]+:)*(?:${PREFIX})-(?:${PALETTE})(?:-[0-9]{2,3})?(?:/[0-9]{1,3})?(?=$|[\\s"'\`])`,
  'g',
);

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      yield* sourceFiles(path);
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      yield path;
    }
  }
}

describe('the default palette is cleared, and nothing asks for it', () => {
  it('clears Tailwind’s default palette in the theme block', () => {
    const css = readFileSync(join(ROOT, 'app', 'globals.css'), 'utf8');
    const theme = css.slice(css.indexOf('@theme inline {'));
    expect(theme.indexOf('--color-*: initial;')).toBeGreaterThan(0);
    expect(theme.indexOf('--color-*: initial;')).toBeLessThan(theme.indexOf('--color-background'));
  });

  it('no source module uses a default-palette utility', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(ROOT)) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(DEFAULT_PALETTE_UTILITY)) {
        offenders.push(`${file.slice(ROOT.length + 1)}: ${match[0].trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no source module writes a literal colour inline', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(ROOT)) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(/style=\{\{[^}]*?(?:color|background|border(?:Color)?)\s*:\s*['"]#[0-9a-fA-F]{3,8}['"]/g)) {
        offenders.push(`${file.slice(ROOT.length + 1)}: ${match[0].slice(0, 80)}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
