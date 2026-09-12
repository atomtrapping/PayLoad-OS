import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import type { CorpusRecord, RightsSchedule } from '@/domain/corpus';
import type { Domain } from '@/domain/types';
import { derivePermittedUses, evaluateUse, standingRecords } from '@/domain/corpus';
import type { CorpusSource } from '@/adapter/corpusSource';
import { evidenceConcentrationWorkload } from '@/discovery/evidenceConcentration';
import { inputFingerprint, runWorkload, specFingerprint, type WorkloadRunResult } from '@/discovery/engine';
import { runBoundedProcess } from '@/runtime/boundedProcess';
import { assertAuthenticated, type AuthenticatedTerminal } from './auth';
import { commitment, limits, refuse, type MiningRequest } from './contracts';

export interface MiningSnapshot {
  corpusId: string; releaseId: string; releaseDigest: string; knownAt: string; domain: Domain;
  fixture_only: boolean; sources: RightsSchedule[]; records: CorpusRecord[];
  selection: 'PERMITTED_STANDING_RECORDS';
  coverage: { standingRecords: number; selectedRecords: number; withheldByPermission: number };
}
export interface MiningWork { jobId: string; request: MiningRequest; snapshot: MiningSnapshot; computedAt: string }
export type MiningExecutor = (work: MiningWork) => Promise<WorkloadRunResult>;

function permitted(snapshot: MiningSnapshot, now: string): void {
  for (const record of snapshot.records) {
    const rights = snapshot.sources.find(s => s.sourceId === record.provenance.sourceId);
    if (!rights || !canMine(rights, snapshot.domain, now)) refuse('MINING_SOURCE_USE_REFUSED', 403);
  }
}
/** Retention is a separate constraint from the registration's use grant. */
function canMine(rights: RightsSchedule, domain: Domain, now: string): boolean {
  const retention = rights.registration.retention;
  if (retention.mode === 'UNTIL' && (!retention.until || !Number.isFinite(Date.parse(retention.until)) || Date.parse(now) >= Date.parse(retention.until))) return false;
  if (retention.mode === 'UNTIL_SOURCE_EXPIRY' && (!rights.registration.effectiveUntil || Date.parse(now) >= Date.parse(rights.registration.effectiveUntil))) return false;
  return evaluateUse(rights, 'internal_research', now, domain).state === 'ALLOWED'
    && evaluateUse(rights, 'normalization', now, domain).state === 'ALLOWED';
}
export async function pinRelease(source: CorpusSource, who: AuthenticatedTerminal, releaseId: string): Promise<MiningSnapshot> {
  assertAuthenticated(who);
  // First executable family is internal, deterministic research. No customer export or admission.
  if (who.terminalClass !== 'FIRM_INTERNAL' || who.purpose !== 'internal_research') refuse('MINING_PURPOSE_REFUSED', 403);
  const hit = await source.getRelease(releaseId);
  if (!hit || !who.corpusScope.includes(hit.corpus.corpusId)) refuse('RESOURCE_NOT_AVAILABLE', 404);
  const records = standingRecords(hit.corpus, hit.release.knownAt).filter(r => !r.supersededByRecordId || !hit.corpus.records.some(next => next.recordId === r.supersededByRecordId && Date.parse(next.knownAt) <= Date.parse(hit.release.knownAt)));
  if (records.length > limits.rows) refuse('MINING_INPUT_LIMIT');
  const now = new Date().toISOString();
  const selected = records.filter(record => {
    const rights = hit.release.sources.find(s => s.sourceId === record.provenance.sourceId);
    return rights && canMine(rights, hit.release.domain, now);
  });
  const usedSources = new Set(selected.map(record => record.provenance.sourceId));
  const snapshot: MiningSnapshot = {
    corpusId: hit.corpus.corpusId, releaseId, releaseDigest: hit.release.releaseDigest, knownAt: hit.release.knownAt,
    domain: hit.release.domain, fixture_only: hit.corpus.fixture_only === true || hit.release.fixture_only === true || source.origin.kind === 'FIXTURE',
    sources: hit.release.sources.filter(source => usedSources.has(source.sourceId)), records: [...selected].sort((a,b) => a.recordId < b.recordId ? -1 : a.recordId > b.recordId ? 1 : 0),
    selection: 'PERMITTED_STANDING_RECORDS', coverage: { standingRecords: records.length, selectedRecords: selected.length, withheldByPermission: records.length - selected.length },
  };
  if (!snapshot.records.length || snapshot.records.length > limits.rows || Buffer.byteLength(JSON.stringify(snapshot)) > limits.inputBytes) refuse('MINING_INPUT_LIMIT');
  permitted(snapshot, new Date().toISOString());
  assertAuthenticated(who);
  return JSON.parse(JSON.stringify(snapshot)) as MiningSnapshot;
}

