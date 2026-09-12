/**
 * The control plane a foreign terminal plugs into.
 *
 * The cases that matter are the refusals: a purpose a class may not declare,
 * a purpose nobody may declare, a tool a purpose does not admit, a corpus
 * outside the scope, an expired declaration, and the estates, which no
 * purpose reaches.
 */
import { describe, expect, it } from 'vitest';
import {
  CLASS_AUDIENCE, DECLARABLE_PURPOSES, NEVER_DECLARABLE, NO_AUTHORITY_CAN_BE_GRANTED_YET, OPERATE_WAITS_ON,
  PLUG_IN_RULE, PURPOSE_ADMITS, SERVED_KINDS, TERMINAL_CLASSES, USE_AUDIENCE, admitCall, admitCapability,
  declarablePurposes, openable, servedCallReceipt, toolServes, type TerminalSession,
} from './terminalPlane';
import { CAPABILITIES, TOOL_CAPABILITY, capabilityById, type Capability } from './capabilityRegistry';
import { PERMITTED_USES, sourceUseRequests } from './corpus';
import { MCP_TOOLS } from '@/mcp/tools';

const OPENED = '2026-09-12T09:00:00.000Z';
const AT = '2026-09-12T10:00:00.000Z';
const EXPIRES = '2026-09-12T17:00:00.000Z';

const session = (over: Partial<TerminalSession> = {}): TerminalSession => ({
  sessionId: 'TS-1',
  terminalId: 'terminal:acme-risk',
  terminalClass: 'CUSTOMER',
  purpose: 'customer_delivery',
  corpusScope: ['caravan.specialty-cargo'],
  openedAt: OPENED,
  expiresAt: EXPIRES,
  ...over,
});

describe('a purpose is declared from the corpus’s own vocabulary, not a second one', () => {
  /* The failure this closes: two vocabularies whose comparison succeeds or fails by accident. */
  it('declares purposes that are permitted uses, and audiences that agree with the rights model', () => {
    for (const use of DECLARABLE_PURPOSES) expect(PERMITTED_USES, use).toContain(use);
    const requests = sourceUseRequests('CARAVAN');
    for (const use of PERMITTED_USES) {
      expect(USE_AUDIENCE[use], `${use} audience`).toBe(requests[use].audience);
    }
  });

  it('derives what a class may declare from the audience it calls at', () => {
    expect(declarablePurposes('CUSTOMER')).toEqual(['customer_delivery']);
    expect(declarablePurposes('PUBLIC')).toEqual(['redistribution']);
    expect(declarablePurposes('FIRM_INTERNAL')).toEqual(['acquisition', 'normalization', 'aggregation', 'internal_research', 'proprietary_strategy']);
    for (const terminalClass of TERMINAL_CLASSES) {
      for (const use of declarablePurposes(terminalClass)) {
        expect(USE_AUDIENCE[use], `${use} for ${terminalClass}`).toBe(CLASS_AUDIENCE[terminalClass]);
      }
    }
  });

  /* Refused with a reason, which is a different thing from omitted. */
  it('lets no class declare model training or trading, and says why', () => {
    expect(Object.keys(NEVER_DECLARABLE).sort()).toEqual(['model_training', 'trading']);
    for (const terminalClass of TERMINAL_CLASSES) {
      expect(declarablePurposes(terminalClass)).not.toContain('model_training');
      expect(declarablePurposes(terminalClass)).not.toContain('trading');
    }
    const refused = openable(session({ terminalClass: 'FIRM_INTERNAL', purpose: 'model_training' }));
    expect(refused.refusal).toBe('PURPOSE_NOT_DECLARABLE_AT_ALL');
    expect(refused.because).toContain('no longer carries its receipts');
    expect(openable(session({ terminalClass: 'FIRM_INTERNAL', purpose: 'trading' })).because).toContain('prohibits trading');
  });

  it('refuses a purpose the class does not call at, naming what it may declare', () => {
    const refused = openable(session({ purpose: 'internal_research' }));
    expect(refused.refusal).toBe('PURPOSE_NOT_DECLARABLE_BY_THIS_CLASS');
    expect(refused.because).toContain('Customer delivery');
    const publicTerminal = openable(session({ terminalClass: 'PUBLIC', purpose: 'customer_delivery' }));
    expect(publicTerminal.refusal).toBe('PURPOSE_NOT_DECLARABLE_BY_THIS_CLASS');
    expect(publicTerminal.because).toContain('Redistribution');
  });

  it('refuses a session that names no corpus and one that expires before it opens', () => {
    expect(openable(session({ corpusScope: [] })).refusal).toBe('SCOPE_IS_EMPTY');
    expect(openable(session({ expiresAt: OPENED })).refusal).toBe('EXPIRES_BEFORE_IT_OPENS');
    expect(openable(session()).open).toBe(true);
  });
});

