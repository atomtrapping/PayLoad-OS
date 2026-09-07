/**
 * The transport that can carry intent, and the rule that does not change.
 *
 * A key says who is calling. A tool call says who is calling and what for. That
 * difference is small in protocol terms and large in this architecture, because
 * the rights model here has always been per-purpose — a decision about an
 * operation, an audience and a use at an instant — and it has never had a
 * transport that could ask. Asserting a purpose in a contract and enforcing it
 * at the boundary are different things, and only the second is a control.
 *
 * The comparison is worth stating precisely rather than as a preference. A tool
 * surface prices probing, because reasoning over it is metered by the caller's
 * own economics; it narrows the schema, because it exposes intentions rather
 * than an addressing system; and it carries a receipt inside the frame where a
 * raw consumer would strip the metadata and keep the payload.
 *
 * And then the caveat, which is the part that matters: none of that touches
 * retention. A prober over an open surface has to keep asking to keep learning.
 * A caller whose context already holds a slice keeps it forever, and a
 * conversational frame invites the broad request that a faceted one would make
 * look odd. Transport does not answer that. Rights-scoping does, and the rule
 * is the same one this system has always had.
 *
 * Serve the corpus under a purpose. Serve the estates never.
 *
 * Nothing here identifies a caller, declares a purpose, or evaluates a right at
 * query time. The rights machinery exists and answers about a viewer class, not
 * about a party.
 */
import { PERMITTED_USES } from './corpus';
import { MCP_TOOLS } from '@/mcp/tools';

/* ── The two transports ── */

export interface TransportAxis {
  axis: 'PROBING_COST' | 'SCHEMA_EXPOSURE' | 'RECEIPT_TRAVEL' | 'INTENT' | 'RETENTION';
  question: string;
  openSurface: string;
  toolSurface: string;
  /** Which is stronger, and NEITHER where the axis does not separate them. */
  stronger: 'TOOL_SURFACE' | 'OPEN_SURFACE' | 'NEITHER';
}

export const TRANSPORT_AXES: readonly TransportAxis[] = [
  {
    axis: 'PROBING_COST',
    question: 'What does a hundred systematic queries cost the caller?',
    openSurface: 'Effectively nothing. Mapping coverage, join semantics and vocabulary is free once a key is held.',
    toolSurface: 'Marginal cost per query, metered by the caller’s own economics. Probing at scale becomes paying at scale, which disciplines exploration without forbidding it.',
    stronger: 'TOOL_SURFACE',
  },
  {
    axis: 'SCHEMA_EXPOSURE',
    question: 'What does the caller learn about how the corpus is addressed?',
    openSurface: 'The addressing system. Fields, facets and joins are enumerable, so the shape of the corpus is legible from outside it.',
    toolSurface: 'Intentions. A tool returns an answer and its receipt; the query grammar stays behind the boundary, so the caller learns what the tools return rather than how the corpus is indexed.',
    stronger: 'TOOL_SURFACE',
  },
  {
    axis: 'RECEIPT_TRAVEL',
    question: 'Does the provenance stay attached to the answer?',
    openSurface: 'Rarely. A consumer strips the envelope and warehouses the payload, and the receipt becomes metadata somebody discarded.',
    toolSurface: 'The receipt rides inside the frame the reasoning happens in, so the provenance and the refusal are in front of the reader rather than beside the file.',
    stronger: 'TOOL_SURFACE',
  },
  {
    axis: 'INTENT',
    question: 'Can the boundary know what the answer is for?',
    openSurface: 'No. A key is an identity and a rate limit is a blunt instrument standing in for a purpose.',
    toolSurface: 'Yes, if the contract asks. A call can declare a purpose, and a declared purpose is the thing this system’s rights model has always been written against.',
    stronger: 'TOOL_SURFACE',
  },
  {
    axis: 'RETENTION',
    question: 'What stops a caller keeping what it received?',
    openSurface: 'Nothing, and a prober must keep asking to keep learning, which at least leaves a trail.',
    toolSurface: 'Nothing, and worse: a conversational frame invites a broad request that a faceted one would make look odd. One pull can be kept forever.',
    stronger: 'NEITHER',
  },
];

