import { CensusNormalizationStore } from '@/acquisition/census-normalization';
import { productionError, productionJson, requireProductionRequest } from '@/production/http';
import { inspectSourceHistory } from '../../_source-readback';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Read-only readback of one operator FMCSA normalization run over the qualification root: the store's own inspection, no derivation, no provider, no clock. */
export async function GET(request: Request, context: { params: Promise<{ normalizationId: string }> }) {
  try {
    requireProductionRequest(request);
    const { normalizationId } = await context.params;
    const run = inspectSourceHistory(normalizationId, {
      invalidMessage: 'Use a bounded normalization identifier.',
      notFound: { code: 'CENSUS_NORMALIZATION_NOT_FOUND', message: 'No stored FMCSA normalization has this identifier.' },
      inspect: (root) => new CensusNormalizationStore(root).inspect(normalizationId),
    });
    return productionJson({ schema: 'payload.source-normalization-readback.v1', mode: 'LOCAL_DEVELOPMENT', normalizationId, run,
      derivationPerformed: false, providerContacted: false, rawBytesIncluded: false, canonicalAdmission: false, customerDistributionPermitted: false });
  } catch (error) { return productionError(error); }
}
