/**
 * A newsroom over the same evidence, not a content machine beside it.
 *
 * The distinction that makes this worth doing: Dossier Services answers one
 * customer's question, and a newsroom identifies developments worth bringing to
 * an audience's attention. Both draw on the same permitted inventory, and
 * publication is already a controlled disclosure here — content, audience,
 * authorization, delivery and correction each have their own record.
 *
 * The proposition is not "our agent reads other accounts and rewrites their
 * posts". It is "the system identified a development, we checked it, we
 * investigated its significance, and we published the supported finding". The
 * software surfaces candidates and assembles evidence. It does not remove the
 * reporting — contacting the operator, obtaining clarification, reconciling
 * conflicting accounts, establishing whether a purported change happened at
 * all. The corpus is a reporting instrument; editorial judgment decides what
 * can responsibly be said.
 *
 * FOUR THINGS THAT MUST NOT COLLAPSE
 *
 * Reporting is not advertising is not an investment recommendation is not
 * trading execution. They look similar from outside — a paragraph about a
 * company — and they carry entirely different obligations. A firm that
 * publishes and also holds positions has to keep them apart structurally,
 * because the moment they blur, every piece of reporting becomes readable as
 * an attempt to move something.
 *
 * THE LOOP THAT WOULD CONFIRM THE FIRM'S OWN CLAIMS
 *
 * This is the constraint the plane exists for, and it is easy to miss.
 *
 * The system observes public information and publishes into the same
 * environment it observes. So: the firm publishes a finding. Another account
 * repeats it. The acquisition layer sees a second source saying the same thing
 * and admits it. The corpus now holds two independent-looking sources for a
 * claim it invented, the concentration measure improves, and the finding gets
 * more confident every time it is quoted.
 *
 * Nothing about that is deliberate and every step of it is reasonable. So a
 * repetition retains its ancestry: an observation that traces back to a firm
 * publication cannot corroborate the artifact that publication came from. The
 * circle is broken at the row rather than at the reviewer.
 *
 * AUDIENCE RESPONSE IS NOT EVIDENCE
 *
 * Views, replies and inquiries measure distribution and demand. They do not
 * validate a capacity estimate or a causal claim, and a newsroom attached to a
 * corpus is exactly where that confusion would be most convenient.
 *
 * X IS A CHANNEL, NOT THE ARCHIVE
 *
 * The durable article, its methodology, its attribution, its disclosures and
 * its corrections live somewhere the firm controls. A platform distributes a
 * channel-appropriate version of something that already exists. A post with no
 * article behind it is a claim with no address.
 */
import type { ClaimClass } from './discoveryLayer';

/* ── Four classes ── */

export const PUBLICATION_CLASSES = [
  'REPORTING', 'ADVERTISING', 'INVESTMENT_RECOMMENDATION', 'TRADING_EXECUTION',
] as const;
export type PublicationClass = typeof PUBLICATION_CLASSES[number];

export interface PublicationContract {
  publicationClass: PublicationClass;
  is: string;
  /** Whether the newsroom may produce it at all. */
  newsroomMayProduce: boolean;
  /** What collapsing it into its neighbour would produce. */
  collapsing: string;
}

export const PUBLICATION_CONTRACTS: readonly PublicationContract[] = [
  {
    publicationClass: 'REPORTING',
    is: 'A supported finding about what changed and why it might matter.',
    newsroomMayProduce: true,
    collapsing: 'Read as advertising, reporting loses the only thing that makes it worth reading. Read as a recommendation, it acquires an obligation nobody accepted.',
  },
  {
    publicationClass: 'ADVERTISING',
    is: 'Material the firm is paid to place, or places to sell something.',
    newsroomMayProduce: false,
    collapsing: 'Unlabelled, it is reporting the reader cannot discount. The label is the whole difference.',
  },
  {
    publicationClass: 'INVESTMENT_RECOMMENDATION',
    is: 'Advice to buy, sell or hold, which is a regulated act rather than a strong opinion.',
    newsroomMayProduce: false,
    collapsing: 'Presented as reporting, it evades the review a recommendation requires — and reporting on a factory is not a recommendation about its owner’s securities.',
  },
  {
    publicationClass: 'TRADING_EXECUTION',
    is: 'The firm actually transacting.',
    newsroomMayProduce: false,
    collapsing: 'Beside publication with no separation, every article becomes readable as an attempt to move something.',
  },
];

