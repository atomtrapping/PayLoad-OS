import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runBoundedProcess, type ProcessFailure } from './boundedProcess';
import { operatingSnapshot } from './policy';

const native = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: native.spawn }));
class Child extends EventEmitter {
  stdin = Object.assign(new EventEmitter(), { end: vi.fn() });
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  kill = vi.fn();
}
let children: Child[];
beforeEach(() => {
  children = [];
  native.spawn.mockImplementation(() => { const child = new Child(); children.push(child); return child; });
  vi.stubEnv('PAYLOAD_EXECUTION_PROFILE', 'conserve');
});

describe('bounded transport operating observations', () => {
  it('counts UTF-8 stdin bytes, observed output on both pipes, and zero-exit completion', async () => {
    const before = operatingSnapshot().pools.production;
    const first = runBoundedProcess({ ...request, input: '\u00e9\ud83e\udd88' });
    children[0].stdout.emit('data', Buffer.from('result'));
    children[0].stderr.emit('data', Buffer.from('note'));
    const active = operatingSnapshot().pools.production;
    expect(active.active).toBe(1);
    expect(active.bytes.stdinSubmitted - before.bytes.stdinSubmitted).toBe(6);
    expect(active.bytes.stdoutObserved - before.bytes.stdoutObserved).toBe(6);
    expect(active.bytes.stderrObserved - before.bytes.stderrObserved).toBe(4);
    children[0].emit('close', 0);
    await first;
    const closed = operatingSnapshot().pools.production;
    expect(closed.attempted - before.attempted).toBe(1);
    expect(closed.admitted - before.admitted).toBe(1);
    expect(closed.closed - before.closed).toBe(1);
    expect(closed.succeeded - before.succeeded).toBe(1);
    expect(closed.failures).toEqual(before.failures);
    expect(closed.durationMs.closedCount - before.durationMs.closedCount).toBe(1);
    expect(closed.active).toBe(0);
  });

  it('separates refusals from process failures and does not submit refused inputs', async () => {
    const before = operatingSnapshot().pools.kernel;
    const first = runBoundedProcess(request);
    expect(() => runBoundedProcess({ ...request, pool: 'kernel' })).toThrow('BUSY');
    vi.stubEnv('PAYLOAD_EXECUTION_PROFILE', 'private-config');
    expect(() => runBoundedProcess({ ...request, pool: 'kernel' })).toThrow('CONFIG_INVALID');
    const after = operatingSnapshot().pools.kernel;
    expect(after.attempted - before.attempted).toBe(2);
    expect(after.refused.busy - before.refused.busy).toBe(1);
    expect(after.refused.configInvalid - before.refused.configInvalid).toBe(1);
    expect(after.admitted).toBe(before.admitted);
    expect(after.closed).toBe(before.closed);
    expect(after.bytes).toEqual(before.bytes);
    expect(after.failures).toEqual(before.failures);
    children[0].emit('close', 0);
    await first;
  });

  it('observes failed spawn with no stdin submission and one released lease', async () => {
    const before = operatingSnapshot().pools.production;
    native.spawn.mockImplementationOnce(() => { throw new Error('private path'); });
    await expect(runBoundedProcess(request)).rejects.toThrow('UNAVAILABLE');
    const after = operatingSnapshot().pools.production;
    expect(after.admitted - before.admitted).toBe(1);
    expect(after.closed - before.closed).toBe(1);
    expect(after.failures.unavailable - before.failures.unavailable).toBe(1);
    expect(after.succeeded).toBe(before.succeeded);
    expect(after.bytes).toEqual(before.bytes);
    expect(after.active).toBe(0);
  });

  it.each(['child', 'stdin', 'stdout', 'stderr'] as const)('records one unavailable outcome on %s error, retaining lease until close', async (stream) => {
    const before = operatingSnapshot().pools.production;
    const first = runBoundedProcess(request);
    const check = expect(first).rejects.toThrow('UNAVAILABLE');
    const child = children[0];
    (stream === 'child' ? child : child[stream]).emit('error', new Error('private diagnostics'));
    await check;
    child.emit('error', new Error('second error'));
    const waiting = operatingSnapshot().pools.production;
    expect(waiting.failures.unavailable - before.failures.unavailable).toBe(1);
    expect(waiting.activeWork).toEqual([{ ageMs: expect.any(Number), settled: true, outcome: 'UNAVAILABLE' }]);
    child.emit('close', 1); child.emit('close', 0);
    const closed = operatingSnapshot().pools.production;
    expect(closed.closed - before.closed).toBe(1);
    expect(closed.failures.exit).toBe(before.failures.exit);
    expect(closed.succeeded).toBe(before.succeeded);
  });

  it.each(['STDOUT_LIMIT', 'STDERR_LIMIT'] as const)('counts the complete crossing chunk and discarded late output after %s', async (reason) => {
    const before = operatingSnapshot().pools.production;
    const first = runBoundedProcess(request);
    const check = expect(first).rejects.toThrow(reason);
    const child = children[0];
    const firstPipe = reason === 'STDOUT_LIMIT' ? child.stderr : child.stdout;
    const crossingPipe = reason === 'STDOUT_LIMIT' ? child.stdout : child.stderr;
    firstPipe.emit('data', Buffer.alloc(10));
    crossingPipe.emit('data', Buffer.alloc(7));
    await check;
    child.stdout.emit('data', Buffer.alloc(3));
    child.stderr.emit('data', Buffer.alloc(4));
    const waiting = operatingSnapshot().pools.production;
    expect(waiting.bytes.stdoutObserved - before.bytes.stdoutObserved).toBe(reason === 'STDOUT_LIMIT' ? 10 : 13);
    expect(waiting.bytes.stderrObserved - before.bytes.stderrObserved).toBe(reason === 'STDOUT_LIMIT' ? 14 : 11);
    expect(waiting.failures[reason === 'STDOUT_LIMIT' ? 'stdoutLimit' : 'stderrLimit'] - before.failures[reason === 'STDOUT_LIMIT' ? 'stdoutLimit' : 'stderrLimit']).toBe(1);
    expect(waiting.activeWork).toEqual([{ ageMs: expect.any(Number), settled: true, outcome: reason }]);
    child.emit('close', null);
    child.stdout.emit('data', Buffer.alloc(100));
    child.stderr.emit('data', Buffer.alloc(100));
    expect(operatingSnapshot().pools.production.bytes).toEqual(waiting.bytes);
  });

  it('keeps timed-out failed-kill work visible until late close and counts its full lifetime', async () => {
    vi.useFakeTimers();
    const clock = vi.spyOn(performance, 'now').mockReturnValue(1000);
    const before = operatingSnapshot().pools.production;
    const first = runBoundedProcess(request);
    const check = expect(first).rejects.toThrow('TIMEOUT');
    const child = children[0];
    child.kill.mockImplementation(() => { throw new Error('private kill failure'); });
    try {
      clock.mockReturnValue(1100);
      await vi.advanceTimersByTimeAsync(100);
      await check;
      clock.mockReturnValue(1450);
      child.stdout.emit('data', Buffer.alloc(5));
      expect(() => runBoundedProcess(request)).toThrow('BUSY');
      const waiting = operatingSnapshot().pools.production;
      expect(waiting.activeWork).toEqual([{ ageMs: 450, settled: true, outcome: 'TIMEOUT' }]);
      expect(waiting.closed).toBe(before.closed);
      expect(waiting.failures.timeout - before.failures.timeout).toBe(1);
      expect(waiting.bytes.stdoutObserved - before.bytes.stdoutObserved).toBe(5);
      clock.mockReturnValue(1600);
      child.emit('close', null); child.emit('close', null);
      const closed = operatingSnapshot().pools.production;
      expect(closed.durationMs.total - before.durationMs.total).toBe(600);
      expect(closed.durationMs.last).toBe(600);
      expect(closed.closed - before.closed).toBe(1);
      expect(closed.active).toBe(0);
    } finally { clock.mockRestore(); }
  });

  it.each([1, null])('counts exit %s as a transport exit failure while leaving the result contract unchanged', async (code) => {
    const before = operatingSnapshot().pools.production;
    const first = runBoundedProcess(request);
    children[0].stdout.emit('data', Buffer.from('reject'));
    children[0].emit('close', code);
    expect(await first).toEqual({ code, stdout: Buffer.from('reject') });
    const after = operatingSnapshot().pools.production;
    expect(after.failures.exit - before.failures.exit).toBe(1);
    expect(after.succeeded).toBe(before.succeeded);
  });

  it('serializes no command, argument, payload, pipe content, environment value or error detail', async () => {
    const secret = 'PRIVATE_SENTINEL_123';
    const first = runBoundedProcess({ ...request, executable: secret, args: [secret], input: secret, env: { NODE_ENV: 'test', TOKEN: secret }, maxOutputBytes: 100 });
    const check = expect(first).rejects.toThrow('UNAVAILABLE');
    children[0].stdout.emit('data', Buffer.from(secret));
    children[0].stderr.emit('data', Buffer.from(secret));
    children[0].emit('error', new Error(secret));
    await check;
    const active = operatingSnapshot();
    expect(JSON.stringify(active)).not.toContain(secret);
    expect(Object.keys(active.pools.production.activeWork[0]).sort()).toEqual(['ageMs', 'outcome', 'settled']);
    children[0].emit('close', null);
    expect(JSON.stringify(operatingSnapshot())).not.toContain(secret);
  });
});
afterEach(() => {
  children.forEach((child) => child.emit('close', null));
  vi.useRealTimers(); vi.unstubAllEnvs(); vi.clearAllMocks();
});
const failure = (reason: ProcessFailure) => new Error(reason);
const request = { pool: 'production' as const, executable: 'fixed-worker', args: [], input: '{}', maxOutputBytes: 16, timeoutMs: 100, failure };

