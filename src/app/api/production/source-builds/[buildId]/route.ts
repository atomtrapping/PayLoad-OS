import { CensusCandidateBuildStore } from '@/data-os/local-census-candidate-build';
import { productionError, productionJson, requireProductionRequest } from '@/production/http';
import { inspectSourceHistory } from '../../_source-readback';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Read-only readback of one operator FMCSA candidate build (v2) over the qualification root: the store's own inspection, no assembly, no provider, no clock. */
export async function GET(request: Request, context: { params: Promise<{ buildId: string }> }) {
  try {
    requireProductionRequest(request);
    const { buildId } = await context.params;
    const build = inspectSourceHistory(buildId, {
      invalidMessage: 'Use a bounded build identifier.',
      notFound: { code: 'CENSUS_BUILD_NOT_FOUND', message: 'No stored FMCSA candidate build has this identifier.' },
      inspect: (root) => new CensusCandidateBuildStore(root).inspect(buildId),
    });
    return productionJson({ schema: 'payload.source-build-readback.v1', mode: 'LOCAL_DEVELOPMENT', buildId, build,
      assemblyPerformed: false, providerContacted: false, rawBytesIncluded: false, canonicalAdmission: false, releaseActivated: false, customerDistributionPermitted: false });
  } catch (error) { return productionError(error); }
}