export function publicationContract(cls: PublicationClass): PublicationContract {
  const found = PUBLICATION_CONTRACTS.find((entry) => entry.publicationClass === cls);
  if (!found) throw new Error(`EDITORIAL_UNKNOWN_CLASS:${cls}`);
  return found;
}

/** The only class a newsroom produces. */
export const NEWSROOM_CLASSES: readonly PublicationClass[] =
  PUBLICATION_CONTRACTS.filter((entry) => entry.newsroomMayProduce).map((entry) => entry.publicationClass);

export const FOUR_CLASSES_RULE =
  'Reporting is not advertising is not an investment recommendation is not trading execution. They look alike from outside and carry entirely different obligations, and a firm that both publishes and holds positions keeps them apart structurally or not at all.';

/* ── The workflow ── */

export const EDITORIAL_STAGES = [
  'FINDING',
  'STORY_CANDIDATE',
  'EVIDENCE_PACKET',
  'DRAFT',
  'REVIEW',
  'DECISION',
  'RELEASE',
  'DISTRIBUTION',
  'CORRECTION_WATCH',
] as const;
export type EditorialStage = typeof EDITORIAL_STAGES[number];

/** What review actually covers. Four questions, not one. */
export const REVIEW_DIMENSIONS = ['EDITORIAL', 'RIGHTS', 'PRIVACY', 'CONFLICT'] as const;
export type ReviewDimension = typeof REVIEW_DIMENSIONS[number];

export const REVIEW_DIMENSION_ASKS: Readonly<Record<ReviewDimension, string>> = {
  EDITORIAL: 'Is the claim supported, and does the wording match the support?',
  RIGHTS: 'May this evidence be published at all, at this audience?',
  PRIVACY: 'Does this identify someone it should not, or aggregate to the same effect?',
  CONFLICT: 'What does the firm hold, and who benefits if this is believed?',
};

/**
 * What the review packet contains. The agent prepares it; a person decides.
 * The third item is the one that keeps the packet honest.
 */
export const REVIEW_PACKET: readonly string[] = [
  'the proposed claim',
  'supporting evidence',
  'conflicting evidence',
  'the difference between what was observed and what was inferred',
  'publication rights',
  'intended audience',
  'the exact proposed text and visuals',
];

export const REVIEW_BINDS_RULE =
  'An approval binds to the release it reviewed. A rewritten headline or a changed chart needs review again when it materially changes the message — an approval is of a message, not of a topic.';

export const AGENT_PREPARES_RULE =
  'The new responsibility is editorial review, not another agent with publishing credentials. An agent assembles the packet and drafts the text; it does not decide that something is fit to say.';

/* ── The loop that must not close ── */

/**
 * Stated once, because it is the whole reason this plane needs constraints
 * rather than a policy document.
 */
export const SELF_CITATION_RULE =
  'An observation that traces back to a firm publication cannot corroborate the finding that publication came from. If another account repeats a Notation finding, the repetition keeps its ancestry — otherwise the corpus gradually confirms its own claims through their circulation, and every step of that is reasonable.';

export const CIRCULATION_IS_NOT_CORROBORATION =
  'Being repeated is not being confirmed. A finding quoted by five accounts has one source, and a system that counts five has learned the wrong thing about its own confidence.';

/** What a repetition must retain to stay distinguishable from an independent source. */
export const ANCESTRY_FIELDS: readonly string[] = [
  'the publication it repeats', 'the finding behind that publication', 'whether the repeater cites it',
];

/* ── Audience feedback ── */

export const AUDIENCE_SIGNALS = ['VIEWS', 'REPLIES', 'INQUIRIES', 'SUBSCRIPTIONS'] as const;

export const AUDIENCE_RULE =
  'Audience response measures distribution and demand. It does not validate a capacity estimate or a causal claim, and a newsroom attached to a corpus is exactly where that confusion would be most convenient.';

/* ── Public and paid ── */

/**
 * What may differ between a public article and a paid dossier — and what may
 * not. The absence at the end is the important half.
 */
export const OFFERING_DIFFERENCES: readonly string[] = [
  'depth', 'customization', 'permitted private context', 'service',
];

