import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EDITORIAL_STAGES, REVIEW_DIMENSIONS } from '@/domain/editorialPlane';
import { GovernanceLedger } from './ledger';
import { seedDemonstration, type Seeded } from './seed';
import { runEditorialLifecycle, POST_CHARACTER_LIMIT, type EditorialLifecycleReceipt } from './editorialLifecycle';

let ledger: GovernanceLedger;
let seeded: Seeded;
let receipt: EditorialLifecycleReceipt;

beforeAll(async () => {
  ledger = await GovernanceLedger.open();
  seeded = await seedDemonstration(ledger);
  receipt = await runEditorialLifecycle(ledger, seeded);
}, 60_000);
afterAll(async () => { await ledger?.close(); });

describe('one briefing and one post preview', () => {
  it('passes through every editorial stage in order', () => {
    expect(receipt.stages.map((s) => s.stage)).toEqual([...EDITORIAL_STAGES]);
    const at = receipt.stages.map((s) => s.at);
    expect([...at].sort()).toEqual(at);
  });

  it('answers all four questions by named reviewers, with the holdings named on the conflict review', () => {
    expect(receipt.dimensionReviews.map((r) => r.dimension).sort()).toEqual([...REVIEW_DIMENSIONS].sort());
    expect(receipt.dimensionReviews.every((r) => r.passed)).toBe(true);
    expect(receipt.dimensionReviews.find((r) => r.dimension === 'CONFLICT')!.holdingsReviewed).toMatch(/holds no position/);
    expect(new Set(receipt.dimensionReviews.map((r) => r.reviewer)).size).toBe(4);
  });

  it('reviews the actual headline, claims, chart, qualifiers and channel text, by digest', () => {
    for (const release of [receipt.article, receipt.post]) {
      expect(Object.keys(release.message).sort()).toEqual(['channelText', 'chart', 'claims', 'headline', 'qualifiers']);
      expect(release.review.actionDigest).toBe(release.messageDigest);
      expect(release.review.reviewer).toBe('editor:desk');
      expect(release.review.authorizationId).toBeTruthy();
      expect(release.message.claims[0].artifactId).toBe(receipt.artifactId);
    }
    expect(receipt.article.messageDigest).not.toBe(receipt.post.messageDigest);
    expect(receipt.article.review.authorizationId).not.toBe(receipt.post.review.authorizationId);
  });

  it('publishes the article to the archive and withholds the post', () => {
    expect(receipt.article.publication).toEqual({ publicationId: 'PUB-ARCHIVE-1', channel: 'ARCHIVE', at: '2026-09-09T17:05:00.000Z' });
    expect(receipt.post.publication).toBeNull();
    expect(receipt.post.withheldBecause).toMatch(/external execution is disabled/);
    expect(receipt.post.characters).toBeLessThanOrEqual(POST_CHARACTER_LIMIT);
    expect(receipt.post.message.channelText).toMatch(/PUB-ARCHIVE-1/);
    expect(receipt.post.message.chart).toMatchObject({ kind: 'none' });
    expect(receipt.counts.publications).toBe(1);
  });

  it('says what it is not, on both messages', () => {
    expect(receipt.article.message.qualifiers.join(' ')).toMatch(/demonstration/i);
    expect(receipt.article.message.qualifiers.join(' ')).toMatch(/NOT_VALIDATED/);
    expect(receipt.article.message.qualifiers.join(' ')).toMatch(/not evidence for it/);
    expect(receipt.post.message.qualifiers.join(' ')).toMatch(/not a real lot/);
    expect(receipt.article.stillUnknown.length).toBeGreaterThan(20);
  });

  it('exposes nothing private through the public channel', () => {
    expect(receipt.privateReferences).toEqual([]);
  });

  it('refuses the firm’s own republication as corroboration, on the record', () => {
    expect(receipt.repetition.refusedBy).toBe('repetition_is_not_corroboration');
    expect(receipt.repetition.descendsViaReleaseId).toBe(receipt.article.releaseId);
    expect(receipt.counts.corroborations).toBe(0);
    expect(receipt.counts.observations).toBe(1);
  });

  it('observed every refusal it claims, by the constraint that refused it', () => {
    expect(receipt.refusals.map((r) => [r.label, r.refusedBy])).toEqual([
      ['release the article before privacy had answered', 'release_before_every_review_passed:3_of_4'],
      ['publish a rewritten headline under the approval of the reviewed one', 'release_approved_as_this_message'],
      ['reissue the reporting as advertising', 'editorial_release_publication_class_check'],
      ['publish the post from the article’s release, on the post’s channel', 'channel_carries_the_reviewed_message'],
      ['release the post under the article’s approval', 'editorial_release_authorization_once'],
      ['drop the qualifiers from the post', 'release_message_has_its_parts'],
      ['post it with no archived article behind it', 'only_the_archive_originates'],
      ['count the firm’s own republication as corroboration of its finding', 'repetition_is_not_corroboration'],
    ]);
  });

  it('counts what it wrote', () => {
    expect(receipt.counts).toEqual({ candidates: 1, dimensionReviews: 4, releases: 2, publications: 1, observations: 1, corroborations: 0, proposals: 2, authorizations: 2, refusals: 8 });
  });

  it('gives the same receipt again', async () => {
    const again = await GovernanceLedger.open();
    try { expect(await runEditorialLifecycle(again, await seedDemonstration(again))).toEqual(receipt); }
    finally { await again.close(); }
  }, 60_000);
});
