import { describe, expect, it } from 'vitest';
import {
  ACCOUNTED_SEPARATELY, COMPONENT_ROLES, CUSTOMER_ENTRY, CUSTOMER_NEED_NOT_KNOW,
  DELIVERABLE_FOOTER, DUALITY_RULE, FEEDBACK_CHANNELS, FEEDBACK_SEPARATION_RULE,
  IDENTITIES, IDENTITY_BLOCKED_ON, IDENTITY_CONTRACTS, MAINTAINED_VALUE, NOT_MORE_OPTIONS,
  NO_NEW_BRANDS_RULE, PROVENANCE_CHAIN, PROVENANCE_CONVENTION_RULE, REUSE_RULE, SERVICE_MODES,
  contribution, identityContract, identityStanding,
} from './firmIdentity';
import { DOMAINS, PRODUCT_ROOT } from './domains';

describe('two names, one firm', () => {
  it('splits production from delivery and gives each its own spine', () => {
    expect(IDENTITIES).toEqual(['Notation Systems', 'Dossier Services']);
    expect(identityContract('Notation Systems').activity).toBe('INFORMATION_PRODUCTION');
    expect(identityContract('Dossier Services').activity).toBe('INFORMATION_DELIVERY');
    expect(identityContract('Notation Systems').spine[0]).toBe('company');
    expect(identityContract('Dossier Services').spine[0]).toBe('problem');
    expect(identityContract('Dossier Services').spine.at(-1)).toBe('follow-up');
  });

  it('gives each identity its own domain, and they are not the same', () => {
    const domains = IDENTITY_CONTRACTS.map((entry) => entry.domain);
    expect(domains).toEqual(['notation.systems', 'dossier.services']);
    expect(new Set(domains).size).toBe(2);
  });

  /* Each collapse costs something specific, so each contract says which. */
  it('says what collapsing each into the other would cost', () => {
    for (const contract of IDENTITY_CONTRACTS) expect(contract.collapsing, contract.identity).not.toHaveLength(0);
    expect(identityContract('Dossier Services').collapsing).toContain('architecture lesson');
    expect(identityContract('Notation Systems').collapsing).toContain('nobody can audit');
    expect(DUALITY_RULE).toContain('neither is a product line');
  });

  it('refuses an identity it does not carry', () => {
    expect(() => identityContract('Hedgerow' as never)).toThrow(/FIRM_UNKNOWN_IDENTITY/);
  });
});

describe('what the customer never has to learn', () => {
  /*
   * A test of the architecture rather than of the copy. If a buyer has to
   * understand any of these to get an answer, the delivery layer has leaked.
   */
  it('names the nouns the delivery layer must keep on its own side', () => {
    for (const noun of ['PayloadOS', 'canonical state', 'lineage', 'the mining architecture']) {
      expect(CUSTOMER_NEED_NOT_KNOW, noun).toContain(noun);
    }
    expect(CUSTOMER_ENTRY).toContain('in their own words');
    expect(CUSTOMER_ENTRY).toContain('not theirs');
  });

  /* And the delivery spine does not mention any of them. */
  it('keeps the delivery spine clear of the production vocabulary', () => {
    const spine = identityContract('Dossier Services').spine.join(' ').toLowerCase();
    for (const noun of CUSTOMER_NEED_NOT_KNOW) {
      expect(spine, noun).not.toContain(noun.toLowerCase());
    }
  });
});

describe('a new capability is a role, not a brand', () => {
  it('keeps the three product lines and adds no fourth', () => {
    const components = COMPONENT_ROLES.map((entry) => entry.component);
    for (const domain of DOMAINS) expect(components, domain.label).toContain(domain.label);
    expect(components).toContain(PRODUCT_ROOT.terminal);
    expect(components).toContain('Dossier Services');
    expect(NO_NEW_BRANDS_RULE).toContain('never a new name on the door');
  });

  /* The row most often got wrong elsewhere. */
  it('keeps agents as bounded operators rather than a product', () => {
    const agents = COMPONENT_ROLES.find((entry) => entry.component === 'Agents')!;
    expect(agents.role).toContain('Not independent authorities');
    expect(agents.customerFacing).toBe(false);
  });

  it('keeps the substrate and the terminal off the customer-facing list', () => {
    const hidden = COMPONENT_ROLES.filter((entry) => !entry.customerFacing).map((entry) => entry.component);
    expect(hidden).toContain('PayloadOS');
    expect(hidden).toContain(PRODUCT_ROOT.terminal);
  });
});

