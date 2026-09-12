import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { retentionPlan } from './retention';

describe('retention deployment-mode normalization', () => {
  it.each(['internal', ' internal ', '\tinternal\n'])('refuses local storage in normalized internal mode %j', (mode) => {
    expect(() => retentionPlan({ PAYLOAD_DEPLOYMENT_MODE: mode, PAYLOAD_TERMINAL_RETENTION: 'local', PAYLOAD_TERMINAL_OBJECT_ROOT: resolve('.stamp/objects') })).toThrow('RETENTION_CONFIG_INVALID');
  });
  it('rejects unknown deployment modes even when retention is disabled', () => {
    expect(() => retentionPlan({ PAYLOAD_DEPLOYMENT_MODE: 'production' })).toThrow('RETENTION_CONFIG_INVALID');
  });
  it('retains local/default behavior after normalization', () => {
    expect(retentionPlan({ PAYLOAD_DEPLOYMENT_MODE: ' local ' })).toBeNull();
    expect(retentionPlan({ PAYLOAD_DEPLOYMENT_MODE: '  ' })).toBeNull();
  });
});
