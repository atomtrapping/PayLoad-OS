import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { retentionPlan } from './retention';

describe('operator-owned internal retention configuration', () => {
  it('is disabled by default and never falls back on invalid selection', () => {
    expect(retentionPlan({})).toBeNull();
    expect(() => retentionPlan({ PAYLOAD_TERMINAL_RETENTION: 'sos' })).toThrow('RETENTION_CONFIG_INVALID');
    expect(() => retentionPlan({ PAYLOAD_TERMINAL_RETENTION: 'unknown' })).toThrow('RETENTION_CONFIG_INVALID');
  });
  it('requires explicit absolute local roots and excludes local production custody', () => {
    expect(() => retentionPlan({ PAYLOAD_TERMINAL_RETENTION: 'local', PAYLOAD_TERMINAL_OBJECT_ROOT: './objects' })).toThrow();
    expect(() => retentionPlan({ PAYLOAD_TERMINAL_RETENTION: 'local', PAYLOAD_TERMINAL_OBJECT_ROOT: resolve('.stamp/objects'), PAYLOAD_DEPLOYMENT_MODE: 'internal' })).toThrow();
    const plan = retentionPlan({ PAYLOAD_TERMINAL_RETENTION: 'local', PAYLOAD_TERMINAL_OBJECT_ROOT: resolve('.stamp/objects') });
    expect(plan?.destination).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(plan?.open().destination).toBe(plan?.destination);
  });
  it('requires a named SOS prefix and does not put secrets in destination identity', () => {
    const env = { PAYLOAD_TERMINAL_RETENTION: 'sos', PAYLOAD_OBJECT_STORE: 'sos', PAYLOAD_SOS_ENDPOINT: 'https://sos-ch-gva-2.exo.io',
      PAYLOAD_SOS_REGION: 'ch-gva-2', PAYLOAD_SOS_BUCKET: 'fixture-bucket', PAYLOAD_SOS_ACCESS_KEY_ID: 'fixture-key-id',
      PAYLOAD_SOS_SECRET_ACCESS_KEY: 'fixture-secret-not-real' };
    expect(() => retentionPlan(env)).toThrow('RETENTION_CONFIG_INVALID');
    const plan = retentionPlan({ ...env, PAYLOAD_SOS_PREFIX: 'internal/terminal-results/v1' });
    expect(plan?.destination).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(retentionPlan({ ...env, PAYLOAD_SOS_PREFIX: 'internal/terminal-results/v1', PAYLOAD_SOS_SECRET_ACCESS_KEY: 'rotated-fixture-secret' })?.destination).toBe(plan?.destination);
  });
});
