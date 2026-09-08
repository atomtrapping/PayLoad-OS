/**
 * One invocation of a statutory capture schedule.
 *
 * The operator's scheduler runs this; it asks the planner whether the
 * invocation is due, and collects exactly once if it is. Everything it needs to
 * decide it reads from disk: there is no run counter, no cursor file and no
 * state of its own, because a scheduler with private state is a second author
 * of the history it is supposed to be recorded in.
 *
 * RUN IDENTITY IS DERIVED, SO THE HISTORY IS THE HISTORY
 *
 * Run N of schedule S is capture `S-N`, and that is the whole bookkeeping. The
 * captures already on disk are the run history, discovered by asking for
 * `S-1`, `S-2`, … until one is absent. Nothing summarises them, so nothing can
 * disagree with them, and an operator reading the directory reads exactly what
 * the planner read.
 *
 * It also removes a way to lie by accident. If the operator declared one
 * request ID for a recurring schedule, the store's replay would return the
 * first capture forever and every later run would look like a success that
 * never happened.
 */
import { SourceConnectorError } from './errors';
import { planCapture, type CaptureSchedule, type SchedulePlan, type ScheduleRun } from './schedule';
import { parseCaptureSchedule } from './schedule';
import { parseStatutoryCaptureRequest, type StatutoryCaptureRequest, type StatutoryJurisdiction } from './statutory';
import type { StatutoryCaptureInspection } from './store';

export const CAPTURE_PLAN_METHOD = 'payload.statutory-capture-plan.v1';

export interface StatutoryCapturePlan {
  schema: typeof CAPTURE_PLAN_METHOD;
  schedule: CaptureSchedule;
  /** The document this schedule collects. The request ID is derived per run and is not declared here. */
  target: { jurisdiction: StatutoryJurisdiction; documentPath: string };
}

export interface StatutoryRunOutcome {
  schema: 'payload.statutory-capture-run.v1';
  plan: SchedulePlan;
  /** The capture ID this invocation would use, whether or not it collected. */
  runId: string;
  /** Present only when the plan said DUE and the store was asked. Null otherwise, never an empty capture. */
  captured: StatutoryCaptureInspection | null;
  because: string;
}

function invalid(message: string): never {
  throw new SourceConnectorError('INVALID_STATUTORY_CAPTURE_PLAN', message);
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

/** Closed command: a schedule, a jurisdiction and a document. No URL, no clock, no request ID. */
export function parseStatutoryCapturePlan(value: unknown): StatutoryCapturePlan {
  if (!plainRecord(value) || Reflect.ownKeys(value).length !== 3
    || !['schema', 'schedule', 'target'].every((field) => Object.hasOwn(value, field))
    || value.schema !== CAPTURE_PLAN_METHOD || !plainRecord(value.target)) {
    invalid('Provide an exact statutory capture plan: schema, schedule and target.');
  }
  const schedule = parseCaptureSchedule(value.schedule);
  const target = value.target as Record<string, unknown>;
  if (Reflect.ownKeys(target).length !== 2 || !Object.hasOwn(target, 'jurisdiction') || !Object.hasOwn(target, 'documentPath')) {
    invalid('The target names exactly a jurisdiction and a document path. A request ID is derived per run and may not be declared.');
  }
  // Validated by the connector's own parser against a probe ID, so the plan
  // cannot declare a document the capture request would later refuse.
  const probe = parseStatutoryCaptureRequest({
    schema: 'payload.statutory-capture-request.v1', requestId: 'probe',
    jurisdiction: target.jurisdiction, documentPath: target.documentPath,
  });
  if (schedule.sourceId !== `${probe.jurisdiction.toLowerCase().replace('_', '-')}-statutory-filing`) {
    invalid('The schedule’s sourceId must name the jurisdiction it collects, for example fl-oir-statutory-filing.');
  }
  return {
    schema: CAPTURE_PLAN_METHOD, schedule,
    target: { jurisdiction: probe.jurisdiction, documentPath: probe.documentPath },
  };
}

/** Run N of schedule S. Derived, never stored, so the captures on disk are the only ledger. */
export function runIdFor(scheduleId: string, run: number): string {
  return `${scheduleId}-${run}`;
}

/** The store surface this runner needs: read history, and collect at most once. */
export interface StatutoryRunStore {
  inspect(id: string): StatutoryCaptureInspection | undefined;
  capture(value: unknown, enabled?: boolean): Promise<StatutoryCaptureInspection>;
}

/**
 * The captures already on disk, in run order. Stops at the first absent run:
 * the ids are contiguous by construction, so a gap would mean history was
 * removed, and this reads what is there rather than hunting for what is not.
 */
export function readRunHistory(plan: StatutoryCapturePlan, store: StatutoryRunStore): ScheduleRun[] {
  const runs: ScheduleRun[] = [];
  for (let run = 1; run <= plan.schedule.maxRuns; run += 1) {
    const inspection = store.inspect(runIdFor(plan.schedule.scheduleId, run));
    if (!inspection) break;
    runs.push({ startedAt: inspection.intent.startedAt, state: inspection.state });
  }
  return runs;
}

/**
 * Decide, then collect at most once.
 *
 * `collects` is the only gate. Every other decision returns the plan and a null
 * capture, and the store is never asked — so a schedule that is not due leaves
 * no intent, spends no budget slot and sends no request.
 */
export async function runScheduledCapture(
  value: unknown,
  store: StatutoryRunStore,
  at: string,
  collectionEnabled: boolean,
): Promise<StatutoryRunOutcome> {
  const plan = parseStatutoryCapturePlan(value);
  const history = readRunHistory(plan, store);
  const decision = planCapture(plan.schedule, history, at);
  const runId = runIdFor(plan.schedule.scheduleId, history.length + 1);
  if (!decision.collects) {
    return {
      schema: 'payload.statutory-capture-run.v1', plan: decision, runId, captured: null,
      because: `${decision.decision}: ${decision.because} Nothing was requested and no history was written.`,
    };
  }
  const request: StatutoryCaptureRequest = {
    schema: 'payload.statutory-capture-request.v1', requestId: runId,
    jurisdiction: plan.target.jurisdiction, documentPath: plan.target.documentPath,
  };
  const captured = await store.capture(request, collectionEnabled);
  return {
    schema: 'payload.statutory-capture-run.v1', plan: decision, runId, captured,
    because: `DUE, so run ${history.length + 1} of ${plan.schedule.maxRuns} was collected as ${runId} and finished ${captured.state}. The bytes are retained under a digest computed here; no field was read from them and nothing was admitted.`,
  };
}
