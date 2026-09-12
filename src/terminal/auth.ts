import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { openable, type TerminalSession } from '@/domain/terminalPlane';
import { id, refuse } from './contracts';

const registration = z.object({
  principalId: id, terminalId: id, displayName: z.string().min(1).max(128),
  kind: z.enum(['HUMAN', 'AGENT', 'POLICY']),
  terminalClass: z.enum(['FIRM_INTERNAL', 'CUSTOMER', 'PUBLIC']),
  purpose: z.enum(['internal_research', 'normalization', 'aggregation', 'acquisition', 'customer_delivery', 'redistribution', 'proprietary_strategy']),
  corpusScope: z.array(id).min(1).max(64),
  canReview: z.boolean(),
  tokenSha256: z.string().regex(/^[a-f0-9]{64}$/),
  expiresAt: z.iso.datetime({ offset: true }),
}).strict();
export type TerminalRegistration = z.infer<typeof registration>;
export type AuthenticatedTerminal = Readonly<Omit<TerminalRegistration, 'tokenSha256'> & { session: Readonly<TerminalSession> }>;
const authenticated = new WeakSet<object>();
export function assertAuthenticated(who: AuthenticatedTerminal): void {
  if (!authenticated.has(who) || Date.parse(who.expiresAt) < Date.now()) refuse('AUTHENTICATION_REQUIRED', 401);
}
export const tokenDigest = (token: string) => createHash('sha256').update(token).digest('hex');

/** Operator configuration only. No caller-supplied identity, class, scope or reviewer flag. */
export function authenticateTerminal(request: Request, config = process.env.PAYLOAD_TERMINAL_PRINCIPALS): AuthenticatedTerminal {
  if (!config || Buffer.byteLength(config) > 65_536) refuse('TERMINAL_AUTH_NOT_CONFIGURED', 503);
  let entries: TerminalRegistration[];
  try { entries = z.array(registration).min(1).max(100).parse(JSON.parse(config)); }
  catch { return refuse('TERMINAL_AUTH_CONFIGURATION_INVALID', 503); }
  const terminals = new Set<string>(), tokens = new Set<string>(), principals = new Map<string, string>();
  for (const entry of entries) {
    const identity = JSON.stringify([entry.kind, entry.displayName, entry.terminalClass, entry.purpose, [...entry.corpusScope].sort(), entry.canReview]);
    if (terminals.has(entry.terminalId) || tokens.has(entry.tokenSha256) || (principals.has(entry.principalId) && principals.get(entry.principalId) !== identity)
      || (entry.canReview && (entry.kind === 'AGENT' || entry.terminalClass !== 'FIRM_INTERNAL')))
      refuse('TERMINAL_AUTH_CONFIGURATION_INVALID', 503);
    terminals.add(entry.terminalId); tokens.add(entry.tokenSha256); principals.set(entry.principalId, identity);
  }
  const header = request.headers.get('authorization');
  const token = header && /^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(header)?.[1];
  const supplied = Buffer.from(tokenDigest(token || ''), 'hex');
  let matched: TerminalRegistration | undefined;
  for (const entry of entries) if (timingSafeEqual(supplied, Buffer.from(entry.tokenSha256, 'hex'))) matched = entry;
  if (!token || !matched || Date.parse(matched.expiresAt) < Date.now()) refuse('AUTHENTICATION_REQUIRED', 401);
  const entry = matched!;
  const now = new Date().toISOString();
  const session: TerminalSession = {
    sessionId: `${entry.terminalId}:${now}`, terminalId: entry.terminalId, terminalClass: entry.terminalClass,
    purpose: entry.purpose, corpusScope: Object.freeze([...entry.corpusScope]), openedAt: now, expiresAt: entry.expiresAt,
  };
  if (!openable(session).open) refuse('TERMINAL_AUTH_CONFIGURATION_INVALID', 503);
  const { tokenSha256: _secret, ...identity } = entry;
  void _secret;
  const result = Object.freeze({ ...identity, corpusScope: session.corpusScope, session: Object.freeze(session) }) as AuthenticatedTerminal;
  authenticated.add(result);
  return result;
}
