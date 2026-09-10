/**
 * The reader four transports share, including the case one of the four had not
 * covered: a caller whose stream rejects when cancelled.
 */
import { describe, expect, it, vi } from 'vitest';
import { readBoundedBody } from './boundedBody';

class TooLarge extends Error {}
const refuse = (): never => { throw new TooLarge('BODY_TOO_LARGE'); };

const encode = (text: string) => new TextEncoder().encode(text);
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

/** A stream that hands over the given chunks, with cancellation under test control. */
function streamOf(chunks: readonly Uint8Array[], onCancel: () => void = () => {}): ReadableStream<Uint8Array> {
  let at = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (at >= chunks.length) controller.close();
      else controller.enqueue(chunks[at++]);
    },
    cancel() { onCancel(); },
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
});
