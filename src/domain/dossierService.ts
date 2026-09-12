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
import { compareInstants } from './corpus';
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
  'SPEC', 'COVERAGE', 'ESTIMATE', 'QUOTATION', 'SCOPE', 'BUILD', 'RELEASE', 'DELIVERED', 'MONITORING',
] as const;
export type DossierStage = typeof DOSSIER_STAGES[number];

/* ── Coverage and the estimate ── */

/**
 * What the inventory holds for one facet, at the time of asking. Three
 * levels, and NONE is a level rather than an absence: a facet with nothing
 * behind it still costs the work of saying so, and a customer is owed the
 * sentence.
 */
export const COVERAGE_LEVELS = ['NONE', 'THIN', 'SUPPORTED'] as const;
export type CoverageLevel = typeof COVERAGE_LEVELS[number];

export const COVERAGE_LEVEL_MEANING: Readonly<Record<CoverageLevel, string>> = {
  NONE: 'No usable artifact. Anything that bears on the facet is named with its assessment, and the dossier states the hole.',
  THIN: 'One usable artifact, or several from one run. The dossier states what it rests on and what it does not.',
  SUPPORTED: 'Two or more usable artifacts from more than one run.',
};

/**
 * The deterministic estimate: units of work per facet by coverage level, and
 * nothing else. The number is not a price — a price is a policy's unit rate
 * times these units, and the policy is approved by a person. What an agent
 * may compute is the units, because the units are a count over rows it can
 * name; what it may not invent is the rate.
 */
export const COVERAGE_LEVEL_UNITS: Readonly<Record<CoverageLevel, number>> = { NONE: 1, THIN: 2, SUPPORTED: 3 };

export const ESTIMATE_METHOD = 'notationsos.dossier.estimate.v1';

/**
 * The quantity level, over the artifacts the dossier may actually use. An
 * artifact that is disallowed, stale or contradicted is in the coverage and
 * not in this count: a facet with two artifacts the firm may not deliver is
 * a hole with two things in it.
 */
export function coverageLevel(usableArtifacts: number, runsAmongUsable: number): CoverageLevel {
  if (usableArtifacts === 0) return 'NONE';
  return usableArtifacts >= 2 && runsAmongUsable >= 2 ? 'SUPPORTED' : 'THIN';
}

/* ── Assessment: what the evidence is, as distinct from how much of it there is ── */

/**
 * The mandate's five: present, stale, conflicting, missing, disallowed. A
 * level says how much bears on a facet; an assessment says whether what
 * bears on it may be delivered, and if not, why. They are two columns
 * because a buyer needs both sentences — "two artifacts, neither of which we
 * may hand you" is different from "nothing", and a dossier that folded the
 * first into the second would be hiding the more useful fact.
 */
export const COVERAGE_ASSESSMENTS = ['PRESENT', 'STALE', 'CONFLICTING', 'MISSING', 'DISALLOWED'] as const;
export type CoverageAssessment = typeof COVERAGE_ASSESSMENTS[number];

export const COVERAGE_ASSESSMENT_MEANING: Readonly<Record<CoverageAssessment, string>> = {
  PRESENT: 'Evidence the dossier may deliver: carrying the right this release exercises, not refuted, not contradicted by other evidence on the facet, within its horizon, and computed over records the corpus still stands behind.',
  STALE: 'Evidence that was present and is not now: its horizon has passed, or a record it read has since been withdrawn by the corpus.',
  CONFLICTING: 'Evidence the corpus disagrees with: a record it read has since been corrected, another artifact on the facet says something else about the same subject, or the claim was checked and refuted.',
  MISSING: 'No artifact bears on this facet at all.',
  DISALLOWED: 'Evidence exists and the firm may not deliver it to this audience: its rights — the intersection of everything it read — do not carry the right this release exercises.',
};

/**
 * Which assessments count as usable. One. A stale, conflicting or disallowed
 * artifact is named in the coverage so the buyer can see it, and it holds
 * nothing up.
 */
export const USABLE_ASSESSMENTS: readonly CoverageAssessment[] = ['PRESENT'];

/** The right a dossier delivery exercises: an export to the customer audience. */
export const DELIVERY_RIGHT = 'customer_delivery';

