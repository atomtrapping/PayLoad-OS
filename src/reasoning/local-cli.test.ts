import {
  existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContentAddressedWrite } from '../data-os/contracts';
import { FileContentAddressedStore } from '../data-os/file-object-store';
import { encodeLocalRecord, localRecordDigest } from '../data-os/local-record';
import { runLocalToolsCli } from './local-cli';
import {
  contextSearchPreview, SakanaToolError, verifyContextSearchResult, type ContextSearchRequest,
} from './local-contracts';
import { searchContextWithTreeQuest } from './local-worker';

type Candidate = Awaited<ReturnType<typeof searchContextWithTreeQuest>>;
type RetainedCandidate = Candidate & { retention: { request: ContentAddressedWrite; candidate: ContentAddressedWrite } };

function requestFixture(): ContextSearchRequest {
  return {
    schema: 'notation.sakana-context-search.v1', requestId: 'cli-local-fixture', classification: 'SYNTHETIC',
    processingBasis: 'Synthetic metadata for local CLI testing.', requirements: [{ id: 'need-a', weight: 1 }],
    sources: [{ id: 'source-a', reference: 'fixture:source-a', contentDigest: `sha256:${'a'.repeat(64)}`,
      knownAt: '2026-09-08T12:00:00.000Z', standing: 'SYNTHETIC', tokens: 5, coverage: ['need-a'] }],
    budget: { maxTokens: 5, maxSources: 1, iterations: 1, seed: 7 },
  };
}

function candidateFixture(): Candidate {
  const request = requestFixture();
  const result = verifyContextSearchResult(request, {
    schema: 'notation.sakana-context-result.v1', requestId: request.requestId,
    tool: { name: 'treequest', version: '0.3.2', algorithm: 'ABMCTS-A' },
    selectedSourceIds: ['source-a'], coveredRequirementIds: ['need-a'], coveredWeight: 1, totalWeight: 1,
    tokenCount: 5, searchIterations: 1,
    trace: [{ step: 1, parentSourceIds: [], selectedSourceIds: ['source-a'], score: 1 }],
  });
  return {
    schema: 'notation.sakana-context-candidate.v1', requestId: request.requestId, status: 'UNADMITTED', reviewRequired: true,
    inputDigest: localRecordDigest(request, 65536), workerDigest: `sha256:${'f'.repeat(64)}`,
    requirementsDigest: `sha256:${'e'.repeat(64)}`,
    outputDigest: localRecordDigest(result, 1048576), startedAt: '2026-09-08T12:01:00.000Z', completedAt: '2026-09-08T12:01:01.000Z',
    durationMs: 1000,
    limits: { profile: 'normal', timeoutMs: 60000, maxInputBytes: 65536, maxOutputBytes: 1048576, processPool: 'production' },
    evaluator: 'weighted-declared-coverage/v1', verification: 'BUDGET_AND_DECLARED_COVERAGE_RECOMPUTED',
    externalRequestMade: false, modelCalls: 0, selectedSources: request.sources, result,
    limitations: ['Coverage labels and token estimates are supplied metadata, not verified factual support.',
      'Source standing, timestamps and content digests are supplied metadata; this worker does not resolve or authenticate source objects.',
      'The requirements digest identifies the declared dependency pins, not an attestation of every installed byte.',
      'Search is bounded; global optimality and LLM reasoning quality are not established.'],
    authority: { canAdmit: false, canContact: false, canSpend: false, canDeliver: false, canExecuteCode: false },
  };
}

let temporary: string;
let temporaryParent: string;
let requestFile: string;
let objectRoot: string;
beforeEach(() => {
  temporaryParent = realpathSync(tmpdir());
  temporary = mkdtempSync(join(temporaryParent, 'payload-local-tools-cli-test-'));
  requestFile = join(temporary, 'request.json'); objectRoot = join(temporary, 'objects');
  writeFileSync(requestFile, JSON.stringify(requestFixture()));
  vi.stubEnv('PAYLOAD_SAKANA_TOOLS', undefined);
  vi.stubEnv('PAYLOAD_SAKANA_TOOLS_PYTHON', undefined);
  vi.stubEnv('PAYLOAD_SAKANA_TOOLS_DEPENDENCIES', undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  const actual = realpathSync(temporary);
  const parent = realpathSync(temporaryParent);
  const path = relative(parent, actual);
  expect(path !== '' && path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path)).toBe(true);
  expect(dirname(actual)).toBe(parent);
  expect(basename(actual)).toMatch(/^payload-local-tools-cli-test-/);
  expect(lstatSync(temporary).isSymbolicLink()).toBe(false);
  rmSync(actual, { recursive: true });
});

