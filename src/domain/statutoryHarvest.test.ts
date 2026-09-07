import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  captureSuppliedDocument,
  extractFiling,
  fieldOf,
  JURISDICTION_GRAMMAR,
  JURISDICTION_IDS,
  type CaptureDeclaration,
  type StatutoryCapture,
} from './statutoryHarvest';
import { STATUTORY_SPECIMENS } from '@/fixtures/insurability/statutoryFilings';

const DECLARATION: CaptureDeclaration = {
  captureId: 'probe-1',
  jurisdiction: 'FL_OIR',
  sourceUrl: 'https://specimen.invalid/probe',
  mediaType: 'text/plain',
  capturedAt: '2026-02-12T14:05:00.000Z',
  knownAt: '2026-02-12T14:07:00.000Z',
  beganAs: 'DRAFTED_SPECIMEN',
};

function captureOrThrow(declaration: CaptureDeclaration, text: string): StatutoryCapture {
  const result = captureSuppliedDocument(declaration, text);
  if (result.capture === null) throw new Error(result.because);
  return result.capture;
}

const specimen = (captureId: string) => STATUTORY_SPECIMENS.find((entry) => entry.declaration.captureId === captureId)!;

describe('statutory capture: bytes somebody supplied, never bytes this fetched', () => {
  it('computes the digest over the supplied bytes rather than accepting a declared one', () => {
    const text = 'Case No: X-1\n';
    const capture = captureOrThrow(DECLARATION, text);
    expect(capture.artifactDigest).toBe(`sha256:${createHash('sha256').update(Buffer.from(text, 'utf-8')).digest('hex')}`);
    expect(capture.byteLength).toBe(Buffer.byteLength(text, 'utf-8'));
  });

  it('never claims the source is true merely because the bytes were kept', () => {
    expect(captureOrThrow(DECLARATION, 'Case No: X-1\n').sourceTruthClaimed).toBe(false);
  });

  /**
   * The constraint that shapes this whole module: collection against a
   * regulator is the operator's act, under the operator's credentials and
   * their reading of the source's terms. A test-asserted absence, because a
   * comment saying "this does not fetch" is not a guarantee that it does not.
   */
  it('has no path to a network at all', () => {
    const source = readFileSync('src/domain/statutoryHarvest.ts', 'utf-8');
    for (const forbidden of ['fetch(', 'node:http', 'node:https', 'XMLHttpRequest', 'undici', 'axios']) {
      expect(source, `statutoryHarvest must not reach a network: found ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('refuses a jurisdiction whose header grammar nobody declared', () => {
    const result = captureSuppliedDocument({ ...DECLARATION, jurisdiction: 'NY_DFS' as never }, 'Case No: X-1');
    expect(result.capture).toBeNull();
    expect(result.because).toContain('No grammar is declared');
  });

  it('refuses to guess whether its own corpus descends from a capture or a draft', () => {
    const result = captureSuppliedDocument({ ...DECLARATION, beganAs: undefined as never }, 'Case No: X-1');
    expect(result.capture).toBeNull();
    expect(result.because).toContain('will not guess');
  });

  it('refuses a knowledge time earlier than the capture it descends from', () => {
    const result = captureSuppliedDocument({ ...DECLARATION, knownAt: '2026-02-12T14:00:00.000Z' }, 'Case No: X-1');
    expect(result.capture).toBeNull();
    expect(result.because).toContain('precedes the capture time');
  });

  it('refuses empty bytes rather than producing a capture of nothing', () => {
    expect(captureSuppliedDocument(DECLARATION, '').capture).toBeNull();
  });

  it('carries the supplier declaration through unchanged, so nothing promotes a draft to a capture', () => {
    const extraction = extractFiling(captureOrThrow(DECLARATION, 'Case No: X-1'));
    expect(extraction.beganAs).toBe('DRAFTED_SPECIMEN');
  });
});

describe('the declared grammar', () => {
  it('declares a label and a kind for every field of every jurisdiction', () => {
    expect(JURISDICTION_IDS).toEqual(['FL_OIR', 'CA_CDI', 'TX_TDI']);
    for (const id of JURISDICTION_IDS) {
      const grammar = JURISDICTION_GRAMMAR[id];
      expect(grammar.fields.length).toBeGreaterThan(0);
      for (const rule of grammar.fields) {
        expect(rule.label.trim(), `${id}.${rule.field} must declare a label`).not.toBe('');
        expect(rule.kind).toBeTruthy();
      }
      const fields = grammar.fields.map((rule) => rule.field);
      expect(new Set(fields).size, `${id} declares a field twice`).toBe(fields.length);
    }
  });

  /** Each regulator prints its own labels. Reading one jurisdiction's document with another's grammar finds nothing. */
  it('reads each jurisdiction by its own labels rather than a shared guess', () => {
    expect(JURISDICTION_GRAMMAR.FL_OIR.fields.find((r) => r.field === 'issuedDate')!.label).toBe('Filed');
    expect(JURISDICTION_GRAMMAR.TX_TDI.fields.find((r) => r.field === 'issuedDate')!.label).toBe('Signed');
    const florida = extractFiling(captureOrThrow(DECLARATION, specimen('tx-tdi-2026-8871').text));
    expect(fieldOf(florida, 'issuedDate')!.presence).toBe('ABSENT');
  });
});

describe('four presence states, kept apart because they mean different things', () => {
  it('reads a labelled line as PRESENT', () => {
    const extraction = extractFiling(captureOrThrow(DECLARATION, specimen('fl-oir-302214-26-co').text));
    expect(fieldOf(extraction, 'carrierNaic')).toMatchObject({ presence: 'PRESENT', value: '99014' });
    expect(fieldOf(extraction, 'policiesImpacted')).toMatchObject({ presence: 'PRESENT', value: 41880 });
    expect(fieldOf(extraction, 'capacityReductionPct')).toMatchObject({ presence: 'PRESENT', value: 100 });
  });

  it('marks a label that does not appear ABSENT, which is not a claim of none', () => {
    const extraction = extractFiling(captureOrThrow({ ...DECLARATION, jurisdiction: 'CA_CDI' }, specimen('ca-cdi-2026-04').text));
    const naic = fieldOf(extraction, 'carrierNaic')!;
    expect(naic.presence).toBe('ABSENT');
    expect(naic.value).toBeNull();
    expect(naic.raw).toBeNull();
    expect(naic.because).toContain('absence of a claim rather than a claim of none');
  });

  /**
   * The distinction the rail exists to keep. A commissioner's order whose
   * effective date is conditioned on the exhaustion of appeals *has* an
   * effective date; this grammar cannot read it. Reporting that as absent
   * would report the document as silent when it spoke.
   */
  it('marks a stated but unreadable value MALFORMED and keeps what was printed', () => {
    const extraction = extractFiling(captureOrThrow({ ...DECLARATION, jurisdiction: 'TX_TDI' }, specimen('tx-tdi-2026-8871').text));
    const effective = fieldOf(extraction, 'effectiveDate')!;
    expect(effective.presence).toBe('MALFORMED');
    expect(effective.value).toBeNull();
    expect(effective.raw).toBe('Upon exhaustion of administrative appeals');
    expect(effective.because).toContain('not a field the document omitted');
  });

  it('refuses a label stated twice with different values rather than taking the first', () => {
    const extraction = extractFiling(captureOrThrow(DECLARATION, 'Case No: A-1\nOrder Type: MARKET_WITHDRAWAL\nOrder Type: RATE_INCREASE\n'));
    const filingType = fieldOf(extraction, 'filingType')!;
    expect(filingType.presence).toBe('AMBIGUOUS');
    expect(filingType.value).toBeNull();
    expect(filingType.because).toContain('document order');
  });

  it('treats a label repeated with the same value as one statement, not a contradiction', () => {
    const extraction = extractFiling(captureOrThrow(DECLARATION, 'Order Type: MARKET_WITHDRAWAL\nOrder Type: MARKET_WITHDRAWAL\n'));
    expect(fieldOf(extraction, 'filingType')).toMatchObject({ presence: 'PRESENT', value: 'MARKET_WITHDRAWAL' });
  });
});

describe('what a value must read as', () => {
  const read = (line: string, field: string) => fieldOf(extractFiling(captureOrThrow(DECLARATION, line)), field)!;

  it('will not decide whether a bare 40 means forty per cent or four thousand per cent', () => {
    expect(read('Capacity Reduction: 40', 'capacityReductionPct').presence).toBe('MALFORMED');
    expect(read('Capacity Reduction: 40%', 'capacityReductionPct')).toMatchObject({ presence: 'PRESENT', value: 40 });
  });

  it('refuses a percentage above 100', () => {
    expect(read('Capacity Reduction: 140%', 'capacityReductionPct').presence).toBe('MALFORMED');
  });

  it('accepts grouped digits as a count and refuses prose', () => {
    expect(read('Policies Affected: 41,880', 'policiesImpacted')).toMatchObject({ presence: 'PRESENT', value: 41880 });
    expect(read('Policies Affected: approximately 41,880', 'policiesImpacted').presence).toBe('MALFORMED');
  });

  it('refuses a condition offered where an instant belongs', () => {
    const effective = read('Effective Date: Upon final approval', 'effectiveDate');
    expect(effective.presence).toBe('MALFORMED');
    expect(effective.because).toContain('a condition, not a time');
  });

  it('refuses a phrase offered where an identifier belongs, rather than shortening it into a key', () => {
    const naic = read('NAIC Company Code: not applicable to this order', 'carrierNaic');
    expect(naic.presence).toBe('MALFORMED');
    expect(naic.because).toContain('will not shorten a phrase into a key');
  });
});

describe('how a line is matched', () => {
  it('matches the label case-insensitively but requires the colon', () => {
    expect(fieldOf(extractFiling(captureOrThrow(DECLARATION, 'order type: MARKET_WITHDRAWAL')), 'filingType')!.presence).toBe('PRESENT');
    expect(fieldOf(extractFiling(captureOrThrow(DECLARATION, 'Order Type MARKET_WITHDRAWAL')), 'filingType')!.presence).toBe('ABSENT');
  });

  /** Prose is not read. A document that says it in a sentence has said nothing this grammar can hear. */
  it('does not find a field stated in a sentence', () => {
    const extraction = extractFiling(captureOrThrow(DECLARATION, 'This order shall take effect on 1 April 2026 and approves the withdrawal.'));
    expect(fieldOf(extraction, 'effectiveDate')!.presence).toBe('ABSENT');
    expect(extraction.because).toContain('rather than recovered by a pattern over English');
  });

  it('does not treat a label appearing mid-line as a labelled field', () => {
    expect(fieldOf(extractFiling(captureOrThrow(DECLARATION, 'See the Order Type: MARKET_WITHDRAWAL noted above')), 'filingType')!.presence).toBe('ABSENT');
  });
});
