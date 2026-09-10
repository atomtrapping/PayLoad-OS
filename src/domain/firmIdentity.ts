/**
 * Two names, one firm, and the reason they are not competing.
 *
 * Hedgerow, Tradewind, Payload, Landshark and Notation have all at various
 * points been candidates for the thing on the front of the building. That is a
 * symptom rather than a branding problem: the firm does two separable things,
 * and a single name has to misdescribe one of them.
 *
 * It produces information, and it delivers information. Those are different
 * activities with different audiences, different vocabularies and different
 * honest claims. So:
 *
 *   Notation Systems  = information production
 *   Dossier Services  = information delivery
 *
 * The customer experiences Dossier Services. The machinery doing it is Notation
 * Systems. A customer never has to understand canonical state, provenance
 * graphs, spatial indexes, lineage or the mining architecture — they ask a
 * question in their own words and receive an evidence-backed answer. That is
 * not a simplification of the architecture for marketing purposes; it is what
 * the architecture is for.
 *
 * TWO SPINES, BECAUSE TWO AUDIENCES
 *
 * notation.systems is institutional and technical, and it is read by someone
 * deciding whether the machinery is trustworthy: company, methodology,
 * infrastructure, provenance, products, APIs, research, contact.
 *
 * dossier.services is customer-oriented, and it is read by someone with a
 * decision to make this quarter: problem, request, scope, evidence, analysis,
 * deliverable, monitoring, follow-up.
 *
 * The second spine never mentions the first spine's nouns. If it has to, the
 * delivery layer has not done its job.
 *
 * THE PROVENANCE CONVENTION IS WHERE THE TWO REINFORCE EACH OTHER
 *
 * Every deliverable ends the same way, and underneath the polished result runs
 * the chain that makes the polish answerable: claim, evidence, observation,
 * computation, version, provenance. Dossier communicates assembled intelligence
 * about a particular problem; Notation communicates the machinery underneath
 * it. A dossier without the chain is a consultancy deck. The chain without the
 * dossier is a database nobody bought.
 *
 * WHAT THIS MODULE DELIBERATELY DOES NOT DO
 *
 * It does not add a fourth product line. Caravan, Tradewind and Landshark stay
 * exactly what `src/domain/domains.ts` says they are, and Dossier Services is
 * not a competitor to them — it is how their output reaches a buyer. Nor does
 * it rename the terminal: `src/domain/firmControlPlane.ts` already separates
 * PayloadOS, the Payload Control Plane and the Payload Terminal, and those
 * three separations still hold underneath this one.
 */
import { PRODUCT_ROOT } from './domains';

/* ── The duality ── */

export const IDENTITIES = ['Notation Systems', 'Dossier Services'] as const;
export type FirmIdentity = typeof IDENTITIES[number];

export interface IdentityContract {
  identity: FirmIdentity;
  activity: 'INFORMATION_PRODUCTION' | 'INFORMATION_DELIVERY';
  domain: string;
  register: string;
  /** Who is reading, and what they are deciding. */
  audience: string;
  /** The site spine, in order. */
  spine: readonly string[];
  /** What collapsing the two would cost. */
  collapsing: string;
}

export const IDENTITY_CONTRACTS: readonly IdentityContract[] = [
  {
    identity: 'Notation Systems',
    activity: 'INFORMATION_PRODUCTION',
    domain: 'notation.systems',
    register: 'Institutional and technical.',
    audience: 'Someone deciding whether the machinery is trustworthy enough to rely on.',
    spine: ['company', 'methodology', 'infrastructure', 'provenance', 'products', 'APIs', 'research', 'careers and contact'],
    collapsing: 'Collapsed into the delivery name, the production discipline becomes an implementation detail nobody can audit — and the thing that makes the output worth more than a consultancy deck is exactly that discipline.',
  },
  {
    identity: 'Dossier Services',
    activity: 'INFORMATION_DELIVERY',
    domain: 'dossier.services',
    register: 'Customer-oriented, and aggressively so.',
    audience: 'Someone with a decision to make this quarter who does not care how it is made.',
    spine: ['problem', 'request', 'scope', 'evidence', 'analysis', 'deliverable', 'monitoring', 'follow-up'],
    collapsing: 'Collapsed into the production name, every customer conversation starts with an architecture lesson. A buyer asked to understand canonical state before receiving an answer has been handed the firm’s problem.',
  },
];

