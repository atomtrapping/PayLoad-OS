/**
 * What a terminal asked for, against an actual PostgreSQL engine.
 *
 * Raw SQL throughout, as everywhere else in this directory: these guarantees
 * have to hold for a writer that never heard of the control plane. The plane
 * refuses a customer terminal declaring internal research; so does this, and
 * the second refusal is the one that matters when somebody writes a row by
 * hand, or a migration does.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { CAPABILITIES, capabilityById } from '@/domain/capabilityRegistry';
import { TERMINAL_CLASSES, declarablePurposes, type TerminalSession } from '@/domain/terminalVocabulary';
import { admitCapability, servedCallReceipt } from '@/domain/terminalPlane';
import { EXECUTION_LEDGER_DDL } from './executionLedger';
import {
  DECLARABLE_PAIRS, RECORDED_ASK_RULE, TERMINAL_LEDGER_DDL, TERMINAL_LEDGER_GUARDS,
  servedCallRow, sessionRow, terminalCapabilitySeed,
} from './terminalLedger';

let client: PGlite;
let scenario = 0;

const OPENED = '2026-09-12T09:00:00.000Z';
const AT = '2026-09-12T10:00:00.000Z';
const EXPIRES = '2026-09-12T17:00:00.000Z';
const AFTER = '2026-09-12T18:00:00.000Z';

/* The corpus tables the execution ledger's foreign keys point at. */
const CORPUS_DDL = `
CREATE TABLE corpora (corpus_id text PRIMARY KEY, domain text NOT NULL, data jsonb NOT NULL);
CREATE TABLE releases (release_id text PRIMARY KEY, corpus_id text NOT NULL REFERENCES corpora(corpus_id), status text NOT NULL, known_at timestamptz NOT NULL, data jsonb NOT NULL);
`;

beforeAll(async () => { client = new PGlite(); await client.waitReady; });
afterAll(async () => { await client?.close(); });

beforeEach(async () => {
  scenario += 1;
  await client.exec(`CREATE SCHEMA term_${scenario}; SET search_path TO term_${scenario};
    ${CORPUS_DDL}${EXECUTION_LEDGER_DDL}${TERMINAL_LEDGER_DDL}${TERMINAL_LEDGER_GUARDS}`);
  await client.exec(`SET search_path TO term_${scenario}; ${terminalCapabilitySeed()}`);
});

async function sql(statement: string) {
  await client.exec(`SET search_path TO term_${scenario}; ${statement}`);
}

/** A transaction, because the proposal guard is checked at commit. */
async function tx(statement: string) {
  try {
    await client.exec(`SET search_path TO term_${scenario}; BEGIN; ${statement}; COMMIT;`);
  } catch (error) {
    await client.exec('ROLLBACK').catch(() => {});
    throw error;
  }
}

async function rows(query: string) {
  await client.query(`SET search_path TO term_${scenario}`);
  return (await client.query(query)).rows as Record<string, unknown>[];
}

const SESSION = {
  sessionId: 'TS-1', terminalId: 'terminal:acme-risk', terminalClass: 'CUSTOMER',
  purpose: 'customer_delivery', corpusScope: ['caravan.specialty-cargo'],
  openedAt: OPENED, expiresAt: EXPIRES,
};

const session = (over: Partial<typeof SESSION> = {}) => sql(sessionRow({ ...SESSION, ...over }));

const RECEIPT = {
  sessionId: 'TS-1', terminalClass: 'CUSTOMER', capability: 'corpus.list-records',
  corpus: 'caravan.specialty-cargo', servedAt: AT, decision: 'ADMITTED',
  refusal: null as string | null, because: 'Customer delivery admits RECORDS.',
};

const call = (
  id = 'C1',
  over: Partial<typeof RECEIPT> = {},
  kind = 'READ',
  proposalId?: string,
  window: { openedAt: string; expiresAt: string } = { openedAt: OPENED, expiresAt: EXPIRES },
) => tx(servedCallRow(id, { ...RECEIPT, ...over }, window, kind, proposalId));

