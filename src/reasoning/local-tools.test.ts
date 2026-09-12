import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localRecordDigest } from '../data-os/local-record';
import type { runBoundedProcess } from '../runtime/boundedProcess';
import {
  contextSearchPreview, evaluateContextSelection, parseContextSearch,
  SakanaToolError, verifyContextSearchResult, type ContextSearchRequest,
} from './local-contracts';
import { localToolEnvironment, searchContextWithTreeQuest } from './local-worker';

function requestFixture(): ContextSearchRequest {
  return {
    schema: 'notation.sakana-context-search.v1', requestId: 'local-search-fixture',
    classification: 'INTERNAL', processingBasis: 'Synthetic metadata for a local contract test.',
    requirements: [{ id: 'need-a', weight: 3 }, { id: 'need-b', weight: 1 }],
    sources: [
      { id: 'source-a', reference: 'fixture:source-a', contentDigest: `sha256:${'a'.repeat(64)}`,
        knownAt: '2026-09-08T12:00:00.000Z', standing: 'OBSERVATION', tokens: 5, coverage: ['need-a'] },
      { id: 'source-b', reference: 'fixture:source-b', contentDigest: `sha256:${'b'.repeat(64)}`,
        knownAt: '2026-09-08T12:00:00.000Z', standing: 'ADMITTED', tokens: 7, coverage: ['need-b'] },
      { id: 'source-refused', reference: 'fixture:source-refused', contentDigest: `sha256:${'c'.repeat(64)}`,
        knownAt: '2026-09-08T12:00:00.000Z', standing: 'REFUSED', tokens: 1, coverage: ['need-a', 'need-b'] },
      { id: 'source-withdrawn', reference: 'fixture:source-withdrawn', contentDigest: `sha256:${'d'.repeat(64)}`,
        knownAt: '2026-09-08T12:00:00.000Z', standing: 'WITHDRAWN', tokens: 1, coverage: ['need-a', 'need-b'] },
    ],
    budget: { maxTokens: 12, maxSources: 2, iterations: 2, seed: 7 },
  };
}

function resultFixture(iterations = 2) {
  const trace = Array.from({ length: iterations }, (_, index) => ({
    step: index + 1,
    parentSourceIds: index === 0 ? [] : index === 1 ? ['source-a'] : ['source-a', 'source-b'],
    selectedSourceIds: index === 0 ? ['source-a'] : ['source-a', 'source-b'],
    score: index === 0 ? 0.75 : 1,
  }));
  return {
    schema: 'notation.sakana-context-result.v1', requestId: 'local-search-fixture',
    tool: { name: 'treequest', version: '0.3.2', algorithm: 'ABMCTS-A' },
    selectedSourceIds: iterations === 1 ? ['source-a'] : ['source-a', 'source-b'],
    coveredRequirementIds: iterations === 1 ? ['need-a'] : ['need-a', 'need-b'],
    coveredWeight: iterations === 1 ? 3 : 4, totalWeight: 4,
    tokenCount: iterations === 1 ? 5 : 12, searchIterations: iterations, trace,
  };
}

function enabledEnvironment() {
  // A regular executable and existing dependency directory satisfy configuration
  // preflight; injected transport prevents either from ever being executed.
  return { PAYLOAD_SAKANA_TOOLS: '1', PAYLOAD_SAKANA_TOOLS_PYTHON: process.execPath,
    PAYLOAD_SAKANA_TOOLS_DEPENDENCIES: realpathSync(tmpdir()) };
}

function transportFixture(result: unknown = resultFixture()) {
  return vi.fn<typeof runBoundedProcess>().mockResolvedValue({ code: 0, stdout: Buffer.from(JSON.stringify(result)) });
}

beforeEach(() => {
  vi.stubEnv('PAYLOAD_EXECUTION_PROFILE', 'normal');
  vi.stubEnv('PAYLOAD_MAX_CHILD_PROCESSES', undefined);
  vi.stubEnv('PAYLOAD_DB_POOL_MAX', undefined);
});
afterEach(() => { vi.unstubAllEnvs(); });

