import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/runtime/boundedProcess', () => ({ runBoundedProcess: vi.fn() }));
import { runBoundedProcess } from '@/runtime/boundedProcess';
import { lakeDestination, localLakeConfig, runLocalLake } from './lakeRuntime';
const config = { python: resolve('python'), packages: resolve('packages'), root: resolve('.stamp/lake'), repository: resolve('.') };
beforeEach(() => { vi.mocked(runBoundedProcess).mockReset(); });
describe('local Iceberg process boundary', () => {
  it('requires explicit configuration and refuses internal deployment', () => {
    expect(() => localLakeConfig({})).toThrow('LOCAL_LAKE_CONFIG_REQUIRED');
    expect(() => localLakeConfig({ PAYLOAD_DEPLOYMENT_MODE: 'internal' })).toThrow('LOCAL_LAKE_NOT_PRODUCTION');
    expect(() => localLakeConfig({ PAYLOAD_DEPLOYMENT_MODE: ' internal ' })).toThrow('LOCAL_LAKE_NOT_PRODUCTION');
    expect(() => localLakeConfig({ PAYLOAD_DEPLOYMENT_MODE: 'unknown' })).toThrow('LOCAL_LAKE_CONFIG_INVALID');
    expect(lakeDestination(config)).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
  it('uses bounded stdin and a credential-stripped fixed isolated module', async () => {
    vi.mocked(runBoundedProcess).mockResolvedValue({ code: 0, stdout: Buffer.from('{"snapshot_id":"9223372036854775806"}') });
    expect(await runLocalLake(config, 'read', { exact: 'identity' })).toEqual({ snapshot_id: '9223372036854775806' });
    const call = vi.mocked(runBoundedProcess).mock.calls[0][0];
    expect(call.pool).toBe('production'); expect(call.timeoutMs).toBe(20000);
    expect(call.args.slice(0, 3)).toEqual(['-I', '-B', '-c']);
    expect(call.args[3]).toContain("runpy.run_module('tools.terminal_lake'");
    expect(call.input).toBe('{"exact":"identity"}');
    expect(Object.keys(call.env!)).not.toContain('DATABASE_URL');
    expect(Object.keys(call.env!)).not.toContain('PAYLOAD_SOS_SECRET_ACCESS_KEY');
  });
  it('rejects overlong input before launch and invalid/nonzero output', async () => {
    await expect(runLocalLake(config, 'publish', { text: 'x'.repeat(65536) })).rejects.toThrow('LOCAL_LAKE_INPUT_LIMIT');
    expect(runBoundedProcess).not.toHaveBeenCalled();
    vi.mocked(runBoundedProcess).mockResolvedValue({ code: 1, stdout: Buffer.alloc(0) });
    await expect(runLocalLake(config, 'publish', {})).rejects.toThrow('LOCAL_LAKE_REFUSED');
    vi.mocked(runBoundedProcess).mockResolvedValue({ code: 0, stdout: Buffer.from('invalid') });
    await expect(runLocalLake(config, 'read', {})).rejects.toThrow('LOCAL_LAKE_RESPONSE_INVALID');
  });
});
