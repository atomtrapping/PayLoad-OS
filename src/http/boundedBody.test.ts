/**
 * The reader four transports share, including the case one of the four had not
 * covered: a caller whose stream rejects when cancelled.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BodyReadError, DEFAULT_BODY_TIMEOUT_MS, readBoundedBody } from './boundedBody';

afterEach(() => { vi.useRealTimers(); });

class TooLarge extends Error {}
const refuse = (): never => { throw new TooLarge('BODY_TOO_LARGE'); };

const encode = (text: string) => new TextEncoder().encode(text);
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

/** A stream that hands over the given chunks, with cancellation under test control. */
function streamOf(chunks: readonly Uint8Array[], onCancel: () => void | Promise<void> = () => {}): ReadableStream<Uint8Array> {
  let at = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (at >= chunks.length) controller.close();
      else controller.enqueue(chunks[at++]);
    },
    cancel() { return onCancel(); },
  });
}

describe('reading a body up to a limit', () => {
  it('returns the whole body when it fits', async () => {
    const text = '{"command":"post"}';
    expect(decode(await readBoundedBody(streamOf([encode(text)]), 1024, refuse))).toBe(text);
  });

  it('joins chunks in the order they arrived', async () => {
    const stream = streamOf([encode('{"a":'), encode('1,"b":'), encode('2}')]);
    expect(decode(await readBoundedBody(stream, 1024, refuse))).toBe('{"a":1,"b":2}');
  });

  /* Bytes, not characters: a limit counted in characters would let a caller
     send three times the bytes by choosing a different alphabet. */
  it('counts bytes rather than characters', async () => {
    const wide = '€€€';                       // 3 characters, 9 bytes in UTF-8
    expect(encode(wide).byteLength).toBe(9);
    await expect(readBoundedBody(streamOf([encode(wide)]), 8, refuse)).rejects.toThrow(TooLarge);
    expect(decode(await readBoundedBody(streamOf([encode(wide)]), 9, refuse))).toBe(wide);
  });

  it('refuses as soon as the limit is passed, without reading the rest', async () => {
    const chunks = [encode('12345'), encode('67890'), encode('never read')];
    let pulled = 0;
    let at = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        if (at >= chunks.length) controller.close();
        else controller.enqueue(chunks[at++]);
      },
    });
    await expect(readBoundedBody(stream, 8, refuse)).rejects.toThrow(TooLarge);
    expect(pulled, 'stopped at the chunk that crossed the limit').toBe(2);
  });

  it('accepts a body exactly at the limit', async () => {
    expect(decode(await readBoundedBody(streamOf([encode('12345678')]), 8, refuse))).toBe('12345678');
  });

  it('cancels the caller stream when it refuses', async () => {
    const cancelled = vi.fn();
    await expect(readBoundedBody(streamOf([encode('too much')], cancelled), 2, refuse)).rejects.toThrow(TooLarge);
    expect(cancelled).toHaveBeenCalled();
  });

  /*
   * The case the coordination board's copy did not cover. Its `await
   * reader.cancel()` was unguarded, so a caller whose stream rejects on cancel
   * — the same broken caller most likely to be sending too much — received
   * that rejection instead of the refusal it had earned.
   */
  it('still refuses when the caller stream fails to cancel', async () => {
    const stream = streamOf([encode('far too much')], () => { throw new Error('BROKEN_CALLER_STREAM'); });
    await expect(readBoundedBody(stream, 4, refuse)).rejects.toThrow(TooLarge);
  });

  it('keeps the caller size error when cancellation never settles', async () => {
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const stream = streamOf([encode('far too much')], cancel);
    await expect(readBoundedBody(stream, 4, refuse)).rejects.toThrow(TooLarge);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(stream.locked).toBe(false);
  });

  /*
   * The helper hands back bytes so each transport keeps its own decode. Three
   * of the four use `fatal: true` and refuse invalid UTF-8; decoding here
   * would have given all four the lenient behaviour of the fourth.
   */
  it('returns the bytes as they arrived, invalid UTF-8 included', async () => {
    const invalid = new Uint8Array([0x7b, 0xff, 0xfe, 0x7d]);
    const bytes = await readBoundedBody(streamOf([invalid]), 1024, refuse);
    expect(bytes).toEqual(invalid);
    expect(() => new TextDecoder('utf-8', { fatal: true }).decode(bytes)).toThrow();
  });

  it('returns an empty body as no bytes', async () => {
    expect(await readBoundedBody(streamOf([]), 1024, refuse)).toEqual(new Uint8Array(0));
  });

  /* The lock is released whichever way the read ended, so a transport that
     wants to inspect the stream afterwards is not blocked by this one. */
  it('releases the reader lock on the way out, refusal included', async () => {
    const ok = streamOf([encode('small')]);
    await readBoundedBody(ok, 1024, refuse);
    expect(ok.locked).toBe(false);

    const big = streamOf([encode('far too much')]);
    await expect(readBoundedBody(big, 2, refuse)).rejects.toThrow(TooLarge);
    expect(big.locked).toBe(false);
  });

  it('preserves an original read failure and releases the lock', async () => {
    const failure = new Error('original stream error');
    const stream = new ReadableStream<Uint8Array>({ pull() { throw failure; } });
    await expect(readBoundedBody(stream, 16, refuse)).rejects.toBe(failure);
    expect(stream.locked).toBe(false);
  });

  it('clears the deadline and abort listener after success', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    expect(await readBoundedBody(streamOf([encode('ok')]), 8, refuse, { signal: controller.signal })).toEqual(encode('ok'));
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
    controller.abort(new Error('late private reason'));
  });

  it('copies bytes across bounded buffer growth and eager tiny chunks', async () => {
    const expected = new Uint8Array(8193).map((_, index) => index % 251);
    let at = 0;
    const scratch = new Uint8Array(1);
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (at === expected.length) controller.close();
        else { scratch[0] = expected[at++]; controller.enqueue(scratch); }
      },
    }, { highWaterMark: 0 });
    const actual = await readBoundedBody(stream, expected.length, refuse);
    expect(actual).toEqual(expected);
    expect(actual.buffer.byteLength).toBe(expected.length);
  });

  it.each([Infinity, NaN, -1, 1.5])('rejects invalid internal byte limits before locking the stream: %s', async (limit) => {
    const stream = streamOf([]);
    await expect(readBoundedBody(stream, limit, refuse)).rejects.toThrow(RangeError);
    expect(stream.locked).toBe(false);
  });
});

