/**
 * The governed surface, against the committed demonstration corpus.
 *
 * `./tools.test.ts` proves the tools answer. This proves the door: the same
 * tool answers one session and refuses another, the corpus a call is about is
 * resolved from what the call names, and both outcomes carry a receipt.
 */
import { describe, expect, it } from 'vitest';
import { corpusOfCall, serveToolCall } from './serve';
import type { TerminalSession } from '@/domain/terminalPlane';

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
