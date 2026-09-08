import type { NextRequest } from 'next/server';
import { bodyRefusal, FeedBodyError, json, readBoundedJson, refusal } from '../../_lib';
import { optimizeInspectionTasking, type ProjectMilestoneDrawContext } from '@/domain/n11MeasurementEconomy';
import { FIXTURE_PROJECT_DRAWS } from '@/fixtures/frontier/insurabilityAndN11';
import { getActiveParameterSet } from '@/domain/parameterRegistry';
import { FIXTURE_TASKING_ORDERS } from '@/fixtures/frontier/productionCorpus';

export async function POST(req: NextRequest) {
  try {
    let context: ProjectMilestoneDrawContext = FIXTURE_PROJECT_DRAWS[0];
    const parsed = (await readBoundedJson(req)) as { context?: ProjectMilestoneDrawContext; requestedDrawAmountCents?: unknown } | undefined;
    if (parsed?.context) context = parsed.context;
    else if (parsed?.requestedDrawAmountCents) context = parsed as ProjectMilestoneDrawContext;

    const paramSet = getActiveParameterSet();
    const schedule = optimizeInspectionTasking(context, {
      paramSet,
      taskingHistory: FIXTURE_TASKING_ORDERS,
    });

    return json({
      schema: 'payload.frontier.measurement-economy.optimization.v1',
      parameterSetVersion: paramSet.version,
      parameterSetDigest: paramSet.parameterSetDigest,
      confidentialityContract: 'EPHEMERAL_PROCESSING_ONLY_ZERO_RETENTION',
      ...schedule,
    });
  } catch (error) {
    if (error instanceof FeedBodyError) return bodyRefusal(error);
    return refusal(400, 'invalid_request', error instanceof Error ? error.message : 'Failed to optimize measurement tasking', 'Send { context: ProjectMilestoneDrawContext } or a draw context object, or no body at all to use the committed fixture.');
  }
}
