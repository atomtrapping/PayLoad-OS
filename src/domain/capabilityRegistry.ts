/**
 * What the substrate can do, as data.
 *
 * Payload OS is a data control and mining substrate, and NotationsOS is one
 * terminal over it. Other terminals should be able to plug in and operate the
 * same substrate, which means there has to be one answer, in one place, to
 * "what can be asked of this system" — an answer the control plane enforces
 * and the navigator draws, so the plug-in contract and the operator's map
 * cannot drift apart.
 *
 * READ, OPERATE, ADMIT — AND WHY THE DISTINCTION IS THE WHOLE THING
 *
 * `./terminalPlane.ts` answers "may this party, for this purpose, see this?"
 * That is the right question for a read and the wrong one for everything
 * else. Running a mining workload, assessing coverage, compiling a dossier,
 * writing a notation: these change state, spend something, or produce a record
 * that did not exist. A purpose does not authorize them. An authorization
 * does, and this repository already has the machinery — a proposal, a decision
 * packet, a human review, a digest-bound `execution_authorization`, revocation
 * (`src/db/executionLedger.ts`).
 *
 * So the plane treats the three kinds differently, and the registry is where a
 * capability says which it is:
 *
 *   READ    answered under a purpose, as now.
 *   OPERATE never executed on a terminal's say-so. The ask becomes a proposal
 *           naming the terminal as counterparty and carrying the side effects
 *           declared here, before anything changes.
 *   ADMIT   putting material into the corpus. The firm's own act, refused to
 *           any terminal that is not the firm's.
 *
 * DECLARED SIDE EFFECTS ARE DECLARED HERE, NOT AT THE CALL
 *
 * `operation_proposal.declared_side_effects` exists so a reviewer is told what
 * an act would change before it changes anything. A caller supplying that list
 * would be a caller describing its own act, which is the shape this system
 * refuses everywhere else. The capability declares it, the plane copies it
 * into the proposal, and a terminal cannot understate what it asked for.
 *
 * THE ESTATES ARE A PROPERTY OF THE CAPABILITY, NOT OF THE TOOL
 *
 * `./servingBoundary.ts` names four estates that leave the wall on no
 * transport: calibration internals, source-reliability models, the
 * disagreement layer, identity decision records. A capability that would
 * expose any of them says so here, and the plane refuses it to anyone outside
 * the firm whatever its kind and whatever purpose is declared. Coverage
 * assessment is the live example: deciding that one artifact CONFLICTS with
 * another is a disagreement-layer judgement, and it is marked accordingly.
 *
 * REACHABILITY IS RECORDED, NOT ASSUMED
 *
 * `reachableToday` says how a caller gets to a capability now, and for most of
 * them the honest answer is that they cannot. A registry that listed only what
 * is already plumbed would be a list of tools; this is meant to be the map of
 * the substrate, including the parts no terminal can operate yet, because that
 * map is what says where the work is.
 */
import type { ServedKind } from './terminalPlane';

/**
 * What invoking a capability does to the world.
 *
 * The line between READ and OPERATE is whether anything is different
 * afterwards, not whether the answer took work to produce. A comparison that
 * computes a number and keeps nothing is a READ; one that writes a derived
 * artifact with a lineage is an OPERATE, because the artifact outlives the
 * call and something later rests on it.
 */
export const CAPABILITY_KINDS = ['READ', 'OPERATE', 'ADMIT'] as const;
export type CapabilityKind = (typeof CAPABILITY_KINDS)[number];

export const CAPABILITY_KIND_MEANING: Record<CapabilityKind, string> = {
  READ: 'Returns what is already held. Nothing is different afterwards, so a declared purpose is the whole question.',
  OPERATE: 'Changes state, spends something, or produces a record that outlives the call. A purpose does not authorize it; a digest-bound authorization does.',
  ADMIT: 'Puts material into the corpus. The firm’s own act, and the one thing no outside terminal performs at any purpose.',
};

export interface Capability {
  id: string;
  title: string;
  kind: CapabilityKind;
  /** The area of the substrate it belongs to, for the navigator's grouping. */
  subsystem: string;
  /** The function, route or module a caller would reach, repo-relative. */
  entryPoint: string;
  /** How a caller reaches it today. "not reachable" is a common, honest answer. */
  reachableToday: string;
  /** What gates it now: env flags, loopback guards, constraints, or nothing. */
  gatedBy: string;
  /** For a READ, the kind of thing it hands back, which a purpose admits or does not. */
  serves?: ServedKind;
  /**
   * For an OPERATE or ADMIT, what it would change — copied into a proposal's
   * `declared_side_effects` so a reviewer reads it before anything changes.
   */
  sideEffects?: readonly string[];
  /** What the governance kernel requires before this may run. */
  authorityNeeded: string;
  /** Whether it would expose one of the four estates. */
  touchesEstates: boolean;
}

/**
 * The one rule a reader should meet before the list.
 */
export const CAPABILITY_RULE =
  'A capability says what it does to the world, what it would change, and whether it reaches an estate. A read is answered under a declared purpose; an operate is never executed on a terminal’s say-so but becomes a proposal carrying the side effects declared here; an admission is the firm’s own act. The plane enforces this registry and the navigator draws it, so what a terminal may ask and what an operator can see are one list.';

/* ── The corpus reads, which are the twelve tools on the surface today ── */

