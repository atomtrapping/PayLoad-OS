/**
 * What a customer actually buys.
 *
 * They arrive with a sentence — "we're evaluating alternative polypropylene
 * suppliers in Mexico and the U.S. Gulf Coast" — and they should leave with an
 * evidence-backed answer. Everything between those two facts is the firm's
 * problem, and this module is the contract for handling it without the customer
 * having to learn what a canonical state is.
 *
 * THE QUESTION IS DECOMPOSED, NOT ANSWERED
 *
 * One sentence becomes nine facets: who the suppliers are, what facilities they
 * operate, whether the material is compatible, what capacity the evidence
 * supports, how it would move, what it would land at, what it depends on, what
 * could go wrong, and what else could be done instead. Each facet is a separate
 * question against the substrate with its own coverage and its own gaps — which
 * is why a dossier can be honest about being strong on three of them and thin
 * on two, where a single narrative answer cannot.
 *
 * THREE STATUSES THAT MUST NEVER COLLAPSE
 *
 * A discovered candidate is a name the corpus surfaced. An evidence-supported
 * candidate is one the evidence actually stands behind. A customer-approved
 * option is one that particular customer has qualified for that particular
 * application.
 *
 * The third is the dangerous one, because approval is the most valuable
 * information in the dossier and the most tempting to reuse. A supplier
 * approved by one customer for one application has not become a good supplier:
 * they have become a supplier that one buyer, with their own specification,
 * their own tolerance and their own commercial history, decided to work with.
 * Promoting that into a corpus-level property would be selling one customer's
 * qualification work to the next, and it would be wrong as well as dishonest —
 * the next customer's specification is different.
 *
 * THE QUOTE AND THE BUILD ARE TWO SNAPSHOTS
 *
 * A quotation estimates the work from the inventory at the time of asking. The
 * build may incorporate evidence acquired since. Both stay identifiable,
 * because a customer who is billed for one and delivered the other should be
 * able to see the difference — and because a material change in scope is an
 * amendment they agree to, never a quiet substitution.
 *
 * A MONITORED REFRESH IS A NEW RELEASE
 *
 * Not an edit. The previously delivered dossier stays inspectable, so a
 * customer who acted on last quarter's version can see what it said when they
 * acted. A corrected source identifies the conclusions it touched and triggers
 * review of them; it does not silently rewrite an answer someone has already
 * used.
 *
 * WHAT AN AGENT MAY NOT INVENT
 *
 * An agent may tailor the package. It may not invent a price, a coverage
 * percentage, or a verification promise — those come from an approved pricing
 * policy, because a quoted number is a commitment and an agent producing one
 * from context is committing the firm to something nobody decided.
 */
import { PROVENANCE_CHAIN, DELIVERABLE_FOOTER } from './firmIdentity';
import type { ClaimClass } from './discoveryLayer';

/* ── The question, decomposed ── */

export const DOSSIER_FACETS = [
  'SUPPLIER_IDENTITY',
  'FACILITIES',
  'MATERIAL_COMPATIBILITY',
  'CAPACITY_EVIDENCE',
  'ROUTES',
  'LANDED_COST',
  'DEPENDENCY',
  'RISK',
  'ALTERNATIVES',
] as const;
export type DossierFacet = typeof DOSSIER_FACETS[number];

export interface FacetContract {
  facet: DossierFacet;
  asks: string;
  /** What a thin answer here costs the decision. */
  ifThin: string;
}

