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
  CLASS_AUDIENCE, DECLARABLE_PURPOSES, NEVER_DECLARABLE, PLUG_IN_RULE, PURPOSE_ADMITS, SERVED_KINDS,
  TERMINAL_CLASSES, TOOL_SERVES, USE_AUDIENCE, admitCall, declarablePurposes, openable, servedCallReceipt,
  type TerminalSession,
} from './terminalPlane';
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

describe('a tool is admitted by what it serves', () => {
  /* A tool that has not said what leaves through it is unreachable, not open. */
  it('classifies every tool on the surface, and nothing that is not on it', () => {
    expect(Object.keys(TOOL_SERVES).sort()).toEqual(MCP_TOOLS.map((tool) => tool.name).sort());
    for (const [tool, kind] of Object.entries(TOOL_SERVES)) expect(SERVED_KINDS, tool).toContain(kind);
  });

  it('refuses an unclassified tool rather than serving it', () => {
    const saved = TOOL_SERVES.list_releases;
    delete TOOL_SERVES.list_releases;
    try {
      const refused = admitCall(session({ terminalClass: 'FIRM_INTERNAL', purpose: 'internal_research' }), 'list_releases', AT);
      expect(refused.refusal).toBe('TOOL_UNCLASSIFIED');
      expect(refused.remedy).toContain('TOOL_SERVES');
    } finally {
      TOOL_SERVES.list_releases = saved;
    }
  });

  it('refuses a tool that is not on the surface, with the list of those that are', () => {
    const refused = admitCall(session(), 'drop_corpus', AT);
    expect(refused.refusal).toBe('TOOL_UNKNOWN');
    expect(refused.remedy).toContain('list_releases');
  });

  /* The two-part rule, enforced: no purpose lists an estate. */
  it('reaches the estates from no purpose at all', () => {
    for (const entry of PURPOSE_ADMITS) expect(entry.admits, entry.use).not.toContain('ESTATE');
    const saved = TOOL_SERVES.get_release;
    TOOL_SERVES.get_release = 'ESTATE';
    try {
      for (const use of DECLARABLE_PURPOSES) {
        const terminalClass = TERMINAL_CLASSES.find((c) => declarablePurposes(c).includes(use));
        if (terminalClass === undefined) continue;
        const refused = admitCall(session({ terminalClass, purpose: use }), 'get_release', AT);
        expect(refused.refusal, use).toBe('ESTATE_NEVER_SERVED');
      }
    } finally {
      TOOL_SERVES.get_release = saved;
    }
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
      because: 'Customer delivery admits RECORDS.',
    });
    const refused = admitCall(session(), 'list_records', AT, 'tradewind.freight');
    expect(servedCallReceipt(session(), 'list_records', AT, refused, 'tradewind.freight')).toMatchObject({
      decision: 'REFUSED', refusal: 'CORPUS_OUTSIDE_SCOPE', corpus: 'tradewind.freight',
    });
  });

  it('states the rule it enforces', () => {
    expect(PLUG_IN_RULE).toContain('identified');
    expect(PLUG_IN_RULE).toContain('permitted uses');
    expect(PLUG_IN_RULE).toContain('receipt');
  });
});
