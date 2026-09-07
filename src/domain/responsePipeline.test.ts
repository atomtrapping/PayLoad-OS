import { describe, expect, it } from 'vitest';
import { DISCLOSURE_MEANING, NEVER_SERVED, PIPELINE_LOSS, PIPELINE_METHOD, STAGE_ORDER, proofEligibility, respond, type Licence, type ResponseRequest, type ServableRow } from './responsePipeline';

const REQUEST: ResponseRequest = {
  queryId: 'q-1', releaseId: 'REL-1', policyVersion: '1.0.0',
  question: 'WHAT_WE_HELD', atInstant: '2026-09-07T12:00:00Z', purpose: 'UNDERWRITING',
};

const LICENCE: Licence = {
  callerId: 'caller-1', permittedPurposes: ['UNDERWRITING'], permittedSourceIds: ['src-a'], disclosure: 'FULL',
};

function row(over: Partial<ServableRow> = {}): ServableRow {
  return {
    recordId: 'REC-1', sourceId: 'src-a', estateClass: null, provenance: 'LIVE_CAPTURE',
    validFrom: '2026-09-01T00:00:00Z', validTo: null, knownAt: '2026-09-02T00:00:00Z',
    sourceTime: '2026-09-01T12:00:00Z', acquisitionTime: '2026-09-02T00:00:00Z',
    evidenceGrade: 'reported/measured/unknown', content: { widthM: 2.41 },
    ...over,
  };
}

describe('the response pipeline: what leaves, why, and the receipt', () => {
  it('serves a permitted, admitted, in-boundary row in full', () => {
    const response = respond(REQUEST, LICENCE, [row()]);
    expect(response.served).toBe(1);
    expect(response.outcomes[0].disclosure).toBe('FULL');
    expect(response.outcomes[0].payload).toMatchObject({ recordId: 'REC-1', content: { widthM: 2.41 } });
    expect(response.receiptDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(response.method).toBe(PIPELINE_METHOD);
  });

  it('refuses the estates before it reads a licence, because no licence reaches them', () => {
    // A fully permitted caller is still refused here. The order is the argument.
    const permissive: Licence = { ...LICENCE, permittedPurposes: ['UNDERWRITING', 'ANY'], permittedSourceIds: ['src-a', 'src-b'] };
    for (const estateClass of NEVER_SERVED) {
      const response = respond(REQUEST, permissive, [row({ estateClass, sourceId: 'src-b' })]);
      expect(response.outcomes[0].refusedAt).toBe('ESTATE');
      expect(response.outcomes[0].because).toMatch(/a permitted caller is still refused here/);
    }
    expect(STAGE_ORDER[0]).toBe('ESTATE');
    expect(PIPELINE_LOSS.join(' ')).toMatch(/refused before rights are read/);
  });

  it('treats an unlisted purpose and an unlicensed source as refusals, never as defaults', () => {
    const wrongPurpose = respond({ ...REQUEST, purpose: 'RESALE' }, LICENCE, [row()]);
    expect(wrongPurpose.outcomes[0].refusedAt).toBe('RIGHTS');
    expect(wrongPurpose.outcomes[0].because).toMatch(/never a default permission/);
    const wrongSource = respond(REQUEST, LICENCE, [row({ sourceId: 'src-z' })]);
    expect(wrongSource.outcomes[0].refusedAt).toBe('RIGHTS');
    expect(wrongSource.outcomes[0].because).toMatch(/not licensed to this caller/);
  });

  it('never serves a demonstration row as corpus state, whatever the licence permits', () => {
    const response = respond(REQUEST, LICENCE, [row({ provenance: 'DEMONSTRATION' })]);
    expect(response.outcomes[0].refusedAt).toBe('ADMISSIBILITY');
    expect(response.outcomes[0].because).toMatch(/never crossed the admission gate/);
    expect(response.outcomes[0].because).toMatch(/The pages may show it; an answer may not carry it/);
  });

  it('applies the as-of question the caller asked, and refuses at that stage rather than earlier', () => {
    // Acquired 2026, asked what we held in 2019: refused at QUESTION, not RIGHTS.
    const early = respond({ ...REQUEST, atInstant: '2019-01-01T00:00:00Z' }, LICENCE, [row({ provenance: 'BACKFILLED', sourceTime: '2019-06-02T00:00:00Z' })]);
    expect(early.outcomes[0].refusedAt).toBe('QUESTION');
    expect(early.outcomes[0].because).toMatch(/that is the other question/);
    // The other question, same row, same instant: served.
    const sourceKnew = respond({ ...REQUEST, question: 'WHAT_THE_SOURCE_KNEW', atInstant: '2019-07-01T00:00:00Z' }, LICENCE,
      [row({ provenance: 'BACKFILLED', sourceTime: '2019-06-02T00:00:00Z', validFrom: '2019-06-01T00:00:00Z' })]);
    expect(sourceKnew.served).toBe(1);
  });

  it('serves existence and grade without substance, and says that is a different question', () => {
    const response = respond(REQUEST, { ...LICENCE, disclosure: 'PROVENANCE_ONLY' }, [row()]);
    expect(response.served).toBe(1);
    expect(response.outcomes[0].payload).toMatchObject({ recordId: 'REC-1', evidenceGrade: 'reported/measured/unknown' });
    expect(response.outcomes[0].payload).not.toHaveProperty('content');
    expect(DISCLOSURE_MEANING.PROVENANCE_ONLY).toMatch(/the shape of the answer and not the answer/);
    expect(PIPELINE_LOSS.join(' ')).toMatch(/it is the answer to a different one/);
  });

  it('is deterministic over pinned inputs, which is what makes it proof-eligible', () => {
    const rows = [row(), row({ recordId: 'REC-2', provenance: 'DEMONSTRATION' })];
    const a = respond(REQUEST, LICENCE, rows);
    const b = respond(REQUEST, LICENCE, rows);
    expect(a.receiptDigest).toBe(b.receiptDigest);
    // Licence term order does not change the receipt; a different purpose does.
    const reordered = respond(REQUEST, { ...LICENCE, permittedPurposes: ['UNDERWRITING'], permittedSourceIds: ['src-a'] }, rows);
    expect(reordered.receiptDigest).toBe(a.receiptDigest);
    expect(respond({ ...REQUEST, policyVersion: '1.0.1' }, LICENCE, rows).receiptDigest).not.toBe(a.receiptDigest);
    expect(a.because).toMatch(/refused at ADMISSIBILITY \(1\)/);
  });

  it('lets the card grade decide proof-eligibility rather than claiming it', () => {
    const response = respond(REQUEST, LICENCE, [row()]);
    const verdict = proofEligibility(REQUEST, LICENCE, response);
    expect(verdict.grade).toBe('CARD_GRADE');
    expect(verdict.missing).toEqual([]);
    const loss = PIPELINE_LOSS.join(' ');
    expect(loss).toMatch(/Nothing here generates a proof/);
    expect(loss).toMatch(/the grade the card gives rather than a claim this module makes/);
    // And the receipt's honest limit.
    expect(loss).toMatch(/a perfect mirror of the policy, not of the obligation/);
  });
});
