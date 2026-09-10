import { describe, expect, it } from 'vitest';
import {
  AGENT_PREPARES_RULE, ANCESTRY_FIELDS, ARCHIVE_RULE, AUDIENCE_RULE, AUDIENCE_SIGNALS,
  AUTOMATED_REPLY_RULE, CHANNEL_KINDS, CIRCULATION_IS_NOT_CORROBORATION, CONFLICT_RULE,
  CORRECTION_REACHES, CORRECTION_RULE, EDITORIAL_BLOCKED_ON, EDITORIAL_STAGES, FOUR_CLASSES_RULE,
  NEWSROOM_CLASSES, OFFERING_DIFFERENCES, ONE_ACCOUNT_RULE, POST_KINDS, PUBLICATION_CLASSES,
  PUBLICATION_CONTRACTS, PUBLISHING_MUST_NOT, REVIEW_BINDS_RULE, REVIEW_DIMENSIONS,
  REVIEW_DIMENSION_ASKS, REVIEW_PACKET, SAME_EVIDENCE_STANDARD_RULE, SELF_CITATION_RULE,
  STILL_UNKNOWN_RULE, editorialStanding, publicationContract,
} from './editorialPlane';

describe('four things that must not collapse', () => {
  it('names reporting, advertising, a recommendation and an execution', () => {
    expect(PUBLICATION_CLASSES).toEqual([
      'REPORTING', 'ADVERTISING', 'INVESTMENT_RECOMMENDATION', 'TRADING_EXECUTION',
    ]);
    for (const contract of PUBLICATION_CONTRACTS) expect(contract.collapsing, contract.publicationClass).not.toHaveLength(0);
    expect(FOUR_CLASSES_RULE).toContain('carry entirely different obligations');
  });

  /* A newsroom produces exactly one of them. */
  it('lets the newsroom produce reporting and nothing else', () => {
    expect(NEWSROOM_CLASSES).toEqual(['REPORTING']);
    for (const cls of ['ADVERTISING', 'INVESTMENT_RECOMMENDATION', 'TRADING_EXECUTION'] as const) {
      expect(publicationContract(cls).newsroomMayProduce, cls).toBe(false);
    }
  });

  it('separates reporting on a company from a recommendation about its securities', () => {
    expect(publicationContract('INVESTMENT_RECOMMENDATION').collapsing)
      .toContain('reporting on a factory is not a recommendation about its owner’s securities');
    expect(publicationContract('ADVERTISING').collapsing).toContain('The label is the whole difference');
  });

  it('refuses a class it does not carry', () => {
    expect(() => publicationContract('OPINION' as never)).toThrow(/EDITORIAL_UNKNOWN_CLASS/);
  });
});

describe('the loop that would confirm the firm’s own claims', () => {
  /*
   * The constraint the plane exists for. Every step of the loop is reasonable,
   * which is why it is refused at the row rather than at the reviewer.
   */
  it('keeps a repetition from corroborating what it repeats', () => {
    expect(SELF_CITATION_RULE).toContain('cannot corroborate the finding that publication came from');
    expect(SELF_CITATION_RULE).toContain('confirms its own claims through their circulation');
    expect(CIRCULATION_IS_NOT_CORROBORATION).toContain('quoted by five accounts has one source');
  });

  it('names what a repetition must retain to stay distinguishable', () => {
    expect(ANCESTRY_FIELDS).toContain('the publication it repeats');
    expect(ANCESTRY_FIELDS).toContain('the finding behind that publication');
  });

  /* And the softer version of the same mistake. */
  it('does not read audience response as evidence', () => {
    expect(AUDIENCE_SIGNALS).toContain('INQUIRIES');
    expect(AUDIENCE_RULE).toContain('does not validate a capacity estimate');
    expect(AUDIENCE_RULE).toContain('most convenient');
  });
});

