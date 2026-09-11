/**
 * One briefing and one post preview, through the newsroom's ledger and the
 * kernel, each reviewed as the message it is.
 *
 * WHAT IS PUBLISHED, AND WHAT IS NOT
 *
 * The finding is a real computation over the committed Caravan demonstration
 * corpus: one lot's retained claims and how they distribute over sources. The
 * story candidate rests on that artifact by foreign key. Four named reviewers
 * answer the four questions — editorial, rights, privacy, conflict — and a
 * release cannot go in until all four have answered yes. The article is a
 * message with a headline, claims, a chart, qualifiers and its own text; the
 * desk editor reviews that message in the kernel and the authorization is of
 * its digest. The archive publication carries the digest and the channel of
 * what went into the archive, tied to the release by both.
 *
 * The post is a second message: a shorter headline, the same claims, no chart
 * and a note saying so, its own qualifiers, and channel text under the
 * platform's limit. It is reviewed as itself, authorized as itself, and
 * released for its channel. It is not published. Real external execution is
 * disabled for this work, so no channel_publication row for the post exists
 * — the reviewed, authorized preview is what the receipt carries, and the
 * receipt says the post was withheld and why. A row saying it went out would
 * have been a row saying something that did not happen.
 *
 * THE LOOP, REFUSED ONCE ON THE RECORD
 *
 * An observation from a simulated repeater descends from the archived
 * article. Offered as corroboration of the finding the article came from, it
 * is refused at the row. No independent observation is invented to show the
 * accepted case, because inventing an independent source is the thing the
 * rule exists to stop.
 *
 * NOTHING PRIVATE
 *
 * The messages are scanned for the dossier's customer and dossier
 * identifiers before release, and the receipt carries the (empty) list. A
 * public channel is the wrong place to learn what a customer asked.
 */
import type { ProducedArtifact } from '@/discovery/engine';
import { REVIEW_DIMENSIONS, type EditorialStage, type ReviewDimension } from '@/domain/editorialPlane';
import { EDITORIAL_STAGES } from '@/domain/editorialPlane';
import { sqlText } from '@/db/ddl';
import { canonicalJson } from '@/fixtures/digest';
import { digestOf, type GovernanceLedger, type GovernedAct, type Refusal } from './ledger';
import { PRINCIPALS } from './principals';
import { DOSSIER_ID } from './dossierLifecycle';
import type { Seeded } from './seed';

export const EDITORIAL_INSTANTS = {
  found: '2026-09-09T09:00:00.000Z',
  candidate: '2026-09-09T09:10:00.000Z',
  packet: '2026-09-09T10:00:00.000Z',
  drafted: '2026-09-09T11:00:00.000Z',
  reviewed: '2026-09-09T14:00:00.000Z',
  privacyAnswered: '2026-09-09T15:00:00.000Z',
  decided: '2026-09-09T16:00:00.000Z',
  released: '2026-09-09T17:00:00.000Z',
  archived: '2026-09-09T17:05:00.000Z',
  postReviewed: '2026-09-10T09:00:00.000Z',
  postReleased: '2026-09-10T09:30:00.000Z',
  repeated: '2026-09-10T12:00:00.000Z',
  expires: '2026-09-30T00:00:00.000Z',
} as const;

export const CANDIDATE_ID = 'STORY-DEMO-1';
export const BEAT = 'demonstration-corpus';
/** The platform's limit, as the post is held to it here. */
export const POST_CHARACTER_LIMIT = 280;

export interface Message {
  headline: string;
  claims: ReadonlyArray<{ claim: string; claimClass: string; artifactId: string; stillUnknown: string }>;
  chart: Record<string, unknown>;
  qualifiers: readonly string[];
  channelText: string;
}

export interface EditorialReleaseRecord {
  releaseId: string; channel: 'ARCHIVE' | 'SYNDICATED_POST'; version: number;
  message: Message; messageDigest: string; stillUnknown: string;
  review: GovernedAct;
  publication: { publicationId: string; channel: string; at: string } | null;
  withheldBecause: string | null;
  characters: number;
}