const capability = (over: Partial<Capability> = {}): Capability => ({
  id: 'test.capability',
  title: 'A capability under test',
  kind: 'READ',
  subsystem: 'Test',
  module: 'src/domain/capabilityRegistry.ts',
  entryPoint: 'nowhere',
  reachableToday: 'not reachable',
  gatedBy: 'nothing',
  serves: 'RECORDS',
  authorityNeeded: 'None.',
  touchesEstates: false,
  ...over,
});

describe('a capability is admitted by what it does to the world', () => {
  /* A tool is one way into a capability; a tool reaching nothing described is unreachable, not open. */
  it('maps every tool on the surface onto a described capability, and nothing that is not on it', () => {
    expect(Object.keys(TOOL_CAPABILITY).sort()).toEqual(MCP_TOOLS.map((tool) => tool.name).sort());
    for (const [tool, id] of Object.entries(TOOL_CAPABILITY)) {
      const reached = capabilityById(id);
      expect(reached, `${tool} reaches ${id}`).toBeDefined();
      expect(reached!.kind, `${tool} is a read`).toBe('READ');
      expect(SERVED_KINDS, `${tool} serves`).toContain(reached!.serves);
      expect(toolServes(tool)).toBe(reached!.serves);
    }
  });

  it('describes every capability once, with a kind and an entry point', () => {
    const ids = CAPABILITIES.map((entry) => entry.id);
    expect(new Set(ids).size, 'duplicate capability id').toBe(ids.length);
    for (const entry of CAPABILITIES) {
      expect(entry.entryPoint.length, entry.id).toBeGreaterThan(0);
      expect(entry.title.length, entry.id).toBeGreaterThan(10);
      if (entry.kind === 'READ') expect(entry.serves, entry.id).toBeDefined();
      else expect(entry.sideEffects?.length, `${entry.id} declares what it would change`).toBeGreaterThan(0);
    }
  });

  it('refuses an ask that reaches no described capability rather than serving it', () => {
    const refused = admitCapability(session(), undefined, AT);
    expect(refused.refusal).toBe('CAPABILITY_UNKNOWN');
    expect(refused.remedy).toContain('capabilityRegistry');
    expect(admitCall(session(), 'drop_corpus', AT).refusal).toBe('TOOL_UNKNOWN');
  });

  /* The two-part rule, enforced: an estate does not leave the firm on any purpose. */
  it('refuses an estate to every terminal outside the firm, whatever it declared', () => {
    for (const entry of PURPOSE_ADMITS) expect(entry.admits, entry.use).not.toContain('ESTATE');
    const estate = capability({ id: 'estate.reliability', touchesEstates: true });
    expect(admitCapability(session(), estate, AT).refusal).toBe('ESTATE_NEVER_SERVED');
    expect(admitCapability(session({ terminalClass: 'PUBLIC', purpose: 'redistribution' }), estate, AT).refusal).toBe('ESTATE_NEVER_SERVED');
    /* Marked as serving the estates, it is refused to the firm's own terminal too. */
    const served = capability({ serves: 'ESTATE' });
    expect(admitCapability(session({ terminalClass: 'FIRM_INTERNAL', purpose: 'internal_research' }), served, AT).refusal).toBe('ESTATE_NEVER_SERVED');
  });

  it('no capability in the registry serves an estate to anyone', () => {
    for (const entry of CAPABILITIES) expect(entry.serves, entry.id).not.toBe('ESTATE');
  });
});

