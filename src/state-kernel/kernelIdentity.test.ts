import { closeSync, ftruncateSync, lstatSync, mkdirSync, mkdtempSync, openSync, realpathSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { kernelIdentity } from './runtime';

const temporaryBase = realpathSync(tmpdir());
const prefix = 'notations-kernel-identity-';
let temporary: string;
let executable: string;
beforeEach(() => {
  temporary = mkdtempSync(join(temporaryBase, prefix));
  executable = join(temporary, 'native', 'state-kernel', 'target', 'debug',
    process.platform === 'win32' ? 'notations-state-kernel.exe' : 'notations-state-kernel');
  mkdirSync(dirname(executable), { recursive: true });
  vi.spyOn(process, 'cwd').mockReturnValue(temporary);
});
afterEach(() => {
  vi.restoreAllMocks();
  expect(dirname(temporary)).toBe(temporaryBase);
  expect(basename(temporary).startsWith(prefix)).toBe(true);
  expect(realpathSync(temporary)).toBe(temporary);
  expect(lstatSync(temporary).isSymbolicLink()).toBe(false);
  rmSync(temporary, { recursive: true });
});

describe('save-local executable content identity', () => {
  it('detects same-size changes even with the original timestamp restored', () => {
    writeFileSync(executable, 'content-A');
    const stat = statSync(executable);
    const first = kernelIdentity();
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(kernelIdentity()).toBe(first);
    writeFileSync(executable, 'content-B');
    utimesSync(executable, stat.atime, stat.mtime);
    expect(kernelIdentity()).not.toBe(first);
    writeFileSync(executable, 'content-A');
    expect(kernelIdentity()).toBe(first);
  });

  it('disables reuse for a missing executable', () => {
    expect(kernelIdentity()).toBeNull();
  });

  it('disables reuse for a non-file executable', () => {
    mkdirSync(executable);
    expect(kernelIdentity()).toBeNull();
  });

  it('bounds fingerprint reads to 32 MiB without making it a replay input limit', () => {
    const file = openSync(executable, 'wx');
    try { ftruncateSync(file, 32 * 1024 * 1024 + 1); }
    finally { closeSync(file); }
    expect(kernelIdentity()).toBeNull();
  });
});
