/** Serializable, payload-free operating observations. Safe for type-only UI imports. */
// SUCCEEDED means only a zero-exit transport completion; apparatus parsing/admission may still reject it.
export type ProcessOutcome = 'SUCCEEDED' | 'UNAVAILABLE' | 'TIMEOUT' | 'STDOUT_LIMIT' | 'STDERR_LIMIT' | 'EXIT_FAILURE';

export interface ExecutionLimits {
  profile: 'normal' | 'conserve';
  childProcesses: number;
  productionWorkers: number;
  kernelWorkers: number;
  databaseConnections: number;
}

export interface PoolSnapshot {
  attempted: number;
  admitted: number;
  closed: number;
  succeeded: number;
  refused: { busy: number; configInvalid: number };
  failures: { unavailable: number; timeout: number; stdoutLimit: number; stderrLimit: number; exit: number };
  /** Submitted stdin is not confirmation of child consumption; output includes discarded late bytes. */
  bytes: { stdinSubmitted: number; stdoutObserved: number; stderrObserved: number };
  /** Full lease lifetime through actual close (or synchronous spawn failure), not response latency. */
  durationMs: { closedCount: number; total: number; max: number; last: number | null };
  active: number;
  /** Bounded by the process policy; no request IDs or command/input/output data. */
  activeWork: Array<{ ageMs: number; settled: boolean; outcome: ProcessOutcome | null }>;
}

export interface OperatingSnapshot {
  schemaVersion: 1;
  scope: 'process';
  /** Aggregate counters stop at MAX_SAFE_INTEGER; true means at least one is no longer exact. */
  countersSaturated: boolean;
  capturedAt: string;
  process: {
    pid: number;
    instanceId: string;
    startedAt: string;
    telemetryStartedAt: string;
    uptimeMs: number;
  };
  policyStatus: 'VALID' | 'INVALID';
  limits: ExecutionLimits | null;
  activeTotal: number;
  pools: { production: PoolSnapshot; kernel: PoolSnapshot };
}