describe('an operate is never run on a terminal’s say-so', () => {
  const operate = capability({
    id: 'discovery.run-workload',
    kind: 'OPERATE',
    serves: undefined,
    sideEffects: ['Writes a workload run and its derived artifacts with their lineage.'],
    authorityNeeded: 'A digest-bound execution authorization.',
  });

  it('turns the ask into a proposal carrying the party, the purpose and the side effects', () => {
    const asked = admitCapability(session(), operate, AT, 'caravan.specialty-cargo');
    expect(asked.outcome).toBe('PROPOSAL_REQUIRED');
    expect(asked.admitted).toBe(false);
    expect(asked.refusal).toBeNull();
    expect(asked.proposal).toEqual({
      operationKind: 'discovery.run-workload',
      counterparty: 'terminal:acme-risk',
      declaredSideEffects: ['Writes a workload run and its derived artifacts with their lineage.'],
      underPurpose: 'customer_delivery',
      waitsOn: OPERATE_WAITS_ON,
      blockedBy: NO_AUTHORITY_CAN_BE_GRANTED_YET,
    });
    expect(asked.because).toContain('has not run');
  });

  /* The side effects are the capability's, so a terminal cannot understate its own ask. */
  it('takes the declared side effects from the capability and not from the caller', () => {
    const asked = admitCapability(session(), operate, AT);
    expect(asked.proposal?.declaredSideEffects).toEqual(operate.sideEffects);
  });

  it('says what the ask waits on, and that one of those things cannot happen yet', () => {
    const asked = admitCapability(session(), operate, AT);
    expect(asked.proposal?.waitsOn).toHaveLength(3);
    expect(asked.proposal?.waitsOn.join(' ')).toContain('an agent cannot be the reviewer');
    expect(asked.proposal?.blockedBy).toContain('no release has been admitted');
  });

  /* Standing comes first: a corpus the session never named is not answered with a proposal. */
  it('refuses an operate on a corpus the session did not name, rather than proposing it', () => {
    expect(admitCapability(session(), operate, AT, 'tradewind.freight').refusal).toBe('CORPUS_OUTSIDE_SCOPE');
    expect(admitCapability(session({ expiresAt: '2026-09-12T09:30:00.000Z' }), operate, AT).refusal).toBe('SESSION_EXPIRED');
  });

  it('refuses an admission to every terminal but the firm’s own, and proposes it for that one', () => {
    const admit = capability({ id: 'corpus.admit-record', kind: 'ADMIT', serves: undefined, sideEffects: ['Puts a record into the corpus.'] });
    expect(admitCapability(session(), admit, AT).refusal).toBe('ADMISSION_IS_THE_FIRMS_OWN_ACT');
    expect(admitCapability(session({ terminalClass: 'PUBLIC', purpose: 'redistribution' }), admit, AT).refusal).toBe('ADMISSION_IS_THE_FIRMS_OWN_ACT');
    const firm = admitCapability(session({ terminalClass: 'FIRM_INTERNAL', purpose: 'internal_research' }), admit, AT);
    expect(firm.outcome).toBe('PROPOSAL_REQUIRED');
    expect(firm.because).toContain('admit material into the corpus');
  });
});

