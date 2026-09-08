import { describe, expect, it, vi } from 'vitest';
import { CARAVAN_CORPUS } from '@/fixtures/caravan/release';
import { currentRelease, releaseRecords } from './corpus';
import { buildSlice, CATALOG_LOSS, CORRECTION_RATE_GATE, gradeFrom, type CatalogCorpus, type SliceSpec } from './catalogSlice';
import { authorizeCatalogExport, catalogDigest, type CatalogVerification, type CatalogVerificationRequest, type CatalogVerifier } from './catalogAuthorization';

const release = currentRelease(CARAVAN_CORPUS);
const SPEC: SliceSpec = { sliceId: 'catalog-test', title: 'Catalog test', question: 'Which observations are in the selected version?', releaseId: release.releaseId };
const NOW = '2026-09-08T12:00:00.000Z';
const CONTEXT = { recipientId: 'test-recipient', purpose: 'CATALOG_TEST', operation: 'EXPORT', audience: 'CUSTOMER' } as const;
const h = (label: string) => catalogDigest({ test: label });

/** A test-only corpus/service pair. No real admission, provider grant or export. */
function eligible(): CatalogCorpus {
  const c: CatalogCorpus = structuredClone(CARAVAN_CORPUS);
  c.fixture_only = false;
  for (const record of c.records) record.visibility = 'COUNTERPARTY_SHARED';
  for (const r of c.releases) {
    r.fixture_only = false;
    for (const source of r.sources) source.registration = {
      ...source.registration, effectiveFrom: '2020-01-01T00:00:00.000Z', effectiveUntil: '2030-01-01T00:00:00.000Z',
      permittedPurposes: ['CATALOG_TEST'], prohibitedPurposes: [], allowedOperations: ['EXPORT'],
      allowedAudiences: ['CUSTOMER'], approvalRequiredOperations: [], retention: { mode: 'INDEFINITE' },
    };
  }
  return c;
}

function verified(request: CatalogVerificationRequest): CatalogVerification {
  return {
    schema: 'notationsos.catalog-verification.v1', requestDigest: catalogDigest(request), verifiedAt: request.requestedAt,
    authorityId: 'isolated-test-verifier',
    records: request.records.map((r) => ({ recordId: r.recordId, recordDigest: r.recordDigest,
      state: 'VERIFIED_ADMITTED', provenance: 'LIVE_CAPTURE', rulingDigest: h(r.recordId) })),
    sources: request.sources.map((s) => ({ sourceId: s.sourceId, policyDigest: s.policyDigest, state: 'CURRENT', grantDigest: h(s.sourceId) })),
    recipientGrant: { grantId: 'test-only-grant', grantDigest: h('test-only-grant'), ...request.context,
      notBefore: '2026-09-01T00:00:00.000Z', notAfter: '2026-10-01T00:00:00.000Z',
      releaseCommitment: request.releaseCommitment, recordsCommitment: request.recordsCommitment,
      conditions: ['Test attribution condition; no actual provider permission.'] },
  };
}
function service(change: (v: CatalogVerification, request: CatalogVerificationRequest) => unknown = (v) => v): CatalogVerifier {
  return { now: () => NOW, verify: (request) => change(verified(request), request) };
}
function attempt(corpus = eligible(), spec = SPEC, verifier = service(), context: unknown = CONTEXT) {
  return buildSlice(corpus, spec, 'UNKNOWN', { context, verifier });
}
function preview(corpus: CatalogCorpus = CARAVAN_CORPUS, spec: SliceSpec = SPEC) {
  const result = buildSlice(corpus, spec, 'UNKNOWN');
  if (!result.manifest) throw new Error('Expected described preview');
  return result.manifest;
}
function refused(result: ReturnType<typeof buildSlice>, reason: string) {
  expect(result.records).toBeNull();
  expect(result.manifest?.readiness).toBe('NOT_FOR_SALE');
  expect(result.manifest?.authorization.reasons).toContain(reason);
}

