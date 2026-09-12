/**
 * The governed surface, against the committed demonstration corpus.
 *
 * `./tools.test.ts` proves the tools answer. This proves the door: the same
 * tool answers one session and refuses another, the corpus a call is about is
 * resolved from what the call names, and both outcomes carry a receipt.
 */
import { describe, expect, it } from 'vitest';
import { corporaOfCall, corpusOfCall, serveCapabilityCall, serveToolCall } from './serve';
import { admitCapability, type TerminalSession } from '@/domain/terminalPlane';

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
    expect(asked.proposal?.blockedBy).toContain('no release has been admitted');
  });
});

/**
 * Two authorization bypasses, found by an independent review of this surface
 * and reproduced before they were closed. Both were reachable in one argument,
 * which is why they are regression tests and not comments.
 */
describe('a caller cannot argue its way past the boundary', () => {
  const landshark = session({ terminalId: 'terminal:landshark-only', corpusScope: ['landshark.parcels'] });
  const anonymous = session({ terminalId: 'terminal:anon', terminalClass: 'PUBLIC', purpose: 'redistribution' });

  /*
   * The scope check read the caller's `corpus` argument in preference to the
   * corpus of the release it also named, so a session could be judged against
   * one corpus and served another. `list_records` does not even declare a
   * `corpus` parameter; the extra key rode through because the check read the
   * raw arguments rather than the parsed ones.
   */
  it('refuses an out-of-scope release named beside an in-scope corpus', async () => {
    const honest = await serveToolCall(landshark, 'list_records', { releaseId: 'REL-CAR-2026.09.01' }, AT);
    expect(honest.refusal?.code).toBe('CORPUS_OUTSIDE_SCOPE');

    const masked = await serveToolCall(landshark, 'list_records', { releaseId: 'REL-CAR-2026.09.01', corpus: 'landshark.parcels' }, AT);
    expect(masked.refusal?.code).toBe('CORPUS_OUTSIDE_SCOPE');
    expect(masked.result).toBeUndefined();
    expect(masked.admission.because).toContain('caravan.specialty-cargo');
  });

  it('names every corpus a call names, with the release’s own first', async () => {
    expect(await corporaOfCall({ releaseId: 'REL-CAR-2026.09.01', corpus: 'landshark.parcels' }))
      .toEqual(['caravan.specialty-cargo', 'landshark.parcels']);
    expect(await corpusOfCall({ releaseId: 'REL-CAR-2026.09.01', corpus: 'landshark.parcels' })).toBe('caravan.specialty-cargo');
    /* A release that resolves to nothing contributes nothing rather than a guess. */
    expect(await corporaOfCall({ releaseId: 'nope' })).toEqual([]);
  });

  /*
   * The projection was the caller's to choose, so a public terminal could ask
   * for the counterparty view of a ruling and be given it — private detail and
   * all. Omitting the argument was the same bypass by another route, because
   * the surface's own default was the wider one.
   */
  it('serves a public terminal the public projection, asked for or not', async () => {
    for (const args of [{ rulingId: 'RUL-7C104-r2', projection: 'COUNTERPARTY_SHARED' }, { rulingId: 'RUL-7C104-r2' }]) {
      const served = await serveToolCall(anonymous, 'get_ruling', args, AT);
      expect(JSON.stringify(served.result), JSON.stringify(args)).toContain('not_visible');
      expect(JSON.stringify(served.result)).not.toContain('COUNTERPARTY_SHARED');
    }
  });

  /* And a customer still receives the counterparty projection its class may have. */
  it('leaves the counterparty projection to the classes that may receive it', async () => {
    const served = await serveToolCall(session(), 'get_ruling', { rulingId: 'RUL-7C104-r2' }, AT);
    expect(JSON.stringify(served.result)).toContain('COUNTERPARTY_SHARED');
  });
});