export interface EditorialLifecycleReceipt {
  readonly fixture_only: true;
  readonly simulated: true;
  readonly candidateId: string;
  readonly artifactId: string;
  readonly beat: string;
  readonly boundToRelease: string;
  readonly stages: ReadonlyArray<{ stage: EditorialStage; at: string; wrote: string }>;
  readonly dimensionReviews: ReadonlyArray<{ dimension: ReviewDimension; reviewer: string; passed: boolean; holdingsReviewed: string | null; at: string }>;
  readonly article: EditorialReleaseRecord;
  readonly post: EditorialReleaseRecord;
  readonly privateReferences: readonly string[];
  readonly repetition: { observationId: string; sourceAccount: string; descendsFromArtifactId: string; descendsViaReleaseId: string; offeredAsCorroborationOf: string; refusedBy: string };
  readonly refusals: readonly Refusal[];
  readonly counts: { candidates: number; dimensionReviews: number; releases: number; publications: number; observations: number; corroborations: number; proposals: number; authorizations: number; refusals: number };
}

const { editor, rightsReviewer, privacyReviewer, conflictReviewer, agent, customer } = PRINCIPALS;

function privateReferencesIn(messages: readonly Message[]): string[] {
  const text = messages.map((m) => canonicalJson(m)).join('\n');
  return [customer.principalId, DOSSIER_ID].filter((needle) => text.includes(needle));
}