describe('content-addressed catalogue descriptions', () => {
  it('preserves the existing UI preview, counts and coverage', () => {
    const p = preview();
    expect(p.schema).toBe('notationsos.catalog-slice.v2');
    expect(p.readiness).toBe('NOT_FOR_SALE');
    expect(p.recordCount).toBe(releaseRecords(CARAVAN_CORPUS, release).length);
    expect(p.coverage.reduce((n, c) => n + c.records, 0)).toBe(p.recordCount);
    expect(p.evidence.reduce((n, e) => n + e.records, 0)).toBe(p.recordCount);
    expect(p.release.knowledgeCutoff).toBe(release.knownAt);
    expect(p.release.declaredManifestCommitment).toBe(release.certification.manifestCommitment);
    expect(p.bounds).toEqual({ predicates: 'UNBOUNDED', subjectTypes: 'UNBOUNDED' });
  });
  it('binds complete record contents, not only counts and evidence classes', () => {
    const c = structuredClone(CARAVAN_CORPUS);
    const before = preview(c);
    c.records[0].value = 'changed without changing the histogram';
    const after = preview(c);
    expect(after.coverage).toEqual(before.coverage);
    expect(after.evidence).toEqual(before.evidence);
    expect(after.digest).not.toBe(before.digest);
    expect(after.recordsCommitment).not.toBe(before.recordsCommitment);
    expect(after.release.contentCommitment).not.toBe(before.release.contentCommitment);
  });
  it.each(['unit', 'basis', 'title'] as const)('binds changed %s', (field) => {
    const c = structuredClone(CARAVAN_CORPUS);
    c.records[0][field] = 'changed';
    expect(preview(c).digest).not.toBe(preview().digest);
  });
  it('binds declared release certification and correction contents', () => {
    const c = structuredClone(CARAVAN_CORPUS);
    c.releases.find((r) => r.releaseId === SPEC.releaseId)!.certification.manifestCommitment = h('other release');
    expect(preview(c).digest).not.toBe(preview().digest);
    c.retractions[0].reason = 'a different correction basis';
    expect(preview(c).release.contentCommitment).not.toBe(preview().release.contentCommitment);
  });
  it('normalizes row order, object-key order and set-valued bounds', () => {
    const c = structuredClone(CARAVAN_CORPUS);
    c.records.reverse(); c.retractions.reverse();
    c.records[0] = Object.fromEntries(Object.entries(c.records[0]).reverse()) as typeof c.records[number];
    expect(preview(c).digest).toBe(preview().digest);
    const a = preview(c, { ...SPEC, predicates: ['quantity.gross', 'condition.moisture'] });
    const b = preview(c, { ...SPEC, predicates: ['condition.moisture', 'quantity.gross'] });
    expect(a.digest).toBe(b.digest);
  });
  it('digests the entire manifest except the digest itself', () => {
    const { digest, ...body } = preview();
    expect(catalogDigest(body)).toBe(digest);
  });
  it('keeps unusual JSON property names in the content commitment', () => {
    const value = JSON.parse('{"__proto__":{"a":1}}');
    expect(catalogDigest(value)).not.toBe(catalogDigest({}));
    expect(catalogDigest({ b: 2, a: 1 })).toBe(catalogDigest({ a: 1, b: 2 }));
  });
  it.each([NaN, Infinity, undefined, [undefined], new Array(1), new Date(NOW)])('refuses values JSON would lose or reinterpret', (value) => {
    expect(() => catalogDigest(value)).toThrow();
  });
  it('does not evaluate accessor properties while committing content', () => {
    const getter = vi.fn(() => 'changed');
    const value = Object.defineProperty({}, 'field', { get: getter, enumerable: true });
    expect(() => catalogDigest(value)).toThrow();
    expect(getter).not.toHaveBeenCalled();
  });
  it('keeps the record-rate threshold and coverage limits', () => {
    const p = preview();
    expect(p.corrections.corrections + p.corrections.withdrawals).toBeGreaterThan(0);
    expect(p.corrections.ratePerRecord).toBe('NOT_PRICEABLE');
    expect(CORRECTION_RATE_GATE.minimumRecords).toBeGreaterThan(p.recordCount);
    expect(p.loss.join(' ')).toContain('not a claim about the world');
    expect(CATALOG_LOSS.join(' ')).toContain('UNKNOWN does not sell');
  });
});

describe('a grade or count grants no sale authority', () => {
  it.each(['ADMITTED', 'UNKNOWN', 'DEMONSTRATION'] as const)('keeps a %s caller declaration unshippable', (grade) => {
    const result = buildSlice(eligible(), SPEC, grade);
    expect(result.records).toBeNull();
    expect(result.manifest?.readiness).toBe('NOT_FOR_SALE');
  });
  it.each([0, 1, 1_000_000, 'UNKNOWN'] as const)('cannot infer member admission from count %s', (count) => {
    expect(gradeFrom(count)).toBe('UNKNOWN');
  });
  it('refuses fixture-origin material even if a test verifier would accept it', () => {
    const verify = vi.fn();
    refused(buildSlice(CARAVAN_CORPUS, SPEC, 'ADMITTED', { context: CONTEXT, verifier: { now: () => NOW, verify } }), 'DEMONSTRATION_NOT_EXPORTABLE');
    expect(verify).not.toHaveBeenCalled();
  });
  it('keeps the default verifier unavailable', () => {
    refused(buildSlice(eligible(), SPEC, 'ADMITTED', { context: CONTEXT }), 'VERIFIER_UNAVAILABLE');
  });
  it('does not accept an approval object as the trusted service', () => {
    refused(buildSlice(eligible(), SPEC, 'ADMITTED', { context: CONTEXT, verifier: { state: 'ADMITTED' } as unknown as CatalogVerifier }), 'VERIFIER_UNAVAILABLE');
  });
});

