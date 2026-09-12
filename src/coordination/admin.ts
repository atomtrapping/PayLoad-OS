import { z } from 'zod';
import { openSync, fstatSync, readSync, closeSync } from 'node:fs';
import { id } from '@/terminal/contracts';
import type { TerminalDatabase } from '@/terminal/database';
import { bootstrapBoard, grantMember, revokeMember } from './database';

const audit = z.object({ actor: id, reason: z.string().trim().min(1).max(1000) }).strict();
export const coordinationConfiguration = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('create-board'), boardId: id, corpusId: id, audit }).strict(),
  z.object({ operation: z.literal('grant-member'), boardId: id, audit, member: z.object({
    principalId: id, participantId: id, kind: z.enum(['AGENT', 'HUMAN', 'POLICY']),
    displayName: z.string().trim().min(1).max(128),
  }).strict() }).strict(),
  z.object({ operation: z.literal('revoke-member'), boardId: id, principalId: id, audit }).strict(),
]);
export function readCoordinationConfigurationFile(path: string): unknown {
  const fd = openSync(path, 'r');
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > 65536) throw new Error('COORDINATION_CONFIGURATION_LIMIT');
    const bytes = Buffer.alloc(65537); let size = 0;
    while (size < bytes.length) {
      const received = readSync(fd, bytes, size, bytes.length - size, null);
      if (received === 0) break;
      size += received;
    }
    if (size > 65536) throw new Error('COORDINATION_CONFIGURATION_LIMIT');
    return coordinationConfiguration.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, size))));
  } finally { closeSync(fd); }
}
/** Operator database administration only. Never called by an HTTP command or agent worker. */
export async function configureCoordination(db: TerminalDatabase, input: unknown) {
  const config = coordinationConfiguration.parse(input);
  switch (config.operation) {
    case 'create-board': return bootstrapBoard(db, config, config.audit);
    case 'grant-member': return grantMember(db, config.boardId, config.member, config.audit);
    case 'revoke-member': await revokeMember(db, config.boardId, config.principalId, config.audit); return { revoked: true };
  }
}
