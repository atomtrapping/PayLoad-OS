/**
 * The surface writing what it decided.
 *
 * `src/db/terminalLedger.test.ts` proves the tables refuse a bad row. This
 * proves the live path puts good ones in them: a session's asks driven through
 * `serveToolCall` and `serveCapabilityCall` with a real ledger behind them,
 * then read back as rows.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { serveCapabilityCall, serveToolCall } from './serve';
import { InMemoryCallSink, type ServedCallSink } from './record';
import { TerminalLedgerStore } from '@/governance/terminalStore';
import { CAPABILITIES } from '@/domain/capabilityRegistry';
import type { TerminalSession } from '@/domain/terminalPlane';

const OPENED = '2026-09-12T09:00:00.000Z';
const AT = '2026-09-12T10:00:00.000Z';

const SESSION: TerminalSession = {
  sessionId: 'TS-1', terminalId: 'terminal:acme-risk', terminalClass: 'CUSTOMER',
  purpose: 'customer_delivery', corpusScope: ['caravan.specialty-cargo'],
  openedAt: OPENED, expiresAt: '2026-09-12T17:00:00.000Z',
};

let store: TerminalLedgerStore | undefined;
afterEach(async () => { await store?.close(); store = undefined; });

describe('a served call lands in the ledger', () => {
  it('writes the declaration once and every ask under it', async () => {
    store = await TerminalLedgerStore.open('t1');
    await serveToolCall(SESSION, 'list_records', { releaseId: 'REL-CAR-2026.09.01' }, AT, store);
    await serveToolCall(SESSION, 'list_releases', { corpus: 'caravan.specialty-cargo' }, AT, store);

    expect(await store.rows(`SELECT session_id, terminal_id, purpose FROM terminal_session`))
      .toEqual([{ session_id: 'TS-1', terminal_id: 'terminal:acme-risk', purpose: 'customer_delivery' }]);
    expect(await store.rows(`SELECT capability_id, decision FROM served_call ORDER BY call_id`)).toEqual([
      { capability_id: 'corpus.list-records', decision: 'ADMITTED' },
      { capability_id: 'corpus.list-releases', decision: 'ADMITTED' },
    ]);
  });

  /* A refusal is recorded as fully as an answer: the pattern worth seeing. */
  it('writes a refusal with its code', async () => {
    store = await TerminalLedgerStore.open('t2');
    const served = await serveToolCall(SESSION, 'list_records', { releaseId: 'REL-TW-2026.09.01' }, AT, store);
    expect(served.refusal?.code).toBe('CORPUS_OUTSIDE_SCOPE');
    expect(await store.rows(`SELECT decision, refusal, corpus FROM served_call`))
      .toEqual([{ decision: 'REFUSED', refusal: 'CORPUS_OUTSIDE_SCOPE', corpus: 'tradewind.freight-rates' }]);
  });

  /* An operate writes the proposal into the kernel and the call that points at it. */
  it('writes the proposal an operate became, with the side effects the capability declared', async () => {
    store = await TerminalLedgerStore.open('t3');
    const operate = CAPABILITIES.find((capability) => capability.kind === 'OPERATE' && !capability.touchesEstates)!;
    const served = await serveCapabilityCall(SESSION, operate.id, { corpus: 'caravan.specialty-cargo' }, AT, store);
    expect(served.admission.outcome).toBe('PROPOSAL_REQUIRED');
    expect(served.unrecorded).toBeUndefined();

    const [call] = await store.rows<{ decision: string; proposal_id: string }>(`SELECT decision, proposal_id FROM served_call`);
    expect(call.decision).toBe('PROPOSAL_REQUIRED');
    const [proposed] = await store.rows<{ operation_kind: string; counterparty: string; authored_by: string; declared_side_effects: string[] }>(
      `SELECT operation_kind, counterparty, authored_by, declared_side_effects FROM operation_proposal WHERE proposal_id = '${call.proposal_id}'`);
    expect(proposed).toMatchObject({
      operation_kind: operate.id,
      counterparty: 'terminal:acme-risk',
      authored_by: 'agent:terminal-plane',
    });
    expect(proposed.declared_side_effects).toEqual([...operate.sideEffects!]);
  });

  /*
   * The ask that reached no described capability is refused and not written:
   * a call row names a capability, and inventing one to name would be a
   * ledger inventing the thing it records.
   */
  it('records nothing for an ask that reached no described capability, and still refuses it', async () => {
    store = await TerminalLedgerStore.open('t4');
    const served = await serveCapabilityCall(SESSION, 'corpus.drop-everything', {}, AT, store);
    expect(served.refusal?.code).toBe('CAPABILITY_UNKNOWN');
    expect(await store.rows(`SELECT 1 FROM served_call`)).toEqual([]);
  });
});

describe('the answer does not depend on being written down', () => {
  /* A correct refusal is not made wrong by the recorder being unavailable. */
  it('answers the call and reports the record as incomplete when the sink throws', async () => {
    const broken: ServedCallSink = {
      openSession: async () => { throw new Error('no database'); },
      recordCall: async () => { throw new Error('unreachable'); },
    };
    const served = await serveToolCall(SESSION, 'list_records', { releaseId: 'REL-CAR-2026.09.01' }, AT, broken);
    expect(served.admission.admitted).toBe(true);
    expect(served.result).toBeDefined();
    expect(served.unrecorded).toEqual({ what: 'SESSION', at: AT, because: 'no database' });
  });

  it('answers with no sink at all, and says nothing about recording', async () => {
    const served = await serveToolCall(SESSION, 'list_records', { releaseId: 'REL-CAR-2026.09.01' }, AT);
    expect(served.result).toBeDefined();
    expect(served.unrecorded).toBeUndefined();
  });

  it('keeps the receipts in memory for a surface with no database behind it', async () => {
    const sink = new InMemoryCallSink();
    await serveToolCall(SESSION, 'list_records', { releaseId: 'REL-CAR-2026.09.01' }, AT, sink);
    await serveToolCall(SESSION, 'list_records', { releaseId: 'REL-TW-2026.09.01' }, AT, sink);
    expect(sink.sessions).toHaveLength(1);
    expect(sink.calls.map((entry) => entry.receipt.decision)).toEqual(['ADMITTED', 'REFUSED']);
  });
});
