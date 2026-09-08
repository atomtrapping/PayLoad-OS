import { SourceCaptureStore } from '@/acquisition/store';
import { productionError, productionJson, requireProductionRequest } from '@/production/http';
import { inspectSourceHistory } from '../../_source-readback';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Read-only readback of one operator source capture, under the same flag and
 * loopback guard as the production rail. Nothing is collected, no provider is
 * contacted, no clock is read, and no history is changed: the store's own
 * inspection recomputes local integrity and answers, or refuses.
 */
export async function GET(request: Request, context: { params: Promise<{ requestId: string }> }) {
  try {
    requireProductionRequest(request);
    const { requestId } = await context.params;
    const inspection = inspectSourceHistory(requestId, {
      invalidMessage: 'Use a bounded source capture request identifier.',
      notFound: { code: 'SOURCE_CAPTURE_NOT_FOUND', message: 'No stored source capture has this request ID.' },
      inspect: (root) => new SourceCaptureStore(root).inspect(requestId),
    });
    return productionJson({ schema: 'payload.source-capture-readback.v1', mode: 'LOCAL_DEVELOPMENT', requestId, inspection,
      collectionPerformed: false, providerContacted: false, rawBytesIncluded: false, canonicalAdmission: false, customerDistributionPermitted: false });
  } catch (error) { return productionError(error); }
}