const corpusRead = (
  id: string,
  title: string,
  entryPoint: string,
  serves: ServedKind,
  reachableToday: string,
): Capability => ({
  id,
  title,
  kind: 'READ',
  subsystem: 'Corpus',
  entryPoint,
  reachableToday,
  gatedBy: 'The terminal plane: a session, a declared purpose that admits this served kind, and a corpus in the session’s scope. The rights guard and the projection shape the answer.',
  serves,
  authorityNeeded: 'None. A read is answered under a purpose.',
  touchesEstates: false,
});

export const CORPUS_CAPABILITIES: readonly Capability[] = [
  corpusRead('corpus.list-releases', 'List the release history of every corpus', 'src/adapter/feed.ts releasesPayload', 'RELEASE_METADATA', 'MCP tool list_releases; HTTP GET /api/v1/releases'),
  corpusRead('corpus.get-release', 'Read one release: build record, coverage, sources, certification, governance', 'src/adapter/feed.ts releasePayload', 'RELEASE_METADATA', 'MCP tool get_release; HTTP GET /api/v1/releases/[releaseId]'),
  corpusRead('corpus.get-release-manifest', 'Read the certified release manifest and its commitment', 'src/adapter/feed.ts releaseManifestPayload', 'MANIFEST', 'MCP tool get_release_manifest; HTTP GET /api/v1/releases/[releaseId]/manifest'),
  corpusRead('corpus.list-records', 'Read the deliverable records of a release, after the rights guard and the projection', 'src/adapter/feed.ts recordsPayload', 'RECORDS', 'MCP tool list_records; HTTP GET /api/v1/releases/[releaseId]/records'),
  corpusRead('corpus.query-as-of', 'Ask what was held at a valid time and a knowledge time, or be refused with a code', 'src/adapter/feed.ts asOfPayload', 'RECORDS', 'MCP tool query_as_of; HTTP GET /api/v1/releases/[releaseId]/as-of'),
  corpusRead('corpus.list-retractions', 'Read what the corpus has taken back since a cursor', 'src/adapter/feed.ts retractionsPayload', 'RELEASE_METADATA', 'MCP tool list_retractions; HTTP GET /api/v1/retractions'),
  corpusRead('corpus.get-ruling', 'Read one ruling under a projection', 'src/adapter/feed.ts rulingPayload', 'RULING', 'MCP tool get_ruling; HTTP GET /api/v1/rulings/[rulingId]'),
  corpusRead('corpus.get-ruling-manifest', 'Read a ruling manifest and its commitment', 'src/adapter/feed.ts rulingManifestPayload', 'MANIFEST', 'MCP tool get_ruling_manifest; HTTP GET /api/v1/rulings/[rulingId]/manifest'),
  corpusRead('factoring.get-receipt', 'Read an underwriting receipt: fact, condition, provenance and validation status', 'src/fixtures/caravan/factoring.ts', 'RECEIPT', 'MCP tool get_factoring_receipt; HTTP GET /api/v1/factoring/receipts/[receiptId]'),
  corpusRead('factoring.verify-receipt', 'Verify a receipt’s attestation and invariant integrity', 'src/domain/factoring.ts verifyFactoringReceiptIntegrity', 'RECEIPT', 'MCP tool verify_factoring_receipt; HTTP POST /api/v1/factoring/verify'),
  corpusRead('dispatch.get-event', 'Read one streamed dispatch decision with the carrier state at its cutoff', 'src/fixtures/caravan/dispatchLiability.ts', 'RECORDS', 'MCP tool get_dispatch_event; HTTP GET /api/v1/dispatch-liability/events/[eventId]'),
  corpusRead('dispatch.replay-liability', 'Reconstruct what the automated dispatch knew at the knowledge cutoff', 'src/fixtures/caravan/dispatchLiability.ts DEFENSE_RECONSTRUCTION_CASE_0803', 'RECORDS', 'MCP tool replay_dispatch_liability; HTTP POST /api/v1/dispatch-liability/replay'),
];

/**
 * Which capability each tool on the surface reaches.
 *
 * The tools are one way in, not the substrate. Mapping them onto capabilities
 * rather than giving them their own classification means a tool cannot serve
 * something the registry has not described, and `./terminalPlane.ts` derives
 * what a tool serves from the capability rather than from a second table that
 * would drift from this one.
 */
export const TOOL_CAPABILITY: Record<string, string> = {
  list_releases: 'corpus.list-releases',
  get_release: 'corpus.get-release',
  get_release_manifest: 'corpus.get-release-manifest',
  list_records: 'corpus.list-records',
  query_as_of: 'corpus.query-as-of',
  list_retractions: 'corpus.list-retractions',
  get_ruling: 'corpus.get-ruling',
  get_ruling_manifest: 'corpus.get-ruling-manifest',
  get_factoring_receipt: 'factoring.get-receipt',
  verify_factoring_receipt: 'factoring.verify-receipt',
  get_dispatch_event: 'dispatch.get-event',
  replay_dispatch_liability: 'dispatch.replay-liability',
};

/** Every capability the substrate declares. */
export const CAPABILITIES: readonly Capability[] = [...CORPUS_CAPABILITIES];

export function capabilityById(id: string): Capability | undefined {
  return CAPABILITIES.find((capability) => capability.id === id);
}

export function capabilityOfTool(toolName: string): Capability | undefined {
  const id = TOOL_CAPABILITY[toolName];
  return id === undefined ? undefined : capabilityById(id);
}