describe('the provenance convention', () => {
  it('signs every deliverable with both names', () => {
    expect(DELIVERABLE_FOOTER).toEqual([
      'Prepared by Dossier Services',
      'A Notation Systems information product',
    ]);
  });

  it('runs the chain from claim to provenance beneath the polished result', () => {
    expect(PROVENANCE_CHAIN).toEqual(['claim', 'evidence', 'observation', 'computation', 'version', 'provenance']);
    expect(PROVENANCE_CONVENTION_RULE).toContain('consultancy deck');
    expect(PROVENANCE_CONVENTION_RULE).toContain('database nobody bought');
  });
});

describe('three modes, no new names', () => {
  it('offers a release, a maintained dossier and authorized workflow support', () => {
    expect(SERVICE_MODES.map((mode) => mode.mode))
      .toEqual(['One-time release', 'Maintained dossier', 'Authorized workflow support']);
    for (const mode of SERVICE_MODES) expect(mode.buys, mode.mode).not.toHaveLength(0);
  });

  it('says why the maintained mode is the one that compounds', () => {
    expect(MAINTAINED_VALUE).toContain('reconstruct it repeatedly');
  });

  /* A shortlist that got shorter is a finding. */
  it('does not treat more options as the deliverable', () => {
    expect(NOT_MORE_OPTIONS).toContain('ruling out a plausible but infeasible one');
  });
});

describe('economics, with the fixed costs left out of the per-dossier number', () => {
  it('computes contribution from realized price and incremental cost only', () => {
    expect(contribution(12_000, 4_500)).toBe(7_500);
    expect(contribution(4_000, 4_000)).toBe(0);
    expect(contribution(3_000, 4_000)).toBe(-1_000);
  });

  it('keeps what must be accounted separately before claiming profitability', () => {
    expect(ACCOUNTED_SEPARATELY).toEqual(['fixed infrastructure', 'general research', 'customer acquisition']);
  });

  it('does not treat reuse as unconditional', () => {
    expect(REUSE_RULE).toContain('not an unconditional acquire-once-forever law');
    expect(REUSE_RULE).toContain('freshness, rights and question overlap');
  });
});

describe('four feedback channels that look like one', () => {
  /*
   * The separation is what stops the commercial loop contaminating the evidence
   * system. A firm reading revenue as confirmation of its world model keeps the
   * model that sells.
   */
  it('gives each channel one thing it tests and one it does not establish', () => {
    expect(FEEDBACK_CHANNELS).toHaveLength(4);
    for (const channel of FEEDBACK_CHANNELS) {
      expect(channel.tests, channel.channel).not.toHaveLength(0);
      expect(channel.doesNotEstablish, channel.channel).not.toHaveLength(0);
    }
    const commercial = FEEDBACK_CHANNELS.find((c) => c.channel === 'Purchases and renewals')!;
    expect(commercial.doesNotEstablish).toContain('A sale does not validate the underlying physical model');
    expect(commercial.doesNotEstablish).toContain('does not prove absence of customer need');
  });

  it('states the separation as a rule', () => {
    expect(FEEDBACK_SEPARATION_RULE).toContain('keep the model that sells');
  });
});

describe('nothing has been delivered, and the zero is derived', () => {
  it('reports zero releases and what it is blocked on', () => {
    const standing = identityStanding();
    expect(standing.releases).toBe(0);
    expect(standing.monitored).toBe(0);
    expect(standing.modesExercised).toBe(0);
    expect(standing.modesOffered).toBe(3);
    expect(standing.blockedOn).toEqual([...IDENTITY_BLOCKED_ON]);
    expect(standing.coverage).toBe('CONTRACT_ONLY_NOTHING_DELIVERED');
  });

  it('moves when a release exists, so the zero means something', () => {
    const standing = identityStanding([
      { releaseId: 'D-1', mode: 'One-time release', monitored: false },
      { releaseId: 'D-2', mode: 'Maintained dossier', monitored: true },
      { releaseId: 'D-3', mode: 'Maintained dossier', monitored: true },
    ]);
    expect(standing.releases).toBe(3);
    expect(standing.monitored).toBe(2);
    expect(standing.modesExercised).toBe(2);
    expect(standing.blockedOn).toEqual([]);
    expect(standing.coverage).toBe('RELEASES_PRESENT');
  });
});
