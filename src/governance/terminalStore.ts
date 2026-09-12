/**
 * The terminal ledger, open and writable.
 *
 * `./terminalLedger.ts` is the schema and the guards; this is a client that
 * holds one and satisfies the surface's `ServedCallSink`, so a running
 * `src/mcp/serve.ts` writes every ask into the tables that refuse a bad one.
 *
 * It lives here rather than in `src/db/` because it is a client, not a schema.
 * `src/db/` holds descriptions of tables, and an architecture test allows a
 * table exactly one of those unless a drift check compares the two — so a
 * store that has to stand up a corpus stub belongs beside `./ledger.ts`, which
 * already holds that stub, and not among the schemas it would appear to
 * redefine.
 *
 * IT OPENS ITS OWN, IN MEMORY
 *
 * PGlite, like `src/governance/ledger.ts`. There is no provisioned database
 * behind this repository and none is provisioned here: a store opened by a
 * process lives and dies with it. That makes it a real ledger for the length
 * of a session and not a durable one, which is stated rather than implied —
 * an operator who needs the record to outlive the process needs a database,
 * and giving this class one is a change of constructor rather than a change of
 * design.
 *
 * THE PROPOSAL IS WRITTEN FIRST, IN THE SAME TRANSACTION
 *
 * An operate ask produces a proposal and a call that points at it. Both go in
 * together, because the deferred guard that checks they are about the same act
 * and the same party fires at commit, and because a call pointing at a
 * proposal that failed to write is a row the foreign key refuses anyway. The
 * plane is the author: an `AGENT` principal, registered once, proposing on the
 * terminal's behalf with the terminal as counterparty. An agent may author a
 * proposal — that is what `operation_proposal` is for — and may not review or
 * authorize one, which the execution ledger enforces in its own columns.
 */
import { PGlite } from '@electric-sql/pglite';
import type { ProposedOperation, ServedCallReceipt, TerminalSession } from '@/domain/terminalPlane';
import { capabilityById } from '@/domain/capabilityRegistry';
import { EXECUTION_LEDGER_DDL } from '@/db/executionLedger';
import {
  TERMINAL_LEDGER_DDL, TERMINAL_LEDGER_GUARDS, servedCallRow, sessionRow, terminalCapabilitySeed,
} from '@/db/terminalLedger';
import { sqlText } from '@/db/ddl';
import { CORPUS_STUB_DDL } from './ledger';

/** The principal the plane proposes as. An agent may author; it may not approve. */
export const PLANE_PRINCIPAL = 'agent:terminal-plane';

export class TerminalLedgerStore {
  private opened = new Set<string>();
  private calls = 0;

  private constructor(private client: PGlite, readonly schema: string) {}

  static async open(schema = 'terminal'): Promise<TerminalLedgerStore> {
    const client = new PGlite();
    await client.waitReady;
    await client.exec(`CREATE SCHEMA ${schema}; SET search_path TO ${schema};
      ${CORPUS_STUB_DDL}${EXECUTION_LEDGER_DDL}${TERMINAL_LEDGER_DDL}${TERMINAL_LEDGER_GUARDS}`);
    await client.exec(`SET search_path TO ${schema};
      ${terminalCapabilitySeed()}
      INSERT INTO principal VALUES (${sqlText(PLANE_PRINCIPAL)}, 'AGENT', 'The terminal plane', now());`);
    return new TerminalLedgerStore(client, schema);
  }

  async close() { await this.client.close(); }

  /** Inside a transaction, so the deferred guards run and a failure leaves nothing half-written. */
  private async write(statement: string): Promise<void> {
    try {
      await this.client.exec(`SET search_path TO ${this.schema}; BEGIN; ${statement}; COMMIT;`);
    } catch (error) {
      await this.client.exec('ROLLBACK').catch(() => { /* an aborted block is ended by the next statement */ });
      throw error;
    }
  }

  async rows<T>(query: string): Promise<T[]> {
    await this.client.query(`SET search_path TO ${this.schema}`);
    return (await this.client.query(query)).rows as T[];
  }

  /**
   * The declaration, written once. A second open of the same session is a
   * no-op rather than a refusal: the surface opens on every call because it
   * cannot know which is the first, and the ledger's written-once rule is
   * about editing a declaration, not about being told twice.
   */
  async openSession(session: TerminalSession): Promise<void> {
    if (this.opened.has(session.sessionId)) return;
    await this.write(sessionRow(session));
    this.opened.add(session.sessionId);
  }

  async recordCall(receipt: ServedCallReceipt, session: TerminalSession, proposal?: ProposedOperation): Promise<void> {
    this.calls += 1;
    const callId = `${session.sessionId}-C${String(this.calls).padStart(4, '0')}`;
    const capability = receipt.capability === null ? undefined : capabilityById(receipt.capability);
    if (capability === undefined) {
      /*
       * The ask reached no described capability, so the plane refused it and
       * there is no row to point at. Recording it would mean inventing a
       * capability to name, and a ledger that invents the thing it is
       * recording is worse than one that says nothing. The refusal is on the
       * response either way.
       */
      return;
    }
    const proposalId = proposal === undefined ? undefined : `${callId}-P`;
    const rows = [
      ...(proposal === undefined ? [] : [proposalRow(proposalId!, proposal)]),
      servedCallRow(callId, receipt, session, capability.kind, proposalId),
    ];
    await this.write(rows.join(';\n'));
  }
}

/**
 * The proposal an operate ask became, as the execution ledger's own row.
 *
 * `declared_side_effects` is the capability's list, copied by the plane, so a
 * reviewer is shown what the act would change before anything changes and the
 * terminal that asked cannot understate it.
 */
export function proposalRow(proposalId: string, proposal: ProposedOperation): string {
  const effects = JSON.stringify([...proposal.declaredSideEffects]);
  return `INSERT INTO operation_proposal (proposal_id, operation_kind, counterparty, authored_by_kind, authored_by, proposed_at, declared_side_effects, data)
    VALUES (${sqlText(proposalId)}, ${sqlText(proposal.operationKind)}, ${sqlText(proposal.counterparty)}, 'AGENT', ${sqlText(PLANE_PRINCIPAL)}, now(),
      ${sqlText(effects)}::jsonb, ${sqlText(JSON.stringify({ underPurpose: proposal.underPurpose, waitsOn: proposal.waitsOn, blockedBy: proposal.blockedBy }))}::jsonb)`;
}
