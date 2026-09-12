import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { capabilityById, TOOL_CAPABILITY } from '@/domain/capabilityRegistry';
import { PERMITTED_USES } from '@/domain/corpus';
import { TERMINAL_CLASSES } from '@/domain/terminalVocabulary';
import { canonicalJson } from '@/fixtures/digest';
import type { ServedCall } from '@/mcp/serve';
import { assertAuthenticated, type AuthenticatedTerminal } from './auth';
import type { TerminalDatabase } from './database';

export type TerminalReadRecording =
  | { status: 'RECORDED'; callId: string; sessionId: string }
  | { status: 'NOT_RECORDED'; code: 'READ_RECEIPT_UNSUPPORTED' | 'READ_RECEIPT_INVALID' | 'READ_RECEIPT_BINDING_CONFLICT' | 'READ_RECEIPT_UNAVAILABLE' };
type RecordingCode = Extract<TerminalReadRecording, { status: 'NOT_RECORDED' }>['code'];
class RecordingFailure extends Error {
  constructor(readonly code: RecordingCode) { super(code); }
}
const fail = (code: RecordingCode): never => { throw new RecordingFailure(code); };
const instant = z.iso.datetime({ offset: true }).refine(value => Number.isFinite(Date.parse(value)));
const text = z.string().min(1).max(512);
const receiptSchema = z.object({
  sessionId: text, terminalId: text, terminalClass: z.enum(TERMINAL_CLASSES), purpose: z.enum(PERMITTED_USES),
  tool: text, corpus: text.nullable(), servedAt: instant, decision: z.enum(['ADMITTED', 'REFUSED']),
  refusal: text.nullable(), capability: text, declaredSideEffects: z.array(z.string()).max(0),
  because: z.string().min(1).max(16_384).refine(value => value.trim().length > 0),
}).strict();
const normalizedTime = (value: string | Date) => new Date(value).toISOString();
const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);

/**
 * Persist a governed READ decision, not its payload or a mining delivery receipt.
 * This creates no proposal or job. The caller decides whether a recording failure
 * prevents delivery; every failure status is sanitized and unsupported asks are
 * explicitly distinguished from a failed write.
 */