/** Retained bytes remain unchanged. Rights are rechecked from today's authoritative source on every use. */
export async function recheckPermission(source: CorpusSource, who: AuthenticatedTerminal, snapshot: MiningSnapshot): Promise<void> {
  assertAuthenticated(who);
  if (who.terminalClass !== 'FIRM_INTERNAL' || who.purpose !== 'internal_research' || !who.corpusScope.includes(snapshot.corpusId)) refuse('RESOURCE_NOT_AVAILABLE', 404);
  await recheckSnapshotSources(source, snapshot);
}
export async function recheckSnapshotSources(source: CorpusSource, snapshot: MiningSnapshot): Promise<void> {
  const hit = await source.getRelease(snapshot.releaseId);
  if (!hit || hit.corpus.corpusId !== snapshot.corpusId) refuse('RESOURCE_NOT_AVAILABLE', 404);
  permitted({ ...snapshot, sources: hit.release.sources }, new Date().toISOString());
}
export function miningDefinition(request: MiningRequest) {
  const definition = evidenceConcentrationWorkload(request.parameters);
  return { ...definition, implementation: { ...definition.implementation, version: request.methodDigest } };
}
export function computeMining(work: MiningWork): WorkloadRunResult {
  const startedAt = new Date().toISOString();
  const result = runWorkload(miningDefinition(work.request), work.snapshot.records, {
    runId: work.jobId, startedAt, completedAt: startedAt,
    rightsOf: record => {
      const source = work.snapshot.sources.find(s => s.sourceId === record.provenance.sourceId)!;
      return derivePermittedUses(source.registration, work.computedAt, source.sourceId, work.snapshot.domain);
    },
  });
  const completedAt = new Date().toISOString();
  return { ...result, completedAt, artifacts: result.artifacts.map(a => ({ ...a, computedAt: completedAt })) };
}
export function validateMiningResult(work: MiningWork, result: WorkloadRunResult): void {
  if (!result || result.runId !== work.jobId || result.specFingerprint !== specFingerprint(miningDefinition(work.request))
    || result.inputFingerprint !== inputFingerprint(work.snapshot.records) || !['SUCCEEDED', 'FAILED'].includes(result.status)
    || !Array.isArray(result.artifacts) || result.artifacts.some(a => a.validation !== 'NOT_VALIDATED')) refuse('MINING_WORKER_RESULT_INVALID');
}
export function workerArtifact() {
  const path = resolve(process.cwd(), '.stamp/terminal-mining-worker.cjs');
  try {
    if (!statSync(path).isFile() || statSync(path).size > 8 * 1024 * 1024) throw new Error();
    const bytes = readFileSync(path);
    return { path, digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}` };
  } catch { return refuse('MINING_WORKER_NOT_BUILT', 503); }
}
export const executeMining: MiningExecutor = async work => {
  const worker = workerArtifact();
  if (worker.digest !== work.request.methodDigest) refuse('MINING_METHOD_CHANGED');
  const input = JSON.stringify(work);
  if (Buffer.byteLength(input) > work.request.budget.maxInputBytes) refuse('MINING_INPUT_LIMIT');
  const env: NodeJS.ProcessEnv = { NODE_ENV: 'production' };
  for (const key of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP']) if (process.env[key]) env[key] = process.env[key];
  // No source/DB/model credentials reach the deterministic worker. It has no arbitrary command API.
  const output = await runBoundedProcess({ pool: 'production', executable: process.execPath, args: [worker.path], input,
    timeoutMs: work.request.budget.timeoutMs, maxOutputBytes: work.request.budget.maxOutputBytes, env,
    failure: reason => new Error(`MINING_WORKER_${reason}`) });
  if (output.code !== 0) refuse('MINING_WORKER_FAILED');
  const result = JSON.parse(output.stdout.toString('utf8')) as WorkloadRunResult;
  validateMiningResult(work, result);
  return result;
};
export const snapshotDigest = (snapshot: MiningSnapshot) => commitment(snapshot);
