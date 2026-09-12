/**
 * The governed surface, against the committed demonstration corpus.
 *
 * `./tools.test.ts` proves the tools answer. This proves the door: the same
 * tool answers one session and refuses another, the corpus a call is about is
 * resolved from what the call names, and both outcomes carry a receipt.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { corpusOfCall, serveCapabilityCall, serveToolCall } from './serve';
import { admitCapability, type TerminalSession } from '@/domain/terminalPlane';
import { TOOL_CAPABILITY } from '@/domain/capabilityRegistry';
import { getCorpusSource } from '@/adapter/corpusSource';
import { getCaseSource } from '@/adapter/caseSource';

afterEach(() => vi.restoreAllMocks());

const AT = '2026-09-12T10:00:00.000Z';

const session = (over: Partial<TerminalSession> = {}): TerminalSession => ({
  sessionId: 'TS-1',
  terminalId: 'terminal:acme-risk',
  terminalClass: 'CUSTOMER',
  purpose: 'customer_delivery',
  corpusScope: ['caravan.specialty-cargo'],
  openedAt: '2026-09-12T09:00:00.000Z',
  expiresAt: '2026-09-12T17:00:00.000Z',
  ...over,
});

describe('a call is about the corpus it names', () => {
  it('takes the corpus argument where the tool has one', async () => {
    expect(await corpusOfCall({ corpus: 'tradewind.freight' })).toBe('tradewind.freight');
  });

  /* A release identifier does carry a corpus, through the source's own inventory. */
  it('resolves the corpus of a named release from the source', async () => {
    expect(await corpusOfCall({ releaseId: 'REL-CAR-2026.09.01' })).toBe('caravan.specialty-cargo');
    expect(await corpusOfCall({ releaseId: 'REL-CAR-2026.09.01', corpus: 'landshark.terminal-parcels' })).toBe('caravan.specialty-cargo');
    expect(await corpusOfCall({ releaseId: 'nope' })).toBeUndefined();
  });

  it('is undefined when the call names neither, which is not the same as any corpus', async () => {
    expect(await corpusOfCall({ rulingId: 'RUL-7C104-r2' })).toBeUndefined();
    expect(await corpusOfCall({})).toBeUndefined();
    expect(await corpusOfCall(undefined)).toBeUndefined();
  });
});