export function identityContract(identity: FirmIdentity): IdentityContract {
  const found = IDENTITY_CONTRACTS.find((entry) => entry.identity === identity);
  if (!found) throw new Error(`FIRM_UNKNOWN_IDENTITY:${identity}`);
  return found;
}

/** Stated once, because it is what the two names are for. */
export const DUALITY_RULE =
  'Notation Systems produces information; Dossier Services delivers it. The customer experiences Dossier Services and the machinery doing it is Notation Systems. Neither name is a synonym for the other and neither is a product line.';

/**
 * The sentence the delivery layer exists to make true.
 *
 * It is a test of the architecture rather than a promise about the copy: if a
 * customer has to learn any of these nouns to get an answer, the delivery layer
 * has leaked and the leak is a defect.
 */
export const CUSTOMER_NEED_NOT_KNOW: readonly string[] = [
  'PayloadOS', 'canonical state', 'GraphRAG', 'PostGIS', 'lineage', 'the mining architecture',
];

export const CUSTOMER_ENTRY =
  'A customer asks what they actually want to know, in their own words, and receives an evidence-backed dossier. Everything above is the firm’s problem, not theirs.';

/* ── Component roles ── */

export interface ComponentRole {
  component: string;
  role: string;
  /** Whether it is a name a customer ever sees. */
  customerFacing: boolean;
}

/**
 * Who does what, so that adding a capability does not add a brand.
 *
 * The agents row is the one most often got wrong elsewhere: agents are bounded
 * operators working through these contracts, not independent authorities and
 * not a product.
 */
export const COMPONENT_ROLES: readonly ComponentRole[] = [
  { component: 'Notation Systems', role: 'The firm, and the information producer.', customerFacing: true },
  { component: 'Dossier Services', role: 'Curation, compilation, quotation, release and monitoring.', customerFacing: true },
  { component: 'PayloadOS', role: 'Shared evidence, identity, state, computation, policy and verification substrate.', customerFacing: false },
  { component: 'Landshark', role: 'Land, ownership, use, development and spatial constraints.', customerFacing: true },
  { component: 'Caravan', role: 'Physical movement, supply networks, logistics and network constraints.', customerFacing: true },
  { component: 'Tradewind', role: 'Aggregate physical-economic analysis, market research and candidate signals.', customerFacing: true },
  { component: PRODUCT_ROOT.terminal, role: 'The internal terminal the firm operates the backend from. Not sold.', customerFacing: false },
  { component: 'Agents', role: 'Bounded operators working through these contracts. Not independent authorities, and not a product.', customerFacing: false },
];

export const NO_NEW_BRANDS_RULE =
  'A new capability is a new role in this table, never a new name on the door. Landshark, Caravan and Tradewind are the product lines; Dossier Services is how their output reaches a buyer; everything else is machinery with an internal name.';

/* ── The provenance convention ── */

export const DELIVERABLE_FOOTER = [
  'Prepared by Dossier Services',
  'A Notation Systems information product',
] as const;

/**
 * What runs underneath the polished result. Each step answers the question the
 * step above it invites, and a deliverable that stops early is asking to be
 * believed rather than checked.
 */
export const PROVENANCE_CHAIN = [
  'claim', 'evidence', 'observation', 'computation', 'version', 'provenance',
] as const;

export const PROVENANCE_CONVENTION_RULE =
  'Every deliverable carries the footer and, beneath the polished result, the chain from claim to provenance. A dossier without the chain is a consultancy deck; the chain without the dossier is a database nobody bought.';

/* ── Service modes ── */

/**
 * Three ways to buy the same thing, so that "we also monitor it" does not
 * become a second product with a second name.
 */
export interface ServiceMode {
  mode: string;
  is: string;
  /** What the customer is actually paying for, which differs in each. */
  buys: string;
}

export const SERVICE_MODES: readonly ServiceMode[] = [
  { mode: 'One-time release', is: 'A dossier compiled against a question, released once.', buys: 'An answer at a moment, with the evidence behind it.' },
  { mode: 'Maintained dossier', is: 'The same dossier kept current, each refresh a new release.', buys: 'Not having to reconstruct the decision context next quarter.' },
  { mode: 'Authorized workflow support', is: 'Separately authorized help acting on what the dossier found.', buys: 'Bounded execution, under authority that stays with the customer.' },
];

