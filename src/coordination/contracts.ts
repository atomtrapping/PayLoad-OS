import { z } from 'zod';
import { id, digest } from '@/terminal/contracts';
import { AUTHORITIES, MESSAGE_KINDS } from './types';

const text = (max: number) => z.string().trim().min(1).max(max);
const labels = z.array(text(180)).max(32).refine(items => new Set(items).size === items.length);
/** Declarations only. Ownership and corpus scope come from durable membership. */
export const participantDefinition = z.object({
  name: text(180), kind: z.enum(['AGENT', 'APPARATUS']), version: text(40), purpose: text(1200),
  authority: z.enum(AUTHORITIES), runtime: z.enum(['Rust', 'C++', 'Python', 'JavaScript', 'Unassigned']),
  status: z.literal('LOCAL'), inputs: labels, outputs: labels, capabilities: labels, reference: text(500),
}).strict();
export const terminalLink = z.object({ jobId: id, actionDigest: digest, resultDigest: digest.optional() }).strict();
export const persistentMessageDraft = z.object({
  requestId: id, recipientId: id.nullable(), kind: z.enum(MESSAGE_KINDS), topic: text(80),
  title: text(180), body: text(4000), replyTo: id.nullable(), link: terminalLink.nullable(),
}).strict();
export const coordinationCommand = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('identity'), boardId: id }).strict(),
  z.object({ operation: z.literal('stable'), boardId: id }).strict(),
  z.object({ operation: z.literal('register'), boardId: id, definition: participantDefinition }).strict(),
  z.object({ operation: z.literal('post'), boardId: id, message: persistentMessageDraft }).strict(),
  z.object({ operation: z.literal('message'), boardId: id, messageId: id }).strict(),
  z.object({ operation: z.literal('acknowledge'), boardId: id, messageId: id, expectedDigest: digest }).strict(),
  z.object({ operation: z.literal('inbox'), boardId: id,
    afterSequence: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
    limit: z.number().int().min(1).max(50).default(20), includeAcknowledged: z.boolean().default(false),
    includeBroadcasts: z.boolean().default(true), kind: z.enum(MESSAGE_KINDS).nullable().default(null),
  }).strict(),
]);