export const FACET_CONTRACTS: readonly FacetContract[] = [
  { facet: 'SUPPLIER_IDENTITY', asks: 'Who are they, as canonical entities rather than as names on a website?', ifThin: 'Two records about one company read as two companies, and a concentration looks like a diversification.' },
  { facet: 'FACILITIES', asks: 'What do they actually operate, and where?', ifThin: 'A registered office is mistaken for a plant, and the corridor analysis is about the wrong place.' },
  { facet: 'MATERIAL_COMPATIBILITY', asks: 'Does what they make meet the specification?', ifThin: 'A shortlist of suppliers who cannot supply this.' },
  { facet: 'CAPACITY_EVIDENCE', asks: 'What volume does the evidence support, at what utilization?', ifThin: 'A capable supplier who is already committed elsewhere.' },
  { facet: 'ROUTES', asks: 'How would it move, through which corridors and gateways?', ifThin: 'A landed cost computed over a route nobody can book.' },
  { facet: 'LANDED_COST', asks: 'What would it cost delivered, with what left out?', ifThin: 'A unit price compared against a landed price, and the wrong supplier chosen.' },
  { facet: 'DEPENDENCY', asks: 'What do they depend on that the buyer would inherit?', ifThin: 'Three alternatives that share one upstream producer, which is one alternative.' },
  { facet: 'RISK', asks: 'What could interrupt it, and how would that be seen coming?', ifThin: 'A decision that is fine until it is not.' },
  { facet: 'ALTERNATIVES', asks: 'What else could be done, including doing nothing?', ifThin: 'A recommendation with no baseline, which cannot be judged.' },
];

export const DECOMPOSITION_RULE =
  'A customer’s sentence becomes nine facets, each a separate question with its own coverage and its own gaps. That is what lets a dossier say it is strong on three and thin on two, where one narrative answer cannot.';

/* ── Candidate standing ── */

export const CANDIDATE_STANDINGS = [
  'DISCOVERED', 'EVIDENCE_SUPPORTED', 'CUSTOMER_APPROVED',
] as const;
export type CandidateStanding = typeof CANDIDATE_STANDINGS[number];

export interface StandingContract {
  standing: CandidateStanding;
  means: string;
  /** Whose property this is. The last one is the whole point. */
  heldBy: 'CORPUS' | 'CUSTOMER';
  collapsing: string;
}

export const STANDING_CONTRACTS: readonly StandingContract[] = [
  {
    standing: 'DISCOVERED',
    means: 'A name the corpus surfaced. Nothing has been checked.',
    heldBy: 'CORPUS',
    collapsing: 'Presented as evidence-supported, a search result becomes a finding.',
  },
  {
    standing: 'EVIDENCE_SUPPORTED',
    means: 'The evidence stands behind the claim, at a stated coverage.',
    heldBy: 'CORPUS',
    collapsing: 'Presented as customer-approved, the firm’s finding becomes the buyer’s decision — which the buyer never made.',
  },
  {
    standing: 'CUSTOMER_APPROVED',
    means: 'This customer has qualified this supplier for this application.',
    heldBy: 'CUSTOMER',
    collapsing: 'Promoted to a corpus property, one customer’s qualification work is sold to the next — and the next customer’s specification is different, so it is wrong as well as dishonest.',
  },
];

/** The standings that belong to the corpus and may be reused across customers. */
export const REUSABLE_STANDINGS: readonly CandidateStanding[] =
  STANDING_CONTRACTS.filter((entry) => entry.heldBy === 'CORPUS').map((entry) => entry.standing);

export const APPROVAL_IS_NOT_A_SUPPLIER_PROPERTY =
  'Approval for one customer and one application never becomes a universal supplier property. It is the most valuable line in a dossier and the most tempting to reuse, and reusing it sells one buyer’s qualification work to the next against a different specification.';

/* ── The compile contract ── */

/** D_r = Compile(Spec, BuildSnapshot, DerivedResults, AudiencePolicy). */
export const COMPILE_INPUTS = ['Spec', 'BuildSnapshot', 'DerivedResults', 'AudiencePolicy'] as const;
export type CompileInput = typeof COMPILE_INPUTS[number];

export const COMPILE_INPUT_MEANING: Readonly<Record<CompileInput, string>> = {
  Spec: 'What was asked, decomposed into facets, with the scope agreed.',
  BuildSnapshot: 'The corpus as it stood when the dossier was built — not when it was quoted.',
  DerivedResults: 'What was computed for this dossier, each carrying its class.',
  AudiencePolicy: 'Who may see what. A dossier is a view, and the view is part of the product.',
};