describe('the workflow', () => {
  it('runs from a finding to a correction watch', () => {
    expect(EDITORIAL_STAGES[0]).toBe('FINDING');
    expect(EDITORIAL_STAGES.at(-1)).toBe('CORRECTION_WATCH');
    expect(EDITORIAL_STAGES).toContain('EVIDENCE_PACKET');
  });

  it('reviews four questions, not one', () => {
    expect(REVIEW_DIMENSIONS).toEqual(['EDITORIAL', 'RIGHTS', 'PRIVACY', 'CONFLICT']);
    for (const dimension of REVIEW_DIMENSIONS) {
      expect(REVIEW_DIMENSION_ASKS[dimension], dimension).toMatch(/\?$/);
    }
    expect(REVIEW_DIMENSION_ASKS.CONFLICT).toContain('who benefits if this is believed');
  });

  /* The item that keeps the packet honest. */
  it('puts conflicting evidence in the packet beside the supporting evidence', () => {
    expect(REVIEW_PACKET).toContain('conflicting evidence');
    expect(REVIEW_PACKET).toContain('the difference between what was observed and what was inferred');
    expect(REVIEW_PACKET).toContain('the exact proposed text and visuals');
  });

  it('binds an approval to a message rather than to a topic', () => {
    expect(REVIEW_BINDS_RULE).toContain('an approval is of a message, not of a topic');
    expect(AGENT_PREPARES_RULE).toContain('not another agent with publishing credentials');
  });

  it('states what remains unknown, and names a reviewer', () => {
    expect(STILL_UNKNOWN_RULE).toContain('the ones worth publishing are rarely settled');
  });
});

describe('public and paid', () => {
  /* The absence at the end is the important half. */
  it('differs in depth, customization, private context and service — and not in evidence', () => {
    expect(OFFERING_DIFFERENCES).toEqual(['depth', 'customization', 'permitted private context', 'service']);
    expect(OFFERING_DIFFERENCES.join(' ')).not.toContain('evidence');
    expect(SAME_EVIDENCE_STANDARD_RULE).toContain('never a lower evidence standard in the public version');
    expect(SAME_EVIDENCE_STANDARD_RULE).toContain('would not stand behind privately');
  });
});

describe('a platform is a channel', () => {
  it('keeps the durable record where the firm controls it', () => {
    expect(CHANNEL_KINDS).toEqual(['ARCHIVE', 'SYNDICATED_POST', 'NEWSLETTER']);
    expect(ARCHIVE_RULE).toContain('a claim with no address');
  });

  it('separates an approved queue from an account that answers everyone', () => {
    expect(POST_KINDS).toEqual(['ORIGINAL', 'AUTOMATED_REPLY']);
    expect(AUTOMATED_REPLY_RULE).toContain('prior written approval');
    expect(ONE_ACCOUNT_RULE).toContain('the self-citation loop wearing a second hat');
  });
});

describe('corrections reach everything the finding touched', () => {
  it('names all five places, and keeps the earlier version', () => {
    expect(CORRECTION_REACHES).toEqual([
      'the analysis', 'the article', 'the charts', 'the syndicated posts', 'the customer dossiers',
    ]);
    expect(CORRECTION_RULE).toContain('does not silently rewrite what the firm previously published');
  });
});

describe('the separation the firm cannot approve away', () => {
  it('does not accept one person approving both sides', () => {
    expect(CONFLICT_RULE).toContain('one person approving both sides does not resolve the conflict');
    expect(PUBLISHING_MUST_NOT).toContain('not an instrument for improving the firm’s positions');
    expect(PUBLISHING_MUST_NOT).toContain('independent confirmation of its thesis');
  });
});

describe('nothing has been published, and the zero is derived', () => {
  it('reports no releases and what it is blocked on', () => {
    const standing = editorialStanding();
    expect(standing.releases).toBe(0);
    expect(standing.published).toBe(0);
    expect(standing.nonReporting).toBe(0);
    expect(standing.reviewDimensions).toBe(4);
    expect(standing.blockedOn).toEqual([...EDITORIAL_BLOCKED_ON]);
    expect(standing.coverage).toBe('CONTRACT_ONLY_NOTHING_PUBLISHED');
  });

  it('counts a release that exists, and would count a non-reporting one', () => {
    const standing = editorialStanding([
      { releaseId: 'E1', publicationClass: 'REPORTING', stage: 'RELEASE' },
      { releaseId: 'E2', publicationClass: 'ADVERTISING', stage: 'DRAFT' },
    ]);
    expect(standing.releases).toBe(2);
    expect(standing.published).toBe(1);
    expect(standing.reporting).toBe(1);
    expect(standing.nonReporting).toBe(1);
    expect(standing.blockedOn).toEqual([]);
  });
});