describe('the same tool answers one session and refuses another', () => {
  it('answers a customer asking for records of the corpus its session named', async () => {
    const served = await serveToolCall(session(), 'list_records', { releaseId: 'REL-CAR-2026.09.01' }, AT);
    expect(served.admission.admitted).toBe(true);
    expect(served.refusal).toBeUndefined();
    expect(served.result).toBeDefined();
    expect(served.receipt).toMatchObject({
      terminalId: 'terminal:acme-risk', purpose: 'customer_delivery', tool: 'list_records',
      corpus: 'caravan.specialty-cargo', servedAt: AT, decision: 'ADMITTED',
    });
  });

  it('refuses the same call from a session scoped to another corpus, and serves nothing', async () => {
    const served = await serveToolCall(session({ corpusScope: ['tradewind.freight'] }), 'list_records', { releaseId: 'REL-CAR-2026.09.01' }, AT);
    expect(served.admission.admitted).toBe(false);
    expect(served.result).toBeUndefined();
    expect(served.refusal).toMatchObject({ code: 'CORPUS_OUTSIDE_SCOPE' });
    expect(served.refusal?.remedy).toContain('not widened');
    expect(served.receipt.decision).toBe('REFUSED');
  });

  /* Aggregation gets the release metadata and not the rows behind it. */
  it('refuses the rows to an aggregation session and answers its metadata call', async () => {
    const aggregating = session({ terminalClass: 'FIRM_INTERNAL', purpose: 'aggregation', corpusScope: ['caravan.specialty-cargo'] });
    const rows = await serveToolCall(aggregating, 'list_records', { releaseId: 'REL-CAR-2026.09.01' }, AT);
    expect(rows.refusal?.code).toBe('PURPOSE_DOES_NOT_ADMIT_THIS');
    expect(rows.result).toBeUndefined();
    const metadata = await serveToolCall(aggregating, 'list_releases', { corpus: 'caravan.specialty-cargo' }, AT);
    expect(metadata.admission.admitted).toBe(true);
  });

  it('refuses a session that could not be opened, whatever it asks', async () => {
    const served = await serveToolCall(session({ terminalClass: 'FIRM_INTERNAL', purpose: 'model_training', corpusScope: ['caravan.specialty-cargo'] }), 'list_releases', {}, AT);
    expect(served.refusal?.code).toBe('PURPOSE_NOT_DECLARABLE_AT_ALL');
    expect(served.result).toBeUndefined();
  });

  it('refuses an unknown tool as an answer rather than a throw', async () => {
    const served = await serveToolCall(session(), 'drop_corpus', {}, AT);
    expect(served.refusal?.code).toBe('TOOL_UNKNOWN');
    expect(served.refusal?.remedy).toContain('list_releases');
  });

  /*
   * A mistyped instant is a tool error, not a refusal: telling a caller its
   * purpose does not admit the tool, when the real fault is its argument,
   * sends it to fix the wrong thing.
   */
  it('keeps malformed arguments a tool error, before the admission decision', async () => {
    await expect(serveToolCall(session(), 'query_as_of', { releaseId: 'REL-CAR-2026.09.01', subject: 's', predicate: 'p', validAt: 'yesterday', knownAt: 'now', question: 'WHAT_WE_HELD' }, AT))
      .rejects.toThrow(/ISO 8601/);
  });

  it('carries the receipt on the refusal as well as on the answer', async () => {
    const refused = await serveToolCall(session({ expiresAt: '2026-09-12T09:30:00.000Z' }), 'list_releases', {}, AT);
    expect(refused.receipt).toMatchObject({ decision: 'REFUSED', refusal: 'SESSION_EXPIRED', tool: 'list_releases', servedAt: AT });
    expect(refused.receipt.terminalClass).toBe('CUSTOMER');
  });
});

describe('a terminal asks for a capability, and an operate comes back as a proposal', () => {
  it('answers a read capability through the tool that reaches it', async () => {
    const served = await serveCapabilityCall(session(), 'corpus.list-records', { releaseId: 'REL-CAR-2026.09.01' }, AT);
    expect(served.admission.outcome).toBe('ADMITTED');
    expect(served.result).toBeDefined();
    expect(served.receipt.capability).toBe('corpus.list-records');
  });

  it('refuses a capability nothing describes, rather than guessing at one', async () => {
    const served = await serveCapabilityCall(session(), 'corpus.drop-everything', {}, AT);
    expect(served.refusal?.code).toBe('CAPABILITY_UNKNOWN');
    expect(served.result).toBeUndefined();
  });

  it('refuses a described capability the session is not scoped for', async () => {
    const served = await serveCapabilityCall(session({ corpusScope: ['tradewind.freight'] }), 'corpus.list-records', { releaseId: 'REL-CAR-2026.09.01' }, AT);
    expect(served.refusal?.code).toBe('CORPUS_OUTSIDE_SCOPE');
  });

  /*
   * The registry describes only reads today, so this exercises the operate
   * path with a capability of its own rather than one of the twelve. What it
   * proves is that the plane routes by kind: nothing is dispatched, and the
   * ask comes back as the proposal it became, saying what it waits on.
   */
  it('dispatches nothing for an operate, and hands back what the ask waits on', async () => {
    const asked = admitCapability(session(), {
      id: 'discovery.run-workload',
      title: 'Run one mining workload over a set of corpus records',
      kind: 'OPERATE',
      subsystem: 'Discovery',
      module: 'src/discovery/engine.ts',
      entryPoint: 'runMiningWorkload',
      reachableToday: 'not reachable',
      gatedBy: 'nothing',
      sideEffects: ['Writes a workload run and its derived artifacts with their lineage.'],
      authorityNeeded: 'A digest-bound execution authorization.',
      touchesEstates: false,
    }, AT, 'caravan.specialty-cargo');
    expect(asked.outcome).toBe('PROPOSAL_REQUIRED');
    expect(asked.proposal?.counterparty).toBe('terminal:acme-risk');
    expect(asked.proposal?.underPurpose).toBe('customer_delivery');
    expect(asked.proposal?.blockedBy).toContain('does not persist an executable request');
  });
});