export const DOSSIER_STAGES = [
  'SPEC', 'COVERAGE', 'QUOTATION', 'BUILD', 'RELEASE', 'MONITORING',
] as const;
export type DossierStage = typeof DOSSIER_STAGES[number];

/**
 * The two snapshots, and why both are kept.
 */
export const TWO_SNAPSHOTS_RULE =
  'The quotation snapshot and the build snapshot may differ, and both stay identifiable. A customer billed against one and delivered the other should be able to see the difference.';

export const AMENDMENT_RULE =
  'A material change of scope is an amendment the customer agrees to, or an exception somebody owns. It is never an unannounced change in what they receive.';

export const REFRESH_IS_A_RELEASE =
  'A monitored refresh is a new release rather than an edit. The previously delivered dossier stays inspectable, so a customer who acted on last quarter’s version can see what it said when they acted.';

export const CORRECTION_RULE =
  'A corrected source identifies the conclusions it touched and triggers review of them. It does not silently rewrite an answer somebody has already used.';

/* ── What an agent may not invent ── */

export const AGENT_MAY_TAILOR: readonly string[] = [
  'which facets are covered', 'the depth of each', 'the order of presentation', 'the level of technical detail',
];

export const AGENT_MAY_NOT_INVENT: readonly string[] = [
  'a price', 'a coverage percentage', 'a verification promise', 'a delivery date',
];

export const PRICING_POLICY_RULE =
  'A quoted number is a commitment. It comes from an approved pricing policy, because an agent producing one from context commits the firm to something nobody decided.';

/* ── What the deliverable carries ── */

/**
 * The polished result sits on top; the chain sits underneath. Reused from
 * `firmIdentity` rather than restated, because a second copy of the convention
 * would eventually disagree with the first.
 */
export const DELIVERABLE_CHAIN = PROVENANCE_CHAIN;
export const DELIVERABLE_IMPRINT = DELIVERABLE_FOOTER;

/**
 * A conclusion is served at the class it was computed at, exactly as a feed
 * payload is. A dossier is a serving surface and its polish does not exempt it.
 */
export const CONCLUSION_CLASS_RULE =
  'Every conclusion in a dossier is presented at the class it was computed at. A dossier is a serving surface and being well-written does not exempt it from the rule the feed obeys.';

export interface Conclusion {
  facet: DossierFacet;
  claimClass: ClaimClass;
  /** What the evidence did not cover. Never omitted, because omission reads as completeness. */
  notCovered: string;
}

export const COVERAGE_HOLE_RULE =
  'Every facet states what it did not cover. An omitted gap reads as completeness, and a customer cannot ask about a hole they cannot see.';

/* ── Standing ── */

export interface DossierSpec {
  dossierId: string;
  recipientId: string;
  facets: readonly DossierFacet[];
  stage: DossierStage;
}

/** None. Nothing has been asked, quoted, built or released. */
export const DOSSIER_SPECS: readonly DossierSpec[] = [];

export const DOSSIER_BLOCKED_ON: readonly string[] = [
  'No customer has asked a question.',
  'No pricing policy is approved, so nothing can be quoted.',
  'Admitted records are zero, so no facet has evidence behind it.',
];

export function dossierStanding(specs: readonly DossierSpec[] = DOSSIER_SPECS) {
  const at = (stage: DossierStage) => specs.filter((spec) => spec.stage === stage).length;
  return {
    specs: specs.length,
    released: at('RELEASE'),
    monitored: at('MONITORING'),
    recipients: new Set(specs.map((spec) => spec.recipientId)).size,
    facetsOffered: DOSSIER_FACETS.length,
    /* A facet nobody asked for is not covered; that is different from covered badly. */
    facetsRequested: new Set(specs.flatMap((spec) => spec.facets)).size,
    blockedOn: specs.length > 0 ? [] : [...DOSSIER_BLOCKED_ON],
    coverage: specs.length === 0 ? 'CONTRACT_ONLY_NOTHING_ASKED' : 'SPECS_PRESENT',
  } as const;
}
