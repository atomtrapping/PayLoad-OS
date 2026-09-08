/**
 * When a capture may run, decided rather than timed.
 *
 * A scheduled connector is usually a daemon: a process holds a timer, wakes
 * itself, and fetches. That shape is wrong here for a reason that is doctrine
 * and not taste. A timer inside the application is a second actor with its own
 * unlogged state — it decides to collect, and the only record that it decided
 * is the collection itself. When it double-fires, or fires after the operator
 * revoked the source, the evidence of the decision is gone.
 *
 * So this module decides and never runs. The operator's own scheduler — cron, a
 * systemd timer, a CI cadence — invokes the capture command, and each
 * invocation asks this planner whether it is due. The decision is computed from
 * three things a reader can check afterwards: the declared schedule, the
 * capture history already on disk, and the instant of the invocation. Nothing
 * here holds state, sleeps, retries, or reaches a network, and a structural
 * test holds this module to importing no transport at all.
 *
 * A RUN IS A RUN, WHATEVER IT RETURNED
 *
 * A failed attempt spends its slot. This matches the byte budget the capture
 * store already keeps and it matters for the same reason: an attempt that
 * reached the regulator and failed is traffic the regulator saw, and a
 * scheduler that only counted successes would answer a rate limit by trying
 * harder. FAILED and QUARANTINED runs count exactly as CAPTURED runs count.
 *
 * ABSENCE IS TYPED
 *
 * A schedule that has never run has `lastRunAt: null`, not an epoch, and not a
 * zero. A schedule with no runs left has `nextEligibleAt: null` and says why,
 * rather than naming a date it will never reach. SILENCE-IS-NOT-ZERO applies to
 * a system reporting on itself as much as to a corpus.
 */
import { SourceConnectorError } from './errors';

export const SCHEDULE_METHOD = 'payload.capture-schedule.v1';

/** Why this invocation may or may not collect. Closed; a caller cannot invent a sixth. */
export type ScheduleDecision =
  /** Collect exactly once, now. */
  | 'DUE'
  /** Inside the window with runs remaining, but the interval since the last run has not elapsed. */
  | 'NOT_DUE'
  /** The schedule's window has not opened. */
  | 'WINDOW_NOT_OPEN'
  /** The schedule's window has closed. A capture after it would be outside the declared qualification. */
  | 'WINDOW_CLOSED'
  /** Every run this schedule declared has been spent. Spent slots are never reclaimed. */
  | 'RUN_BUDGET_SPENT'
  /** The operator turned it off. Nothing is inferred from that; it is simply off. */
  | 'DISABLED'
  /**
   * A previous run started and never wrote a receipt. Whether the source was
   * contacted is unknown, and continuing on top of it would be guessing, so the
   * schedule stops and names the run for the operator to inspect.
   */
  | 'HISTORY_INCOMPLETE';

export interface CaptureSchedule {
  schema: typeof SCHEDULE_METHOD;
  scheduleId: string;
  sourceId: string;
  /** The floor on how often this may collect. Not a promise to collect that often. */
  minimumIntervalHours: number;
  /** Half-open: eligible at this instant and after it. */
  notBefore: string;
  /** Half-open: ineligible at this instant and after it. */
  notAfter: string;
  /** Total collections this schedule may ever perform, spent or not. */
  maxRuns: number;
  enabled: boolean;
}

/**
 * One attempt already on disk, whatever it returned.
 *
 * INCOMPLETE is a fourth outcome and not a flavour of failure: the intent was
 * written and no receipt followed, so the attempt neither captured nor is known
 * to have failed. Collapsing it into FAILED would assert something about the
 * source nobody observed.
 */
export interface ScheduleRun {
  startedAt: string;
  state: 'CAPTURED' | 'QUARANTINED' | 'FAILED' | 'INCOMPLETE';
}

export interface SchedulePlan {
  schema: typeof SCHEDULE_METHOD;
  scheduleId: string;
  sourceId: string;
  decision: ScheduleDecision;
  /** True for DUE and nothing else. A caller that collects on any other decision is a bug this field names. */
  collects: boolean;
  at: string;
  runsSpent: number;
  runsRemaining: number;
  /** null when this schedule has never run. Never an epoch, never a zero. */
  lastRunAt: string | null;
  /** null when no further run is possible: the budget is spent or the window has closed. */
  nextEligibleAt: string | null;
  because: string;
}

