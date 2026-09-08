import type { NextRequest } from 'next/server';
import { bodyRefusal, FeedBodyError, json, readBoundedJson, refusal } from '../../_lib';
import { FIXTURE_DISPATCH_STREAM, DEFENSE_RECONSTRUCTION_CASE_0803 } from '@/fixtures/caravan/dispatchLiability';

export async function POST(request: NextRequest) {
  try {
    const body = (await readBoundedJson(request)) as { decisionId?: unknown } | undefined;
    const decisionId = typeof body?.decisionId === 'string' ? body.decisionId : undefined;

    if (!decisionId) {
      return refusal(400, 'missing_decision_id', 'Provide a decisionId in JSON body', 'Provide { "decisionId": "DISP-EVT-2026-0803" }');
    }

    if (decisionId === 'DISP-EVT-2026-0803' || decisionId === 'LOD-99203') {
      return json({
        schema: 'payload.dispatch-liability.defense-reconstruction.v1',
        fixture_only: true,
        reconstruction: DEFENSE_RECONSTRUCTION_CASE_0803,
      });
    }

    const found = FIXTURE_DISPATCH_STREAM.find((e) => e.decisionId === decisionId);
    if (!found) {
      return refusal(404, 'decision_not_found', `No dispatch decision ${decisionId}.`, 'List decisions via GET /api/v1/dispatch-liability/events');
    }

    return json({
      schema: 'payload.dispatch-liability.defense-reconstruction.v1',
      fixture_only: true,
      reconstruction: {
        decisionId: found.decisionId,
        carrierUsdot: found.carrierSafetySnapshot.usdot,
        carrierName: found.carrierSafetySnapshot.legalName,
        decisionTimestamp: found.decisionTimestamp,
        knowledgeTimeTk: found.knowledgeCutoff,
        subpoenaTimeTsub: new Date().toISOString(),
        stateAtTk: {
          authority: found.carrierSafetySnapshot.operatingAuthorityStatus,
          safetyRating: found.carrierSafetySnapshot.safetyRating,
          vehicleOosRate: found.carrierSafetySnapshot.vehicleOosRate,
          fatalCrashes: found.carrierSafetySnapshot.crashHistory24Mo.fatal,
          defensible: found.qualificationVerdict.doctrineCompliance === 'DEFENSIBLE_SELECTION',
        },
        evidentiaryFinding: `At knowledge cutoff Tk (${found.knowledgeCutoff}), automated dispatch selection conformed strictly to ${found.broker.algorithmPolicyId}. Carrier had active authority and compliant safety metrics.`,
      },
    });
  } catch (error) {
    if (error instanceof FeedBodyError) return bodyRefusal(error);
    return refusal(400, 'invalid_payload', 'Request must be valid JSON', 'Send { "decisionId": string }');
  }
}
