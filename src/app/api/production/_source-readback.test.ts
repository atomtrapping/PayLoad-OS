import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SourceConnectorError } from '@/acquisition/errors';
import { ProductionError } from '@/production/errors';
import { inspectSourceHistory } from './_source-readback';

const messages = {
  invalidMessage: 'Use a bounded identifier.',
  notFound: { code: 'HISTORY_NOT_FOUND', message: 'No saved history has this identifier.' },
};

afterEach(() => vi.unstubAllEnvs());

describe('shared source-history readback boundary', () => {
  it('passes only the operator-configured root to inspection and returns the exact object', () => {
    vi.stubEnv('PAYLOAD_SOURCE_QUALIFICATION_DIR', 'operator-owned-root');
    const history = { id: 'saved-history', absent: null };
    const inspect = vi.fn(() => history);
    expect(inspectSourceHistory(history.id, { ...messages, inspect })).toBe(history);
    expect(inspect).toHaveBeenCalledTimes(1);
    expect(inspect).toHaveBeenCalledWith('operator-owned-root');
  });

  it('uses the source CLI default root without creating it', () => {
    vi.stubEnv('PAYLOAD_SOURCE_QUALIFICATION_DIR', undefined);
    const inspect = vi.fn(() => ({ saved: true }));
    inspectSourceHistory('saved', { ...messages, inspect });
    expect(inspect).toHaveBeenCalledTimes(1);
    expect(inspect).toHaveBeenCalledWith(join(process.cwd(), '.payload', 'source-qualification'));
  });

  it.each(['', '../elsewhere', 'not valid', 'a'.repeat(81)])('rejects %j before any store inspection', (id) => {
    const inspect = vi.fn();
    expect(() => inspectSourceHistory(id, { ...messages, inspect })).toThrow(expect.objectContaining({ code: 'INVALID_REQUEST', status: 400 }));
    expect(inspect).not.toHaveBeenCalled();
  });

  it('keeps each route’s missing-history code and message', () => {
    expect(() => inspectSourceHistory('missing', { ...messages, inspect: () => null })).toThrow(expect.objectContaining({
      code: messages.notFound.code, message: messages.notFound.message, status: 404,
    }));
  });

  it.each([[400, 400], [403, 409], [404, 409], [503, 409]])('maps a trusted source failure with status %i to %i', (sourceStatus, responseStatus) => {
    const inspect = () => { throw new SourceConnectorError('SOURCE_DIGEST_MISMATCH', 'Stored source digest differs.', sourceStatus); };
    expect(() => inspectSourceHistory('saved', { ...messages, inspect })).toThrow(expect.objectContaining({
      code: 'SOURCE_DIGEST_MISMATCH', message: 'Stored source digest differs.', status: responseStatus,
    }));
  });

  it('sanitizes uncontrolled diagnostics rather than leaking a filesystem path', () => {
    const inspect = () => { throw new Error('C:\\private\\source.json could not be read'); };
    try {
      inspectSourceHistory('saved', { ...messages, inspect });
      throw new Error('Expected inspection refusal.');
    } catch (error) {
      expect(error).toBeInstanceOf(ProductionError);
      expect(error).toMatchObject({ code: 'SOURCE_HISTORY_INVALID', status: 409 });
      expect((error as Error).message).not.toContain('private');
    }
  });
});
