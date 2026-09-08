/**
 * The one module in this rail that runs a process, tested against the real one.
 *
 * These read this repository's own object store, which is available wherever
 * the suite runs because the suite runs inside it. That makes the tests
 * unusually strong: the value a claim carries is checked against what
 * `git rev-parse` says independently, rather than against a fixture that could
 * be wrong in the same direction as the code.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MAX_OBJECTS_PER_CAPTURE, OBJECT_NAME, SELF_CAPTURE_LOSS, SELF_CAPTURE_METHOD,
  SelfCaptureError, captureCommits, selfCaptureEnabled,
} from './selfCapture';

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const HEAD = git('rev-parse', 'HEAD');
const capture = (objectNames: readonly string[]) =>
  captureCommits({ objectNames, capturedAt: '2026-09-08T18:30:00.000Z', repository: 'notationsystems/NotationsOS' });

beforeEach(() => { vi.stubEnv('PAYLOAD_SELF_CAPTURE_LOCAL', '1'); });
afterEach(() => { vi.unstubAllEnvs(); });

describe('reading the real store, checked against git rather than against a fixture', () => {
  it('reads HEAD and carries the tree git independently reports', async () => {
    const result = await capture([HEAD]);
    expect(result.method).toBe(SELF_CAPTURE_METHOD);
    expect(result.observations).toHaveLength(1);
    expect(result.notRead).toEqual([]);
    const tree = result.observations[0].fields.find((entry) => entry.field === 'tree')!;
    expect(tree.value).toBe(git('rev-parse', 'HEAD^{tree}'));
  });

  it('carries the parent git independently reports', async () => {
    const [observation] = (await capture([HEAD])).observations;
    expect(observation.fields.find((entry) => entry.field === 'parents')!.value).toEqual([git('rev-parse', 'HEAD~1')]);
  });

  it('digests exactly the bytes git returned', async () => {
    const [observation] = (await capture([HEAD])).observations;
    const bytes = execFileSync('git', ['cat-file', 'commit', HEAD]);
    expect(observation.bytesDigest).toBe(`sha256:${createHash('sha256').update(bytes).digest('hex')}`);
  });

  it('declares the read as a store read rather than as a specimen', async () => {
    const [observation] = (await capture([HEAD])).observations;
    expect(observation.declaration.beganAs).toBe('OBJECT_STORE_READ');
    expect(observation.declaration.readBy).toBe(`git cat-file commit ${HEAD}`);
    expect(observation.declaration.capturedAt).toBe('2026-09-08T18:30:00.000Z');
  });
});

describe('a value that reaches an argv position is a name or it is refused', () => {
  // Each of these would be an instruction to git rather than an object to read.
  const notNames = ['--upload-pack=touch /tmp/pwned', '-c core.pager=sh', 'HEAD', 'HEAD~1', 'refs/heads/main',
    '../../etc/passwd', `${HEAD} --output=/tmp/x`, `${HEAD}\n--help`, HEAD.toUpperCase(), HEAD.slice(0, 39), `${HEAD}a`, ''];

  for (const value of notNames) {
    it(`refuses ${JSON.stringify(value.slice(0, 32))} without running anything`, async () => {
      const result = await capture([value]);
      expect(result.observations).toEqual([]);
      expect(result.notRead).toHaveLength(1);
      expect(result.notRead[0].because).toMatch(/refused rather than repaired/);
      expect(OBJECT_NAME.test(value)).toBe(false);
    });
  }

  it('refuses the bad name and still reads the good one in the same batch', async () => {
    const result = await capture(['--upload-pack=evil', HEAD]);
    expect(result.observations).toHaveLength(1);
    expect(result.notRead.map((entry) => entry.objectName)).toEqual(['--upload-pack=evil']);
    expect(result.because).toMatch(/1 of 2 objects read/);
  });

  it('reports a well-formed name that names nothing, rather than losing it silently', async () => {
    const absent = 'f'.repeat(40);
    const result = await capture([absent]);
    expect(result.observations).toEqual([]);
    expect(result.notRead[0].objectName).toBe(absent);
    // A capture that returned fewer objects than asked for without saying so
    // would be the one thing a capture must never be.
    expect(result.because).toMatch(/silent loss/);
  });
});

describe('the rail is the operator’s to switch on, and its batch is bounded', () => {
  it('refuses to read anything with the flag unset', async () => {
    vi.stubEnv('PAYLOAD_SELF_CAPTURE_LOCAL', '0');
    expect(selfCaptureEnabled()).toBe(false);
    await expect(capture([HEAD])).rejects.toMatchObject({ code: 'LOCAL_MODE_DISABLED', status: 403 });
  });

  it('refuses an empty capture', async () => {
    await expect(capture([])).rejects.toMatchObject({ code: 'NO_OBJECTS' });
  });

  it('refuses a batch larger than it publishes', async () => {
    const many = Array.from({ length: MAX_OBJECTS_PER_CAPTURE + 1 }, () => HEAD);
    await expect(capture(many)).rejects.toMatchObject({ code: 'TOO_MANY_OBJECTS', status: 413 });
  });

  it('is a typed refusal rather than a bare throw', async () => {
    await expect(capture([])).rejects.toBeInstanceOf(SelfCaptureError);
  });
});

describe('what the module is allowed to do at all', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/adapter/selfCapture.ts'), 'utf8');
  const body = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('reaches no network and writes nothing', async () => {
    expect(body).not.toMatch(/fetch\(|http|https|net\.|writeFile|rename|unlink|mkdir/);
  });

  it('runs git with no shell, and with a subcommand this file states as a literal', () => {
    expect(body).toMatch(/shell: false/);
    expect(body).toMatch(/\['cat-file', 'commit', objectName\]/);
    // No push, fetch, clone, checkout or config anywhere in the file.
    expect(body).not.toMatch(/'(push|fetch|clone|checkout|config|remote|reset)'/);
  });

  it('validates before it spawns, in that order', () => {
    // If the test above ever passes while this one fails, the guard has moved
    // below the thing it guards.
    expect(body.indexOf('OBJECT_NAME.test(objectName)')).toBeLessThan(body.indexOf("runGit(['cat-file'"));
  });

  it('consumes git’s stderr and never returns it', () => {
    expect(body).toMatch(/child\.stderr\.on\('data'/);
    expect(body).not.toMatch(/stderr[\s\S]{0,80}(reject|resolve|message:|because:)/);
  });

  it('says what a capture still does not establish', () => {
    expect(SELF_CAPTURE_LOSS.length).toBeGreaterThanOrEqual(5);
    const stated = SELF_CAPTURE_LOSS.join(' ');
    expect(stated).toMatch(/does not fetch, clone, push, or contact a remote/);
    expect(stated).toMatch(/off by default/);
  });
});