/** One validation record: the outcome it left the artifact in, and when. */
export interface ValidationUnderAssessment { outcome: string; validatedAt: string }

export interface EvidenceUnderAssessment {
  artifactId: string;
  subject: string;
  claim: string;
  /**
   * Every validation record the artifact carries, each dated. The state at an
   * instant is the latest record at or before it, which is what the ledger
   * reads; the artifact's current state is not passed, because a later record
   * must not decide what an earlier assessment saw. Unvalidated is the empty
   * list, so an outcome without an instant cannot be expressed.
   */
  validations: readonly ValidationUnderAssessment[];
  horizonEndsAt: string | null;
  /** In the corpus's rights vocabulary. The discovery ledger refuses any other. */
  rights: readonly string[];
  inputRecordIds: readonly string[];
}

/** One record the corpus took back, with how. A record can carry both: corrected under one retraction, withdrawn under another. */
export interface TakenBackRecord { recordId: string; kind: 'CORRECTION' | 'WITHDRAWAL' }

export interface AssessmentContext {
  /** The instant the coverage was assessed at. Staleness and conflict are read as of it. */
  assessedAt: string;
  /** The right this dossier's delivery exercises. */
  requiredRight: string;
  /** What the corpus had taken back by `assessedAt`: a correction says something else; a withdrawal says nothing. */
  takenBack: readonly TakenBackRecord[];
  /** The other artifacts bearing on the same facet, so a disagreement about one subject is seen. */
  alongside: readonly Pick<EvidenceUnderAssessment, 'artifactId' | 'subject' | 'claim'>[];
}

/**
 * One artifact, one assessment, in an order that is the argument.
 *
 * Rights first: the firm's rights decide whether the buyer may receive this
 * artifact, and one they may not is named to them by identifier and
 * assessment only — the reason is on the evidence row and the operator's
 * receipt, not in the release. Conflict second: a corrected input, a
 * disagreeing neighbour on the facet, or a refuted claim is a fact about
 * the evidence the buyer must see. Stale third. Present is what is left,
 * and it is earned by passing the three, not assumed.
 *
 * `inputRecordIds` is every source record the artifact rests on, through
 * any derived artifacts it read; the ledger's guard follows the inputs down
 * the same way. A refutation is read as of the assessment instant, like a
 * retraction and a horizon: the validation standing then is the latest
 * record at or before it, one dated after it is not yet known, and a later
 * record that passed does not un-refute what stood at the instant.
 * Instants are compared as instants, not as spellings.
 */

/**
 * The validation standing at an instant: the latest record at or before it,
 * or none. The ledger's `dossier_expected_assessment` selects the same row
 * the same way, so the two answers cannot differ.
 */
export function standingValidation(
  validations: readonly ValidationUnderAssessment[],
  at: string,
): ValidationUnderAssessment | null {
  return validations.reduce<ValidationUnderAssessment | null>((latest, record) => {
    if (compareInstants(record.validatedAt, at) > 0) return latest;
    return latest === null || compareInstants(record.validatedAt, latest.validatedAt) > 0 ? record : latest;
  }, null);
}