function ioFixture() { return { stdout: vi.fn<(text: string) => void>(), stderr: vi.fn<(text: string) => void>() }; }
function searchFixture() { return vi.fn<typeof searchContextWithTreeQuest>().mockResolvedValue(candidateFixture()); }

function expectFailure(io: ReturnType<typeof ioFixture>, expectedCode?: string) {
  expect(io.stdout).not.toHaveBeenCalled(); expect(io.stderr).toHaveBeenCalledOnce();
  const error = JSON.parse(io.stderr.mock.calls[0][0]);
  expect(Object.keys(error).sort()).toEqual(['error', 'usage']);
  expect(error.usage).toBe('sakana:tools preview|run --request <metadata.json> [--allow-local] [--store <object-root>]');
  if (expectedCode) expect(error.error).toBe(expectedCode);
  else expect(error.error).toMatch(/^SAKANA_TOOLS_/);
  expect(io.stderr.mock.calls[0][0]).not.toContain(temporary);
  expect(io.stderr.mock.calls[0][0]).not.toContain('Synthetic metadata');
}

describe('local Sakana operator CLI', () => {
  it('previews with disabled and missing configuration without invoking search or creating storage', async () => {
    const search = searchFixture(); const io = ioFixture(); const before = readFileSync(requestFile);
    expect(await runLocalToolsCli(['preview', '--request', requestFile], io, search)).toBe(0);
    expect(JSON.parse(io.stdout.mock.calls[0][0])).toEqual(contextSearchPreview(requestFixture()));
    expect(search).not.toHaveBeenCalled(); expect(io.stderr).not.toHaveBeenCalled();
    expect(existsSync(objectRoot)).toBe(false); expect(readFileSync(requestFile)).toEqual(before);
  });

  it.each([false, true])('refuses a real run with allow-local=%s while local tools are disabled', async (allowLocal) => {
    const io = ioFixture();
    const args = ['run', '--request', requestFile, '--store', objectRoot, ...(allowLocal ? ['--allow-local'] : [])];
    expect(await runLocalToolsCli(args, io)).toBe(1);
    expectFailure(io, allowLocal ? 'SAKANA_TOOLS_DISABLED' : 'SAKANA_TOOLS_LOCAL_RUN_NOT_AUTHORIZED');
    expect(existsSync(objectRoot)).toBe(false);
  });

  it('passes explicit local authorization to injected search and omits retention unless requested', async () => {
    const io = ioFixture(); const search = searchFixture();
    expect(await runLocalToolsCli(['run', '--request', requestFile, '--allow-local'], io, search)).toBe(0);
    expect(search).toHaveBeenCalledOnce();
    expect(search).toHaveBeenCalledWith(requestFixture(), { allowLocal: true });
    expect(JSON.parse(io.stdout.mock.calls[0][0])).toEqual(candidateFixture());
    expect(io.stderr).not.toHaveBeenCalled(); expect(existsSync(objectRoot)).toBe(false);
  });

  it('retains request and candidate bytes by digest with verified readback and exact retry stability', async () => {
    const search = searchFixture(); const io = ioFixture();
    const args = ['run', '--request', requestFile, '--allow-local', '--store', objectRoot];
    const sourceBytes = readFileSync(requestFile);
    expect(await runLocalToolsCli(args, io, search)).toBe(0);
    const first = JSON.parse(io.stdout.mock.calls[0][0]) as RetainedCandidate;
    const store = new FileContentAddressedStore(objectRoot);
    const requestBytes = encodeLocalRecord(requestFixture(), 65536);
    const candidateBytes = encodeLocalRecord(candidateFixture(), 2 * 1048576);
    expect(first.retention.request.contentDigest).toBe(localRecordDigest(requestFixture(), 65536));
    expect(first.retention.candidate.contentDigest).toBe(localRecordDigest(candidateFixture(), 2 * 1048576));
    expect(first.retention.request.byteLength).toBe(requestBytes.byteLength);
    expect(first.retention.candidate.byteLength).toBe(candidateBytes.byteLength);
    expect(Buffer.from(store.get(first.retention.request.contentDigest)!)).toEqual(requestBytes);
    expect(Buffer.from(store.get(first.retention.candidate.contentDigest)!)).toEqual(candidateBytes);
    const originalInventory = readdirSync(objectRoot, { recursive: true }).sort();
    const retry = ioFixture();
    expect(await runLocalToolsCli(args, retry, search)).toBe(0);
    expect(JSON.parse(retry.stdout.mock.calls[0][0])).toEqual(first);
    expect(readdirSync(objectRoot, { recursive: true }).sort()).toEqual(originalInventory);
    expect(readFileSync(requestFile)).toEqual(sourceBytes);
    expect(io.stderr).not.toHaveBeenCalled(); expect(retry.stderr).not.toHaveBeenCalled();
  });

  it('reuses the same request identity across runs while preserving distinct immutable candidates', async () => {
    const search = searchFixture(); const io = ioFixture();
    const args = ['run', '--request', requestFile, '--allow-local', '--store', objectRoot];
    expect(await runLocalToolsCli(args, io, search)).toBe(0);
    const first = JSON.parse(io.stdout.mock.calls[0][0]) as RetainedCandidate;
    const later = { ...candidateFixture(), startedAt: '2026-09-08T12:02:00.000Z', completedAt: '2026-09-08T12:02:01.000Z' };
    search.mockResolvedValue(later); const next = ioFixture();
    expect(await runLocalToolsCli(args, next, search)).toBe(0);
    const second = JSON.parse(next.stdout.mock.calls[0][0]) as RetainedCandidate;
    expect(second.retention.request).toEqual(first.retention.request);
    expect(second.retention.candidate.contentDigest).not.toBe(first.retention.candidate.contentDigest);
    const store = new FileContentAddressedStore(objectRoot);
    expect(Buffer.from(store.get(first.retention.candidate.contentDigest)!)).toEqual(encodeLocalRecord(candidateFixture(), 2 * 1048576));
    expect(Buffer.from(store.get(second.retention.candidate.contentDigest)!)).toEqual(encodeLocalRecord(later, 2 * 1048576));
  });

  it.each([
    'unknown-command', 'extra-positional', 'missing-request', 'missing-value', 'unknown-option',
    'preview-authorization', 'preview-storage', 'blank-storage', 'boolean-value',
    'duplicate-request', 'duplicate-storage', 'duplicate-authorization',
  ])('refuses %s before invoking search', async (kind) => {
    const variants: Record<string, string[]> = {
      'unknown-command': ['approve', '--request', requestFile],
      'extra-positional': ['run', 'extra', '--request', requestFile],
      'missing-request': ['run'], 'missing-value': ['run', '--request'],
      'unknown-option': ['run', '--request', requestFile, '--model', 'caller-model'],
      'preview-authorization': ['preview', '--request', requestFile, '--allow-local'],
      'preview-storage': ['preview', '--request', requestFile, '--store', objectRoot],
      'blank-storage': ['run', '--request', requestFile, '--store', ' '],
      'boolean-value': ['run', '--request', requestFile, '--allow-local=false'],
      'duplicate-request': ['run', '--request', requestFile, '--request', requestFile],
      'duplicate-storage': ['run', '--request', requestFile, '--allow-local', '--store', objectRoot, '--store', objectRoot],
      'duplicate-authorization': ['run', '--request', requestFile, '--allow-local', '--allow-local'],
    };
    const io = ioFixture(); const search = searchFixture();
    expect(await runLocalToolsCli(variants[kind], io, search)).toBe(1);
    expectFailure(io); expect(search).not.toHaveBeenCalled(); expect(existsSync(objectRoot)).toBe(false);
  });

  it.each([
    ['empty', Buffer.from('')], ['malformed', Buffer.from('{')], ['utf8', Buffer.from([0xc3, 0x28])],
    ['bom', Buffer.from('\ufeff{}')], ['oversized', Buffer.alloc(65537, 0x20)],
    ['duplicate', Buffer.from('{"schema":1,"schema":2}')],
    ['escaped-duplicate', Buffer.from('{"schema":1,"schem\\u0061":2}')],
    ['nested-duplicate', Buffer.from('{"nested":{"seed":1,"seed":2}}')],
  ])('refuses %s request file without exposing file data', async (_name, bytes) => {
    writeFileSync(requestFile, bytes); const search = searchFixture(); const io = ioFixture();
    expect(await runLocalToolsCli(['run', '--request', requestFile, '--allow-local'], io, search)).toBe(1);
    expectFailure(io, 'SAKANA_TOOLS_REQUEST_FILE_INVALID'); expect(search).not.toHaveBeenCalled();
    expect(readFileSync(requestFile)).toEqual(bytes);
  });

  it('accepts a valid request padded to the exact file byte ceiling', async () => {
    const encoded = JSON.stringify(requestFixture());
    writeFileSync(requestFile, encoded + ' '.repeat(65536 - Buffer.byteLength(encoded)));
    const io = ioFixture(); const search = searchFixture();
    expect(await runLocalToolsCli(['preview', '--request', requestFile], io, search)).toBe(0);
    expect(search).not.toHaveBeenCalled(); expect(io.stderr).not.toHaveBeenCalled();
  });

  it.each(['missing', 'directory'])('refuses a %s request pathname', async (kind) => {
    const io = ioFixture(); const search = searchFixture();
    const path = kind === 'missing' ? join(temporary, 'missing.json') : temporary;
    expect(await runLocalToolsCli(['run', '--request', path, '--allow-local'], io, search)).toBe(1);
    expectFailure(io, 'SAKANA_TOOLS_REQUEST_FILE_INVALID'); expect(search).not.toHaveBeenCalled();
  });

  it('rejects strict metadata violations before invoking search or creating storage', async () => {
    writeFileSync(requestFile, JSON.stringify({ ...requestFixture(), rawContent: 'private source body' }));
    const search = searchFixture(); const io = ioFixture();
    expect(await runLocalToolsCli(['run', '--request', requestFile, '--allow-local', '--store', objectRoot], io, search)).toBe(1);
    expectFailure(io, 'SAKANA_TOOLS_INPUT_INVALID'); expect(search).not.toHaveBeenCalled();
    expect(existsSync(objectRoot)).toBe(false); expect(io.stderr.mock.calls[0][0]).not.toContain('private source body');
  });

  it('reports only fixed errors when injected search fails with private diagnostics', async () => {
    const io = ioFixture(); const search = searchFixture();
    search.mockRejectedValue(new Error(`private credential synthetic-secret at ${requestFile}`));
    expect(await runLocalToolsCli(['run', '--request', requestFile, '--allow-local', '--store', objectRoot], io, search)).toBe(1);
    expectFailure(io, 'SAKANA_TOOLS_COMMAND_FAILED'); expect(existsSync(objectRoot)).toBe(false);
    expect(io.stderr.mock.calls[0][0]).not.toContain('synthetic-secret');
  });

  it('retains a typed worker refusal code without publishing a candidate', async () => {
    const io = ioFixture(); const search = searchFixture();
    search.mockRejectedValue(new SakanaToolError('SAKANA_TOOLS_BUSY'));
    expect(await runLocalToolsCli(['run', '--request', requestFile, '--allow-local', '--store', objectRoot], io, search)).toBe(1);
    expectFailure(io, 'SAKANA_TOOLS_BUSY'); expect(existsSync(objectRoot)).toBe(false);
  });

  it('does not overwrite existing corrupt retained bytes and redacts the storage failure', async () => {
    const search = searchFixture(); const io = ioFixture();
    const args = ['run', '--request', requestFile, '--allow-local', '--store', objectRoot];
    expect(await runLocalToolsCli(args, io, search)).toBe(0);
    const first = JSON.parse(io.stdout.mock.calls[0][0]) as RetainedCandidate;
    const retained = join(objectRoot, first.retention.candidate.storageKey);
    writeFileSync(retained, 'corrupt fixture bytes'); const failed = ioFixture();
    expect(await runLocalToolsCli(args, failed, search)).toBe(1);
    expectFailure(failed, 'SAKANA_TOOLS_COMMAND_FAILED');
    expect(readFileSync(retained, 'utf8')).toBe('corrupt fixture bytes');
  });

  it('refuses retention success when a just-published object is missing during readback', async () => {
    const get = vi.spyOn(FileContentAddressedStore.prototype, 'get').mockReturnValueOnce(undefined);
    try {
      const io = ioFixture(); const search = searchFixture();
      expect(await runLocalToolsCli(['run', '--request', requestFile, '--allow-local', '--store', objectRoot], io, search)).toBe(1);
      expectFailure(io, 'SAKANA_TOOLS_RETENTION_READBACK_FAILED');
      expect(get).toHaveBeenCalled();
    } finally { get.mockRestore(); }
  });
});
