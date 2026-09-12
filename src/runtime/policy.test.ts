import { afterEach, describe, expect, it, vi } from 'vitest';
import { acquireProcessSlot, executionPolicy, operatingSnapshot } from './policy';

afterEach(() => vi.unstubAllEnvs());

describe('lower-only operator execution policy', () => {
  it('retains production and database defaults while bounding formerly unbounded Rust children', () => {
    expect(executionPolicy({})).toEqual({ profile: 'normal', childProcesses: 4, productionWorkers: 2, kernelWorkers: 2, databaseConnections: 10 });
  });
  it('conserves across both child pools and database connections', () => {
    expect(executionPolicy({ PAYLOAD_EXECUTION_PROFILE: 'conserve' })).toEqual({ profile: 'conserve', childProcesses: 1, productionWorkers: 1, kernelWorkers: 1, databaseConnections: 2 });
  });
  it('custom limits lower normal defaults and never raise a conserve profile', () => {
    expect(executionPolicy({ PAYLOAD_MAX_CHILD_PROCESSES: '3', PAYLOAD_DB_POOL_MAX: '4' })).toMatchObject({ childProcesses: 3, databaseConnections: 4 });
    expect(executionPolicy({ PAYLOAD_EXECUTION_PROFILE: 'conserve', PAYLOAD_MAX_CHILD_PROCESSES: '4', PAYLOAD_DB_POOL_MAX: '10' })).toMatchObject({ childProcesses: 1, databaseConnections: 2 });
    expect(executionPolicy({ PAYLOAD_EXECUTION_PROFILE: 'conserve', PAYLOAD_DB_POOL_MAX: '1' }).databaseConnections).toBe(1);
  });
  it.each(['0', '-1', '1.5', '1e0', 'NaN', 'Infinity', '999', 'private-value', ' 1', '01'])('refuses invalid limits without echoing values: %s', (value) => {
    for (const name of ['PAYLOAD_MAX_CHILD_PROCESSES', 'PAYLOAD_DB_POOL_MAX']) {
      expect(() => executionPolicy({ [name]: value })).toThrow(/^EXECUTION_POLICY_INVALID$/);
    }
  });
  it('refuses unknown profiles', () => {
    expect(() => executionPolicy({ PAYLOAD_EXECUTION_PROFILE: 'unlimited' })).toThrow('EXECUTION_POLICY_INVALID');
  });
  it('uses one combined budget, refuses without queuing and releases idempotently', () => {
    vi.stubEnv('PAYLOAD_EXECUTION_PROFILE', 'normal');
    vi.stubEnv('PAYLOAD_MAX_CHILD_PROCESSES', '3');
    const leases: (() => void)[] = [];
    try {
      leases.push(acquireProcessSlot('production')!, acquireProcessSlot('production')!);
      expect(acquireProcessSlot('production')).toBeNull();
      leases.push(acquireProcessSlot('kernel')!);
      expect(acquireProcessSlot('kernel')).toBeNull();
      leases[0](); leases[0]();
      leases.push(acquireProcessSlot('kernel')!);
      expect(acquireProcessSlot('production')).toBeNull();
    } finally { leases.forEach((release) => release()); }
  });
  it('lowering admission limits drains existing leases without pretending to cancel them', () => {
    vi.stubEnv('PAYLOAD_EXECUTION_PROFILE', 'normal');
    const first = acquireProcessSlot('production')!;
    const second = acquireProcessSlot('kernel')!;
    try {
      vi.stubEnv('PAYLOAD_EXECUTION_PROFILE', 'conserve');
      expect(acquireProcessSlot('production')).toBeNull();
      first();
      expect(acquireProcessSlot('production')).toBeNull();
      second();
      const next = acquireProcessSlot('production')!;
      expect(next).toBeTypeOf('function');
      next();
    } finally { first(); second(); }
  });
});