export function assessEvidence(evidence: EvidenceUnderAssessment, context: AssessmentContext): { assessment: CoverageAssessment; because: string } {
  if (!evidence.rights.includes(context.requiredRight)) {
    return { assessment: 'DISALLOWED', because: `Its rights are ${evidence.rights.length ? evidence.rights.join(', ') : 'none'}; ${context.requiredRight} is not among them, and a dossier delivery exercises it.` };
  }
  const takenBackAs = (kind: TakenBackRecord['kind']) => [...new Set(context.takenBack.filter((t) => t.kind === kind).map((t) => t.recordId))];
  const corrected = evidence.inputRecordIds.filter((id) => takenBackAs('CORRECTION').includes(id));
  if (corrected.length > 0) {
    return { assessment: 'CONFLICTING', because: `It read ${corrected.join(', ')}, which the corpus has since corrected: the corpus now says something else about what it read.` };
  }
  const disagreeing = context.alongside.filter((other) => other.artifactId !== evidence.artifactId && other.subject === evidence.subject && other.claim !== evidence.claim);
  if (disagreeing.length > 0) {
    return { assessment: 'CONFLICTING', because: `${disagreeing.map((other) => other.artifactId).join(', ')} bears on the same facet and says something else about ${evidence.subject}.` };
  }
  const standing = standingValidation(evidence.validations, context.assessedAt);
  if (standing !== null && standing.outcome === 'FALSIFIED') {
    return { assessment: 'CONFLICTING', because: `The claim was checked against held-out or observed evidence and refuted at ${standing.validatedAt}.` };
  }
  if (evidence.horizonEndsAt !== null && compareInstants(evidence.horizonEndsAt, context.assessedAt) < 0) {
    return { assessment: 'STALE', because: `Its horizon ended at ${evidence.horizonEndsAt}, before ${context.assessedAt}.` };
  }
  const withdrawn = evidence.inputRecordIds.filter((id) => takenBackAs('WITHDRAWAL').includes(id));
  if (withdrawn.length > 0) {
    return { assessment: 'STALE', because: `It read ${withdrawn.join(', ')}, which the corpus has since withdrawn.` };
  }
  return { assessment: 'PRESENT', because: `Carries ${context.requiredRight}; no input corrected or withdrawn by ${context.assessedAt}; no other artifact on the facet disagrees about ${evidence.subject}; not refuted; within its horizon.` };
}

export interface CoverageRollup {
  assessment: CoverageAssessment;
  present: number; stale: number; conflicting: number; disallowed: number;
}

/**
 * The facet's assessment from its artifacts', and the counts beside it.
 *
 * The headline is worst-first over what is not present — CONFLICTING, then
 * STALE, then DISALLOWED — and PRESENT only when everything is. A facet with
 * one present artifact and one the firm may not deliver reads DISALLOWED
 * with counts 1 and 1, and its level says something is deliverable; a
 * headline that read PRESENT would have hidden the artifact the buyer is
 * not being given.
 */
export function rollupAssessment(assessments: readonly CoverageAssessment[]): CoverageRollup {
  const count = (a: CoverageAssessment) => assessments.filter((entry) => entry === a).length;
  const counts = { present: count('PRESENT'), stale: count('STALE'), conflicting: count('CONFLICTING'), disallowed: count('DISALLOWED') };
  const assessment: CoverageAssessment = assessments.length === 0 ? 'MISSING'
    : counts.conflicting > 0 ? 'CONFLICTING'
    : counts.stale > 0 ? 'STALE'
    : counts.disallowed > 0 ? 'DISALLOWED'
    : 'PRESENT';
  return { assessment, ...counts };
}

export const ASSESSMENT_RULE =
  'Coverage distinguishes present, stale, conflicting, missing and disallowed evidence, per artifact and rolled up per facet with the counts beside the headline. Only present evidence holds a conclusion up; the rest is named by identifier and assessment so the buyer can see that something exists that they are not being given — never its claim, and never the internal reason. An assessment is a fact at its instant: the rows are written once, and a corpus that has moved since is a new assessment, not an edit.';

export function estimateUnits(coverage: ReadonlyArray<{ facet: DossierFacet; level: CoverageLevel }>): number {
  return coverage.reduce((total, entry) => total + COVERAGE_LEVEL_UNITS[entry.level], 0);
}

export const ESTIMATE_RULE =
  'The estimate is a count of units over named coverage rows, reproducible by anyone holding the rows. The quotation multiplies it by a rate from an approved pricing policy, and the multiplication is checked at the row. Neither number comes from context.';

/**
 * The two snapshots, and why both are kept.
 */
export const TWO_SNAPSHOTS_RULE =
  'The quotation snapshot and the build snapshot may differ, and both stay identifiable. A customer billed against one and delivered the other should be able to see the difference.';

export const AMENDMENT_RULE =
  'A material change of scope is an amendment the customer agrees to, or an exception somebody owns. It is never an unannounced change in what they receive.';

export const REASSESSMENT_RULE =
  'An assessment is a fact at its instant. A corpus that moves after the quote is assessed again — a new coverage row for the facet at a later instant, with its own evidence — and the earlier row stands. A release names, for every facet, the assessment it was built over, the latest at or before its build; a conclusion rests on present evidence in that row and no other; and a level that moved since the quote is a change of scope, which is an amendment the customer agrees to, never a substitution.';

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