describe('an exact injected verifier and current export context', () => {
  it('cuts exact sorted records only with complete successful verification', () => {
    const c = eligible();
    const result = attempt(c, { ...SPEC, predicates: ['quantity.gross'] });
    expect(result.records).not.toBeNull();
    if (result.records === null) throw new Error(result.because);
    expect(result.records.every((r) => r.predicate === 'quantity.gross')).toBe(true);
    expect(result.records.map((r) => r.recordId)).toEqual(result.records.map((r) => r.recordId).sort());
    expect(catalogDigest(result.records)).toBe(result.manifest.recordsCommitment);
    expect(result.excluded).toBeGreaterThan(0);
    expect(result.manifest.authorization.state).toBe('VERIFIED');
    expect(result.manifest.authorization.context).toEqual(CONTEXT);
    expect(result.manifest.authorization.conditions).toHaveLength(1);
    c.records[0].value = 'mutated after return';
    expect(catalogDigest(result.records)).toBe(result.manifest.recordsCommitment);
  });
  it('gives the verifier a detached request', () => {
    const result = attempt(eligible(), SPEC, service((v, request) => { request.records[0].recordId = 'changed'; return v; }));
    expect(result.manifest?.authorization.state).toBe('VERIFIED');
  });
  it.each(['UNVERIFIED', 'REFUSED'] as const)('refuses a mixed set containing %s admission', (state) => {
    refused(attempt(eligible(), SPEC, service((v) => { v.records[0].state = state; return v; })), 'RECORD_NOT_VERIFIED_ADMITTED');
  });
  it('refuses a mixed demonstration record', () => {
    refused(attempt(eligible(), SPEC, service((v) => { v.records[0].provenance = 'DEMONSTRATION'; return v; })), 'RECORD_NOT_VERIFIED_ADMITTED');
  });
  it.each(['missing', 'duplicate', 'extra'] as const)('refuses %s admission references', (kind) => {
    refused(attempt(eligible(), SPEC, service((v) => {
      if (kind === 'missing') v.records.pop();
      if (kind === 'duplicate') v.records[0] = v.records[1];
      if (kind === 'extra') v.records.push({ ...v.records[0], recordId: 'unselected' });
      return v;
    })), 'RECORD_COVERAGE_MISMATCH');
  });
  it('refuses a stale record digest despite unchanged record ID', () => {
    refused(attempt(eligible(), SPEC, service((v) => { v.records[0].recordDigest = h('old record'); return v; })), 'RECORD_REFERENCE_MISMATCH');
  });
  it('refuses a proof captured before a record mutation', () => {
    const c = eligible(); let previous: CatalogVerification;
    attempt(c, SPEC, service((v) => { previous = v; return v; }));
    c.records[0].value = 'new value';
    refused(attempt(c, SPEC, service(() => previous)), 'STALE_OR_MISMATCHED_VERIFICATION');
  });
  it('refuses a proof for the wrong verification instant', () => {
    refused(attempt(eligible(), SPEC, service((v) => { v.verifiedAt = '2026-09-07T12:00:00.000Z'; return v; })), 'STALE_OR_MISMATCHED_VERIFICATION');
  });
  it.each(['REVOKED', 'UNVERIFIED'] as const)('refuses a %s source grant', (state) => {
    refused(attempt(eligible(), SPEC, service((v) => { v.sources[0].state = state; return v; })), 'CURRENT_SOURCE_GRANT_UNVERIFIED');
  });
  it('refuses an unrelated source-policy digest', () => {
    refused(attempt(eligible(), SPEC, service((v) => { v.sources[0].policyDigest = h('old policy'); return v; })), 'SOURCE_REFERENCE_MISMATCH');
  });
  it.each(['expired', 'denied', 'purpose', 'audience', 'approval'] as const)('evaluates source policy at export: %s', (kind) => {
    const c = eligible();
    for (const source of c.releases.find((r) => r.releaseId === SPEC.releaseId)!.sources) {
      const p = source.registration;
      if (kind === 'expired') p.effectiveUntil = NOW;
      if (kind === 'denied') p.allowedOperations = ['INGEST'];
      if (kind === 'purpose') p.permittedPurposes = ['qualification-only'];
      if (kind === 'audience') p.allowedAudiences = ['INTERNAL'];
      if (kind === 'approval') { p.allowedOperations = []; p.approvalRequiredOperations = ['EXPORT']; }
    }
    refused(attempt(c), 'SOURCE_EXPORT_NOT_ALLOWED');
  });
  it('checks finite retention independently from the policy effective window', () => {
    const c = eligible();
    for (const source of c.releases.find((r) => r.releaseId === SPEC.releaseId)!.sources) source.registration.retention = { mode: 'UNTIL', until: NOW };
    refused(attempt(c), 'SOURCE_RETENTION_EXPIRED');
  });
  it('refuses source-expiry retention whose expiry is unresolved', () => {
    const c = eligible();
    for (const source of c.releases.find((r) => r.releaseId === SPEC.releaseId)!.sources) {
      source.registration.retention = { mode: 'UNTIL_SOURCE_EXPIRY' };
      delete source.registration.effectiveUntil;
    }
    refused(attempt(c), 'SOURCE_RETENTION_UNRESOLVED');
  });
  it.each(['recipientId', 'purpose', 'releaseCommitment', 'recordsCommitment'] as const)('requires the recipient grant to bind %s', (field) => {
    refused(attempt(eligible(), SPEC, service((v) => {
      v.recipientGrant[field] = field.endsWith('Commitment') ? h('other') : 'other'; return v;
    })), 'RECIPIENT_GRANT_MISMATCH');
  });
  it('refuses an expired recipient agreement', () => {
    refused(attempt(eligible(), SPEC, service((v) => { v.recipientGrant.notAfter = NOW; return v; })), 'RECIPIENT_GRANT_OUTSIDE_WINDOW');
  });
  it('refuses private records even with an accepting verifier', () => {
    const c = eligible(); c.records[0].visibility = 'INTERNAL_ONLY';
    refused(attempt(c), 'RECORD_VISIBILITY_NOT_EXPORTABLE');
  });
});