export async function runEditorialLifecycle(ledger: GovernanceLedger, seeded: Seeded): Promise<EditorialLifecycleReceipt> {
  const T = EDITORIAL_INSTANTS;
  const artifact: ProducedArtifact = seeded.caravan.run.result.artifacts[0];
  const detail = artifact.detail as { largestSource?: string; largestShare?: number; singleSourced?: boolean };
  const takenBack = seeded.caravan.run.takenBack;
  const stages: Array<{ stage: EditorialStage; at: string; wrote: string }> = [];
  const stage = async (s: EditorialStage, at: string, wrote: string) => {
    await ledger.write(`UPDATE story_candidate SET stage = '${s}' WHERE candidate_id = ${sqlText(CANDIDATE_ID)}`);
    stages.push({ stage: s, at, wrote });
  };
  const refusalsBefore = ledger.refusals.length;

  /* ── finding → story candidate ── */
  await ledger.write(`INSERT INTO story_candidate VALUES (${sqlText(CANDIDATE_ID)}, ${sqlText(artifact.artifactId)}, '${artifact.claimClass}', ${sqlText(BEAT)}, 'FINDING', '${T.found}')`);
  stages.push({ stage: 'FINDING', at: T.found, wrote: `story_candidate ${CANDIDATE_ID} on ${artifact.artifactId} (${artifact.claimClass}, ${artifact.validation})` });
  await stage('STORY_CANDIDATE', T.candidate, `beat ${BEAT}; the subject is ${artifact.subject}`);

  /* ── evidence packet and draft: the message, with every part ── */
  const share = Math.round((detail.largestShare ?? 0) * 100);
  const stillUnknown = 'Whether the concentration reflects the world or the corpus’s coverage of it: the run read a demonstration corpus and validated nothing.';
  const claims: Message['claims'] = [{ claim: artifact.claim, claimClass: artifact.claimClass, artifactId: artifact.artifactId, stillUnknown }];
  const qualifiers = [
    'The Caravan corpus is a committed demonstration. This is a statement about that corpus and about no real lot, sample or party.',
    `The artifact is ${artifact.validation}: the run finished, and nothing has checked its result against anything.`,
    `${takenBack.length} records the corpus had taken back before the run were not read (${takenBack.map((t) => t.retractionId).filter((v, i, a) => a.indexOf(v) === i).join(', ')}).`,
    'Audience response to this article is not evidence for it, and a repetition of it elsewhere is not a second source.',
  ];
  const article: Message = {
    headline: `${artifact.subject}: ${share}% of its retained claims come from ${detail.largestSource ?? 'one source'}`,
    claims,
    chart: { kind: 'bar', measure: 'Share of retained claims held by the largest source', subject: artifact.subject, largestSource: detail.largestSource ?? null, largestShare: detail.largestShare ?? null, singleSourced: detail.singleSourced ?? null, restsOn: artifact.artifactId },
    qualifiers,
    channelText: `${artifact.claim} The finding is a computed result over the Caravan demonstration corpus, produced by the evidence-concentration workload and not validated. ${qualifiers[2]} What remains unknown: ${stillUnknown}`,
  };
  const articleDigest = digestOf(article);
  await stage('EVIDENCE_PACKET', T.packet, `claims × ${claims.length}, qualifiers × ${qualifiers.length}, chart over ${artifact.artifactId}`);
  await stage('DRAFT', T.drafted, `article message, digest ${articleDigest.slice(0, 19)}…`);

  /* ── review: four questions, and the fourth answered later ── */
  const dimensionReview = (dimension: ReviewDimension, reviewer: string, passed: boolean, holdings: string | null, at: string) =>
    `INSERT INTO editorial_review VALUES (${sqlText(`ER-${dimension}`)}, ${sqlText(CANDIDATE_ID)}, '${dimension}', ${sqlText(reviewer)}, ${holdings ? sqlText(holdings) : 'NULL'}, ${passed}, '${at}')`;
  const holdings = 'The firm holds no position in any party to the demonstration corpus, which is synthetic; nobody benefits if this is believed.';
  const dimensionReviews = [
    { dimension: 'EDITORIAL' as const, reviewer: editor.principalId, passed: true, holdingsReviewed: null, at: T.reviewed },
    { dimension: 'RIGHTS' as const, reviewer: rightsReviewer.principalId, passed: true, holdingsReviewed: null, at: T.reviewed },
    { dimension: 'CONFLICT' as const, reviewer: conflictReviewer.principalId, passed: true, holdingsReviewed: holdings, at: T.reviewed },
    { dimension: 'PRIVACY' as const, reviewer: privacyReviewer.principalId, passed: true, holdingsReviewed: null, at: T.privacyAnswered },
  ];
  await ledger.write(dimensionReviews.slice(0, 3).map((r) => dimensionReview(r.dimension, r.reviewer, r.passed, r.holdingsReviewed, r.at)).join(';\n'));
  await stage('REVIEW', T.reviewed, `editorial_review × 3 answered yes; PRIVACY not yet answered`);

  /* ── decision: the editor reviews the message in the kernel, of its digest ── */
  const articleReview = await ledger.govern({
    tag: 'ARTICLE-1', operationKind: 'EDITORIAL_RELEASE', counterparty: 'audience:archive', action: article,
    doingNothing: 'The finding stays in the discovery register, where a reader who already knows to look can find it.',
    against: 'It rests on one run over a demonstration corpus, the artifact is not validated, and a reader who skips the qualifiers will take a synthetic lot for a real one.',
    sections: ['the proposed claim', 'supporting evidence', 'the difference between what was observed and what was inferred', 'publication rights', 'intended audience', 'the exact proposed text and visuals'],
    authoredBy: agent, preparedBy: agent, reviewer: editor, response: 'APPROVE',
    reasoning: 'The headline says what the chart shows, the qualifiers say what it is not, and still-unknown is on the page. Release to the archive.',
    releaseId: seeded.caravan.releaseId, policyVersion: 'newsroom@1',
    proposedAt: T.drafted, reviewedAt: T.decided, grantedAt: T.decided, expiresAt: T.expires,
  });
  await stage('DECISION', T.decided, `${articleReview.proposalId} → ${articleReview.reviewId} APPROVE by ${editor.principalId} → ${articleReview.authorizationId}`);

  const releaseRow = (over: { id?: string; channel?: string; version?: number; digest?: string; auth?: string; message?: Message; cls?: string; at?: string } = {}) =>
    `INSERT INTO editorial_release VALUES (${sqlText(over.id ?? 'EREL-ARTICLE-1')}, ${sqlText(CANDIDATE_ID)}, ${sqlText(artifact.artifactId)}, '${over.cls ?? 'REPORTING'}', ${over.version ?? 1},
      '${over.digest ?? articleDigest}', ${sqlText(stillUnknown)}, '${over.at ?? T.released}', '${over.channel ?? 'ARCHIVE'}', ${sqlText(canonicalJson(over.message ?? article))}::jsonb, ${sqlText(over.auth ?? articleReview.authorizationId!)})`;

  await ledger.refuse('release the article before privacy had answered', releaseRow());
  await ledger.write(dimensionReview('PRIVACY', privacyReviewer.principalId, true, null, T.privacyAnswered));
  const edited = { ...article, headline: `${article.headline} — and that should worry you` };
  await ledger.refuse('publish a rewritten headline under the approval of the reviewed one', releaseRow({ digest: digestOf(edited), message: edited }));
  await ledger.refuse('reissue the reporting as advertising', releaseRow({ cls: 'ADVERTISING' }));
  await ledger.write(releaseRow());
  await ledger.write(`INSERT INTO channel_publication VALUES ('PUB-ARCHIVE-1', 'ARCHIVE', 'ORIGINAL', 'EREL-ARTICLE-1', '${articleDigest}', NULL, NULL, '${T.archived}')`);
  await stage('RELEASE', T.released, `editorial_release EREL-ARTICLE-1 ARCHIVE v1 under ${articleReview.authorizationId}; channel_publication PUB-ARCHIVE-1`);

  /* ── the post: a second message, reviewed as itself, released for its channel, and withheld ── */
  const postQualifiers = ['Demonstration corpus — not a real lot.', `Computed result, ${artifact.validation}.`];
  const postHeadline = `Demonstration corpus: ${share}% of one lot’s claims come from one source`;
  const post: Message = {
    headline: postHeadline,
    claims,
    chart: { kind: 'none', because: 'No chart on this channel; the archived article carries it, and the post links to the article.' },
    qualifiers: postQualifiers,
    channelText: `${postHeadline}. ${artifact.claim} ${postQualifiers.join(' ')} Method and full qualifiers in the archive: PUB-ARCHIVE-1.`,
  };
  const postDigest = digestOf(post);
  const characters = [...post.channelText].length;
  if (characters > POST_CHARACTER_LIMIT) throw new Error(`The post is ${characters} characters, over the limit of ${POST_CHARACTER_LIMIT}.`);

  await ledger.refuse('publish the post from the article’s release, on the post’s channel',
    `INSERT INTO channel_publication VALUES ('PUB-X-WRONG', 'SYNDICATED_POST', 'ORIGINAL', 'EREL-ARTICLE-1', '${articleDigest}', 'PUB-ARCHIVE-1', NULL, '${T.postReleased}')`);
  await ledger.refuse('release the post under the article’s approval', releaseRow({ id: 'EREL-POST-1', channel: 'SYNDICATED_POST', digest: articleDigest, message: post, at: T.postReleased }));
  const postReview = await ledger.govern({
    tag: 'POST-1', operationKind: 'EDITORIAL_RELEASE', counterparty: 'audience:syndicated-post', action: post,
    doingNothing: 'The article stays in the archive and reaches whoever comes to it.',
    against: `${characters} characters cannot carry the qualifiers the article carries; a reader who never opens the archive gets the number and not the caveats.`,
    sections: ['the proposed claim', 'intended audience', 'the exact proposed text and visuals'],
    authoredBy: agent, preparedBy: agent, reviewer: editor, response: 'APPROVE',
    reasoning: 'The post says demonstration, says not validated, and points at the archive. It may be released for its channel. It may not be posted: external execution is disabled.',
    releaseId: seeded.caravan.releaseId, policyVersion: 'newsroom@1',
    proposedAt: T.archived, reviewedAt: T.postReviewed, grantedAt: T.postReviewed, expiresAt: T.expires,
  });
  const stripped = { ...post, qualifiers: undefined } as unknown as Message;
  await ledger.refuse('drop the qualifiers from the post', `INSERT INTO editorial_release VALUES ('EREL-POST-1', ${sqlText(CANDIDATE_ID)}, ${sqlText(artifact.artifactId)}, 'REPORTING', 1,
    '${postDigest}', ${sqlText(stillUnknown)}, '${T.postReleased}', 'SYNDICATED_POST', ${sqlText(JSON.stringify(stripped))}::jsonb, ${sqlText(postReview.authorizationId!)})`);
  await ledger.write(releaseRow({ id: 'EREL-POST-1', channel: 'SYNDICATED_POST', digest: postDigest, message: post, auth: postReview.authorizationId!, at: T.postReleased }));
  await ledger.refuse('post it with no archived article behind it',
    `INSERT INTO channel_publication VALUES ('PUB-X-ORPHAN', 'SYNDICATED_POST', 'ORIGINAL', 'EREL-POST-1', '${postDigest}', NULL, NULL, '${T.postReleased}')`);
  const withheldBecause = 'Real external execution is disabled for this work. The post is reviewed and authorized for its channel and has not been posted; no channel_publication row exists for it, because a row saying it went out would say something that did not happen.';
  await stage('DISTRIBUTION', T.postReleased, `EREL-POST-1 SYNDICATED_POST v1 under ${postReview.authorizationId}, ${characters} characters, withheld; PUB-ARCHIVE-1 is the only publication`);

  /* ── correction watch: a repetition offered as corroboration, refused ── */
  await ledger.write(`INSERT INTO external_observation VALUES ('OBS-REPEAT-1', 'account:simulated-repeater', ${sqlText(`Repeats the archived article: ${article.headline}`)}, ${sqlText(artifact.artifactId)}, 'EREL-ARTICLE-1', '${T.repeated}')`);
  const repetition = await ledger.refuse('count the firm’s own republication as corroboration of its finding',
    `INSERT INTO corroboration VALUES ('COR-REPEAT-1', 'OBS-REPEAT-1', ${sqlText(artifact.artifactId)}, ${sqlText(artifact.artifactId)}, '${artifact.claimClass}', '${T.repeated}')`);
  await stage('CORRECTION_WATCH', T.repeated, `external_observation OBS-REPEAT-1 descends from EREL-ARTICLE-1; offered as corroboration of ${artifact.artifactId}; refused by ${repetition.refusedBy}`);

  const privateReferences = privateReferencesIn([article, post]);
  const counts = {
    candidates: await ledger.count('story_candidate'), dimensionReviews: await ledger.count('editorial_review'),
    releases: await ledger.count('editorial_release'), publications: await ledger.count('channel_publication'),
    observations: await ledger.count('external_observation'), corroborations: await ledger.count('corroboration'),
    proposals: await ledger.count('operation_proposal', "operation_kind = 'EDITORIAL_RELEASE'"),
    authorizations: await ledger.count('execution_authorization', "proposal_id LIKE 'P-ARTICLE-%' OR proposal_id LIKE 'P-POST-%'"),
    refusals: ledger.refusals.length - refusalsBefore,
  };
  if (stages.map((s) => s.stage).join() !== EDITORIAL_STAGES.join()) throw new Error('The lifecycle skipped an editorial stage.');
  if (REVIEW_DIMENSIONS.length !== dimensionReviews.length) throw new Error('A review dimension was not answered.');

  return {
    fixture_only: true, simulated: true,
    candidateId: CANDIDATE_ID, artifactId: artifact.artifactId, beat: BEAT, boundToRelease: seeded.caravan.releaseId,
    stages, dimensionReviews,
    article: { releaseId: 'EREL-ARTICLE-1', channel: 'ARCHIVE', version: 1, message: article, messageDigest: articleDigest, stillUnknown, review: articleReview, publication: { publicationId: 'PUB-ARCHIVE-1', channel: 'ARCHIVE', at: T.archived }, withheldBecause: null, characters: [...article.channelText].length },
    post: { releaseId: 'EREL-POST-1', channel: 'SYNDICATED_POST', version: 1, message: post, messageDigest: postDigest, stillUnknown, review: postReview, publication: null, withheldBecause, characters },
    privateReferences,
    repetition: { observationId: 'OBS-REPEAT-1', sourceAccount: 'account:simulated-repeater', descendsFromArtifactId: artifact.artifactId, descendsViaReleaseId: 'EREL-ARTICLE-1', offeredAsCorroborationOf: artifact.artifactId, refusedBy: repetition.refusedBy },
    refusals: ledger.refusals.slice(refusalsBefore),
    counts,
  };
}