describe('one bounded process lifecycle for production and kernel', () => {
  it('preserves exact output across empty and tiny chunks without a retained chunk list', async () => {
    const first = runBoundedProcess(request);
    for (const byte of Buffer.from('bounded output')) {
      children[0].stdout.emit('data', Buffer.alloc(0));
      children[0].stdout.emit('data', Buffer.from([byte]));
    }
    children[0].emit('close', 0);
    expect((await first).stdout.toString()).toBe('bounded output');
  });
  it('shares admission across apparatuses and has no pending queue', async () => {
    const first = runBoundedProcess(request);
    expect(() => runBoundedProcess({ ...request, pool: 'kernel' })).toThrow('BUSY');
    expect(native.spawn).toHaveBeenCalledOnce();
    children[0].stdout.emit('data', Buffer.from('result'));
    children[0].emit('close', 0);
    expect(await first).toEqual({ code: 0, stdout: Buffer.from('result') });
    const next = runBoundedProcess({ ...request, pool: 'kernel' });
    children[1].emit('close', 0);
    await next;
  });
  it('fails closed on invalid configuration before spawning', () => {
    vi.stubEnv('PAYLOAD_EXECUTION_PROFILE', 'invalid');
    expect(() => runBoundedProcess(request)).toThrow('CONFIG_INVALID');
    expect(native.spawn).not.toHaveBeenCalled();
  });
  it.each(['TIMEOUT', 'UNAVAILABLE', 'STDOUT_LIMIT', 'STDERR_LIMIT'] as const)('retains lease after %s until actual close', async (reason) => {
    vi.useFakeTimers();
    const first = runBoundedProcess(request);
    const check = expect(first).rejects.toThrow(reason);
    const child = children[0];
    if (reason === 'TIMEOUT') await vi.advanceTimersByTimeAsync(100);
    if (reason === 'UNAVAILABLE') child.emit('error', new Error('private diagnostics'));
    if (reason === 'STDOUT_LIMIT') child.stdout.emit('data', Buffer.alloc(17));
    if (reason === 'STDERR_LIMIT') child.stderr.emit('data', Buffer.alloc(17));
    await check;
    expect(child.kill).toHaveBeenCalledOnce();
    // Late output is ignored, not buffered, and does not settle twice.
    child.stdout.emit('data', Buffer.alloc(17));
    child.stderr.emit('data', Buffer.alloc(17));
    expect(child.kill).toHaveBeenCalledOnce();
    expect(() => runBoundedProcess(request)).toThrow('BUSY');
    child.emit('close', null); child.emit('close', null);
    const next = runBoundedProcess(request);
    expect(() => runBoundedProcess(request)).toThrow('BUSY');
    children[1].emit('close', 0);
    await next;
  });
  it('counts stdout and stderr together without retaining stderr', async () => {
    const first = runBoundedProcess(request);
    const check = expect(first).rejects.toThrow('STDOUT_LIMIT');
    children[0].stderr.emit('data', Buffer.alloc(10));
    children[0].stdout.emit('data', Buffer.alloc(7));
    await check;
  });
  it('releases after synchronous spawn failure and redacts its diagnostics', async () => {
    native.spawn.mockImplementationOnce(() => { throw new Error('private path'); });
    await expect(runBoundedProcess(request)).rejects.toThrow(/^UNAVAILABLE$/);
    const next = runBoundedProcess(request);
    children[0].emit('close', 0);
    await next;
  });
  it('sanitizes synchronous stdin failure and a throwing kill without prematurely releasing', async () => {
    native.spawn.mockImplementationOnce(() => {
      const child = new Child(); children.push(child);
      child.stdin.end.mockImplementation(() => { throw new Error('private input failure'); });
      child.kill.mockImplementation(() => { throw new Error('private kill failure'); });
      return child;
    });
    await expect(runBoundedProcess(request)).rejects.toThrow(/^UNAVAILABLE$/);
    expect(() => runBoundedProcess(request)).toThrow('BUSY');
    children[0].emit('close', null);
    const next = runBoundedProcess(request);
    children[1].emit('close', 0);
    await next;
  });
});