describe('bounded, closed validation and refusal without records', () => {
  it('does not verify an empty or extra-field selection even when called directly', () => {
    const verifier = { now: () => NOW, verify: vi.fn() };
    const selection = { sliceId: 'test', corpusId: 'test', releaseId: 'test', releaseCommitment: h('release'), recordsCommitment: h('records'), records: [], sources: [] };
    expect(authorizeCatalogExport(selection, CONTEXT, verifier).reasons).toEqual(['INVALID_EXPORT_SELECTION']);
    expect(authorizeCatalogExport({ ...selection, approved: true } as typeof selection, CONTEXT, verifier).state).toBe('REFUSED');
    expect(verifier.verify).not.toHaveBeenCalled();
  });
  it.each([{ ...CONTEXT, requestedAt: NOW }, { ...CONTEXT, operation: 'PUBLISH' }, { ...CONTEXT, recipientId: '' }, { ...CONTEXT, audience: 'PUBLIC' }])('refuses an invalid export context', (context) => {
    refused(attempt(eligible(), SPEC, service(), context), 'INVALID_EXPORT_CONTEXT');
  });
  it.each(['unknown field', 'throw', 'bad clock'] as const)('refuses unavailable or malformed verification: %s', (mode) => {
    const verifier = service((v) => mode === 'unknown field' ? { ...v, approved: true } : (() => { throw new Error('private service diagnostic'); })());
    if (mode === 'bad clock') verifier.now = () => 'not a clock';
    const result = attempt(eligible(), SPEC, verifier);
    refused(result, 'VERIFICATION_UNAVAILABLE_OR_INVALID');
    expect(JSON.stringify(result)).not.toContain('private service diagnostic');
  });
  it.each([{ predicates: [] }, { predicates: ['x', 'x'] }, { question: '' }, { extra: true }])('refuses invalid specification', (patch) => {
    const result = buildSlice(eligible(), { ...SPEC, ...patch } as SliceSpec, 'ADMITTED');
    expect(result.records).toBeNull(); expect(result.manifest).toBeNull();
  });
  it.each(['duplicate record', 'duplicate release', 'nonfinite', 'wrong corpus'] as const)('refuses ambiguous/lossy input: %s', (kind) => {
    const c = eligible();
    if (kind === 'duplicate record') c.records.push(c.records[0]);
    if (kind === 'duplicate release') c.releases.push(c.releases[0]);
    if (kind === 'nonfinite') c.records[0].value = NaN;
    if (kind === 'wrong corpus') c.releases.find((r) => r.releaseId === SPEC.releaseId)!.corpusId = 'other-corpus';
    const result = attempt(c); expect(result.records).toBeNull(); expect(result.manifest).toBeNull();
  });
  it('refuses an absent release and an empty selection', () => {
    expect(attempt(eligible(), { ...SPEC, releaseId: 'absent' }).manifest).toBeNull();
    refused(attempt(eligible(), { ...SPEC, predicates: ['absent'] }), 'EMPTY_SELECTION');
  });
});