describe('strict local context metadata requests', () => {
  it('accepts bounded metadata and previews its authority without making a model request', () => {
    const request = requestFixture();
    expect(parseContextSearch(request)).toEqual(request);
    expect(contextSearchPreview(request)).toEqual({
      schema: 'notation.sakana-context-preview.v1', requestId: request.requestId,
      inputDigest: localRecordDigest(request, 65536), evaluator: 'weighted-declared-coverage/v1',
      tool: 'treequest', toolVersion: '0.3.2', budget: request.budget,
      eligibleSourceCount: 2, externalRequestMade: false, modelCalls: 0, authority: 'PROPOSE_ONLY',
    });
  });

  it.each([
    ['top-level raw content', (value: ContextSearchRequest) => Object.assign(value, { rawContent: 'must not enter metadata' })],
    ['source text', (value: ContextSearchRequest) => Object.assign(value.sources[0], { text: 'raw source body' })],
    ['requirement prompt', (value: ContextSearchRequest) => Object.assign(value.requirements[0], { prompt: 'do work' })],
    ['budget override', (value: ContextSearchRequest) => Object.assign(value.budget, { timeoutMs: 999999 })],
    ['duplicate source id', (value: ContextSearchRequest) => { value.sources[1].id = value.sources[0].id; }],
    ['duplicate requirement id', (value: ContextSearchRequest) => { value.requirements[1].id = value.requirements[0].id; }],
    ['duplicate coverage', (value: ContextSearchRequest) => { value.sources[0].coverage.push('need-a'); }],
    ['unknown coverage', (value: ContextSearchRequest) => { value.sources[0].coverage.push('unprovided-need'); }],
    ['invalid digest', (value: ContextSearchRequest) => { value.sources[0].contentDigest = 'source bytes'; }],
    ['invalid time', (value: ContextSearchRequest) => { value.sources[0].knownAt = 'yesterday'; }],
    ['blank processing basis', (value: ContextSearchRequest) => { value.processingBasis = ' '; }],
    ['mixed synthetic standing', (value: ContextSearchRequest) => { value.classification = 'SYNTHETIC'; }],
  ])('refuses %s without exposing input', (_name, mutate) => {
    const request = requestFixture(); mutate(request);
    expect(() => parseContextSearch(request)).toThrow(/^SAKANA_TOOLS_INPUT_INVALID$/);
  });

  it.each([
    ['maxTokens', 0], ['maxTokens', 32769], ['maxSources', 0], ['maxSources', 17],
    ['iterations', 0], ['iterations', 129], ['seed', -1], ['seed', 4294967296], ['iterations', 1.5],
  ] as const)('refuses out-of-contract %s=%s', (field, value) => {
    const request = requestFixture(); request.budget[field] = value;
    expect(() => parseContextSearch(request)).toThrow('SAKANA_TOOLS_INPUT_INVALID');
  });

  it('rejects a packet over the aggregate byte ceiling even when individual fields fit', () => {
    const request = requestFixture();
    request.requirements = Array.from({ length: 32 }, (_, index) => ({ id: `need-${index}-${'a'.repeat(100)}`, weight: 1 }));
    request.sources = Array.from({ length: 64 }, (_, index) => ({ ...request.sources[0], id: `source-${index}`,
      reference: 'r'.repeat(500), coverage: request.requirements.map(({ id }) => id) }));
    expect(Buffer.byteLength(JSON.stringify(request))).toBeGreaterThan(65536);
    expect(() => parseContextSearch(request)).toThrow('SAKANA_TOOLS_INPUT_INVALID');
  });

  it('requires wholly synthetic standing for a synthetic packet', () => {
    const request = requestFixture(); request.classification = 'SYNTHETIC';
    request.sources.forEach((source) => { source.standing = 'SYNTHETIC'; });
    expect(parseContextSearch(request)).toEqual(request);
  });

  it.each(['\ud800', '\udfff', 'text\ud800tail', '\u0085', '\u001c', '\u001d', '\u001e', '\u001f', ' \u0085\u001c '])(
    'rejects nonportable or Python-blank metadata text %j', (text) => {
      const request = requestFixture(); request.processingBasis = text;
      expect(() => parseContextSearch(request)).toThrow('SAKANA_TOOLS_INPUT_INVALID');
      request.processingBasis = requestFixture().processingBasis; request.sources[0].reference = text;
      expect(() => parseContextSearch(request)).toThrow('SAKANA_TOOLS_INPUT_INVALID');
    },
  );

  it.each([
    '2026-09-08T12:00Z', '0000-09-08T12:00:00Z', '2026-02-30T12:00:00Z',
    '2026-09-08T12:00:00', `2026-09-08T12:00:00.${'1'.repeat(45)}Z`,
  ])('rejects nonportable or invalid timestamps %s', (knownAt) => {
    const request = requestFixture(); request.sources[0].knownAt = knownAt;
    expect(() => parseContextSearch(request)).toThrow('SAKANA_TOOLS_INPUT_INVALID');
  });

  it.each(['2026-09-08T12:00:00Z', '2026-09-08T12:00:00.123456-04:00'])('accepts full-second timestamps %s', (knownAt) => {
    const request = requestFixture(); request.sources[0].knownAt = knownAt;
    request.processingBasis = 'Unicode context \ud83d\udcc4';
    expect(parseContextSearch(request)).toEqual(request);
  });
});