/**
 * The second mode is the one that compounds, and the reason is worth stating:
 * the expensive part of a decision is usually reassembling its context, not
 * making it.
 */
export const MAINTAINED_VALUE =
  'Maintaining a customer’s decision context and operational history so they do not have to reconstruct it repeatedly is a distinct source of value from compiling the answer the first time.';

/**
 * And the correction nobody expects: more options is not the deliverable.
 */
export const NOT_MORE_OPTIONS =
  'The customer value is not always more options. Sometimes the useful result is ruling out a plausible but infeasible one, and a shortlist that got shorter is a finding rather than a failure.';

/* ── Economics ── */

/**
 * Contribution per dossier, with everything that is not incremental left out
 * of it on purpose.
 */
export function contribution(realizedPrice: number, incrementalFulfillmentCost: number): number {
  return realizedPrice - incrementalFulfillmentCost;
}

/**
 * What must be accounted for separately before the firm claims profitability.
 * A positive contribution per dossier is a fact about a dossier, not about a
 * business.
 */
export const ACCOUNTED_SEPARATELY: readonly string[] = [
  'fixed infrastructure', 'general research', 'customer acquisition',
];

export const REUSE_RULE =
  'Corpus reuse improves contribution when freshness, rights and question overlap permit it. It is not an unconditional acquire-once-forever law, and a corpus that cannot lawfully be reused for the next question has not reduced the cost of answering it.';

/* ── Feedback ── */

/**
 * Four channels that look like one and are not.
 *
 * Keeping them apart is what stops the commercial loop from contaminating the
 * evidence system: a firm that treats revenue as confirmation of its world
 * model will keep the model that sells.
 */
export interface FeedbackChannel {
  channel: string;
  tests: string;
  /** The inference it does not support, stated because it is the tempting one. */
  doesNotEstablish: string;
}

export const FEEDBACK_CHANNELS: readonly FeedbackChannel[] = [
  {
    channel: 'Evidence corrections',
    tests: 'The record.',
    doesNotEstablish: 'That the model reading the record was right.',
  },
  {
    channel: 'Independent observations',
    tests: 'The models.',
    doesNotEstablish: 'That the workflow around the model works.',
  },
  {
    channel: 'Execution receipts',
    tests: 'Workflow reliability.',
    doesNotEstablish: 'That the decision the workflow executed was correct.',
  },
  {
    channel: 'Purchases and renewals',
    tests: 'Packaging and demand.',
    doesNotEstablish: 'A sale does not validate the underlying physical model. A profitable trade does not prove a durable signal. No response to outreach does not prove absence of customer need.',
  },
];

export const FEEDBACK_SEPARATION_RULE =
  'Each channel tests one thing and is not evidence for the others. A firm that reads revenue as confirmation of its world model will keep the model that sells.';

/* ── Standing ── */

export const IDENTITY_BLOCKED_ON: readonly string[] = [
  'No dossier has been specified, quoted, built or released.',
  'No customer holds a maintained dossier.',
  'Admitted records are zero, so nothing has been compiled from them.',
];

export interface DossierRelease {
  releaseId: string;
  mode: string;
  monitored: boolean;
}

/** None. Nothing has been delivered, because nothing has been admitted. */
export const DOSSIER_RELEASES: readonly DossierRelease[] = [];

export function identityStanding(releases: readonly DossierRelease[] = DOSSIER_RELEASES) {
  return {
    identities: IDENTITIES.length,
    releases: releases.length,
    monitored: releases.filter((entry) => entry.monitored).length,
    modesOffered: SERVICE_MODES.length,
    modesExercised: new Set(releases.map((entry) => entry.mode)).size,
    customerFacingComponents: COMPONENT_ROLES.filter((entry) => entry.customerFacing).length,
    blockedOn: releases.length > 0 ? [] : [...IDENTITY_BLOCKED_ON],
    coverage: releases.length === 0 ? 'CONTRACT_ONLY_NOTHING_DELIVERED' : 'RELEASES_PRESENT',
  } as const;
}