describe('every call is admitted or refused, and the order is the argument', () => {
  it('admits a customer asking for records of a corpus its session named', () => {
    const admitted = admitCall(session(), 'list_records', AT, 'caravan.specialty-cargo');
    expect(admitted.admitted).toBe(true);
    expect(admitted.served).toBe('RECORDS');
    expect(admitted.shape).toContain('both clocks');
    expect(admitted.refusal).toBeNull();
  });

  /* Aggregation gets aggregates and their refusals, not the rows behind them. */
  it('refuses the rows to a purpose that admits only aggregates, naming what it does admit', () => {
    const refused = admitCall(session({ terminalClass: 'FIRM_INTERNAL', purpose: 'aggregation' }), 'list_records', AT, 'caravan.specialty-cargo');
    expect(refused.refusal).toBe('PURPOSE_DOES_NOT_ADMIT_THIS');
    expect(refused.because).toContain('RECORDS');
    expect(refused.because).toContain('AGGREGATE');
    expect(admitCall(session({ terminalClass: 'FIRM_INTERNAL', purpose: 'aggregation' }), 'list_releases', AT).admitted).toBe(true);
  });

  it('refuses the records to a public terminal, which redistribution never carried', () => {
    const publicSession = session({ terminalClass: 'PUBLIC', purpose: 'redistribution' });
    expect(admitCall(publicSession, 'list_records', AT, 'caravan.specialty-cargo').refusal).toBe('PURPOSE_DOES_NOT_ADMIT_THIS');
    expect(admitCall(publicSession, 'get_ruling', AT).admitted).toBe(true);
  });

  it('refuses a corpus the session did not name, and does not widen the scope by asking', () => {
    const refused = admitCall(session(), 'list_records', AT, 'tradewind.freight');
    expect(refused.refusal).toBe('CORPUS_OUTSIDE_SCOPE');
    expect(refused.remedy).toContain('not widened');
    expect(admitCall(session({ corpusScope: ['caravan.specialty-cargo', 'tradewind.freight'] }), 'list_records', AT, 'tradewind.freight').admitted).toBe(true);
  });

  it('refuses a call after the declaration stopped standing', () => {
    const refused = admitCall(session(), 'list_records', AT.replace('T10', 'T18'), 'caravan.specialty-cargo');
    expect(refused.refusal).toBe('SESSION_EXPIRED');
    expect(refused.remedy).toContain('not extended by calling after it');
    /* At the instant it expires it still stands; after it, it does not. */
    expect(admitCall(session(), 'list_records', EXPIRES, 'caravan.specialty-cargo').admitted).toBe(true);
  });

  /* A session that could not be opened answers nothing, whatever it asks. */
  it('refuses every call of a session that could not be opened, before anything else', () => {
    const cannotOpen = session({ purpose: 'model_training', terminalClass: 'FIRM_INTERNAL' });
    for (const tool of ['list_releases', 'drop_corpus', 'list_records']) {
      expect(admitCall(cannotOpen, tool, AT).refusal, tool).toBe('PURPOSE_NOT_DECLARABLE_AT_ALL');
    }
  });

  it('gives every refusal a reason and a remedy', () => {
    const refusals = [
      admitCall(session(), 'drop_corpus', AT),
      admitCall(session(), 'list_records', AT, 'tradewind.freight'),
      admitCall(session({ terminalClass: 'FIRM_INTERNAL', purpose: 'aggregation' }), 'list_records', AT),
      admitCapability(session(), capability({ kind: 'ADMIT', serves: undefined, sideEffects: ['Puts a record into the corpus.'] }), AT),
      admitCall(session({ purpose: 'trading' }), 'list_records', AT),
    ];
    for (const refusal of refusals) {
      expect(refusal.admitted).toBe(false);
      expect(refusal.because.length).toBeGreaterThan(20);
      expect(refusal.remedy.length).toBeGreaterThan(20);
      expect(refusal.shape).toBeNull();
    }
  });
});

describe('a call leaves a receipt whichever way it went', () => {
  it('names the party, the purpose, the tool and the instant, admitted or refused', () => {
    const admitted = admitCall(session(), 'list_records', AT, 'caravan.specialty-cargo');
    expect(servedCallReceipt(session(), 'list_records', AT, admitted, 'caravan.specialty-cargo')).toEqual({
      sessionId: 'TS-1',
      terminalId: 'terminal:acme-risk',
      terminalClass: 'CUSTOMER',
      purpose: 'customer_delivery',
      tool: 'list_records',
      corpus: 'caravan.specialty-cargo',
      servedAt: AT,
      decision: 'ADMITTED',
      refusal: null,
      capability: 'corpus.list-records',
      declaredSideEffects: [],
      because: 'Customer delivery admits RECORDS.',
    });
    const refused = admitCall(session(), 'list_records', AT, 'tradewind.freight');
    expect(servedCallReceipt(session(), 'list_records', AT, refused, 'tradewind.freight')).toMatchObject({
      decision: 'REFUSED', refusal: 'CORPUS_OUTSIDE_SCOPE', corpus: 'tradewind.freight',
    });
  });

  /* A proposal is recorded as a proposal, with what it would change. */
  it('records an operate ask as a proposal, naming the capability and its side effects', () => {
    const operate = capability({ id: 'dossier.reassess', kind: 'OPERATE', serves: undefined, sideEffects: ['Writes a second coverage row for the facet at a later instant.'] });
    const asked = admitCapability(session(), operate, AT, 'caravan.specialty-cargo');
    expect(servedCallReceipt(session(), 'list_records', AT, asked, 'caravan.specialty-cargo')).toMatchObject({
      decision: 'PROPOSAL_REQUIRED',
      refusal: null,
      capability: 'dossier.reassess',
      declaredSideEffects: ['Writes a second coverage row for the facet at a later instant.'],
    });
  });

  it('states the rule it enforces', () => {
    expect(PLUG_IN_RULE).toContain('identified');
    expect(PLUG_IN_RULE).toContain('permitted uses');
    expect(PLUG_IN_RULE).toContain('receipt');
    expect(PLUG_IN_RULE).toContain('never run on a terminal’s say-so');
    expect(PLUG_IN_RULE).toContain('firm’s own act');
  });
});