/** An agent principal and a proposal it authored on a terminal's behalf. */
const proposal = (id: string, operationKind: string, counterparty: string) => `
  INSERT INTO principal VALUES ('agent:terminal-plane', 'AGENT', 'The terminal plane', '${OPENED}')
    ON CONFLICT (principal_id) DO NOTHING;
  INSERT INTO operation_proposal (proposal_id, operation_kind, counterparty, authored_by_kind, authored_by, proposed_at, declared_side_effects)
    VALUES ('${id}', '${operationKind}', '${counterparty}', 'AGENT', 'agent:terminal-plane', '${AT}', '["Writes a run and its artifacts."]'::jsonb)`;

describe('the registry is a table, and a call points at one of its rows', () => {
  it('seeds every capability the registry declares, with its kind', async () => {
    const held = await rows(`SELECT capability_id, kind, serves, touches_estates FROM terminal_capability ORDER BY capability_id`);
    expect(held).toHaveLength(CAPABILITIES.length);
    const byId = new Map(held.map((row) => [row.capability_id as string, row]));
    for (const capability of CAPABILITIES) {
      expect(byId.get(capability.id), capability.id).toMatchObject({
        kind: capability.kind,
        serves: capability.serves ?? null,
        touches_estates: capability.touchesEstates,
      });
    }
  });

  it('refuses a call naming a capability the registry does not describe', async () => {
    await session();
    await expect(call('C1', { capability: 'corpus.drop-everything' })).rejects.toThrow(/call_capability|foreign key/i);
  });

  /*
   * The kind on the call is the registry's kind, not the writer's opinion of
   * it. Claiming a read is an operate and serving it anyway trips the
   * admitted-reads rule first, which is the stricter of the two; claiming it
   * on a refusal, where that rule says nothing, reaches the composite key.
   */
  it('refuses a call claiming a capability is a kind it is not', async () => {
    await session();
    await expect(call('C1', {}, 'OPERATE')).rejects.toThrow(/call_only_a_read_is_admitted/);
    await expect(call('C2', { decision: 'REFUSED', refusal: 'CORPUS_OUTSIDE_SCOPE' }, 'OPERATE'))
      .rejects.toThrow(/call_capability|foreign key/i);
  });

  it('lets no capability row serve an estate', async () => {
    await expect(sql(`INSERT INTO terminal_capability VALUES ('estate.reliability', 'READ', 'ESTATE', true)`))
      .rejects.toThrow(/capability_serves_no_estate/);
  });

  it('makes a read say what it serves and anything else say nothing', async () => {
    await expect(sql(`INSERT INTO terminal_capability VALUES ('x.read', 'READ', NULL, false)`)).rejects.toThrow(/capability_read_serves_something/);
    await expect(sql(`INSERT INTO terminal_capability VALUES ('x.operate', 'OPERATE', 'RECORDS', false)`)).rejects.toThrow(/capability_read_serves_something/);
  });
});

