import * as fs from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readCoordinationConfigurationFile } from './admin';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, fstatSync: vi.fn(actual.fstatSync) };
});

const directories: string[] = [];
function file(bytes: string | Buffer) {
  const directory = fs.mkdtempSync(join(tmpdir(), 'coordination-admin-test-')); directories.push(directory);
  const path = join(directory, 'input.json'); fs.writeFileSync(path, bytes); return path;
}
afterEach(() => { vi.restoreAllMocks(); for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true }); });
describe('bounded explicit operator configuration reader', () => {
  it('reads a strict valid request without opening a database or changing terminal authority', () => {
    const request = { operation: 'create-board', boardId: 'review', corpusId: 'landshark.terminal-parcels', audit: { actor: 'operator', reason: 'Explicit setup' } };
    expect(readCoordinationConfigurationFile(file(JSON.stringify(request)))).toEqual(request);
    expect(() => readCoordinationConfigurationFile(file(JSON.stringify({ ...request, canReview: true })))).toThrow();
  });
  it('checks actual bytes even when a file grows after its stat snapshot', () => {
    const path = file(Buffer.alloc(65537));
    const stat = fs.statSync(path);
    vi.mocked(fs.fstatSync).mockReturnValueOnce({ ...stat, size: 1, isFile: () => true } as fs.Stats);
    expect(() => readCoordinationConfigurationFile(path)).toThrow('COORDINATION_CONFIGURATION_LIMIT');
  });
  it('refuses oversized and invalid UTF-8 inputs', () => {
    expect(() => readCoordinationConfigurationFile(file(Buffer.alloc(65537)))).toThrow('COORDINATION_CONFIGURATION_LIMIT');
    expect(() => readCoordinationConfigurationFile(file(Buffer.from([0xff])))).toThrow();
  });
});