describe('declared coverage evaluation', () => {
  it('recomputes weighted coverage and token totals without factual-support promotion', () => {
    expect(evaluateContextSelection(requestFixture(), ['source-b', 'source-a'])).toEqual({
      selectedSourceIds: ['source-a', 'source-b'], coveredRequirementIds: ['need-a', 'need-b'],
      coveredWeight: 4, totalWeight: 4, tokenCount: 12, score: 1,
    });
    expect(evaluateContextSelection(requestFixture(), [])).toEqual({ selectedSourceIds: [], coveredRequirementIds: [],
      coveredWeight: 0, totalWeight: 4, tokenCount: 0, score: 0 });
  });

  it.each([['source-a', 'source-a'], ['missing'], ['source-refused'], ['source-withdrawn']])('rejects ineligible selection %j', (...selection) => {
    expect(() => evaluateContextSelection(requestFixture(), selection)).toThrow('SAKANA_TOOLS_SELECTION_INVALID');
  });

  it('enforces token and source budgets independently', () => {
    const request = requestFixture(); request.budget.maxTokens = 11;
    expect(() => evaluateContextSelection(request, ['source-a', 'source-b'])).toThrow('SAKANA_TOOLS_SELECTION_INVALID');
    request.budget.maxTokens = 12; request.budget.maxSources = 1;
    expect(() => evaluateContextSelection(request, ['source-a', 'source-b'])).toThrow('SAKANA_TOOLS_SELECTION_INVALID');
  });
});