export const INTENT_IS_THE_UPGRADE = {
  claim: 'A tool call is the first transport here that can carry a purpose, which makes per-purpose admissibility executable at the boundary instead of asserted in a contract.',
  because: `The rights model already decides against a purpose: ${PERMITTED_USES.length} permitted uses, evaluated for an operation, an audience and an instant. It has never been asked at query time by a caller who declared one.`,
  notASubstitute: 'Declaring a purpose is not proof of one. It shifts the question from “can this be enforced at all” to “what happens when a declaration is false”, which is a rights and evidence question rather than a transport one.',
} as const;

/* ── The rule that transport does not change ── */

export const TWO_PART_RULE = {
  serve: 'The corpus, under a purpose: records, releases, manifests, as-of answers and refusals, shaped by what the caller may see for the use they declared.',
  neverServe: 'The estates. The corpus’s self-knowledge does not leave the wall on any transport.',
  estates: [
    'Calibration internals: what each source has been worth, and how that was fitted.',
    'Source-reliability models and the verdict history behind them.',
    'The structure of the disagreement layer: which sources conflict, how often, and where.',
    'Identity decision records: which identifiers were carried to one subject, on what evidence, by which method.',
  ],
  why: 'The corpus is the inventory and the estates are the business. A competitor who buys every record still cannot buy the accumulated judgement that made them usable, unless it is served to them.',
} as const;

export interface PurposeShape {
  purpose: string;
  shape: string;
  reason: string;
}

export const PURPOSE_SHAPING: readonly PurposeShape[] = [
  { purpose: 'Research', shape: 'Aggregates and their refusals, not the rows behind them.', reason: 'The question is about a population, and serving rows to answer it is serving more than the purpose needs.' },
  { purpose: 'Counterparty diligence', shape: 'Entity-level records with their evidence classes and both clocks.', reason: 'The question is about one party, and an aggregate cannot answer it honestly.' },
  { purpose: 'Model training', shape: 'Refused at the type level, not rate-limited.', reason: 'Training is not a use of an answer; it is a copy of the corpus into a form that no longer carries its receipts, and a refusal states that rather than pricing it.' },
];

/**
 * A caller is a source, and a source is metered, identified and recorded. This
 * is the event half of the response receipt named from the other side: the
 * fields a bill needs are the fields a rights decision needs.
 */
export const CALLER_IS_A_SOURCE = {
  claim: 'Every caller is a source in this system’s own sense: an identified party whose requests are recorded, whose behaviour is legible, and whose declared purposes accumulate a history like any other declarations.',
  soThen: 'Systematic probing leaves a pattern, and a pattern is evidence. That is not a defence against a first pull; it is what makes a second one answerable.',
  sharedWithBilling: 'A recipient identity, a request identifier and a served instant are the same three fields a traceable bill line needs. One set of fields, two purposes, and neither exists.',
} as const;

/* ── What exists ── */

export interface ServingStanding {
  tools: number;
  callersIdentified: number;
  purposesDeclarable: number;
  rightsEvaluatedPerCaller: boolean;
  statement: string;
}

/** Pure: the surface as it is, not as the argument would like it. */
export function servingStanding(): ServingStanding {
  return {
    tools: MCP_TOOLS.length,
    callersIdentified: 0,
    purposesDeclarable: 0,
    rightsEvaluatedPerCaller: false,
    statement: `${MCP_TOOLS.length} tools and an unauthenticated feed. Rights are evaluated against a declared viewer class rather than against a party, no caller is identified, no call declares a purpose, and nothing is metered — so the argument for this transport is an argument about what it could enforce, and none of it is enforced yet.`,
  };
}

