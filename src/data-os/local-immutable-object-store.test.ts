import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalImmutableObjectStore, localObjectDestination } from './local-immutable-object-store';
import { MAX_OBJECT_BYTES, objectDigest } from './immutable-object-store';

let root: string;
const payload = Buffer.from('synthetic internal artifact');
const digest = objectDigest(payload);
const key = 'sha256/' + digest.slice(7) + '.json';
const signal = () => new AbortController().signal;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'payload-immutable-object-test-')); });
afterEach(() => {
  const target = resolve(root);
  expect(dirname(target)).toBe(resolve(tmpdir()));
  expect(basename(target).startsWith('payload-immutable-object-test-')).toBe(true);
  rmSync(target, { recursive: true, force: true });
});

describe('local immutable object custody', () => {
  it('conditionally publishes and exactly reads a receipt across instances', async () => {
    const first = new LocalImmutableObjectStore(root);
    const receipt = await first.ensure(key, payload, signal());
    expect(receipt).toEqual({ schema: 'payload.object-custody.v1', provider: 'local',
      destination: localObjectDestination(root), key, contentDigest: digest, byteLength: payload.length, versionId: null });
    const restarted = new LocalImmutableObjectStore(root);
    expect(await restarted.ensure(key, payload, signal())).toEqual(receipt);
    expect(await restarted.readReceipt(receipt, signal())).toEqual(payload);
    expect(await restarted.get(key, 100, signal())).toEqual(payload);
  });
  it('uses the same destination for equivalent resolved roots without creating storage', async () => {
    const missing = join(root, 'missing'); const instance = new LocalImmutableObjectStore(missing);
    expect(instance.destination).toBe(localObjectDestination(join(root, 'child', '..', 'missing')));
    expect(await instance.get(key, 100, signal())).toBeNull();
    expect(existsSync(missing)).toBe(false);
    expect(() => localObjectDestination('')).toThrow('OBJECT_ROOT_REQUIRED');
  });
  it('copies caller bytes and does not overwrite or repair a corrupt object', async () => {
    const instance = new LocalImmutableObjectStore(root); const content = Buffer.from(payload);
    const pending = instance.ensure(key, content, signal()); content.fill(0);
    const receipt = await pending; expect(await instance.readReceipt(receipt, signal())).toEqual(payload);
    const target = join(root, ...key.split('/')); writeFileSync(target, 'corrupt');
    await expect(instance.ensure(key, payload, signal())).rejects.toThrow('conflict');
    await expect(instance.get(key, 100, signal())).rejects.toThrow('OBJECT_INTEGRITY_FAILED');
    await expect(instance.readReceipt(receipt, signal())).rejects.toThrow('OBJECT_INTEGRITY_FAILED');
    expect(readFileSync(target, 'utf8')).toBe('corrupt');
  });
  it('supports safe named paths but still verifies their exact receipt digest', async () => {
    const instance = new LocalImmutableObjectStore(root); const named = 'warehouse/corpus/metadata/v1.json';
    const receipt = await instance.ensure(named, payload, signal());
    writeFileSync(join(root, ...named.split('/')), Buffer.alloc(payload.length, 65));
    await expect(instance.readReceipt(receipt, signal())).rejects.toThrow('OBJECT_INTEGRITY_FAILED');
  });
  it('binds a receipt to destination/provider/key/digest/length/version', async () => {
    const instance = new LocalImmutableObjectStore(root); const receipt = await instance.ensure(key, payload, signal());
    for (const change of [{ destination: 'other' }, { provider: 'exoscale-sos' as const }, { versionId: 'remote-v1' },
      { contentDigest: 'invalid' }, { byteLength: -1 }, { key: '../outside' }]) {
      await expect(instance.readReceipt({ ...receipt, ...change }, signal())).rejects.toThrow();
    }
    await expect(instance.readReceipt({ ...receipt, contentDigest: 'sha256:' + 'f'.repeat(64) }, signal())).rejects.toThrow('OBJECT_INTEGRITY_FAILED');
  });
  it.each(['../escape', '/absolute', 'a//b', 'a%2fb', 'a?b', 'a\\b', 'con', 'a.'])('refuses unsafe object key %s', async (bad) => {
    await expect(new LocalImmutableObjectStore(root).ensure(bad, payload, signal())).rejects.toThrow('OBJECT_KEY_INVALID');
  });
  it('enforces byte ceilings and digest-addressed input consistency', async () => {
    const instance = new LocalImmutableObjectStore(root);
    await expect(instance.ensure(key, Buffer.alloc(MAX_OBJECT_BYTES + 1), signal())).rejects.toThrow('OBJECT_BYTES_INVALID');
    await expect(instance.ensure(key, Buffer.from('wrong'), signal())).rejects.toThrow('OBJECT_INTEGRITY_FAILED');
    await instance.ensure(key, payload, signal());
    await expect(instance.get(key, 1, signal())).rejects.toThrow();
    for (const max of [0, -1, Infinity, MAX_OBJECT_BYTES + 1]) {
      await expect(instance.get(key, max, signal())).rejects.toThrow('OBJECT_BYTES_INVALID');
    }
  });
  it('does not publish with a pre-aborted signal', async () => {
    const missing = join(root, 'missing');
    await expect(new LocalImmutableObjectStore(missing).ensure(key, payload, AbortSignal.abort())).rejects.toThrow('OBJECT_CANCELLED');
    expect(existsSync(missing)).toBe(false);
  });
  it('deduplicates concurrent ensure calls without a mutable overwrite path', async () => {
    const first = new LocalImmutableObjectStore(root); const second = new LocalImmutableObjectStore(root);
    const receipts = await Promise.all([first.ensure(key, payload, signal()), second.ensure(key, payload, signal())]);
    expect(receipts[0]).toEqual(receipts[1]);
  });
});
