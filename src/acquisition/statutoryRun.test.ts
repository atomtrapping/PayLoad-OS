/**
 * The gate between a schedule and a socket.
 *
 * One property carries the whole design: the store is asked exactly when the
 * plan says DUE, and on every other decision it is not touched at all. A
 * scheduler that requested first and decided afterwards would have spent a
 * budget slot and contacted a regulator before anyone read the window.
 */
import { describe, expect, it, vi } from 'vitest';
import { SourceConnectorError } from './errors';
import { SCHEDULE_METHOD, type CaptureSchedule } from './schedule';
import type { StatutoryCaptureInspection } from './store';
import {
  CAPTURE_PLAN_METHOD, parseStatutoryCapturePlan, readRunHistory, runIdFor, runScheduledCapture,
  type StatutoryCapturePlan, type StatutoryRunStore,
} from './statutoryRun';

const schedule: CaptureSchedule = {
  schema: SCHEDULE_METHOD, scheduleId: 'tx-tdi-weekly', sourceId: 'tx-tdi-statutory-filing',
  minimumIntervalHours: 168, notBefore: '2026-09-07T00:00:00.000Z', notAfter: '2026-12-07T00:00:00.000Z',
  maxRuns: 12, enabled: true,
};

function plan(overrides: Partial<StatutoryCapturePlan> = {}): StatutoryCapturePlan {
  return {
    schema: CAPTURE_PLAN_METHOD, schedule,
    target: { jurisdiction: 'TX_TDI', documentPath: '/company/documents/orders.txt' },
    ...overrides,
  };
}

function historyStore(runs: Array<{ startedAt: string; state: StatutoryCaptureInspection['state'] }>): StatutoryRunStore & { capture: ReturnType<typeof vi.fn> } {
  const capture = vi.fn(async (value: unknown) => ({
    ...(value as object), state: 'CAPTURED', intent: { startedAt: '2026-09-21T00:00:00.000Z' },
  }) as unknown as StatutoryCaptureInspection);
  return {
    capture,
    inspect: (id: string) => {
      const index = Number(id.slice('tx-tdi-weekly-'.length));
      const run = runs[index - 1];
      return run ? ({ intent: { startedAt: run.startedAt }, state: run.state } as unknown as StatutoryCaptureInspection) : undefined;
    },
  };
}

describe('the store is asked only when the plan says DUE', () => {
  it('collects once on the first invocation inside the window', async () => {
    const store = historyStore([]);
    const outcome = await runScheduledCapture(plan(), store, '2026-09-07T09:00:00.000Z', true);
    expect(outcome.plan.decision).toBe('DUE');
    expect(outcome.runId).toBe('tx-tdi-weekly-1');
    expect(store.capture).toHaveBeenCalledOnce();
    expect(store.capture.mock.calls[0][0]).toEqual({
      schema: 'payload.statutory-capture-request.v1', requestId: 'tx-tdi-weekly-1',
      jurisdiction: 'TX_TDI', documentPath: '/company/documents/orders.txt',
    });
    expect(store.capture.mock.calls[0][1]).toBe(true);
  });

  it('touches nothing when the invocation is not due, so no slot is spent and no request is sent', async () => {
    const store = historyStore([{ startedAt: '2026-09-07T09:00:00.000Z', state: 'CAPTURED' }]);
    const outcome = await runScheduledCapture(plan(), store, '2026-09-08T09:00:00.000Z', true);
    expect(outcome.plan.decision).toBe('NOT_DUE');
    expect(outcome.captured).toBeNull();
    expect(store.capture).not.toHaveBeenCalled();
    expect(outcome.because).toMatch(/Nothing was requested and no history was written/);
  });

  it('stops on an unfinished run rather than treating it as a failure it can retry past', async () => {
    const store = historyStore([{ startedAt: '2026-09-07T09:00:00.000Z', state: 'INCOMPLETE' }]);
    const outcome = await runScheduledCapture(plan(), store, '2026-09-21T09:00:00.000Z', true);
    expect(outcome.plan.decision).toBe('HISTORY_INCOMPLETE');
    expect(store.capture).not.toHaveBeenCalled();
    expect(outcome.plan.because).toMatch(/neither a capture nor a failure/);
  });

  it('carries the operator’s collection flag through unchanged rather than deciding it here', async () => {
    const store = historyStore([]);
    await runScheduledCapture(plan(), store, '2026-09-07T09:00:00.000Z', false);
    expect(store.capture.mock.calls[0][1]).toBe(false);
  });
});