describe('a session is the declaration, and it cannot widen', () => {
  /* Generated from the same function the plane admits by, so the two cannot drift. */
  it('derives the declarable pairs from the plane’s own rule', () => {
    const expected = TERMINAL_CLASSES.flatMap((terminalClass) =>
      declarablePurposes(terminalClass).map((purpose) => [terminalClass, purpose]));
    expect(DECLARABLE_PAIRS.map((pair) => [...pair])).toEqual(expected);
    expect(DECLARABLE_PAIRS.map(([, use]) => use)).not.toContain('model_training');
    expect(DECLARABLE_PAIRS.map(([, use]) => use)).not.toContain('trading');
  });

  it('accepts a class declaring a purpose it calls at', async () => {
    await session();
    await session({ sessionId: 'TS-2', terminalClass: 'PUBLIC', purpose: 'redistribution' });
    await session({ sessionId: 'TS-3', terminalClass: 'FIRM_INTERNAL', purpose: 'internal_research' });
    expect(await rows(`SELECT count(*)::int AS n FROM terminal_session`)).toEqual([{ n: 3 }]);
  });

  it('refuses a class declaring a purpose it does not call at', async () => {
    await expect(session({ purpose: 'internal_research' })).rejects.toThrow(/session_purpose_is_declarable_by_its_class/);
    await expect(session({ terminalClass: 'PUBLIC', purpose: 'customer_delivery' })).rejects.toThrow(/session_purpose_is_declarable_by_its_class/);
  });

  /* Refused by the database as well as by the plane, and for the same reason. */
  it('refuses model training and trading to every class', async () => {
    for (const terminalClass of TERMINAL_CLASSES) {
      await expect(session({ terminalClass, purpose: 'model_training' }), `${terminalClass} model_training`)
        .rejects.toThrow(/session_purpose_is_declarable_by_its_class/);
      await expect(session({ terminalClass, purpose: 'trading' }), `${terminalClass} trading`)
        .rejects.toThrow(/session_purpose_is_declarable_by_its_class/);
    }
  });

  it('refuses a session naming no corpus, and one that expires before it opens', async () => {
    await expect(session({ corpusScope: [] })).rejects.toThrow(/session_names_a_corpus/);
    await expect(session({ expiresAt: OPENED })).rejects.toThrow(/session_expires_after_it_opens/);
  });

  /* A widening is a new session, so the row cannot be edited into one. */
  it('refuses rewriting a session', async () => {
    await session();
    await expect(sql(`UPDATE terminal_session SET purpose = 'internal_research' WHERE session_id = 'TS-1'`))
      .rejects.toThrow(/session_is_written_once:UPDATE/);
    await expect(sql(`UPDATE terminal_session SET corpus_scope = '{"caravan.specialty-cargo","tradewind.freight"}' WHERE session_id = 'TS-1'`))
      .rejects.toThrow(/session_is_written_once:UPDATE/);
    await expect(sql(`DELETE FROM terminal_session WHERE session_id = 'TS-1'`))
      .rejects.toThrow(/session_is_written_once:DELETE/);
  });
});

describe('a call is dated inside the window its session declared', () => {
  beforeEach(async () => { await session(); });

  it('records an admitted read', async () => {
    await call();
    expect((await rows(`SELECT session_id, capability_id, decision, corpus FROM served_call`))[0]).toMatchObject({
      session_id: 'TS-1', capability_id: 'corpus.list-records', decision: 'ADMITTED', corpus: 'caravan.specialty-cargo',
    });
  });

  it('refuses a call before its session opened and after it expired', async () => {
    await expect(call('C1', { servedAt: '2026-09-12T08:00:00.000Z' })).rejects.toThrow(/call_within_the_session_window/);
    await expect(call('C2', { servedAt: AFTER })).rejects.toThrow(/call_within_the_session_window/);
    /* The instants themselves stand: a window is inclusive of its edges. */
    await call('C3', { servedAt: OPENED });
    await call('C4', { servedAt: EXPIRES });
  });

  /* A caller cannot claim a window its session did not declare. */
  it('refuses a call carrying a window that is not its session’s', async () => {
    await expect(call('C1', {}, 'READ', undefined, { openedAt: OPENED, expiresAt: AFTER }))
      .rejects.toThrow(/call_session|foreign key/i);
  });

  it('refuses a call claiming a class its session does not have', async () => {
    await expect(call('C1', { terminalClass: 'FIRM_INTERNAL' })).rejects.toThrow(/call_session_class|foreign key/i);
  });

  it('refuses rewriting a call', async () => {
    await call();
    await expect(sql(`UPDATE served_call SET decision = 'REFUSED' WHERE call_id = 'C1'`)).rejects.toThrow(/call_is_written_once:UPDATE/);
    await expect(sql(`DELETE FROM served_call WHERE call_id = 'C1'`)).rejects.toThrow(/call_is_written_once:DELETE/);
  });
});