/* ── Attesting the policy, which is not attesting the corpus ── */

/**
 * The inversion. The usual reason to reach for a proof system is trust
 * substitution: prove the computation, hide the inputs, believe the number.
 * ./computationCarrier refuses that for corpus computation and the refusal
 * stands. This is a different and much narrower thing, at a different boundary.
 *
 * The response pipeline — query, rights check, admissibility filter, response
 * shaping, receipt — is a deterministic computation over declared inputs: the
 * query, the licence, the corpus release and the policy version. A frozen
 * program over pinned inputs producing an attested output is exactly what a
 * proof guest is. So the thing to prove is not that a fact is true. It is that
 * the policy ran.
 *
 * What that buys is enforcement rather than credibility, which is why it does
 * not contradict the refusal: REFUSED becomes a demonstrated property instead
 * of an assertion, filtering becomes checkable without exposing the filter, and
 * a caller can be given an answer's provenance without its substance.
 */
export const POLICY_ATTESTATION = {
  inversion: 'Not “prove the computation so the number can be trusted”, but “prove the policy ran, and let the proof travel with the response”.',
  compatibleWithTheRefusal: 'General proving of corpus computation stays refused. This is at the response boundary, over a policy this system wrote, and it is enforcement rather than credibility — the boundary is still drawn by doctrine, and the proof only shows it was held.',
  buys: [
    { property: 'Verifiable refusal', what: 'REFUSED means the policy refused, and a caller can check that rather than take it on faith. For a buyer whose procurement question is about governance, the governance becomes checkable instead of described.' },
    { property: 'Demonstrable filtering', what: 'A caller verifies that some correct execution of the declared policy produced exactly this response from exactly this release, without seeing the policy internals or the corpus behind them.' },
    { property: 'Selective disclosure', what: 'Provenance served without substance: that a record exists in a release, is admitted, carries an evidence class and satisfies a predicate — proven, while the fields themselves stay behind the rights boundary. For a caller deciding whether to buy, verification without exposure is a better product than a sample.' },
  ],
  answers: 'The one-shot retention risk, partly: what a prospecting caller can pull is a proof about content rather than the content.',
  doesNotAnswer: 'Estate leakage. No cryptography fixes an architecture error, and the estates stay unserved because they are unserved, not because they are proven unserved.',
  state: 'ABSENT' as const,
} as const;

/**
 * What the inversion needs, and the reason it is reachable here rather than
 * being a wish: each precondition is something this system already had to build
 * for an unrelated reason.
 */
export const ATTESTATION_PRECONDITIONS = [
  { needs: 'A deterministic response computation', why: 'A proof over floating-point dispatch is not available; a proof over pinned, ordered, fixed-point arithmetic is natural. The archival discipline and the cryptographic layer turn out to have the same precondition.' },
  { needs: 'The policy as a versioned, digest-addressed artifact', why: 'A proof is about a program. A policy that lives in scattered code rather than as a pinned object is not a thing a proof can be about.' },
  { needs: 'Receipts as first-class objects', why: 'The proof slots into the receipt envelope as one more grade rather than as a parallel system: replayable here, replayable by anyone, attested.' },
] as const;

export const ATTESTATION_COSTS = [
  { cost: 'Proving is not free', detail: 'Guest execution and proof generation carry real latency and compute per response, which prices a tier rather than a default: plain receipts for the daily flow, proofs for settlement, audit and high-value verification. Expensive things are bought, not assumed.' },
  { cost: 'The guest is a new frame-validity surface', detail: 'A wrong guest proves the wrong policy perfectly. So the guest carries its own computation card, its version is pinned, and its digest is in the proof’s manifest — the same discipline the pinned engine already runs under.' },
  { cost: 'It enforces a boundary it does not draw', detail: 'Probing is narrowed and not stopped, and the estates are safe because they are never served. Doctrine draws the line; the proof shows the line was held.' },
] as const;
