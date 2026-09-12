import { randomUUID } from 'node:crypto';
import type { ExecutionLimits, OperatingSnapshot, PoolSnapshot, ProcessOutcome } from './operatingTypes';

/** Operator-owned limits. HTTP requests cannot select a profile or increase a ceiling. */
export type ExecutionEnvironment = Readonly<Record<string, string | undefined>>;
export type ProcessPool = 'production' | 'kernel';
export const MAX_PRODUCTION_WORKERS = 2;
export const MAX_KERNEL_WORKERS = 2;

export class ExecutionPolicyError extends Error {
  constructor() { super('EXECUTION_POLICY_INVALID'); }
}

function lowerLimit(value: string | undefined, profileLimit: number, ceiling: number): number {
  if (value === undefined || value.trim() === '') return profileLimit;
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > ceiling) throw new ExecutionPolicyError();
  return Math.min(Number(value), profileLimit);
}

export function executionPolicy(env: ExecutionEnvironment = process.env): ExecutionLimits {
  const profile = env.PAYLOAD_EXECUTION_PROFILE?.trim() || 'normal';
  if (profile !== 'normal' && profile !== 'conserve') throw new ExecutionPolicyError();
  const conserving = profile === 'conserve';
  return {
    profile,
    childProcesses: lowerLimit(env.PAYLOAD_MAX_CHILD_PROCESSES, conserving ? 1 : 4, 4),
    productionWorkers: conserving ? 1 : MAX_PRODUCTION_WORKERS,
    kernelWorkers: conserving ? 1 : MAX_KERNEL_WORKERS,
    databaseConnections: lowerLimit(env.PAYLOAD_DB_POOL_MAX, conserving ? 2 : 10, 10),
  } as const;
}

// Next can bundle the same adapter into several routes in ONE process. Share its
// counters across those bundles, not across independent Node processes or hosts.
// No interval/event log/reset endpoint: only bounded aggregates and <= 4 live leases.
const budgetKey = Symbol.for('payload.execution-budget.v2');
interface ActiveWork { started: number; outcome: ProcessOutcome | null }
interface PoolState { counters: Omit<PoolSnapshot, 'active' | 'activeWork'>; work: Map<symbol, ActiveWork> }
interface Budget {
  instanceId: string;
  startedAt: string;
  telemetryStartedAt: string;
  countersSaturated: boolean;
  pools: Record<ProcessPool, PoolState>;
}
const host = globalThis as typeof globalThis & { [budgetKey]?: Budget };
function poolState(): PoolState {
  return {
    counters: {
      attempted: 0, admitted: 0, closed: 0, succeeded: 0,
      refused: { busy: 0, configInvalid: 0 },
      failures: { unavailable: 0, timeout: 0, stdoutLimit: 0, stderrLimit: 0, exit: 0 },
      bytes: { stdinSubmitted: 0, stdoutObserved: 0, stderrObserved: 0 },
      durationMs: { closedCount: 0, total: 0, max: 0, last: null },
    },
    work: new Map(),
  };
}
function budget(): Budget {
  return host[budgetKey] ??= {
    instanceId: randomUUID(),
    startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
    telemetryStartedAt: new Date().toISOString(),
    countersSaturated: false,
    pools: { production: poolState(), kernel: poolState() },
  };
}
/** Saturation keeps long-running aggregate counters finite and JSON-safe. */
function add(current: number, amount = 1): number {
  const increment = Math.max(0, amount);
  if (current > Number.MAX_SAFE_INTEGER - increment) {
    budget().countersSaturated = true;
    return Number.MAX_SAFE_INTEGER;
  }
  return current + increment;
}
function elapsed(started: number, now = performance.now()): number {
  return Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.round(now - started)));
}

export interface ProcessLease {
  (): void;
  settle: (outcome: ProcessOutcome) => void;
  bytes: (stream: 'stdinSubmitted' | 'stdoutObserved' | 'stderrObserved', amount: number) => void;
}

/** No waiting queue. The caller must retain the lease until child close, even after timeout. */
export function acquireProcessSlot(pool: ProcessPool): ProcessLease | null {
  const active = budget();
  const state = active.pools[pool];
  const counters = state.counters;
  counters.attempted = add(counters.attempted);
  let policy: ExecutionLimits;
  try { policy = executionPolicy(); }
  catch (error) {
    counters.refused.configInvalid = add(counters.refused.configInvalid);
    throw error;
  }
  const poolLimit = pool === 'production' ? policy.productionWorkers : policy.kernelWorkers;
  if (state.work.size >= poolLimit || active.pools.production.work.size + active.pools.kernel.work.size >= policy.childProcesses) {
    counters.refused.busy = add(counters.refused.busy);
    return null;
  }
  counters.admitted = add(counters.admitted);
  const key = Symbol();
  const work: ActiveWork = { started: performance.now(), outcome: null };
  state.work.set(key, work);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    state.work.delete(key);
    counters.closed = add(counters.closed);
    const duration = elapsed(work.started);
    counters.durationMs.closedCount = add(counters.durationMs.closedCount);
    counters.durationMs.total = add(counters.durationMs.total, duration);
    counters.durationMs.max = Math.max(counters.durationMs.max, duration);
    counters.durationMs.last = duration;
  };
  const settle = (outcome: ProcessOutcome) => {
    if (released || work.outcome !== null) return;
    work.outcome = outcome;
    if (outcome === 'SUCCEEDED') counters.succeeded = add(counters.succeeded);
    else {
      const counter = { UNAVAILABLE: 'unavailable', TIMEOUT: 'timeout', STDOUT_LIMIT: 'stdoutLimit', STDERR_LIMIT: 'stderrLimit', EXIT_FAILURE: 'exit' } as const;
      const name = counter[outcome];
      counters.failures[name] = add(counters.failures[name]);
    }
  };
  const bytes: ProcessLease['bytes'] = (stream, amount) => {
    if (!released && Number.isSafeInteger(amount) && amount >= 0) counters.bytes[stream] = add(counters.bytes[stream], amount);
  };
  return Object.assign(release, { settle, bytes });
}

/** Read-only, per-process observations. Invalid operator policy never leaks raw settings. */
export function operatingSnapshot(): OperatingSnapshot {
  const active = budget();
  let limits: ExecutionLimits | null = null;
  try { limits = executionPolicy(); } catch { /* Report invalid policy alongside retained aggregate observations. */ }
  const now = performance.now();
  const snapshotPool = (state: PoolState): PoolSnapshot => ({
    ...state.counters,
    refused: { ...state.counters.refused },
    failures: { ...state.counters.failures },
    bytes: { ...state.counters.bytes },
    durationMs: { ...state.counters.durationMs },
    active: state.work.size,
    activeWork: Array.from(state.work.values(), (work) => ({ ageMs: elapsed(work.started, now), settled: work.outcome !== null, outcome: work.outcome })),
  });
  return {
    schemaVersion: 1,
    scope: 'process',
    countersSaturated: active.countersSaturated,
    capturedAt: new Date().toISOString(),
    process: { pid: process.pid, instanceId: active.instanceId, startedAt: active.startedAt, telemetryStartedAt: active.telemetryStartedAt, uptimeMs: Math.round(process.uptime() * 1000) },
    policyStatus: limits ? 'VALID' : 'INVALID',
    limits,
    activeTotal: active.pools.production.work.size + active.pools.kernel.work.size,
    pools: { production: snapshotPool(active.pools.production), kernel: snapshotPool(active.pools.kernel) },
  };
}