describe('each outcome carries what it must and nothing it must not', () => {
  beforeEach(async () => { await session(); });

  it('makes a refusal carry its code, and an answer carry none', async () => {
    await expect(call('C1', { decision: 'REFUSED', refusal: null })).rejects.toThrow(/call_refusal_has_a_code/);
    await expect(call('C2', { refusal: 'CORPUS_OUTSIDE_SCOPE' })).rejects.toThrow(/call_refusal_has_a_code/);
    await call('C3', { decision: 'REFUSED', refusal: 'CORPUS_OUTSIDE_SCOPE', because: 'The session named another corpus.' });
    expect(await rows(`SELECT refusal FROM served_call WHERE call_id = 'C3'`)).toEqual([{ refusal: 'CORPUS_OUTSIDE_SCOPE' }]);
  });

  it('makes a proposed call carry a proposal, and any other carry none', async () => {
    await expect(call('C1', { decision: 'PROPOSAL_REQUIRED', because: 'It changes what the system holds.' }))
      .rejects.toThrow(/call_proposal_when_proposed/);
    await sql(proposal('P-1', 'corpus.list-records', 'terminal:acme-risk'));
    await expect(call('C2', {}, 'READ', 'P-1')).rejects.toThrow(/call_proposal_when_proposed/);
  });

  it('says something about every call, however it went', async () => {
    await expect(call('C1', { because: '   ' })).rejects.toThrow(/because/);
  });
});

describe('an operate is never recorded as answered', () => {
  const OPERATE = CAPABILITIES.find((capability) => capability.kind === 'OPERATE')!;
  const ADMIT = CAPABILITIES.find((capability) => capability.kind === 'ADMIT')!;

  it('refuses an admitted operate, and accepts the proposal it should have been', async () => {
    await session();
    await expect(call('C1', { capability: OPERATE.id }, 'OPERATE')).rejects.toThrow(/call_only_a_read_is_admitted/);
    await tx(`${proposal('P-1', OPERATE.id, 'terminal:acme-risk')};
      ${servedCallRow('C2', { ...RECEIPT, capability: OPERATE.id, decision: 'PROPOSAL_REQUIRED', because: 'It changes what the system holds.' }, { openedAt: OPENED, expiresAt: EXPIRES }, 'OPERATE', 'P-1')}`);
    expect((await rows(`SELECT decision, proposal_id FROM served_call WHERE call_id = 'C2'`))[0])
      .toMatchObject({ decision: 'PROPOSAL_REQUIRED', proposal_id: 'P-1' });
  });

  /* An admission into the corpus is the firm's own act, in the database too. */
  it('refuses an admission asked for by any session but the firm’s own', async () => {
    await session();
    await sql(proposal('P-1', ADMIT.id, 'terminal:acme-risk'));
    await expect(call('C1', { capability: ADMIT.id, decision: 'PROPOSAL_REQUIRED', because: 'It would admit material.' }, 'ADMIT', 'P-1'))
      .rejects.toThrow(/call_admission_is_the_firms_own_act/);
    /* Refused, it is recordable: a refusal is a fact worth keeping. */
    await call('C2', { capability: ADMIT.id, decision: 'REFUSED', refusal: 'ADMISSION_IS_THE_FIRMS_OWN_ACT', because: 'It would put material into the corpus.' }, 'ADMIT');
  });

  it('lets the firm’s own session propose an admission', async () => {
    await session({ sessionId: 'TS-F', terminalId: 'terminal:payload-os-stdio', terminalClass: 'FIRM_INTERNAL', purpose: 'internal_research' });
    await tx(`${proposal('P-1', ADMIT.id, 'terminal:payload-os-stdio')};
      ${servedCallRow('C1', { ...RECEIPT, sessionId: 'TS-F', terminalClass: 'FIRM_INTERNAL', capability: ADMIT.id, decision: 'PROPOSAL_REQUIRED', because: 'It would admit material.' }, { openedAt: OPENED, expiresAt: EXPIRES }, 'ADMIT', 'P-1')}`);
    expect(await rows(`SELECT count(*)::int AS n FROM served_call`)).toEqual([{ n: 1 }]);
  });
});