describe('independent worker-result verification', () => {
  it('accepts a complete trace whose selected plan has the best observed declared score', () => {
    expect(verifyContextSearchResult(requestFixture(), resultFixture())).toEqual(resultFixture());
  });

  it.each([
    ['unknown field', (value: ReturnType<typeof resultFixture>) => { Object.assign(value, { verifiedTruth: true }); }],
    ['unknown tool field', (value: ReturnType<typeof resultFixture>) => { Object.assign(value.tool, { modelEndpoint: 'private' }); }],
    ['unknown trace field', (value: ReturnType<typeof resultFixture>) => { Object.assign(value.trace[0], { reasoning: 'unverified' }); }],
    ['wrong request', (value: ReturnType<typeof resultFixture>) => { value.requestId = 'other-request'; }],
    ['wrong pinned version', (value: ReturnType<typeof resultFixture>) => { value.tool.version = '9.0.0'; }],
    ['wrong algorithm', (value: ReturnType<typeof resultFixture>) => { value.tool.algorithm = 'unbounded'; }],
    ['forged token total', (value: ReturnType<typeof resultFixture>) => { value.tokenCount = 1; }],
    ['forged covered weight', (value: ReturnType<typeof resultFixture>) => { value.coveredWeight = 3; }],
    ['forged total weight', (value: ReturnType<typeof resultFixture>) => { value.totalWeight = 5; }],
    ['forged coverage', (value: ReturnType<typeof resultFixture>) => { value.coveredRequirementIds = ['need-a']; }],
    ['duplicate final selection', (value: ReturnType<typeof resultFixture>) => { value.selectedSourceIds = ['source-a', 'source-a']; }],
    ['unknown final source', (value: ReturnType<typeof resultFixture>) => { value.selectedSourceIds = ['missing']; }],
    ['refused final source', (value: ReturnType<typeof resultFixture>) => { value.selectedSourceIds = ['source-refused']; }],
    ['withdrawn final source', (value: ReturnType<typeof resultFixture>) => { value.selectedSourceIds = ['source-withdrawn']; }],
    ['unsorted selection', (value: ReturnType<typeof resultFixture>) => { value.selectedSourceIds.reverse(); }],
    ['incomplete trace', (value: ReturnType<typeof resultFixture>) => { value.trace.pop(); }],
    ['wrong iteration count', (value: ReturnType<typeof resultFixture>) => { value.searchIterations = 1; }],
    ['wrong step order', (value: ReturnType<typeof resultFixture>) => { value.trace[1].step = 1; }],
    ['forged score', (value: ReturnType<typeof resultFixture>) => { value.trace[0].score = 1; }],
    ['unknown ancestry', (value: ReturnType<typeof resultFixture>) => { value.trace[0].parentSourceIds = ['source-b']; }],
    ['unknown trial source', (value: ReturnType<typeof resultFixture>) => { value.trace[0].selectedSourceIds = ['missing']; }],
    ['unsorted trace selection', (value: ReturnType<typeof resultFixture>) => { value.trace[1].selectedSourceIds.reverse(); }],
    ['multi-source jump', (value: ReturnType<typeof resultFixture>) => { value.trace[0].selectedSourceIds = ['source-a', 'source-b']; value.trace[0].score = 1; }],
    ['removed parent source', (value: ReturnType<typeof resultFixture>) => { value.trace[1].selectedSourceIds = ['source-b']; value.trace[1].score = 0.25; }],
  ])('rejects %s', (_name, mutate) => {
    const result = resultFixture(); mutate(result);
    expect(() => verifyContextSearchResult(requestFixture(), result)).toThrow(/^SAKANA_TOOLS_RESULT_INVALID$/);
  });

  it('rejects a lower-scoring final choice even when that choice was observed', () => {
    const result = resultFixture();
    Object.assign(result, { selectedSourceIds: ['source-a'], coveredRequirementIds: ['need-a'], coveredWeight: 3, tokenCount: 5 });
    expect(() => verifyContextSearchResult(requestFixture(), result)).toThrow('SAKANA_TOOLS_RESULT_INVALID');
  });

  it('rejects a valid-looking final choice absent from the trace', () => {
    const result = resultFixture();
    result.trace[1] = { step: 2, parentSourceIds: [], selectedSourceIds: ['source-b'], score: 0.25 };
    expect(() => verifyContextSearchResult(requestFixture(), result)).toThrow('SAKANA_TOOLS_RESULT_INVALID');
  });

  it('rejects no-op search steps while an eligible source still fits', () => {
    const result = resultFixture();
    Object.assign(result, { selectedSourceIds: ['source-a'], coveredRequirementIds: ['need-a'], coveredWeight: 3, tokenCount: 5 });
    result.trace = [
      { step: 1, parentSourceIds: [], selectedSourceIds: [], score: 0 },
      { step: 2, parentSourceIds: [], selectedSourceIds: ['source-a'], score: 0.75 },
    ];
    expect(() => verifyContextSearchResult(requestFixture(), result)).toThrow('SAKANA_TOOLS_RESULT_INVALID');
  });

  it('allows terminal no-op steps when no eligible source fits the remaining token budget', () => {
    const request = requestFixture(); request.budget.maxTokens = 5;
    const result = resultFixture();
    Object.assign(result, { selectedSourceIds: ['source-a'], coveredRequirementIds: ['need-a'], coveredWeight: 3, tokenCount: 5 });
    result.trace[1] = { step: 2, parentSourceIds: ['source-a'], selectedSourceIds: ['source-a'], score: 0.75 };
    expect(verifyContextSearchResult(request, result)).toEqual(result);
  });

  it('rejects an ungenerated empty final plan even when every generated score is zero', () => {
    const request = requestFixture(); request.budget.iterations = 1;
    request.sources.forEach((source) => { source.coverage = []; });
    const result = resultFixture(1);
    Object.assign(result, { selectedSourceIds: [], coveredRequirementIds: [], coveredWeight: 0, tokenCount: 0 });
    result.trace[0].score = 0;
    expect(() => verifyContextSearchResult(request, result)).toThrow('SAKANA_TOOLS_RESULT_INVALID');
  });

  it('accepts a generated empty terminal plan when all sources are refused or withdrawn', () => {
    const request = requestFixture(); request.budget.iterations = 1;
    request.sources = request.sources.filter(({ standing }) => standing === 'REFUSED' || standing === 'WITHDRAWN');
    const result = resultFixture(1);
    Object.assign(result, { selectedSourceIds: [], coveredRequirementIds: [], coveredWeight: 0, tokenCount: 0 });
    result.trace[0] = { step: 1, parentSourceIds: [], selectedSourceIds: [], score: 0 };
    expect(verifyContextSearchResult(request, result)).toEqual(result);
  });

  it.each(['lower-token', 'lexical'] as const)('enforces the %s tie-break among generated plans', (tieBreak) => {
    const request = requestFixture(); request.requirements = [{ id: 'need-a', weight: 1 }];
    request.sources = request.sources.slice(0, 2).map((source) => ({ ...source, coverage: ['need-a'], tokens: 5 }));
    if (tieBreak === 'lower-token') request.sources[1].tokens = 3;
    const winner = tieBreak === 'lower-token' ? 'source-b' : 'source-a';
    const loser = winner === 'source-a' ? 'source-b' : 'source-a';
    const result = resultFixture();
    Object.assign(result, { selectedSourceIds: [loser], coveredRequirementIds: ['need-a'], coveredWeight: 1, totalWeight: 1, tokenCount: 5 });
    result.trace = [
      { step: 1, parentSourceIds: [], selectedSourceIds: ['source-a'], score: 1 },
      { step: 2, parentSourceIds: [], selectedSourceIds: ['source-b'], score: 1 },
    ];
    expect(() => verifyContextSearchResult(request, result)).toThrow('SAKANA_TOOLS_RESULT_INVALID');
    result.selectedSourceIds = [winner];
    result.tokenCount = tieBreak === 'lower-token' ? 3 : 5;
    expect(verifyContextSearchResult(request, result)).toEqual(result);
  });
});

