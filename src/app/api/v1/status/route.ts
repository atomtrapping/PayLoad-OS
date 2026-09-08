import {
  json,
  SYSTEM_DATA_CLASS,
  SYSTEM_CORPUS_RELEASE,
  SYSTEM_PARAMETER_SET_VERSION,
} from '../_lib';
import {
  FIXTURE_BITEMPORAL_OBSERVATIONS,
  FIXTURE_SOURCE_ARTIFACTS,
  FIXTURE_EXTRACTION_RUNS,
} from '@/fixtures/frontier/productionCorpus';
import { getActiveParameterSet } from '@/domain/parameterRegistry';

/**
 * WHAT THIS RESPONSE READS, AND WHAT IT MERELY DECLARES.
 *
 * Three of its `records` counts were literal zeros sitting in the same object
 * literal as three computed array lengths, so a caller could not tell which
 * numbers were readings. This process has no admission store — the console at /
 * answers UNKNOWN for exactly that reason — and a confident zero about a store
 * you cannot reach is the worst thing a status page can say about itself.
 *
 * Seven of the eight rungs below carry a status word beginning with VERIFIED,
 * and not one of them verifies anything at request time: no compiler runs, no
 * route is probed, no curl chain executes. They are assertions about what CI
 * established, so they live under a key that says so, with the party that
 * asserted them named. The rung numbers and the detail text are unchanged; only
 * the claim about who checked them is.
 *
 * `runtime_security` is the same kind of thing. Nothing here inspects the
 * process, its listening socket or what stands in front of it, so those fields
 * are the operator's declaration of the intended deployment, marked as such.
 * The proxy topology it declares is also why src/coordination/http.ts refuses a
 * relayed request outright.
 */
export async function GET() {
  const activeParams = getActiveParameterSet();
  const anchorObservation = FIXTURE_BITEMPORAL_OBSERVATIONS[0];
  const anchorArtifact = FIXTURE_SOURCE_ARTIFACTS.find((artifact) => artifact.artifactDigest === anchorObservation.sourceArtifactDigest);

  return json({
    schema: 'payload.frontier.system-status.v1',
    timestamp: new Date().toISOString(),
    
    // Core Boundary & Honesty Assertion
    data_class: SYSTEM_DATA_CLASS,
    corpus_release: SYSTEM_CORPUS_RELEASE,
    parameter_set_version: SYSTEM_PARAMETER_SET_VERSION,
    parameter_set_digest: activeParams.parameterSetDigest,

    // Corpus Accounting. Every entry says where its number came from, because
    // the three that are not readings used to look exactly like the three that are.
    records: {
      admitted: 'NOT_COUNTED',
      candidate: 'NOT_COUNTED',
      quarantined: 'NOT_COUNTED',
      not_counted_because: 'This process is not connected to an admission store, so it cannot see how many rows are in one. That is not the same as there being none. GET / reports the same three readings as UNREADABLE for the same reason.',
      synthetic: FIXTURE_BITEMPORAL_OBSERVATIONS.length,
      artifacts_retained: FIXTURE_SOURCE_ARTIFACTS.length,
      extractions_registered: FIXTURE_EXTRACTION_RUNS.length,
      counted_from: 'synthetic, artifacts_retained and extractions_registered are lengths of the committed fixture arrays, read at request time.',
    },

    // The Verification Ladder, as declared. Nothing below is checked here.
    declared_verification_ladder: {
      asserted_by: 'CI and the committed test suite, not this response. No rung re-runs when this route is called.',
      current_rung: 3,
      current_rung_name: 'Substance begins (Hash -> Artifact -> Retained Bytes Traced)',
      status: 'VERIFIED_SUBSTANCE_TRACED',
      rungs: [
        {
          rung: 0,
          target: 'Compiles, lints',
          layer: 'Code shape',
          status: 'VERIFIED',
          detail: 'TypeScript strict compilation and ESLint zero-error validation passes cleanly.',
        },
        {
          rung: 1,
          target: 'Routes respond',
          layer: 'Serving layer',
          status: 'VERIFIED',
          detail: 'All API routes respond with HTTP 200/400 and strict JSON serialization.',
        },
        {
          rung: 2,
          target: 'Endpoints return data',
          layer: 'Response shape',
          status: 'VERIFIED',
          detail: 'Endpoints self-attest data_class: "synthetic" in headers and JSON envelopes to prevent synthetic demo misrepresentation.',
        },
        {
          rung: 3,
          target: 'One result traces hash -> artifact -> retained bytes',
          layer: 'Substance begins',
          status: 'VERIFIED',
          detail: 'Lineage chain verified: curl /api/v1/insurability/filings -> extract artifact hash -> resolve to retained original bytes -> extraction run connecting them with byte-level SHA-256 match.',
        },
        {
          rung: 4,
          target: 'Full cycle: capture -> extract -> admit -> serve, provenance intact',
          layer: 'Substance',
          status: 'VERIFIED_ON_SUPPLIED_BYTES',
          detail: 'The cycle exists and runs at /api/v1/insurability/harvester and /harvester: bytes are captured under a digest computed at capture, extracted under a declared per-jurisdiction header grammar (FL OIR / CA CDI / TX TDI), built into candidates under a knowledge horizon, ruled on by the admission gate, and served bounded by knowledge time. Candidates reach ADMITTED because a regulator names an issued NAIC code and declares its own effective date. What stays out of scope is collection: capture begins at bytes the operator supplies, this repository has no path to a regulator, and scheduled SERFF harvesting remains the operator\u2019s act under the operator\u2019s credentials.',
        },
        {
          rung: 5,
          target: 'Replay reproduces digests',
          layer: 'Verification',
          status: 'VERIFIED_ON_SPECIMENS',
          detail: 'Re-running the statutory pipeline over the same request reproduces the same admission receipt digest, and a test holds it. The limit is the corpus rather than the method: the specimens are four drafted documents, so this is determinism demonstrated, not determinism demonstrated at scale.',
        },
        {
          rung: 6,
          target: 'Florida/California backtest',
          layer: 'Validation',
          status: 'PENDING',
          detail: 'Counterfactual historical validation on real admitted regulatory filings.',
        },
      ],
    },

    // Lineage anchor, read off the fixture rather than typed beside it. The
    // digest used to be a hand-copied 64-hex literal in three places here, so a
    // changed fixture would have left this route pointing at bytes that no
    // longer existed while still looking correct.
    lineage_anchor: {
      endpoint: '/api/v1/insurability/filings',
      sample_observation_id: anchorObservation.observationId,
      sample_artifact_hash: anchorObservation.sourceArtifactDigest,
      artifact_retained: anchorArtifact !== undefined,
      artifact_resolve_url: `/api/v1/evidence/artifacts/${anchorObservation.sourceArtifactDigest}`,
      trace_url: `/api/v1/evidence/trace/${anchorObservation.observationId}`,
    },

    // Serving posture as DECLARED by the operator. Nothing here inspects the
    // process, its listening socket, or what sits in front of it.
    declared_runtime_posture: {
      observed_by: 'NOTHING. These are the operator\'s statements of intent, not readings taken by this handler.',
      serving_environment: 'development_sandbox',
      proxy_topology: 'nginx -> next dev (port 3000)',
      interface_binding: '0.0.0.0',
      confidentiality_guarantee: 'EPHEMERAL_IN_MEMORY_ZERO_PERSISTENCE',
      operational_requirement: 'Portfolio stress queries execute purely in-memory. Before production onboarding of real lender loan books, containerized serving (next start), secret manager credentials, and TLS mutual auth must be activated.',
    },
  });
}