const canonical = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  && new Date(value).toISOString() === value;

function invalid(message: string): never {
  throw new SourceConnectorError('INVALID_CAPTURE_SCHEDULE', message);
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

/** Closed command: a schedule declares a window, a floor and a budget, and nothing else. */
export function parseCaptureSchedule(value: unknown): CaptureSchedule {
  const fields = ['schema', 'scheduleId', 'sourceId', 'minimumIntervalHours', 'notBefore', 'notAfter', 'maxRuns', 'enabled'];
  if (!plainRecord(value) || Reflect.ownKeys(value).length !== fields.length
    || fields.some((field) => !Object.hasOwn(value, field))) {
    invalid('Provide an exact capture schedule: schema, scheduleId, sourceId, minimumIntervalHours, notBefore, notAfter, maxRuns, enabled.');
  }
  if (value.schema !== SCHEDULE_METHOD
    || typeof value.scheduleId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(value.scheduleId)
    || typeof value.sourceId !== 'string' || !/^[a-z0-9-]{1,80}$/.test(value.sourceId)
    || typeof value.enabled !== 'boolean') invalid('The capture schedule identifiers, schema or enabled flag are not permitted.');
  if (typeof value.minimumIntervalHours !== 'number' || !Number.isInteger(value.minimumIntervalHours)
    || value.minimumIntervalHours < 1 || value.minimumIntervalHours > 8760) {
    invalid('Declare a minimum interval of 1 to 8760 whole hours. A sub-hourly floor against a public regulator is not a schedule this connector will keep.');
  }
  if (typeof value.maxRuns !== 'number' || !Number.isInteger(value.maxRuns) || value.maxRuns < 1 || value.maxRuns > 1000) {
    invalid('Declare a total run budget of 1 to 1000. An unbounded schedule is not a bounded request.');
  }
  if (!canonical(value.notBefore) || !canonical(value.notAfter)) {
    invalid('Declare the window as canonical UTC instants, for example 2026-09-07T00:00:00.000Z.');
  }
  if (Date.parse(value.notAfter) <= Date.parse(value.notBefore)) {
    invalid('The schedule window must open before it closes.');
  }
  return {
    schema: SCHEDULE_METHOD, scheduleId: value.scheduleId, sourceId: value.sourceId,
    minimumIntervalHours: value.minimumIntervalHours, notBefore: value.notBefore,
    notAfter: value.notAfter, maxRuns: value.maxRuns, enabled: value.enabled,
  };
}

function plan(
  schedule: CaptureSchedule, at: string, decision: ScheduleDecision,
  runsSpent: number, lastRunAt: string | null, nextEligibleAt: string | null, because: string,
): SchedulePlan {
  return {
    schema: SCHEDULE_METHOD, scheduleId: schedule.scheduleId, sourceId: schedule.sourceId,
    decision, collects: decision === 'DUE', at, runsSpent,
    runsRemaining: Math.max(0, schedule.maxRuns - runsSpent), lastRunAt, nextEligibleAt, because,
  };
}

/**
 * Decide whether this invocation collects. Pure: the same schedule, history and
 * instant give the same plan on any machine, which is what makes the decision
 * auditable after the fact rather than only observable while it happens.
 */
export function planCapture(schedule: CaptureSchedule, history: readonly ScheduleRun[], at: string): SchedulePlan {
  const declared = parseCaptureSchedule(schedule);
  if (!canonical(at)) invalid('Plan against a canonical UTC instant.');
  for (const run of history) {
    if (!canonical(run.startedAt) || !['CAPTURED', 'QUARANTINED', 'FAILED', 'INCOMPLETE'].includes(run.state)) {
      invalid('The capture history is not readable as canonical runs; no plan was computed over it.');
    }
  }

  const now = Date.parse(at);
  const opens = Date.parse(declared.notBefore);
  const closes = Date.parse(declared.notAfter);
  // Every attempt counts, whatever it returned: an attempt the regulator saw is traffic.
  const runs = [...history].sort((left, right) => Date.parse(left.startedAt) - Date.parse(right.startedAt));
  const spent = runs.length;
  const last = runs.at(-1)?.startedAt ?? null;
  const intervalMs = declared.minimumIntervalHours * 3_600_000;
  const afterInterval = last === null ? null : new Date(Date.parse(last) + intervalMs).toISOString();

  const unfinished = runs.find((entry) => entry.state === 'INCOMPLETE');
  if (unfinished) {
    return plan(declared, at, 'HISTORY_INCOMPLETE', spent, last, null,
      `A run that began at ${unfinished.startedAt} wrote no receipt, so whether the source was contacted is unknown. That is neither a capture nor a failure, and this schedule stops rather than guessing which it was: inspect that run before the schedule continues.`);
  }
  if (!declared.enabled) {
    return plan(declared, at, 'DISABLED', spent, last, null,
      `Schedule ${declared.scheduleId} is disabled. Nothing is inferred from that — a disabled schedule is not a closed window, an exhausted budget or a refusal, and re-enabling it makes it eligible again under the same window and budget.`);
  }
  if (spent >= declared.maxRuns) {
    return plan(declared, at, 'RUN_BUDGET_SPENT', spent, last, null,
      `All ${declared.maxRuns} declared runs are spent, counting ${runs.filter((r) => r.state !== 'CAPTURED').length} that did not capture. A failed attempt is traffic the source saw, so it spends its slot; spent slots are never reclaimed and a larger budget is a new schedule.`);
  }
  if (now < opens) {
    return plan(declared, at, 'WINDOW_NOT_OPEN', spent, last, declared.notBefore,
      `The declared window opens at ${declared.notBefore}, which is after ${at}. Collecting early would be collecting outside the qualification the operator declared.`);
  }
  if (now >= closes) {
    return plan(declared, at, 'WINDOW_CLOSED', spent, last, null,
      `The declared window closed at ${declared.notAfter}. A capture after it would sit outside the source qualification that authorised it, so this schedule is finished rather than merely quiet.`);
  }
  if (afterInterval !== null && now < Date.parse(afterInterval)) {
    return plan(declared, at, 'NOT_DUE', spent, last, afterInterval,
      `The last run began at ${last} and this schedule declares a floor of ${declared.minimumIntervalHours} ${declared.minimumIntervalHours === 1 ? 'hour' : 'hours'}, so the next run is eligible at ${afterInterval}. This invocation collects nothing and records nothing.`);
  }
  return plan(declared, at, 'DUE', spent, last, at,
    last === null
      ? `Inside the window with ${declared.maxRuns} runs unspent and no previous run. This invocation may collect exactly once.`
      : `Inside the window, ${declared.maxRuns - spent} of ${declared.maxRuns} runs remaining, and ${declared.minimumIntervalHours} ${declared.minimumIntervalHours === 1 ? 'hour has' : 'hours have'} elapsed since ${last}. This invocation may collect exactly once.`);
}

export const SCHEDULE_LOSS = [
  'This module decides and never collects. It holds no timer, sleeps for nothing and reaches no network; the operator’s own scheduler invokes the command and this planner answers whether the invocation is due.',
  'A run is a run whatever it returned. FAILED and QUARANTINED attempts spend their slots exactly as captures do, because an attempt the source saw is traffic the source saw.',
  'A schedule that has never run reports lastRunAt as null, never an epoch. A schedule with no run left reports nextEligibleAt as null and says why, rather than naming a date it will never reach.',
  'DISABLED is its own answer. It is not a closed window, not an exhausted budget and not a refusal, and nothing may be inferred from it beyond the operator having turned it off.',
  'An unfinished run stops the schedule rather than being counted as a failure. An intent with no receipt says the source may or may not have been contacted, and continuing on top of it would assert something nobody observed.',
  'The plan is a decision and not a collection. `collects` is true for DUE alone, so a caller that fetches on any other decision is a bug this field names rather than a policy this module allowed.',
] as const;