describe('the proposal a call points at is the one it made', () => {
  const OPERATE = CAPABILITIES.find((capability) => capability.kind === 'OPERATE')!;
  const OTHER = CAPABILITIES.filter((capability) => capability.kind === 'OPERATE')[1]!;

  beforeEach(async () => { await session(); });

  it('refuses a call pointing at a proposal for another act', async () => {
    await expect(tx(`${proposal('P-1', OTHER.id, 'terminal:acme-risk')};
      ${servedCallRow('C1', { ...RECEIPT, capability: OPERATE.id, decision: 'PROPOSAL_REQUIRED', because: 'It changes what the system holds.' }, { openedAt: OPENED, expiresAt: EXPIRES }, 'OPERATE', 'P-1')}`))
      .rejects.toThrow(new RegExp(`call_proposed_another_act:C1:asked ${OPERATE.id}, proposed ${OTHER.id}`));
  });

  it('refuses a call pointing at a proposal for another party', async () => {
    await expect(tx(`${proposal('P-1', OPERATE.id, 'terminal:someone-else')};
      ${servedCallRow('C1', { ...RECEIPT, capability: OPERATE.id, decision: 'PROPOSAL_REQUIRED', because: 'It changes what the system holds.' }, { openedAt: OPENED, expiresAt: EXPIRES }, 'OPERATE', 'P-1')}`))
      .rejects.toThrow(/call_proposed_for_another_party:C1:asked by terminal:acme-risk, proposed for terminal:someone-else/);
  });

  it('refuses a call pointing at no proposal at all', async () => {
    await expect(call('C1', { capability: OPERATE.id, decision: 'PROPOSAL_REQUIRED', because: 'It changes what the system holds.' }, 'OPERATE', 'P-missing'))
      .rejects.toThrow(/call_proposal|foreign key/i);
  });
});

describe('the ledger starts empty, and states its rule', () => {
  it('holds no session and no call', async () => {
    expect(await rows(`SELECT 1 FROM terminal_session`)).toEqual([]);
    expect(await rows(`SELECT 1 FROM served_call`)).toEqual([]);
  });

  /* And nothing can be authorized: the authorization names a release, and there are none. */
  it('cannot authorize what a terminal proposes, because no release has been admitted', async () => {
    await session();
    await sql(proposal('P-1', 'discovery.run-workload', 'terminal:acme-risk'));
    await expect(sql(`
      INSERT INTO decision_packet (packet_id, proposal_id, action_kind, action, action_digest, doing_nothing, against, prepared_by_kind, prepared_by, prepared_at)
        VALUES ('K-1', 'P-1', 'discovery.run-workload', '{}'::jsonb, 'sha256:${'1'.repeat(64)}', 'Nothing runs.', 'It reads the corpus.', 'AGENT', 'agent:terminal-plane', '${AT}');
      INSERT INTO principal VALUES ('operator:jo', 'HUMAN', 'Jo', '${OPENED}');
      INSERT INTO proposal_review (review_id, proposal_id, reviewed_action_digest, response, reviewer_kind, reviewer, reasoning, reviewed_at)
        VALUES ('RV-1', 'P-1', 'sha256:${'1'.repeat(64)}', 'APPROVE', 'HUMAN', 'operator:jo', 'Read it.', '${AT}');
      INSERT INTO execution_authorization (authorization_id, proposal_id, envelope_class, granted_by_kind, granted_by, corpus_release_id,
        state_revision, policy_version, granted_at, expires_at, action_digest, review_response)
        VALUES ('AU-1', 'P-1', 'NARROW_ACTION', 'HUMAN', 'operator:jo', 'REL-NONE', 1, 'terminal@1', '${AT}', '${AFTER}', 'sha256:${'1'.repeat(64)}', 'APPROVE')`))
      .rejects.toThrow(/corpus_release_id|releases|foreign key/i);
    expect(await rows(`SELECT 1 FROM execution_authorization`)).toEqual([]);
    expect(await rows(`SELECT proposal_id FROM operation_proposal`)).toEqual([{ proposal_id: 'P-1' }]);
  });

  it('states what it records', () => {
    expect(RECORDED_ASK_RULE).toContain('A refusal is recorded as fully as an answer');
    expect(RECORDED_ASK_RULE).toContain('never recorded as answered');
  });
});

/**
 * The round trip: what the plane decides is what the ledger holds.
 *
 * The two halves were written to the same vocabulary but by different hands,
 * and a vocabulary shared on paper is not a vocabulary shared in fact. So this
 * runs a spread of real asks through `admitCapability`, takes the receipt it
 * returns, and writes it — unedited except for the identifiers the row needs.
 * A decision the plane can produce and the ledger will not accept is a
 * disagreement between the two, and this is where it surfaces.
 */