export const SAME_EVIDENCE_STANDARD_RULE =
  'The paid distinction is depth, customization, permitted private context and service. It is never a lower evidence standard in the public version — a public claim the firm would not stand behind privately is one it should not make publicly.';

/* ── Channels ── */

export const CHANNEL_KINDS = ['ARCHIVE', 'SYNDICATED_POST', 'NEWSLETTER'] as const;
export type ChannelKind = typeof CHANNEL_KINDS[number];

export const ARCHIVE_RULE =
  'The durable article, its methodology, its attribution, its disclosures and its corrections live where the firm controls them. A platform distributes a channel-appropriate version of something that already exists; a post with no article behind it is a claim with no address.';

/**
 * What the platforms permit, as constraints rather than as a memo. The second
 * is the one that separates a publishing queue from an autonomous account.
 */
export const POST_KINDS = ['ORIGINAL', 'AUTOMATED_REPLY'] as const;
export type PostKind = typeof POST_KINDS[number];

export const AUTOMATED_REPLY_RULE =
  'An automated reply requires prior written approval from the platform. An approved publishing queue and an account that answers everyone are different projects, and only the first is in scope.';

export const ONE_ACCOUNT_RULE =
  'One clearly identified account, with human-approved original posts. Not a network of accounts amplifying one another — which the platforms prohibit and which would also be the self-citation loop wearing a second hat.';

/* ── Corrections ── */

export const CORRECTION_RULE =
  'A corrected source identifies the affected analysis, article, chart, posts and customer dossiers, and a notice goes out through each channel that carried the original. The earlier version stays in the record: a source change does not silently rewrite what the firm previously published.';

export const CORRECTION_REACHES: readonly string[] = [
  'the analysis', 'the article', 'the charts', 'the syndicated posts', 'the customer dossiers',
];

/* ── The separation the firm cannot approve away ── */

export const CONFLICT_RULE =
  'Publishing permissions and trading permissions are separate, and one person approving both sides does not resolve the conflict. Holdings and commercial relationships are reviewed before release, sponsored material is labelled, and trading around unpublished market-sensitive research is governed by a policy somebody qualified wrote.';

export const PUBLISHING_MUST_NOT =
  'The publishing system is not an instrument for improving the firm’s positions, and the research system does not treat reactions to the firm’s own posts as independent confirmation of its thesis.';

/* ── What a published claim carries ── */

export interface PublishedClaim {
  claim: string;
  claimClass: ClaimClass;
  /** What remains unknown. Required, for the same reason a dossier states its gaps. */
  stillUnknown: string;
}

export const STILL_UNKNOWN_RULE =
  'Every item states what remains unknown and names its reviewer. An article that lists only what is established describes a settled question, and the ones worth publishing are rarely settled.';

/* ── Standing ── */

export interface EditorialRelease {
  releaseId: string;
  publicationClass: PublicationClass;
  stage: EditorialStage;
}

/** None. Nothing has been found, drafted, reviewed or published. */
export const EDITORIAL_RELEASES: readonly EditorialRelease[] = [];

export const EDITORIAL_BLOCKED_ON: readonly string[] = [
  'No finding exists, because nothing has been mined.',
  'No beat is defined and no reviewer is named.',
  'No channel account is configured, and none would be used before an article existed to distribute.',
];

export function editorialStanding(releases: readonly EditorialRelease[] = EDITORIAL_RELEASES) {
  return {
    releases: releases.length,
    published: releases.filter((entry) => entry.stage === 'RELEASE' || entry.stage === 'DISTRIBUTION').length,
    reporting: releases.filter((entry) => entry.publicationClass === 'REPORTING').length,
    /* Should stay at zero: the newsroom produces one class. */
    nonReporting: releases.filter((entry) => !NEWSROOM_CLASSES.includes(entry.publicationClass)).length,
    reviewDimensions: REVIEW_DIMENSIONS.length,
    correctionReach: CORRECTION_REACHES.length,
    blockedOn: releases.length > 0 ? [] : [...EDITORIAL_BLOCKED_ON],
    coverage: releases.length === 0 ? 'CONTRACT_ONLY_NOTHING_PUBLISHED' : 'RELEASES_PRESENT',
  } as const;
}
