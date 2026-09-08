import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SourceCaptureStore } from '../acquisition/store';
import { CensusNormalizationStore } from '../acquisition/census-normalization';
import { CensusCandidateBuildStore } from '../data-os/local-census-candidate-build';
import { byteDigest } from '../data-os/evidence-capture';
import * as files from '../data-os/local-files';
import * as sourcePolicy from '../data-os/source-policy';
import { localJson, localRecordDigest } from '../data-os/local-record';
import { CensusPackageStore, compareCensusObservations, parseCensusPackageRequest, type CensusPackageRequest } from './census-package';
import { CENSUS_OBSERVATION_PRODUCT } from './census-product';
import { executeBoutiqueCli, runBoutiqueCli } from './cli';

let root: string;
const AT = '2026-09-08T01:03:00.000Z';
const LATER = '2026-09-09T01:03:00.000Z';
const EXPIRED = '2026-10-08T01:03:00.000Z';
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'notations-boutique-test-'));
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Offline qualification test must not contact any provider.'); }));
});
afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllGlobals();
  const target = resolve(root); const base = resolve(tmpdir());
  expect(target.startsWith(`${base}\\`) || target.startsWith(`${base}/`)).toBe(true);
  rmSync(target, { recursive: true, force: true });
});

async function makeBuild(version = 'v1', changes: Record<string, unknown> = {}, day = '08'): Promise<CensusPackageRequest> {
  const bytes = Buffer.from(JSON.stringify([{
    dot_number: '80806', legal_name: 'SYNTHETIC CORPORATION', business_org_desc: 'CORPORATION',
    phy_country: 'US', phy_state: 'CA', power_units: '12', total_drivers: '0',
    mcs150_date: '20260901', mcs150_mileage: '400', mcs150_mileage_year: '0', docket1_status_code: null, ...changes,
  }]));
  const captureId = `capture-${version}`;
  const captured = await new SourceCaptureStore(root, {
    fetch: async () => ({ bytes, mediaType: 'application/json', etag: null, lastModified: null }),
    now: () => `2026-09-${day}T01:00:00.000Z`,
  }).capture({ schema: 'payload.source-capture-request.v1', requestId: captureId, sourceId: 'fmcsa-company-census', usdot: ['80806'] }, true);
  expect(captured.state).toBe('CAPTURED');
  const normalized = new CensusNormalizationStore(root).normalize({
    schema: 'payload.fmcsa-census-normalization-request.v1', normalizationId: `normalized-${version}`,
    purpose: 'source-qualification', capture: { requestId: captureId, receiptDigest: captured.receipt!.digest }, usdot: '80806',
  }, `2026-09-${day}T01:01:00.000Z`).run;
  const build = new CensusCandidateBuildStore(root).build({
    schema: 'payload.local-candidate-build-request.v2', buildId: `build-${version}`, purpose: 'source-qualification', knownThrough: normalized.normalizedAt,
    definition: { id: 'census-observation-qualification', version: '1.0.0', domain: 'CARAVAN', recordType: 'FMCSACompanyCensusObservation', sourceClasses: ['public-government-company-census'] },
    normalizations: [{ id: normalized.request.manifest.normalizationId, digest: normalized.digest }],
  }, `2026-09-${day}T01:02:00.000Z`).build;
  return { schema: 'notations.census-package-request.v2', packageId: `package-${version}`, build: { id: build.buildId, digest: build.digest } };
}
const artifactPath = (id: string, name: string) => join(root, 'boutique-packages', byteDigest(Buffer.from(id)).slice(7), name);
function retainedSourceBytes() {
  return readdirSync(root, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile() && !entry.parentPath.includes('boutique'))
    .map((entry) => { const path = join(entry.parentPath, entry.name); return [path, byteDigest(readFileSync(path))]; }).sort();
}