describe.each(['tool', 'capability'] as const)('the %s boundary binds authorization to the dispatched read', (entrypoint) => {
  const call = (principal: TerminalSession, name: string, args: unknown) => entrypoint === 'tool'
    ? serveToolCall(principal, name, args, AT)
    : serveCapabilityCall(principal, TOOL_CAPABILITY[name], args, AT);
  const outside = () => session({ corpusScope: ['landshark.terminal-parcels'] });

  it.each(['get_release', 'get_release_manifest', 'list_records', 'query_as_of'])('rejects corpus smuggling for %s', async (name) => {
    const args = name === 'query_as_of'
      ? { releaseId: 'REL-CAR-2026.09.01', subject: 'LOT-5B-221', predicate: 'quantity.gross', validAt: '2026-08-17T16:00:00Z', knownAt: '2026-08-20T00:00:00Z', question: 'WHAT_WE_HELD' }
      : { releaseId: 'REL-CAR-2026.09.01' };
    for (const corpus of ['landshark.terminal-parcels', null, 42]) {
      await expect(call(outside(), name, { ...args, corpus })).rejects.toThrow();
    }
    expect((await call(outside(), name, args)).refusal?.code).toBe('CORPUS_OUTSIDE_SCOPE');
    expect((await call(session(), name, args)).admission.admitted).toBe(true);
  });

  it('filters collection rows and counts to the owned scope, including omitted filters', async () => {
    const releases = await call(outside(), 'list_releases', {});
    const releaseResult = releases.result as { count: number; releases: { corpusId: string }[] };
    expect(releaseResult.count).toBeGreaterThan(0);
    expect(releaseResult.count).toBe(releaseResult.releases.length);
    expect(releaseResult.releases.every((release) => release.corpusId === 'landshark.terminal-parcels')).toBe(true);
    expect((await call(outside(), 'list_releases', { corpus: 'caravan.specialty-cargo' })).refusal?.code).toBe('CORPUS_OUTSIDE_SCOPE');
    await expect(call(outside(), 'list_releases', { corpus: 'caravan.specialty-cargo', releaseId: null })).rejects.toThrow();
    const retractions = await call(outside(), 'list_retractions', { since: '2026-08-26T00:00:00Z' });
    expect(retractions.result).toMatchObject({ count: 1, retractions: [{ retractionId: 'RET-LS-0001' }] });
    const empty = await call(session({ corpusScope: ['absent-corpus'] }), 'list_releases', {});
    expect(empty.result).toMatchObject({ count: 0, releases: [] });
  });

  it.each(['get_ruling', 'get_ruling_manifest'])('resolves %s ownership and caps its public projection', async (name) => {
    const args = { rulingId: 'RUL-7C104-r2' };
    expect((await call(outside(), name, args)).refusal?.code).toBe('CORPUS_OUTSIDE_SCOPE');
    const customer = await call(session(), name, args);
    expect(customer.result).toMatchObject({ projection: 'COUNTERPARTY_SHARED' });
    expect(customer.receipt.corpus).toBe('caravan.specialty-cargo');
    const publicSession = session({ terminalClass: 'PUBLIC', purpose: 'redistribution' });
    expect((await call(publicSession, name, args)).result).toMatchObject({ error: 'not_visible' });
    expect((await call(publicSession, name, { ...args, projection: 'PUBLIC_RULING' })).result).toMatchObject({ error: 'not_visible' });
    expect((await call(publicSession, name, { ...args, projection: 'COUNTERPARTY_SHARED' })).refusal?.code).toBe('PROJECTION_OUTSIDE_AUTHORITY');
  });

  it('applies the same public cap to retractions', async () => {
    const principal = session({ terminalClass: 'PUBLIC', purpose: 'redistribution' });
    expect((await call(principal, 'list_retractions', {})).result).toMatchObject({ projection: 'PUBLIC_RULING' });
    expect((await call(principal, 'list_retractions', { projection: 'COUNTERPARTY_SHARED' })).refusal?.code).toBe('PROJECTION_OUTSIDE_AUTHORITY');
  });

  it.each([
    ['get_factoring_receipt', { receiptId: 'RCP-FACT-2026-0901' }],
    ['get_factoring_receipt', { receiptId: 'SHP-CAR-88219' }],
    ['verify_factoring_receipt', { receiptId: 'SHP-CAR-88219' }],
    ['get_dispatch_event', { decisionId: 'DISP-EVT-2026-0803' }],
    ['get_dispatch_event', { decisionId: 'LOD-99203' }],
    ['replay_dispatch_liability', { decisionId: 'LOD-99203' }],
  ])('binds %s and its aliases using the artifact release', async (name, args) => {
    expect((await call(outside(), name, args)).refusal?.code).toBe('CORPUS_OUTSIDE_SCOPE');
    const allowed = await call(session(), name, args);
    expect(allowed.admission.admitted).toBe(true);
    expect(allowed.result).toBeDefined();
    expect(allowed.receipt.corpus).toBe('caravan.specialty-cargo');
  });

  it('refuses an existing ruling whose release cannot establish its corpus', async () => {
    const cases = getCaseSource();
    const hit = (await cases.getRuling('RUL-7C104-r2'))!;
    vi.spyOn(cases, 'getRuling').mockResolvedValue({ ...hit, ruling: { ...hit.ruling, corpus: { ...hit.ruling.corpus, releaseId: 'missing-release' } } });
    const result = await call(session(), 'get_ruling', { rulingId: 'RUL-7C104-r2' });
    expect(result.refusal?.code).toBe('CORPUS_UNRESOLVED');
    expect(result.result).toBeUndefined();
  });

  it('owns the arguments and session while resource lookup is pending', async () => {
    const source = getCorpusSource();
    const getRelease = source.getRelease.bind(source);
    let resume!: () => void;
    const paused = new Promise<void>((resolve) => { resume = resolve; });
    vi.spyOn(source, 'getRelease').mockImplementationOnce(async (id) => { await paused; return getRelease(id); });
    const principal = session();
    const args = { releaseId: 'REL-CAR-2026.09.01' };
    const pending = call(principal, 'list_records', args);
    args.releaseId = 'REL-LS-2026.09.01';
    principal.terminalId = 'changed';
    principal.purpose = 'redistribution';
    (principal.corpusScope as string[]).splice(0, 1, 'landshark.terminal-parcels');
    resume();
    const result = await pending;
    expect(result.admission.admitted).toBe(true);
    expect(result.receipt).toMatchObject({ terminalId: 'terminal:acme-risk', purpose: 'customer_delivery', corpus: 'caravan.specialty-cargo' });
    expect(result.result).toMatchObject({ release: { releaseId: 'REL-CAR-2026.09.01' } });
  });

  it('cannot widen a pending session by mutating its original scope', async () => {
    const source = getCorpusSource();
    const getRelease = source.getRelease.bind(source);
    let resume!: () => void;
    const paused = new Promise<void>((resolve) => { resume = resolve; });
    vi.spyOn(source, 'getRelease').mockImplementationOnce(async (id) => { await paused; return getRelease(id); });
    const principal = outside();
    const pending = call(principal, 'list_records', { releaseId: 'REL-CAR-2026.09.01' });
    (principal.corpusScope as string[]).push('caravan.specialty-cargo');
    resume();
    const result = await pending;
    expect(result.refusal?.code).toBe('CORPUS_OUTSIDE_SCOPE');
    expect(result.result).toBeUndefined();
  });

  it('returns a stable not-found result without dispatching an unresolved read', async () => {
    const lookup = vi.spyOn(getCorpusSource(), 'getRelease').mockResolvedValueOnce(undefined);
    const result = await call(session(), 'get_release', { releaseId: 'missing-release' });
    expect(result.result).toMatchObject({ error: 'release_not_found' });
    expect(lookup).toHaveBeenCalledTimes(1);
  });
});