describe('run identity is derived, so the captures on disk are the ledger', () => {
  it('numbers each run after the last capture present, counting failures as runs', () => {
    const store = historyStore([
      { startedAt: '2026-09-07T09:00:00.000Z', state: 'CAPTURED' },
      { startedAt: '2026-09-14T09:00:00.000Z', state: 'FAILED' },
    ]);
    expect(readRunHistory(plan(), store).map((run) => run.state)).toEqual(['CAPTURED', 'FAILED']);
    expect(runIdFor('tx-tdi-weekly', 3)).toBe('tx-tdi-weekly-3');
  });

  it('gives the third invocation the third ID, so a replay cannot pass for a new capture', async () => {
    const store = historyStore([
      { startedAt: '2026-09-07T09:00:00.000Z', state: 'CAPTURED' },
      { startedAt: '2026-09-14T09:00:00.000Z', state: 'CAPTURED' },
    ]);
    const outcome = await runScheduledCapture(plan(), store, '2026-09-21T09:00:00.000Z', true);
    expect(outcome.runId).toBe('tx-tdi-weekly-3');
    expect(store.capture.mock.calls[0][0]).toMatchObject({ requestId: 'tx-tdi-weekly-3' });
  });

  it('stops reading history at the first absent run rather than hunting past a gap', () => {
    const store: StatutoryRunStore = {
      capture: vi.fn(),
      inspect: (id) => id.endsWith('-2') ? undefined : ({ intent: { startedAt: '2026-09-07T09:00:00.000Z' }, state: 'CAPTURED' } as unknown as StatutoryCaptureInspection),
    };
    expect(readRunHistory(plan(), store)).toHaveLength(1);
  });
});

describe('the plan is a closed command', () => {
  it('refuses a declared request ID, because run identity is derived and not chosen', () => {
    expect(() => parseStatutoryCapturePlan({ ...plan(), target: { jurisdiction: 'TX_TDI', documentPath: '/a.txt', requestId: 'fixed' } })).toThrow(SourceConnectorError);
  });

  it('refuses a target the capture request itself would refuse', () => {
    expect(() => parseStatutoryCapturePlan(plan({ target: { jurisdiction: 'TX_TDI', documentPath: 'orders.txt' } }))).toThrow(SourceConnectorError);
    expect(() => parseStatutoryCapturePlan(plan({ target: { jurisdiction: 'NY_DFS' as 'TX_TDI', documentPath: '/a.txt' } }))).toThrow(SourceConnectorError);
  });

  it('refuses a schedule whose sourceId does not name the jurisdiction it collects', () => {
    expect(() => parseStatutoryCapturePlan(plan({ schedule: { ...schedule, sourceId: 'fl-oir-statutory-filing' } }))).toThrow(SourceConnectorError);
    expect(parseStatutoryCapturePlan(plan()).schedule.sourceId).toBe('tx-tdi-statutory-filing');
  });

  it('refuses an unbounded schedule inside an otherwise valid plan', () => {
    expect(() => parseStatutoryCapturePlan(plan({ schedule: { ...schedule, maxRuns: 100_000 } }))).toThrow(SourceConnectorError);
    expect(() => parseStatutoryCapturePlan({ schema: CAPTURE_PLAN_METHOD, schedule })).toThrow(SourceConnectorError);
  });
});
