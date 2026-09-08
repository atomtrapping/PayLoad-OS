/**
 * WHAT THIS ROUTE DOES, AND THE WORD IT USED TO USE FOR IT.
 *
 * It computes what the calibration for one instrument would become if a
 * supplied observation outcome were added to the committed tasking history, and
 * returns that. It writes nothing. There is no store behind it: the combined
 * history is a local array, and it is garbage collected when the response is
 * serialized.
 *
 * It used to answer `status: 'OBSERVATION_RECORDED_AND_CALIBRATED'` — past
 * tense, twice, for a thing that happened neither time — and to stamp the echoed
 * order `status: 'CALIBRATED'` with a `calibrationRunAt` timestamp for a run
 * nothing retained, under a doctrine block stating the storage rule the route
 * does not execute. It was also the one response in this repository that both
 * claimed persistence and skipped the synthetic attestation envelope, because it
 * called NextResponse directly instead of the feed's own `json`.
 *
 * A preview is a useful thing to serve. It is not a record, and the difference
 * is the entire subject of this system.
 */
import type { NextRequest } from 'next/server';
import { bodyRefusal, FeedBodyError, json, readBoundedJson, refusal } from '../../../_lib';
import type { TaskingOrderRecord } from '@/domain/productionPipeline';
import { calibrateInstrumentFromHistory } from '@/domain/productionPipeline';
import { FIXTURE_TASKING_ORDERS } from '@/fixtures/frontier/productionCorpus';
import type { MeasurementInstrumentId } from '@/domain/n11MeasurementEconomy';

/** Everything this route reads off the wire, so no field arrives as `unknown` and is defaulted by accident. */
interface ObservationRequest {
  orderId?: string;
  instrumentId?: string;
  projectId?: string;
  targetMilestone?: string;
  dispatchedAt?: string;
  defectActuallyExisted?: boolean;
  instrumentDetectedDefect?: boolean;
  turnaroundHoursElapsed?: number;
  assumedSensitivity?: number;
  assumedFalseAlarmRate?: number;
  authorizedCostCents?: number;
  measuredNoiseVarianceMm?: number;
}

export async function POST(req: NextRequest) {
  try {
    const body = ((await readBoundedJson(req)) ?? {}) as ObservationRequest;
    const { orderId, instrumentId, defectActuallyExisted, instrumentDetectedDefect, turnaroundHoursElapsed } = body;

    if (!orderId || !instrumentId) {
      return refusal(400, 'missing_fields', 'orderId and instrumentId are required', 'Send { orderId, instrumentId, defectActuallyExisted, instrumentDetectedDefect }.');
    }

    const supposedOrder: TaskingOrderRecord = {
      orderId,
      // No default with LIVE in it: an unnamed project is unnamed.
      projectId: body.projectId ?? 'PROJECT_NOT_NAMED_BY_CALLER',
      targetMilestone: body.targetMilestone ?? 'Ground Truth Verification Inspection',
      instrumentId: instrumentId as MeasurementInstrumentId,
      // Not CALIBRATED. This order exists for the length of this request.
      status: 'OBSERVED',
      dispatchedAt: body.dispatchedAt ?? new Date(Date.now() - 86400000).toISOString(),
      observedAt: new Date().toISOString(),
      priors: {
        assumedSensitivity: body.assumedSensitivity ?? 0.95,
        assumedFalseAlarmRate: body.assumedFalseAlarmRate ?? 0.05,
        authorizedCostCents: body.authorizedCostCents ?? 1000000,
      },
      observationOutcome: {
        defectActuallyExisted: Boolean(defectActuallyExisted),
        instrumentDetectedDefect: Boolean(instrumentDetectedDefect),
        turnaroundHoursElapsed: Number(turnaroundHoursElapsed ?? 24),
        measuredNoiseVarianceMm: Number(body.measuredNoiseVarianceMm ?? 2.5),
      },
    };

    const committed = calibrateInstrumentFromHistory(instrumentId as MeasurementInstrumentId, FIXTURE_TASKING_ORDERS);
    const withSupplied = calibrateInstrumentFromHistory(instrumentId as MeasurementInstrumentId, [...FIXTURE_TASKING_ORDERS, supposedOrder]);

    return json({
      schema: 'payload.frontier.measurement-economy.tasking.observe.v1',
      status: 'CALIBRATION_PREVIEWED_NOT_PERSISTED',
      writes: 'NONE',
      // Both readings, so the caller can see what the supplied observation
      // would change rather than being handed only the after.
      calibrationOnCommittedHistory: committed,
      calibrationIfSupplied: withSupplied,
      supposedOrder,
      doctrine: {
        rule: 'Close the N11 loop by storing every N11-TASK-* with its eventual observation outcome.',
        state: 'The loop is not closed. This route has no store: the supplied outcome is held for the length of this request and is not retained, so the next call to GET /api/v1/measurement-economy/instruments reads the committed history unchanged.',
        blocker: 'A tasking order is an operational record with an author and a time, and nothing in this repository is the place it would be written. The admission gate at src/db/admitRecords.ts admits corpus records, not tasking outcomes.',
      },
    });
  } catch (error) {
    if (error instanceof FeedBodyError) return bodyRefusal(error);
    return refusal(400, 'invalid_request', error instanceof Error ? error.message : 'Failed to evaluate the supplied tasking observation', 'Send { orderId, instrumentId, defectActuallyExisted, instrumentDetectedDefect }.');
  }
}
