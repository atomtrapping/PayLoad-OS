import { NextRequest } from 'next/server';
import { json } from '../../_lib';
import { FIXTURE_BITEMPORAL_OBSERVATIONS, FIXTURE_SOURCE_ARTIFACTS } from '@/fixtures/frontier/productionCorpus';
import { queryFilingsAsOf } from '@/domain/productionPipeline';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const asOf = searchParams.get('asOf');

  const asOfDate = asOf || new Date().toISOString();
  const syntheticFilings = queryFilingsAsOf(FIXTURE_BITEMPORAL_OBSERVATIONS, asOfDate);

  const filingsWithLineageLinks = syntheticFilings.map((filing) => ({
    ...filing,
    artifact_resolve_url: `/api/v1/evidence/artifacts/${encodeURIComponent(filing.sourceArtifactDigest)}`,
    artifact_raw_download_url: `/api/v1/evidence/artifacts/${encodeURIComponent(filing.sourceArtifactDigest)}?raw=true`,
    trace_url: `/api/v1/evidence/trace/${filing.observationId}`,
  }));

  return json({
    schema: 'payload.frontier.insurability.filings.v1',
    asOfKnowledgeTime: asOfDate,
    count: syntheticFilings.length,
    records: {
      // Same rule as /api/v1/status: this process cannot see an admission
      // store, so it does not report a count from one. The array below is the
      // committed fixture, and the identifier says so — it used to be called
      // `admittedFilings` while being served, correctly, as `synthetic`.
      admitted: 'NOT_COUNTED',
      candidate: 'NOT_COUNTED',
      quarantined: 'NOT_COUNTED',
      not_counted_because: 'No admission store is reachable from this process. A zero here would be a claim about a store it cannot read.',
      synthetic: syntheticFilings.length,
    },
    doctrine: {
      role: 'INSURABILITY_CHANGE_FEED_PROVIDER',
      sourceArchive: 'Public State Insurance Department SERFF Filings & Regulatory Orders (CDI, FL OIR, TDI)',
      boundary: 'Evidence substrate of insurance availability changes; does not write insurance policies or provide actuarial pricing.',
      bitemporalGuarantee: 'Knowledge-time bounded query eliminates future lookahead bias.',
    },
    filings: filingsWithLineageLinks,
    sourceArtifactDigests: FIXTURE_SOURCE_ARTIFACTS.map((a) => a.artifactDigest),
  });
}

