import { z } from 'zod';
import { createHash } from 'node:crypto';
import { canonicalJson } from '@/fixtures/digest';
import { TERMINAL_OPERATIONS } from '@/domain/capabilityRegistry';

export const TERMINAL_PROTOCOL = 'payload.terminal.v1' as const;
export const MINING_CAPABILITY = TERMINAL_OPERATIONS[0];
export const id = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
export const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
export const limits = Object.freeze({ rows: 1000, inputBytes: 1_048_576, outputBytes: 1_048_576, timeoutMs: 5000, backlog: 100, attempts: 3 });
export const miningRequest = z.object({
  capability: z.literal(MINING_CAPABILITY),
  releaseId: id,
  snapshotDigest: digest,
  methodDigest: digest,
  parameters: z.object({ minRecords: z.number().int().min(1).max(limits.rows) }).strict(),
  budget: z.object({
    maxRows: z.number().int().min(1).max(limits.rows),
    maxInputBytes: z.number().int().min(1024).max(limits.inputBytes),
    maxOutputBytes: z.number().int().min(1024).max(limits.outputBytes),
    timeoutMs: z.number().int().min(100).max(limits.timeoutMs),
  }).strict(),
  idempotencyKey: id,
  correction: z.object({ jobId: id, reason: z.string().trim().min(1).max(1000) }).strict().optional(),
}).strict();
export type MiningRequest = z.infer<typeof miningRequest>;
export const reviewRequest = z.object({ jobId: id, actionDigest: digest, response: z.enum(['APPROVE', 'DENY']), reason: z.string().trim().min(1).max(2000) }).strict();
export const terminalCommand = z.discriminatedUnion('command', [
  z.object({ command: z.literal('discover') }).strict(),
  z.object({ command: z.literal('read'), tool: id, args: z.record(z.string(), z.unknown()) }).strict(),
  z.object({ command: z.literal('pin'), releaseId: id }).strict(),
  z.object({ command: z.literal('submit'), request: miningRequest }).strict(),
  z.object({ command: z.literal('review'), review: reviewRequest }).strict(),
  z.object({ command: z.literal('jobs'), after: id.optional(), limit: z.number().int().min(1).max(50).default(20) }).strict(),
  z.object({ command: z.literal('job'), jobId: id }).strict(),
  z.object({ command: z.literal('result'), jobId: id }).strict(),
]);
export function commitment(value: unknown): string { return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`; }
export class TerminalError extends Error {
  constructor(readonly code: string, readonly status = 409) { super(code); }
}
export function refuse(code: string, status = 409): never { throw new TerminalError(code, status); }