describe('evidence-bound internal observation packages', () => {
  it('manufactures byte-bound artifacts from exact real-store candidates and preserves original history', async () => {
    const request = await makeBuild(); const history = retainedSourceBytes();
    const result = new CensusPackageStore(root).build(request, AT);
    expect(result.status).toBe('CREATED');
    expect(result.release).toMatchObject({ state: 'INTERNAL_QUALIFICATION_RELEASE', canonicalAdmission: false, customerDistributionPermitted: false, recordCount: 1 });
    expect(result.release.acceptance.state).toBe('ACCEPTED_FOR_INTERNAL_QUALIFICATION');
    expect(result.release.artifacts.map((item) => item.name)).toEqual(CENSUS_OBSERVATION_PRODUCT.formats);
    for (const artifact of result.release.artifacts) {
      const bytes = readFileSync(artifactPath(request.packageId, artifact.name));
      expect({ digest: byteDigest(bytes), bytes: bytes.length }).toEqual({ digest: artifact.digest, bytes: artifact.bytes });
    }
    const record = JSON.parse(readFileSync(artifactPath(request.packageId, 'records.jsonl'), 'utf8'));
    expect(record).toMatchObject({ state: 'UNADMITTED', identity: { canonicalId: null }, validTime: { state: 'UNOBSERVED', from: null, to: null } });
    expect(record.fields.total_drivers.value).toBe(0);
    expect(record.fields.mcs150_mileage_year).toMatchObject({ raw: '0', value: null, presence: 'PRESENT' });
    expect(record.fields.docket1_status_code.presence).toBe('EXPLICIT_NULL');
    expect(record.fields.docket1.presence).toBe('OMITTED');
    const dictionary = JSON.parse(readFileSync(artifactPath(request.packageId, 'dictionary.json'), 'utf8'));
    expect(dictionary.schema).toBe('notations.census-column-dictionary.v1');
    expect(dictionary.csvColumns).toHaveLength(79);
    expect(new Set(dictionary.csvColumns.map((column: {name: string}) => column.name)).size).toBe(79);
    const headers = readFileSync(artifactPath(request.packageId, 'records.csv'), 'utf8').split('\r\n')[0].split(',').map((cell) => cell.slice(1, -1));
    expect(headers).toEqual(dictionary.csvColumns.map((column: {name: string}) => column.name));
    expect(retainedSourceBytes()).toEqual(history);
    expect(new CensusPackageStore(root).inspect(request.packageId)).toEqual(result.release);
  });

  it('retries the same completed release historically without changing its clock or renewing permission', async () => {
    const request = await makeBuild(); const store = new CensusPackageStore(root);
    const first = store.build(request, AT);
    expect(store.build(request, EXPIRED)).toEqual({ ...first, status: 'EXISTING' });
    expect(() => store.build({ ...request, build: { ...request.build, digest: `sha256:${'a'.repeat(64)}` } }, AT)).toThrow('PACKAGE_REQUEST_CONFLICT');
  });

  it.each(['intent.json', 'release.json', ...CENSUS_OBSERVATION_PRODUCT.formats])('refuses damaged %s without repairing it', async (name) => {
    const request = await makeBuild(); const store = new CensusPackageStore(root); store.build(request, AT);
    const target = artifactPath(request.packageId, name); const bytes = readFileSync(target);
    writeFileSync(target, Buffer.concat([bytes, Buffer.from('X')]));
    expect(() => store.inspect(request.packageId)).toThrow();
    expect(readFileSync(target)).toEqual(Buffer.concat([bytes, Buffer.from('X')]));
  });

  it('detects rehashed manifest content claims by recomputing from retained evidence', async () => {
    const request = await makeBuild(); const store = new CensusPackageStore(root); store.build(request, AT);
    const target = artifactPath(request.packageId, 'release.json');
    const release = JSON.parse(readFileSync(target, 'utf8')); delete release.digest; release.recordCount = 2;
    const changed = { ...release, digest: localRecordDigest(release, 4 * 1024 * 1024) };
    writeFileSync(target, localJson(changed) + '\n');
    expect(() => store.inspect(request.packageId)).toThrow('PACKAGE_RECOMPUTATION_MISMATCH');
  });

  it('resumes a partially materialized package at its original clock after interrupted publication', async () => {
    const request = await makeBuild(); const store = new CensusPackageStore(root);
    const realPublish = files.publishImmutableFile; let interrupted = false;
    vi.spyOn(files, 'publishImmutableFile').mockImplementation((...args) => {
      if (!interrupted && args[1].at(-1) === 'quality.json') { interrupted = true; throw new Error('synthetic interruption'); }
      return realPublish(...args);
    });
    expect(() => store.build(request, AT)).toThrow('synthetic interruption');
    expect(store.inspect(request.packageId)).toBeUndefined();
    const recovered = store.build(request, LATER);
    expect(recovered.release.releasedAt).toBe(AT);
    expect(store.inspect(request.packageId)).toEqual(recovered.release);
  });

  it('does not resume incomplete work after permission expires', async () => {
    const request = await makeBuild(); const store = new CensusPackageStore(root);
    const realPublish = files.publishImmutableFile;
    vi.spyOn(files, 'publishImmutableFile').mockImplementation((...args) => {
      if (args[1].at(-1) === 'quality.json') throw new Error('interrupted'); return realPublish(...args);
    });
    expect(() => store.build(request, AT)).toThrow('interrupted');
    expect(() => store.build(request, EXPIRED)).toThrow('PACKAGE_DERIVATION_NOT_ALLOWED');
    expect(() => store.build(request, '2026-09-20T01:03:00.000Z')).toThrow('PACKAGE_CAPTURE_TOO_OLD');
  });

  it('rechecks preceding-vintage derivation permission when resuming an unfinished comparison', async () => {
    const store = new CensusPackageStore(root); const first = store.build(await makeBuild(), AT).release;
    const priorBytes = readFileSync(artifactPath(first.packageId, 'records.jsonl'));
    const candidateId = JSON.parse(priorBytes.toString('utf8')).candidateId;
    const request = { ...await makeBuild('v2', { power_units: '14' }, '09'), previous: { id: first.packageId, digest: first.digest } };
    const realPublish = files.publishImmutableFile;
    const publication = vi.spyOn(files, 'publishImmutableFile').mockImplementation((...args) => {
      if (args[1].at(-1) === 'release.json') throw new Error('interrupted comparison');
      return realPublish(...args);
    });
    expect(() => store.build(request, LATER)).toThrow('interrupted comparison');
    publication.mockRestore();
    const resumeAt = '2026-09-10T01:03:00.000Z';
    const evaluate = sourcePolicy.evaluateSourceUse;
    // Simulate an independently resolved expiry for this comparison input.
    // Retained registrations and historical decisions are not rewritten.
    const decisions = vi.spyOn(sourcePolicy, 'evaluateSourceUse').mockImplementation((registration, use) => {
      const result = evaluate(registration, use);
      return use.requestId === `${candidateId}:package` && use.operation === 'DERIVE' && use.requestedAt === resumeAt
        ? { ...result, state: 'DENIED', reasons: ['OUTSIDE_EFFECTIVE_WINDOW'] } : result;
    });
    expect(() => store.build(request, resumeAt)).toThrow('PACKAGE_DERIVATION_NOT_ALLOWED');
    expect(existsSync(artifactPath(request.packageId, 'release.json'))).toBe(false);
    expect(readFileSync(artifactPath(first.packageId, 'records.jsonl'))).toEqual(priorBytes);
    decisions.mockRestore();
    expect(store.build(request, resumeAt).release.releasedAt).toBe(LATER);
  });

  it('preserves both vintages and reports changes without falsely declaring a source correction', async () => {
    const store = new CensusPackageStore(root); const firstRequest = await makeBuild(); const first = store.build(firstRequest, AT).release;
    const before = readFileSync(artifactPath(firstRequest.packageId, 'records.jsonl'));
    const nextRequest = await makeBuild('v2', { power_units: '14', docket1_status_code: 'A' }, '09');
    const second = store.build({ ...nextRequest, previous: { id: first.packageId, digest: first.digest } }, LATER).release;
    expect(second.recordsDigest).not.toBe(first.recordsDigest);
    const changes = JSON.parse(readFileSync(artifactPath(second.packageId, 'changes.json'), 'utf8'));
    expect(changes).toMatchObject({ classification: 'OBSERVATION_UPDATE', correctionsDeclared: false, supersedesPhysicalState: false });
    expect(changes.records[0].kind).toBe('FIELDS_CHANGED');
    expect(changes.records[0].fields.map((field: { field: string }) => field.field)).toEqual(['power_units', 'docket1_status_code']);
    expect(readFileSync(artifactPath(first.packageId, 'records.jsonl'))).toEqual(before);
    expect(new CensusPackageStore(root).inspect(second.packageId)).toEqual(second);
  });

  it('records a new capture without turning unchanged fields into a correction', async () => {
    const store = new CensusPackageStore(root); const first = store.build(await makeBuild(), AT).release;
    const second = store.build({ ...await makeBuild('v2', {}, '09'), previous: { id: first.packageId, digest: first.digest } }, LATER).release;
    const changes = JSON.parse(readFileSync(artifactPath(second.packageId, 'changes.json'), 'utf8'));
    expect(changes.records[0]).toMatchObject({ kind: 'FIELDS_UNCHANGED', fields: [] });
    const record = JSON.parse(readFileSync(artifactPath(second.packageId, 'records.jsonl'), 'utf8'));
    expect(() => compareCensusObservations([record], [record, record])).toThrow('DUPLICATE_OBSERVATION_IDENTITY');
  });

  it('fails closed for wrong references, late captures, forward predecessors and undeclared request fields', async () => {
    const request = await makeBuild(); const store = new CensusPackageStore(root);
    expect(() => store.build({ ...request, build: { ...request.build, digest: `sha256:${'f'.repeat(64)}` } }, AT)).toThrow('PACKAGE_BUILD_REFERENCE_MISMATCH');
    expect(() => store.build(request, '2026-09-20T01:03:00.000Z')).toThrow('PACKAGE_CAPTURE_TOO_OLD');
    expect(() => store.build(request, '2026-09-08T01:01:00.000Z')).toThrow('PACKAGE_BEFORE_BUILD');
    expect(() => parseCensusPackageRequest({ ...request, authority: 'invented' })).toThrow();
    expect(() => parseCensusPackageRequest({ ...request, packageId: '../escape' })).toThrow();
    expect(() => parseCensusPackageRequest({ ...request, previous: { id: request.packageId, digest: request.build.digest } })).toThrow('PACKAGE_PREDECESSOR_CYCLE');
  });

  it('preserves exact JSONL while neutralizing spreadsheet formulas in the CSV view', async () => {
    const request = await makeBuild('v1', { legal_name: '=1+1' }); new CensusPackageStore(root).build(request, AT);
    expect(readFileSync(artifactPath(request.packageId, 'records.csv'), 'utf8')).toContain('"\'=1+1"');
    expect(JSON.parse(readFileSync(artifactPath(request.packageId, 'records.jsonl'), 'utf8')).fields.legal_name.raw).toBe('=1+1');
  });

  it('retains a customer delivery refusal with current decisions and no emitted records', async () => {
    const store = new CensusPackageStore(root); const release = store.build(await makeBuild(), AT).release;
    const request = { schema: 'notations.census-delivery-request.v1', deliveryId: 'attempt-1', release: { id: release.packageId, digest: release.digest }, recipientId: 'synthetic-customer', purpose: 'source-qualification' };
    const receipt = store.requestCustomerDelivery(request, LATER);
    expect(receipt).toMatchObject({ state: 'REFUSED', dataEmitted: false, customerDelivered: false });
    expect(receipt.decisions.every((decision) => decision.state === 'DENIED' && decision.evaluatedAt === LATER)).toBe(true);
    expect(JSON.stringify(receipt)).not.toContain('SYNTHETIC CORPORATION');
    expect(store.requestCustomerDelivery(request, LATER)).toEqual(receipt);
    expect(store.requestCustomerDelivery(request, EXPIRED)).toEqual(receipt);
    expect(() => store.requestCustomerDelivery({ ...request, recipientId: 'different-recipient' }, LATER)).toThrow('DELIVERY_REQUEST_CONFLICT');
  });

  it('does not retain a delivery attempt before the package exists', async () => {
    const store = new CensusPackageStore(root); const release = store.build(await makeBuild(), AT).release;
    const request = { schema: 'notations.census-delivery-request.v1', deliveryId: 'too-early', release: { id: release.packageId, digest: release.digest }, recipientId: 'synthetic-customer', purpose: 'source-qualification' };
    expect(() => store.requestCustomerDelivery(request, '2026-09-08T01:02:59.999Z')).toThrow('DELIVERY_BEFORE_RELEASE');
    expect(existsSync(join(root, 'boutique-delivery-attempts'))).toBe(false);
    const retained = store.requestCustomerDelivery(request, AT);
    expect(retained.requestedAt).toBe(AT);
    expect(store.requestCustomerDelivery(request, '2026-09-08T01:02:59.999Z')).toEqual(retained);
  });

  it('refuses a rehashed predecessor whose claimed contents do not rederive from evidence', async () => {
    const store = new CensusPackageStore(root); const first = store.build(await makeBuild(), AT).release;
    const target = artifactPath(first.packageId, 'release.json');
    const altered = JSON.parse(readFileSync(target, 'utf8')); delete altered.digest; altered.recordCount = 99;
    const tampered = { ...altered, digest: localRecordDigest(altered, 4 * 1024 * 1024) };
    writeFileSync(target, localJson(tampered) + '\n');
    const second = await makeBuild('v2', {}, '09');
    expect(() => store.build({ ...second, previous: { id: first.packageId, digest: tampered.digest } }, LATER)).toThrow('PACKAGE_RECOMPUTATION_MISMATCH');
  });

  it('exposes a bounded operator CLI and sanitized failures', async () => {
    expect(executeBoutiqueCli(['spec'])).toHaveProperty('digest');
    expect(executeBoutiqueCli([])).toHaveProperty('help');
    const request = await makeBuild(); new CensusPackageStore(root).build(request, AT);
    expect(executeBoutiqueCli(['inspect', '--root', root, '--package-id', request.packageId])).toMatchObject({ status: 'INSPECTED', historical: true, permissionRenewed: false });
    const io = { stdout: vi.fn(), stderr: vi.fn() };
    expect(runBoutiqueCli(['inspect', '--package-id', 'missing', '--root', root], io)).toBe(1);
    expect(io.stderr.mock.calls[0][0]).not.toContain(root);
    for (const args of [['build', '--request', 'a', '--request', 'b'], ['spec', '--root', root], ['inspect', '--package-id', 'x', '--evil', 'y']]) {
      expect(() => executeBoutiqueCli(args)).toThrow();
    }
    const input = join(root, 'bad-request.json');
    writeFileSync(input, '{"packageId":"a","packageId":"b"}');
    expect(runBoutiqueCli(['build', '--request', input, '--root', root], io)).toBe(1);
  });

  it('recomputes legacy v1 packages without changing their dictionary or digest', async () => {
    const request = { ...await makeBuild(), schema: 'notations.census-package-request.v1' as const };
    const store = new CensusPackageStore(root); const release = store.build(request, AT).release;
    expect(release.schema).toBe('notations.census-package-release.v1');
    expect(JSON.parse(readFileSync(artifactPath(request.packageId, 'dictionary.json'), 'utf8'))).toEqual(CENSUS_OBSERVATION_PRODUCT);
    expect(store.inspect(request.packageId)).toEqual(release);
  });
});