describe('one bounded read deadline and caller cancellation', () => {
  it('uses a finite ten-second deadline for existing three-argument callers', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const stream = new ReadableStream<Uint8Array>({ cancel });
    const outcome = expect(readBoundedBody(stream, 16, refuse)).rejects.toMatchObject({
      name: 'BodyReadError', code: 'BODY_READ_TIMEOUT', message: 'BODY_READ_TIMEOUT',
    });
    expect(DEFAULT_BODY_TIMEOUT_MS).toBe(10_000);
    await vi.advanceTimersByTimeAsync(DEFAULT_BODY_TIMEOUT_MS);
    await outcome;
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(stream.locked).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not restart the configured deadline when another chunk arrives', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({ start(value) { controller = value; } });
    const outcome = expect(readBoundedBody(stream, 16, refuse, { timeoutMs: 100 })).rejects.toThrow('BODY_READ_TIMEOUT');
    await vi.advanceTimersByTimeAsync(99);
    controller.enqueue(encode('progress'));
    await vi.advanceTimersByTimeAsync(1);
    await outcome;
    expect(stream.locked).toBe(false);
  });

  it('times out immediately when the explicit deadline is zero', async () => {
    const stream = streamOf([encode('ok')]);
    await expect(readBoundedBody(stream, 16, refuse, { timeoutMs: 0 })).rejects.toBeInstanceOf(BodyReadError);
    expect(stream.locked).toBe(false);
  });

  it('sanitizes an already-aborted signal before pulling any body bytes', async () => {
    const controller = new AbortController();
    controller.abort(new Error('private abort reason'));
    const pull = vi.fn();
    const cancel = vi.fn(() => { throw new Error('private cancellation error'); });
    const stream = new ReadableStream<Uint8Array>({ pull, cancel }, { highWaterMark: 0 });
    await expect(readBoundedBody(stream, 16, refuse, { signal: controller.signal })).rejects.toMatchObject({
      name: 'BodyReadError', code: 'BODY_READ_ABORTED', message: 'BODY_READ_ABORTED',
    });
    expect(pull).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(stream.locked).toBe(false);
  });

  it('aborts a stalled read without waiting for cancellation and clears its timer', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const controller = new AbortController();
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const stream = new ReadableStream<Uint8Array>({ cancel });
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const outcome = expect(readBoundedBody(stream, 16, refuse, { signal: controller.signal })).rejects.toThrow('BODY_READ_ABORTED');
    controller.abort(new Error('private reason'));
    await outcome;
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(stream.locked).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('lets the deadline run for endlessly eager empty chunks, then stops reading', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let pulls = 0;
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (++pulls > 4096) throw new Error('Reader did not yield to the event loop.');
        controller.enqueue(new Uint8Array(0));
      },
      cancel,
    });
    const outcome = expect(readBoundedBody(stream, 16, refuse, { timeoutMs: 100 })).rejects.toThrow('BODY_READ_TIMEOUT');
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(pulls).toBeGreaterThan(0);
    expect(pulls).toBeLessThan(4096);
    await vi.advanceTimersByTimeAsync(100);
    await outcome;
    const stoppedAt = pulls;
    await new Promise<void>(resolve => setImmediate(resolve));
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(pulls).toBe(stoppedAt);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(stream.locked).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([Infinity, NaN, -1, 1.5, 2_147_483_648])('rejects invalid deadlines instead of disabling the timer: %s', async (timeoutMs) => {
    const stream = streamOf([]);
    await expect(readBoundedBody(stream, 16, refuse, { timeoutMs })).rejects.toThrow('BODY_READ_TIMEOUT_INVALID');
    expect(stream.locked).toBe(false);
  });
});
