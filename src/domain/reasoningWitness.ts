/**
 * A reasoner over the corpus is the system's most powerful witness, and
 * witnesses do not testify on their own behalf.
 *
 * The pairing is genuinely complementary, which is why it is worth stating
 * rather than assuming. A language model over an unstructured corpus has no
 * epistemic structure: it cannot say which release an answer came from, cannot
 * distinguish a claim it read from a claim it composed, and cannot refuse. A
 * corpus without a reasoner has structure and no traversal: it can answer a
 * query and cannot follow a question through eight records and tell you what
 * they amount to. Each supplies what the other structurally lacks.
 *
 * What keeps the pairing safe is not restraint at the prompt. It is three rules
 * that are already this system's rules, applied to prose:
 *
 *   an explanation is a projection of the ledger, not a generation over it;
 *   a tier crossing in a sentence is an authored claim, not a summary;
 *   a reasoning output is a candidate, like every other extraction.
 *
 * The second is the one that is easy to miss and hardest to undo. "The vessel
 * arrived" is a different claim from "berth containment at 04:12, adjudicated
 * at confidence 0.6, superseded twice", and a sentence that promotes the second
 * into the first has crossed a waterline in prose where no ruling was made.
 *
 * This firm is not building agent infrastructure. The tools are how a reasoner
 * reaches the substrate; the substrate is the product, and its distinguishing
 * property is that it can testify.
 */
import { MCP_TOOLS } from '@/mcp/tools';

/* ── The pairing ── */

export const THE_PAIRING = {
  reasonerLacks: 'Epistemic structure. Without the corpus it cannot say which release an answer came from, cannot separate a claim it read from one it composed, and has no way to refuse.',
  corpusLacks: 'Traversal and narrative. It answers a query exactly and cannot follow a question through eight records and say what they amount to.',
  therefore: 'Each supplies what the other structurally lacks, which is why the pairing is worth having and why it needs rules rather than trust.',
  posture: 'The competitive race is to give agents more access, faster. This gives reasoners structure, accountability and the ability to refuse, which is a different product and a slower one.',
} as const;

/* ── The three rules ── */

export interface ReasoningRule {
  id: 'PROJECTION_NOT_GENERATION' | 'TIER_CROSSING_IS_A_CLAIM' | 'OUTPUTS_ARE_CANDIDATES';
  rule: string;
  /** The failure it prevents, stated concretely enough to recognise. */
  prevents: string;
  /** What enforcement would look like. */
  enforcement: string;
  /** Whether anything actually holds it. Stated rather than inferred from the prose. */
  enforced: boolean;
}

export const REASONING_RULES: readonly ReasoningRule[] = [
  {
    id: 'PROJECTION_NOT_GENERATION',
    rule: 'An explanation is a projection of the ledger, not a generation over it. Every sentence resolves to records, and a sentence that resolves to nothing is not an explanation.',
    prevents: 'Fluent narration that reads as a finding and cites nothing — the failure that makes a reasoner over a corpus worse than no reasoner at all, because it is more persuasive than the records it displaced.',
    enforcement: 'A citation to record identifiers on every claim, and a refusal where the corpus is silent. The tools return payloads and no surface requires a reasoner to bind a sentence to one.',
    enforced: false,
  },
  {
    id: 'TIER_CROSSING_IS_A_CLAIM',
    rule: 'Promoting a hedged, adjudicated or refused state into a plain assertion is an authored claim, not a summary, and it needs the same authority any other claim needs.',
    prevents: '“The vessel arrived” standing in for “berth containment at 04:12, at confidence 0.6, superseded twice”. The waterline is crossed in a sentence, where no ruling was made and none is visible.',
    enforcement: 'The vocabulary of the source state carried into the prose: a refusal stays a refusal, a candidate stays a candidate, an uncertainty keeps its bound.',
    enforced: false,
  },
  {
    id: 'OUTPUTS_ARE_CANDIDATES',
    rule: 'What a reasoner produces is a candidate observation with its method identity, its version and its inputs — the same shape a parser’s output takes, because it is the same kind of thing.',
    prevents: 'A reasoning output entering as a fact because it arrived in fluent prose rather than in a row. The extraction interface already says a model is an adapter; this says so for the model that writes sentences.',
    enforcement: 'A producer identity and a transform identity on the candidate. Records carry both fields already, and no reasoner has ever been either — a field that exists and is never populated enforces nothing.',
    enforced: false,
  },
];

/* ── What a reasoner may and may not do ── */

export const REASONER_MAY = [
  'Traverse: follow a question across records, releases and links, and say which it followed.',
  'Summarise with citations, where every sentence resolves to identifiers a reader can fetch.',
  'Propose a candidate, with its method and version, for admission to decide on.',
  'Ask for a projection, and receive whatever refusals that projection carries.',
] as const;

export const REASONER_MAY_NOT = [
  'Admit anything. Admission is a boundary and a reasoner is on the far side of it.',
  'Resolve an identity. That is a decision with evidence, made by a person, and a fluent argument for a merge is still not a merge.',
  'Assert beyond the release it was given, including by filling a gap with what is generally true of the world.',
  'Narrate a refusal as an absence. “No data” and “the corpus refuses, for this reason” are different answers, and only one of them is honest.',
] as const;

export const WITNESS_NOT_AUTHORITY = {
  statement: 'The reasoner is the most powerful witness in the system and has no authority in it.',
  because: 'It is the component best able to produce something that sounds like a finding, which is exactly why it is the component that must never be one.',
  sameWall: 'It is the wall that already keeps a solver from deciding an identity and an audit computation from becoming a corpus fact. One wall, a third occupant.',
} as const;

/* ── The reach, which is not the product ── */

export const REACH_NOT_INFRASTRUCTURE = {
  claim: 'The tool surface is how a reasoner reaches the substrate. It is not the product, and this firm is not building agent infrastructure.',
  why: 'An agent ecosystem competing on access will meet a liability wall, and the reasoning systems that survive it will be the ones whose substrate can testify. Testimony is the asset; reach is plumbing.',
  here: 'The tools are read-only by construction: they list and fetch releases, manifests, records, rulings and retractions, answer an as-of query, and replay or verify a retained run. None writes, and none could.',
} as const;

/* ── What exists ── */

export interface ReasoningStanding {
  tools: number;
  writingTools: number;
  candidatesFromReasoners: number;
  rulesEnforced: number;
  rulesTotal: number;
  statement: string;
}

/** Pure: the surface is read-only, and none of the three rules is enforced by anything. */
export function reasoningStanding(): ReasoningStanding {
  const enforced = REASONING_RULES.filter((r) => r.enforced).length;
  return {
    tools: MCP_TOOLS.length,
    writingTools: 0,
    candidatesFromReasoners: 0,
    rulesEnforced: enforced,
    rulesTotal: REASONING_RULES.length,
    statement: `${MCP_TOOLS.length} tools, none of which writes. No candidate has ever been proposed by a reasoner, and ${enforced} of ${REASONING_RULES.length} rules are enforced by anything — the surface is safe today because it is read-only, which is not the same as the rules being held.`,
  };
}
