import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST, MAX_DOCUMENTS } from './route';
import { STATUTORY_SPECIMENS, STATUTORY_SPECIMEN_CONTEXT, NAIC_REGISTRY } from '@/fixtures/insurability/statutoryFilings';

const get = (query = '') => GET(new NextRequest(`http://127.0.0.1:3111/api/v1/insurability/harvester${query}`));
const post = (body: unknown) =>
  POST(new NextRequest('http://127.0.0.1:3111/api/v1/insurability/harvester', { method: 'POST', body: JSON.stringify(body) }));

const SPECIMEN_DOCUMENTS = STATUTORY_SPECIMENS.map((entry) => ({ declaration: entry.declaration, text: entry.text }));

describe('GET /api/v1/insurability/harvester', () => {
  it('declares the five stages and the three jurisdictions it reads', async () => {
    const body = await (await get()).json();
    expect(body.stages).toEqual(['CAPTURE', 'EXTRACT', 'CANDIDATE_BUILD', 'ADMIT', 'SERVE']);
    expect(body.jurisdictions.map((entry: { id: string }) => entry.id)).toEqual(['FL_OIR', 'CA_CDI', 'TX_TDI']);
    expect(body.contract.id).toBe('payload.statutory-candidate-build.v1');
  });

  /** The whole shape of the module, stated in the payload so a caller cannot miss it. */
  it('states that it never collects', async () => {
    const body = await (await get()).json();
    expect(body.collection.performed).toBe(false);
    expect(body.collection.detail).toContain('never fetches');
  });

  it('reports rows that crossed the gate and bytes that were drafted, without either hiding the other', async () => {
    const body = await (await get('?asOf=2026-05-01T00:00:00.000Z')).json();
    expect(body.records.admitted).toBe(5);
    expect(body.records.refused).toBe(9);
    expect(body.provenance.crossedTheGate).toBe(true);
    expect(body.provenance.beganAs).toEqual(['DRAFTED_SPECIMEN']);
    expect(body.provenance.detail).toContain('neither fact excuses omitting the other');
  });

  it('bounds what it serves by the knowledge instant asked for', async () => {
    expect((await (await get('?asOf=2026-01-01T00:00:00.000Z')).json()).records.served).toBe(0);
    expect((await (await get('?asOf=2026-05-01T00:00:00.000Z')).json()).records.served).toBe(5);
  });

  /** Knowable by a date and in force on a date are different questions. */
  it('answers the valid-time question separately from the knowledge-time one', async () => {
    const march = await (await get('?asOf=2026-03-01T00:00:00.000Z&inForceAt=2026-03-01T00:00:00.000Z')).json();
    expect(march.records.served).toBe(0);
    const april = await (await get('?asOf=2026-05-01T00:00:00.000Z&inForceAt=2026-04-15T00:00:00.000Z')).json();
    expect(april.records.served).toBe(5);
  });

  it('names the filings it excluded by the cutoff rather than dropping them silently', async () => {
    const body = await (await get()).json();
    expect(body.excluded).toHaveLength(1);
    expect(body.excluded[0].extractionId).toContain('fl-oir-302214-26-co-a1');
  });

  it('shows each filing’s identity and world-time adjudication with its reason', async () => {
    const body = await (await get()).json();
    const byId = Object.fromEntries(body.filings.map((entry: { captureId: string }) => [entry.captureId, entry]));
    expect(byId['fl-oir-302214-26-co'].identity.outcome).toBe('RESOLVED');
    expect(byId['ca-cdi-2026-04'].identity.outcome).toBe('NO_USABLE_IDENTIFIER');
    expect(byId['tx-tdi-2026-8871'].worldTime.outcome).toBe('REFUSED');
    for (const filing of body.filings) expect(filing.because.length).toBeGreaterThan(0);
  });

  it('refuses an unreadable instant rather than quietly using now', async () => {
    const res = await get('?asOf=last%20April');
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('UNREADABLE_AS_OF');
  });
});

describe('POST /api/v1/insurability/harvester', () => {
  const base = {
    documents: SPECIMEN_DOCUMENTS,
    registry: NAIC_REGISTRY,
    buildId: 'caller-build-1',
    knownThrough: '2026-05-01T00:00:00.000Z',
    context: STATUTORY_SPECIMEN_CONTEXT,
    authority: 'authority:caller',
    ruledAt: '2026-05-02T00:00:00.000Z',
    asOf: '2026-05-02T00:00:00.000Z',
  };

  it('runs the pipeline over supplied bytes and admits what passes', async () => {
    const body = await (await post(base)).json();
    expect(body.mode).toBe('SUPPLIED_BYTES');
    expect(body.records.captured).toBe(4);
    expect(body.records.admitted).toBe(10);
    expect(body.rows).toHaveLength(10);
    expect(body.receipt.authority).toBe('authority:caller');
  });

  it('refuses to name its own authority', async () => {
    const res = await post({ ...base, authority: '   ' });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe('NO_AUTHORITY_NAMED');
    expect(body.remedy).toContain('will not name itself');
  });

  it('refuses to decide the caller’s rights', async () => {
    const res = await post({ ...base, context: undefined });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('NO_DECLARED_CONTEXT');
  });

  it('refuses to assume the knowledge horizon is now', async () => {
    const res = await post({ ...base, knownThrough: undefined });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe('NO_KNOWLEDGE_HORIZON');
    expect(body.remedy).toContain('A build states what it knew');
  });

  /** An empty registry is the registry being empty. It is not the filings being wrong. */
  it('refuses every candidate when no registration is supplied, and says why', async () => {
    const body = await (await post({ ...base, registry: [] })).json();
    expect(body.records.admitted).toBe(0);
    expect(body.registryNote).toContain('That is the registry being empty, not the filings being wrong');
    expect(body.refusalTally.some((entry: { check: string }) => entry.check === 'SUBJECT_IDENTIFIED')).toBe(true);
  });

  it('reports a capture that was refused instead of dropping the document', async () => {
    const broken = { declaration: { ...SPECIMEN_DOCUMENTS[0].declaration, captureId: 'bad-clock', knownAt: '2020-01-01T00:00:00.000Z' }, text: SPECIMEN_DOCUMENTS[0].text };
    const body = await (await post({ ...base, documents: [...SPECIMEN_DOCUMENTS, broken] })).json();
    expect(body.records.captureRefused).toBe(1);
    expect(body.captureRefusals[0].captureId).toBe('bad-clock');
    expect(body.captureRefusals[0].because).toContain('precedes the capture time');
  });

  it('refuses a body with no documents rather than harvesting anything itself', async () => {
    const res = await post({ ...base, documents: [] });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('NO_DOCUMENTS');
    expect(body.remedy).toContain('This route never fetches');
  });

  it('caps the batch and the document size', async () => {
    const many = Array.from({ length: MAX_DOCUMENTS + 1 }, () => SPECIMEN_DOCUMENTS[0]);
    expect((await post({ ...base, documents: many })).status).toBe(413);
    const huge = [{ declaration: SPECIMEN_DOCUMENTS[0].declaration, text: 'x'.repeat(512 * 1024 + 1) }];
    expect((await post({ ...base, documents: huge })).status).toBe(413);
  });

  it('refuses an unreadable body', async () => {
    const res = await POST(new NextRequest('http://127.0.0.1:3111/api/v1/insurability/harvester', { method: 'POST', body: '{not json' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('UNREADABLE_BODY');
  });

  it('reproduces the same receipt digest for the same request', async () => {
    const first = await (await post(base)).json();
    const second = await (await post(base)).json();
    expect(first.receipt.receiptDigest).toBe(second.receipt.receiptDigest);
  });
});