describe('what the plane decided is what the ledger holds', () => {
  const PLANE_SESSION: TerminalSession = {
    sessionId: 'TS-1', terminalId: 'terminal:acme-risk', terminalClass: 'CUSTOMER',
    purpose: 'customer_delivery', corpusScope: ['caravan.specialty-cargo'],
    openedAt: OPENED, expiresAt: EXPIRES,
  };

  const OPERATE = CAPABILITIES.find((capability) => capability.kind === 'OPERATE')!;
  const ESTATE = CAPABILITIES.find((capability) => capability.touchesEstates)!;

  /** One ask, decided by the plane and written as the ledger row it becomes. */
  async function record(callId: string, capabilityId: string, corpus?: string) {
    const capability = capabilityById(capabilityId)!;
    const admission = admitCapability(PLANE_SESSION, capability, AT, corpus);
    const receipt = servedCallReceipt(PLANE_SESSION, capabilityId, AT, admission, corpus);
    const proposalId = admission.outcome === 'PROPOSAL_REQUIRED' ? `P-${callId}` : undefined;
    const rowSql = servedCallRow(
      callId,
      { ...receipt, capability: capabilityId },
      { openedAt: PLANE_SESSION.openedAt, expiresAt: PLANE_SESSION.expiresAt },
      capability.kind,
      proposalId,
    );
    await tx(proposalId === undefined
      ? rowSql
      : `${proposal(proposalId, capabilityId, PLANE_SESSION.terminalId)}; ${rowSql}`);
    return admission.outcome;
  }

  beforeEach(async () => { await session(); });

  it('writes an admitted read, a refusal and a proposal exactly as the plane decided them', async () => {
    expect(await record('C1', 'corpus.list-records', 'caravan.specialty-cargo')).toBe('ADMITTED');
    expect(await record('C2', 'corpus.list-records', 'tradewind.freight')).toBe('REFUSED');
    expect(await record('C3', OPERATE.id, 'caravan.specialty-cargo')).toBe('PROPOSAL_REQUIRED');
    expect(await record('C4', ESTATE.id, 'caravan.specialty-cargo')).toBe('REFUSED');

    expect(await rows(`SELECT call_id, decision, refusal, proposal_id FROM served_call ORDER BY call_id`)).toEqual([
      { call_id: 'C1', decision: 'ADMITTED', refusal: null, proposal_id: null },
      { call_id: 'C2', decision: 'REFUSED', refusal: 'CORPUS_OUTSIDE_SCOPE', proposal_id: null },
      { call_id: 'C3', decision: 'PROPOSAL_REQUIRED', refusal: null, proposal_id: 'P-C3' },
      { call_id: 'C4', decision: 'REFUSED', refusal: 'ESTATE_NEVER_SERVED', proposal_id: null },
    ]);
  });

  /*
   * The pattern is the point. Four asks by one party under one declared
   * purpose, three of them refused or held, is a shape somebody can read off
   * the table — which was the whole reason to write it down.
   */
  it('leaves a pattern of asking that can be read back against the party', async () => {
    await record('C1', 'corpus.list-records', 'caravan.specialty-cargo');
    await record('C2', 'corpus.list-records', 'tradewind.freight');
    await record('C3', OPERATE.id, 'caravan.specialty-cargo');
    await record('C4', ESTATE.id, 'caravan.specialty-cargo');

    expect(await rows(`
      SELECT s.terminal_id, s.purpose, c.decision, count(*)::int AS asks
        FROM served_call c JOIN terminal_session s ON s.session_id = c.session_id
        GROUP BY s.terminal_id, s.purpose, c.decision ORDER BY c.decision`)).toEqual([
      { terminal_id: 'terminal:acme-risk', purpose: 'customer_delivery', decision: 'ADMITTED', asks: 1 },
      { terminal_id: 'terminal:acme-risk', purpose: 'customer_delivery', decision: 'PROPOSAL_REQUIRED', asks: 1 },
      { terminal_id: 'terminal:acme-risk', purpose: 'customer_delivery', decision: 'REFUSED', asks: 2 },
    ]);
  });
});