export async function recordTerminalRead(db: TerminalDatabase, who: AuthenticatedTerminal, served: ServedCall): Promise<TerminalReadRecording> {
  assertAuthenticated(who);
  try {
    const capability = served.receipt.capability ? capabilityById(served.receipt.capability) : undefined;
    if (!capability || capability.kind !== 'READ' || served.proposal !== undefined || served.receipt.decision === 'PROPOSAL_REQUIRED') {
      return { status: 'NOT_RECORDED', code: 'READ_RECEIPT_UNSUPPORTED' };
    }
    // Parse/copy before the first await. No result payload or token is retained.
    const checked = receiptSchema.safeParse(served.receipt);
    if (!checked.success) return { status: 'NOT_RECORDED', code: 'READ_RECEIPT_INVALID' };
    const receipt = checked.data;
    const session = { ...who.session, corpusScope: [...who.session.corpusScope] };
    const identity = { principalId: who.principalId, terminalId: who.terminalId, kind: who.kind, displayName: who.displayName,
      terminalClass: who.terminalClass, purpose: who.purpose, corpusScope: [...who.corpusScope], canReview: who.canReview, expiresAt: who.expiresAt };
    if (!Object.hasOwn(TOOL_CAPABILITY, receipt.tool) || TOOL_CAPABILITY[receipt.tool] !== receipt.capability
      || !same([receipt.sessionId, receipt.terminalId, receipt.terminalClass, receipt.purpose], [session.sessionId, session.terminalId, session.terminalClass, session.purpose])
      || receipt.decision !== served.admission.outcome || receipt.refusal !== served.admission.refusal
      || served.admission.admitted !== (receipt.decision === 'ADMITTED') || served.admission.proposal !== null
      || ((receipt.decision === 'REFUSED') !== (receipt.refusal !== null))
      || Date.parse(receipt.servedAt) < Date.parse(session.openedAt) || Date.parse(receipt.servedAt) > Date.parse(session.expiresAt)
      || (receipt.decision === 'ADMITTED' && receipt.corpus !== null && !session.corpusScope.includes(receipt.corpus))) {
      return { status: 'NOT_RECORDED', code: 'READ_RECEIPT_INVALID' };
    }
    const callId = `CALL-${randomUUID()}`;
    await db.transaction(async sql => {
      await sql.query('INSERT INTO principal(principal_id,kind,display_name,registered_at) VALUES($1,$2,$3,clock_timestamp()) ON CONFLICT(principal_id) DO NOTHING',
        [who.principalId, who.kind, who.displayName]);
      const principal = (await sql.query<{ kind: string }>('SELECT kind FROM principal WHERE principal_id=$1', [who.principalId])).rows[0];
      if (principal?.kind !== who.kind) fail('READ_RECEIPT_BINDING_CONFLICT');
      const registry = (await sql.query<{ kind: string; serves: string | null; touches_estates: boolean }>(
        'SELECT kind,serves,touches_estates FROM terminal_capability WHERE capability_id=$1', [capability.id])).rows[0];
      if (!same(registry, { kind: capability.kind, serves: capability.serves ?? null, touches_estates: capability.touchesEstates })) fail('READ_RECEIPT_BINDING_CONFLICT');
      const inserted = await sql.query(`INSERT INTO terminal_session(session_id,terminal_id,terminal_class,purpose,corpus_scope,opened_at,expires_at)
        VALUES($1,$2,$3,$4,$5::text[],$6,$7) ON CONFLICT(session_id) DO NOTHING RETURNING session_id`,
        [session.sessionId, session.terminalId, session.terminalClass, session.purpose, session.corpusScope, session.openedAt, session.expiresAt]);
      const retained = (await sql.query<{ session_id: string; terminal_id: string; terminal_class: string; purpose: string; corpus_scope: string[]; opened_at: string | Date; expires_at: string | Date }>(
        'SELECT session_id,terminal_id,terminal_class,purpose,corpus_scope,opened_at,expires_at FROM terminal_session WHERE session_id=$1', [session.sessionId])).rows[0];
      if (!retained || !same({ ...retained, opened_at: normalizedTime(retained.opened_at), expires_at: normalizedTime(retained.expires_at) },
        { session_id: session.sessionId, terminal_id: session.terminalId, terminal_class: session.terminalClass, purpose: session.purpose,
          corpus_scope: session.corpusScope, opened_at: normalizedTime(session.openedAt), expires_at: normalizedTime(session.expiresAt) })) fail('READ_RECEIPT_BINDING_CONFLICT');
      if (inserted.rows.length) {
        await sql.query('INSERT INTO payload_terminal_session_identity(session_id,principal_id,identity) VALUES($1,$2,$3::jsonb)', [session.sessionId, who.principalId, canonicalJson(identity)]);
      }
      const bound = (await sql.query<{ principal_id: string; identity: unknown }>(
        'SELECT principal_id,identity FROM payload_terminal_session_identity WHERE session_id=$1', [session.sessionId])).rows[0];
      // Never claim an existing, previously unbound session for this principal.
      if (!bound || bound.principal_id !== who.principalId || !same(bound.identity, identity)) fail('READ_RECEIPT_BINDING_CONFLICT');
      await sql.query(`INSERT INTO served_call(call_id,session_id,session_opened_at,session_expires_at,session_class,
        capability_id,capability_kind,corpus,served_at,decision,refusal,proposal_id,because)
        VALUES($1,$2,$3,$4,$5,$6,'READ',$7,$8,$9,$10,NULL,$11)`,
        [callId, session.sessionId, session.openedAt, session.expiresAt, session.terminalClass, capability.id, receipt.corpus,
          receipt.servedAt, receipt.decision, receipt.refusal, receipt.because]);
    });
    return { status: 'RECORDED', callId, sessionId: session.sessionId };
  } catch (error) {
    return { status: 'NOT_RECORDED', code: error instanceof RecordingFailure ? error.code : 'READ_RECEIPT_UNAVAILABLE' };
  }
}