describe('local worker authorization, isolation, and shared throttle', () => {
  it('refuses unauthorized and default-disabled work before calling transport', async () => {
    const transport = transportFixture();
    await expect(searchContextWithTreeQuest(null, { allowLocal: false, env: enabledEnvironment(), transport }))
      .rejects.toThrow('SAKANA_TOOLS_LOCAL_RUN_NOT_AUTHORIZED');
    await expect(searchContextWithTreeQuest(requestFixture(), { allowLocal: true, env: {}, transport }))
      .rejects.toThrow('SAKANA_TOOLS_DISABLED');
    expect(transport).not.toHaveBeenCalled();
  });

  it('refuses invalid input and unavailable operator configuration without calling transport', async () => {
    const transport = transportFixture();
    await expect(searchContextWithTreeQuest({ ...requestFixture(), executable: 'caller-selected' },
      { allowLocal: true, env: enabledEnvironment(), transport })).rejects.toThrow('SAKANA_TOOLS_INPUT_INVALID');
    for (const overrides of [
      { PAYLOAD_SAKANA_TOOLS_PYTHON: undefined }, { PAYLOAD_SAKANA_TOOLS_PYTHON: 'relative-python' },
      { PAYLOAD_SAKANA_TOOLS_DEPENDENCIES: 'relative-dependencies' },
      { PAYLOAD_SAKANA_TOOLS_DEPENDENCIES: process.execPath },
    ]) {
      await expect(searchContextWithTreeQuest(requestFixture(), { allowLocal: true, env: { ...enabledEnvironment(), ...overrides }, transport }))
        .rejects.toThrow('SAKANA_TOOLS_UNAVAILABLE');
    }
    expect(transport).not.toHaveBeenCalled();
  });

  it('passes only required OS paths and fixed thread controls, stripping credentials and runtime hooks', () => {
    expect(localToolEnvironment({
      SystemRoot: 'fixture-system-root', WINDIR: 'fixture-windows', TEMP: 'fixture-temp', TMP: 'fixture-tmp', TMPDIR: 'fixture-tmpdir',
      OPENAI_API_KEY: 'synthetic-openai-secret', ANTHROPIC_API_KEY: 'synthetic-anthropic-secret',
      AWS_SECRET_ACCESS_KEY: 'synthetic-aws-secret', DATABASE_URL: 'synthetic-db-secret',
      NODE_OPTIONS: '--require injected.js', PYTHONPATH: 'injected', PYTHONHOME: 'injected',
      PYTHONSTARTUP: 'injected.py', PATH: 'caller-bin', HTTP_PROXY: 'caller-proxy',
      PAYLOAD_EXECUTION_PROFILE: 'normal', OMP_NUM_THREADS: '999', UNUSED: undefined,
    })).toEqual({
      SystemRoot: 'fixture-system-root', WINDIR: 'fixture-windows', TEMP: 'fixture-temp', TMP: 'fixture-tmp', TMPDIR: 'fixture-tmpdir',
      NODE_ENV: 'production', PYTHONDONTWRITEBYTECODE: '1', PYTHONNOUSERSITE: '1', OPENBLAS_NUM_THREADS: '1',
      OMP_NUM_THREADS: '1', MKL_NUM_THREADS: '1', NUMEXPR_NUM_THREADS: '1',
    });
  });

  it('submits isolated fixed arguments and returns an unadmitted candidate with recomputed digests', async () => {
    const request = requestFixture(); const transport = transportFixture();
    const env = { ...enabledEnvironment(), OPENAI_API_KEY: 'synthetic-secret', PYTHONPATH: 'injected' };
    const candidate = await searchContextWithTreeQuest(request, { allowLocal: true, env, transport });
    expect(transport).toHaveBeenCalledOnce();
    const submitted = transport.mock.calls[0][0];
    expect(submitted).toMatchObject({ pool: 'production', executable: realpathSync(process.execPath),
      args: ['-I', '-S', '-B', realpathSync(resolve('tools/sakana/worker.py')), '--dependencies', realpathSync(tmpdir())],
      input: JSON.stringify(request), maxOutputBytes: 1048576, timeoutMs: 60000, env: localToolEnvironment(env) });
    expect(submitted.failure('TIMEOUT')).toEqual(new SakanaToolError('SAKANA_TOOLS_TIMEOUT'));
    expect(candidate).toMatchObject({ schema: 'notation.sakana-context-candidate.v1', requestId: request.requestId,
      status: 'UNADMITTED', reviewRequired: true, inputDigest: localRecordDigest(request, 65536),
      outputDigest: localRecordDigest(resultFixture(), 1048576), evaluator: 'weighted-declared-coverage/v1',
      verification: 'BUDGET_AND_DECLARED_COVERAGE_RECOMPUTED', externalRequestMade: false, modelCalls: 0,
      authority: { canAdmit: false, canContact: false, canSpend: false, canDeliver: false, canExecuteCode: false } });
    expect(candidate.selectedSources.map(({ id }) => id)).toEqual(['source-a', 'source-b']);
    expect(candidate.workerDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(candidate.requirementsDigest).toBe(`sha256:${createHash('sha256').update(readFileSync(resolve('tools/sakana/requirements.txt'))).digest('hex')}`);
    expect(candidate.durationMs).toBeGreaterThanOrEqual(0);
    expect(candidate.limits).toEqual({ profile: 'normal', timeoutMs: 60000, maxInputBytes: 65536, maxOutputBytes: 1048576, processPool: 'production' });
    expect(Date.parse(candidate.completedAt)).toBeGreaterThanOrEqual(Date.parse(candidate.startedAt));
    expect(JSON.stringify(candidate)).not.toContain('synthetic-secret');
    expect(request).toEqual(requestFixture());
  });

  it.each([['normal', 128, 60000], ['conserve', 32, 15000]] as const)(
    'uses the operator %s budget and timeout', async (profile, iterations, timeoutMs) => {
      vi.stubEnv('PAYLOAD_EXECUTION_PROFILE', profile);
      const request = requestFixture(); request.budget.iterations = iterations;
      const transport = transportFixture(resultFixture(iterations));
      const candidate = await searchContextWithTreeQuest(request, { allowLocal: true, env: enabledEnvironment(), transport });
      expect(transport.mock.calls[0][0].timeoutMs).toBe(timeoutMs);
      expect(transport.mock.calls[0][0].pool).toBe('production');
      expect(candidate.limits).toEqual({ profile, timeoutMs, maxInputBytes: 65536, maxOutputBytes: 1048576, processPool: 'production' });
    },
  );

  it('does not let per-call environment override the shared conserve throttle', async () => {
    vi.stubEnv('PAYLOAD_EXECUTION_PROFILE', 'conserve');
    const request = requestFixture(); request.budget.iterations = 33;
    const transport = transportFixture(resultFixture(33));
    await expect(searchContextWithTreeQuest(request, { allowLocal: true,
      env: { ...enabledEnvironment(), PAYLOAD_EXECUTION_PROFILE: 'normal' }, transport }))
      .rejects.toThrow('SAKANA_TOOLS_SEARCH_BUDGET_EXCEEDED');
    expect(transport).not.toHaveBeenCalled();
  });

  it.each([
    Buffer.from('{'), Buffer.from('null'), Buffer.from('{}'), Buffer.from([0xc3, 0x28]),
    Buffer.from(JSON.stringify(resultFixture()).replace('"requestId":', '"requestId":"duplicate","requestId":')),
    Buffer.from(JSON.stringify(resultFixture()).replace('"requestId":', '"requestId":"duplicate","request\\u0049d":')),
    Buffer.from(JSON.stringify({ ...resultFixture(), tokenCount: 0 })),
  ])('rejects malformed or forged successful worker output without surfacing diagnostics', async (stdout) => {
    const transport = transportFixture(); transport.mockResolvedValue({ code: 0, stdout });
    await expect(searchContextWithTreeQuest(requestFixture(), { allowLocal: true, env: enabledEnvironment(), transport }))
      .rejects.toThrow(/^SAKANA_TOOLS_RESULT_INVALID$/);
  });

  it.each([1, null])('rejects unsuccessful worker exit %s even with a well-formed result', async (code) => {
    const transport = transportFixture(); transport.mockResolvedValue({ code, stdout: Buffer.from(JSON.stringify(resultFixture())) });
    await expect(searchContextWithTreeQuest(requestFixture(), { allowLocal: true, env: enabledEnvironment(), transport }))
      .rejects.toThrow('SAKANA_TOOLS_WORKER_FAILED');
  });

  it('preserves the bounded transport refusal instead of fabricating a search candidate', async () => {
    const transport = vi.fn<typeof runBoundedProcess>().mockImplementation(async (request) => {
      throw request.failure('BUSY');
    });
    await expect(searchContextWithTreeQuest(requestFixture(), { allowLocal: true, env: enabledEnvironment(), transport }))
      .rejects.toThrow('SAKANA_TOOLS_BUSY');
  });
});