describe('bounded process-scoped operating snapshots', () => {
  it('reports effective validated policy, separate process/telemetry starts and both pools', () => {
    vi.stubEnv('PAYLOAD_EXECUTION_PROFILE', 'conserve');
    vi.stubEnv('PAYLOAD_DB_POOL_MAX', '1');
    const snapshot = operatingSnapshot();
    expect(snapshot).toMatchObject({ schemaVersion: 1, scope: 'process', policyStatus: 'VALID', activeTotal: 0,
      limits: { profile: 'conserve', childProcesses: 1, productionWorkers: 1, kernelWorkers: 1, databaseConnections: 1 },
      process: { pid: process.pid } });
    expect(snapshot.process.instanceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(Date.parse(snapshot.process.startedAt)).toBeLessThanOrEqual(Date.parse(snapshot.process.telemetryStartedAt));
    expect(Date.parse(snapshot.process.telemetryStartedAt)).toBeLessThanOrEqual(Date.parse(snapshot.capturedAt));
    expect(snapshot.process.uptimeMs).toBeGreaterThanOrEqual(0);
    for (const pool of Object.values(snapshot.pools)) {
      expect(pool.activeWork).toEqual([]);
      expect(pool).toHaveProperty('refused.configInvalid');
      expect(pool).toHaveProperty('failures.exit');
      expect(pool).toHaveProperty('bytes.stderrObserved');
      expect(pool).toHaveProperty('durationMs.closedCount');
    }
  });

  it('reports invalid policy without a read incrementing refusals or echoing settings', () => {
    vi.stubEnv('PAYLOAD_EXECUTION_PROFILE', 'credential-private-path');
    const before = operatingSnapshot();
    const next = operatingSnapshot();
    expect(next.policyStatus).toBe('INVALID');
    expect(next.limits).toBeNull();
    expect(next.pools).toEqual(before.pools);
    expect(JSON.stringify(next)).not.toContain('credential-private-path');
  });

  it('counts rejected admission separately from started work and never labels a plain lease successful', () => {
    vi.stubEnv('PAYLOAD_EXECUTION_PROFILE', 'conserve');
    const before = operatingSnapshot().pools.production;
    const lease = acquireProcessSlot('production')!;
    try {
      expect(acquireProcessSlot('production')).toBeNull();
      vi.stubEnv('PAYLOAD_EXECUTION_PROFILE', 'invalid');
      expect(() => acquireProcessSlot('production')).toThrow('EXECUTION_POLICY_INVALID');
      const active = operatingSnapshot().pools.production;
      expect(active.attempted - before.attempted).toBe(3);
      expect(active.admitted - before.admitted).toBe(1);
      expect(active.refused.busy - before.refused.busy).toBe(1);
      expect(active.refused.configInvalid - before.refused.configInvalid).toBe(1);
      expect(active.activeWork).toEqual([{ ageMs: expect.any(Number), settled: false, outcome: null }]);
    } finally { lease(); lease(); }
    const closed = operatingSnapshot().pools.production;
    expect(closed.closed - before.closed).toBe(1);
    expect(closed.succeeded).toBe(before.succeeded);
  });

  it('measures monotonic age and lifetime through release, not through settlement', () => {
    const clock = vi.spyOn(performance, 'now').mockReturnValue(100);
    const before = operatingSnapshot().pools.kernel;
    const lease = acquireProcessSlot('kernel')!;
    try {
      clock.mockReturnValue(150);
      lease.settle('TIMEOUT');
      clock.mockReturnValue(280);
      expect(operatingSnapshot().pools.kernel.activeWork).toEqual([{ ageMs: 180, settled: true, outcome: 'TIMEOUT' }]);
      lease(); lease();
      lease.settle('SUCCEEDED');
      const closed = operatingSnapshot().pools.kernel;
      expect(closed.closed - before.closed).toBe(1);
      expect(closed.durationMs.closedCount - before.durationMs.closedCount).toBe(1);
      expect(closed.durationMs.total - before.durationMs.total).toBe(180);
      expect(closed.durationMs.last).toBe(180);
      expect(closed.failures.timeout - before.failures.timeout).toBe(1);
      expect(closed.succeeded).toBe(before.succeeded);
    } finally { lease(); clock.mockRestore(); }
  });

  it('returns detached snapshots so callers cannot change admission, counters or active metadata', () => {
    const lease = acquireProcessSlot('kernel')!;
    try {
      const changed = operatingSnapshot();
      const before = operatingSnapshot();
      changed.pools.kernel.refused.busy = -1;
      changed.pools.kernel.bytes.stdinSubmitted = -1;
      changed.pools.kernel.durationMs.total = -1;
      changed.pools.kernel.failures.exit = -1;
      changed.pools.kernel.activeWork[0].outcome = 'SUCCEEDED';
      changed.pools.kernel.activeWork.length = 0;
      changed.limits!.childProcesses = 1000;
      const next = operatingSnapshot();
      expect(next.pools.kernel.refused).toEqual(before.pools.kernel.refused);
      expect(next.pools.kernel.bytes).toEqual(before.pools.kernel.bytes);
      expect(next.pools.kernel.durationMs).toEqual(before.pools.kernel.durationMs);
      expect(next.pools.kernel.failures).toEqual(before.pools.kernel.failures);
      expect(next.pools.kernel.activeWork).toEqual([{ ageMs: expect.any(Number), settled: false, outcome: null }]);
      expect(next.limits).toEqual(before.limits);
    } finally { lease(); }
  });

  it('shares identity, counts and the active ceiling across separately evaluated route modules', async () => {
    vi.stubEnv('PAYLOAD_EXECUTION_PROFILE', 'conserve');
    const lease = acquireProcessSlot('production')!;
    try {
      const before = operatingSnapshot();
      vi.resetModules();
      const secondBundle = await import('./policy');
      expect(secondBundle.operatingSnapshot().process).toMatchObject({ instanceId: before.process.instanceId, telemetryStartedAt: before.process.telemetryStartedAt });
      expect(secondBundle.operatingSnapshot().activeTotal).toBe(1);
      expect(secondBundle.acquireProcessSlot('kernel')).toBeNull();
      expect(operatingSnapshot().pools.kernel.refused.busy).toBe(before.pools.kernel.refused.busy + 1);
      lease();
      expect(secondBundle.operatingSnapshot().activeTotal).toBe(0);
    } finally { lease(); }
  });

  it('does not retain invalid byte samples and marks saturating counters rather than overflowing', () => {
    const lease = acquireProcessSlot('kernel')!;
    try {
      const before = operatingSnapshot().pools.kernel.bytes;
      for (const invalid of [NaN, Infinity, -1, 0.5]) lease.bytes('stdinSubmitted', invalid);
      expect(operatingSnapshot().pools.kernel.bytes).toEqual(before);
      lease.bytes('stdinSubmitted', Number.MAX_SAFE_INTEGER);
      lease.bytes('stdinSubmitted', 1);
      expect(operatingSnapshot().pools.kernel.bytes.stdinSubmitted).toBe(Number.MAX_SAFE_INTEGER);
      expect(operatingSnapshot().countersSaturated).toBe(true);
      const snapshot = operatingSnapshot();
      expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
    } finally { lease(); }
  });
});
