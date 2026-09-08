/**
 * The planner's two disciplines, pinned: it decides and never collects, and
 * absence is typed rather than zeroed.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SourceConnectorError } from './errors';
import {
  SCHEDULE_LOSS, SCHEDULE_METHOD, parseCaptureSchedule, planCapture,
  type CaptureSchedule, type ScheduleRun,
} from './schedule';

const SOURCE = resolve(process.cwd(), 'src/acquisition/schedule.ts');
const withoutComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function schedule(overrides: Partial<CaptureSchedule> = {}): CaptureSchedule {
  return {
    schema: SCHEDULE_METHOD, scheduleId: 'fl-oir-daily', sourceId: 'fl-oir-statutory-filing',
    minimumIntervalHours: 24, notBefore: '2026-09-07T00:00:00.000Z', notAfter: '2026-10-07T00:00:00.000Z',
    maxRuns: 30, enabled: true, ...overrides,
  };
}
const run = (startedAt: string, state: ScheduleRun['state'] = 'CAPTURED'): ScheduleRun => ({ startedAt, state });

describe('the planner decides and never collects', () => {
  it('reaches for no transport, so a plan can be computed anywhere without opening a socket', () => {
    const source = withoutComments(readFileSync(SOURCE, 'utf8'));
    const imports = [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]);
    expect(imports.filter((path) => /http|store|node:(https|http|dns|net|fs)/.test(path))).toEqual([]);
    // Call sites, not the word: the losses list mentions fetching in prose.
    expect(source).not.toMatch(/\bfetch\(|setTimeout\(|setInterval\(|Date\.now\(|new Date\(\)/);
  });

  it('marks exactly one decision as collecting, so a caller that fetches on any other is a named bug', () => {
    const at = '2026-09-08T00:00:00.000Z';
    const due = planCapture(schedule(), [], at);
    expect(due.decision).toBe('DUE');
    expect(due.collects).toBe(true);
    for (const other of [
      planCapture(schedule({ enabled: false }), [], at),
      planCapture(schedule(), [run('2026-09-07T23:00:00.000Z')], at),
      planCapture(schedule(), [], '2026-09-06T00:00:00.000Z'),
      planCapture(schedule(), [], '2026-10-08T00:00:00.000Z'),
      planCapture(schedule({ maxRuns: 1 }), [run('2026-09-01T00:00:00.000Z')], at),
    ]) expect(other.collects).toBe(false);
  });
});

describe('absence is typed', () => {
  it('reports a schedule that has never run as null, not as an epoch', () => {
    const plan = planCapture(schedule(), [], '2026-09-08T00:00:00.000Z');
    expect(plan.lastRunAt).toBeNull();
    expect(plan.runsSpent).toBe(0);
    expect(plan.runsRemaining).toBe(30);
    expect(plan.because).toMatch(/no previous run/);
  });

  it('reports no next run as null and says why, rather than naming a date it will never reach', () => {
    const spent = planCapture(schedule({ maxRuns: 2 }), [run('2026-09-07T01:00:00.000Z'), run('2026-09-08T01:00:00.000Z')], '2026-09-09T02:00:00.000Z');
    expect(spent.decision).toBe('RUN_BUDGET_SPENT');
    expect(spent.nextEligibleAt).toBeNull();
    expect(spent.runsRemaining).toBe(0);

    const closed = planCapture(schedule(), [], '2026-10-08T00:00:00.000Z');
    expect(closed.decision).toBe('WINDOW_CLOSED');
    expect(closed.nextEligibleAt).toBeNull();
    expect(closed.because).toMatch(/finished rather than merely quiet/);
  });

  it('keeps DISABLED as its own answer, not a closed window and not an exhausted budget', () => {
    const plan = planCapture(schedule({ enabled: false }), [run('2026-09-07T01:00:00.000Z')], '2026-09-09T02:00:00.000Z');
    expect(plan.decision).toBe('DISABLED');
    expect(plan.runsRemaining).toBe(29);
    expect(plan.because).toMatch(/not a closed window, an exhausted budget or a refusal/);
  });
});

describe('a run is a run whatever it returned', () => {
  it('spends a slot for a failed attempt, because an attempt the source saw is traffic the source saw', () => {
    const history = [run('2026-09-07T01:00:00.000Z', 'FAILED'), run('2026-09-08T01:00:00.000Z', 'QUARANTINED')];
    const plan = planCapture(schedule({ maxRuns: 2 }), history, '2026-09-09T02:00:00.000Z');
    expect(plan.decision).toBe('RUN_BUDGET_SPENT');
    expect(plan.runsSpent).toBe(2);
    expect(plan.because).toMatch(/counting 2 that did not capture/);
  });

  it('measures the interval from the last attempt of any outcome', () => {
    const history = [run('2026-09-08T00:00:00.000Z', 'FAILED')];
    const early = planCapture(schedule(), history, '2026-09-08T12:00:00.000Z');
    expect(early.decision).toBe('NOT_DUE');
    expect(early.nextEligibleAt).toBe('2026-09-09T00:00:00.000Z');
    expect(planCapture(schedule(), history, '2026-09-09T00:00:00.000Z').decision).toBe('DUE');
  });

  it('reads history in any order, because a directory listing is not a chronology', () => {
    const shuffled = [run('2026-09-09T00:00:00.000Z'), run('2026-09-07T00:00:00.000Z'), run('2026-09-08T00:00:00.000Z')];
    expect(planCapture(schedule(), shuffled, '2026-09-09T12:00:00.000Z').lastRunAt).toBe('2026-09-09T00:00:00.000Z');
  });
});

describe('the window is half-open at both ends', () => {
  it('opens at notBefore and closes at notAfter', () => {
    expect(planCapture(schedule(), [], '2026-09-07T00:00:00.000Z').decision).toBe('DUE');
    expect(planCapture(schedule(), [], '2026-09-06T23:59:59.999Z').decision).toBe('WINDOW_NOT_OPEN');
    expect(planCapture(schedule(), [], '2026-10-06T23:59:59.999Z').decision).toBe('DUE');
    expect(planCapture(schedule(), [], '2026-10-07T00:00:00.000Z').decision).toBe('WINDOW_CLOSED');
  });

  it('names the opening instant as the next eligible time before the window opens', () => {
    const plan = planCapture(schedule(), [], '2026-09-01T00:00:00.000Z');
    expect(plan.nextEligibleAt).toBe('2026-09-07T00:00:00.000Z');
  });
});

describe('the schedule is a closed command', () => {
  const rejects = (value: unknown) => {
    expect(() => parseCaptureSchedule(value)).toThrow(SourceConnectorError);
    try { parseCaptureSchedule(value); } catch (failure) {
      expect((failure as SourceConnectorError).code).toBe('INVALID_CAPTURE_SCHEDULE');
    }
  };

  it('refuses a sub-hourly floor, an unbounded budget, a backwards window and a non-canonical instant', () => {
    rejects(schedule({ minimumIntervalHours: 0 }));
    rejects({ ...schedule(), minimumIntervalHours: 0.5 });
    rejects(schedule({ maxRuns: 0 }));
    rejects(schedule({ maxRuns: 1001 }));
    rejects(schedule({ notBefore: '2026-10-07T00:00:00.000Z', notAfter: '2026-09-07T00:00:00.000Z' }));
    rejects(schedule({ notBefore: '2026-09-07T00:00:00Z' }));
    rejects({ ...schedule(), extra: true });
    rejects({ ...schedule(), enabled: 'yes' });
  });

  it('refuses to plan over an unreadable history rather than skipping the entries it cannot read', () => {
    expect(() => planCapture(schedule(), [{ startedAt: 'yesterday', state: 'CAPTURED' }], '2026-09-08T00:00:00.000Z')).toThrow(SourceConnectorError);
    expect(() => planCapture(schedule(), [{ startedAt: '2026-09-08T00:00:00.000Z', state: 'UNKNOWN' as ScheduleRun['state'] }], '2026-09-08T00:00:00.000Z')).toThrow(SourceConnectorError);
    expect(() => planCapture(schedule(), [], '2026-09-08T00:00:00Z')).toThrow(SourceConnectorError);
  });
});

describe('what the planner gives up', () => {
  it('states its losses, beginning with holding no timer', () => {
    expect(SCHEDULE_LOSS[0]).toMatch(/decides and never collects/);
    expect(SCHEDULE_LOSS.join(' ')).toMatch(/A run is a run whatever it returned/);
    expect(SCHEDULE_LOSS.join(' ')).toMatch(/never an epoch/);
  });
});
