import type { AuthenticatedTerminal } from '@/terminal/auth';
import { assertAuthenticated } from '@/terminal/auth';
import { commitment, refuse, TerminalError } from '@/terminal/contracts';
import type { TerminalDatabase } from '@/terminal/database';
import type { TerminalService } from '@/terminal/service';
import { applyCommand, connectionsFor } from './ledger';
import { coordinationCommand } from './contracts';
import { withCoordinationBoard, type CoordinationBoard, type PersistentBoardMessage } from './database';
import { validateTerminalLink } from './terminalLinks';

/** Board state never grants terminal authority, claims work, or marks a job complete. */
export class CoordinationService {
  constructor(private readonly db: TerminalDatabase, private readonly terminal: Pick<TerminalService, 'getJob' | 'result'>) {}

  async command(who: AuthenticatedTerminal, input: unknown): Promise<unknown> {
    assertAuthenticated(who);
    const command = coordinationCommand.parse(input);
    const within = <T>(work: Parameters<typeof withCoordinationBoard<T>>[3]) =>
      withCoordinationBoard(this.db, who, command.boardId, work);
    const inspect = async (board: CoordinationBoard, message: PersistentBoardMessage) => ({
      message, linkedJob: message.link ? await validateTerminalLink(this.terminal, who, board, message.link) : null,
    });

    if (command.operation === 'identity') return within(async tx => ({
      schema: 'payload.coordination.identity.v1', mode: 'AUTHENTICATED', board: tx.board,
      identity: { principalId: who.principalId, terminalId: who.terminalId, participantId: tx.member.participantId },
      participant: await tx.participant(tx.member.participantId) ?? null,
    }));
    if (command.operation === 'stable') return within(async tx => {
      const participants = await tx.participants();
      const connections = connectionsFor({ schema: 'payload.coordination.v1', participants, messages: [], acknowledgements: [] }, command.boardId);
      const result = { schema: 'payload.coordination.stable.v1', participants, connections: [] as typeof connections, connectionsTruncated: false };
      let bytes = Buffer.byteLength(JSON.stringify(result));
      for (const connection of connections) {
        const size = Buffer.byteLength(JSON.stringify(connection)) + 1;
        if (result.connections.length === 200 || bytes + size > 950_000) { result.connectionsTruncated = true; break; }
        result.connections.push(connection); bytes += size;
      }
      return result;
    });
    if (command.operation === 'register') return within(async tx => {
      // Reuse the local module's semantic declaration validator, without importing its seed/history.
      const declaration = { ...command.definition, id: tx.member.participantId, scope: tx.board.boardId, domains: [tx.board.domain] };
      const validated = applyCommand({ schema: 'payload.coordination.v1', participants: [], messages: [], acknowledgements: [] },
        tx.board.boardId, { operation: 'register', participant: declaration }, []).participants[0];
      return { participant: await tx.register(validated) };
    });
    if (command.operation === 'inbox') {
      const selected = await within(async tx => ({ board: tx.board, page: await tx.inbox(command) }));
      const messages = [];
      let withheld = 0;
      let bytes = 30_000; // Reserve metadata and at most 50 bounded ACKs.
      let consumed = command.afterSequence;
      let nextSequence = selected.page.nextSequence, hasMore = selected.page.hasMore;
      for (const message of selected.page.messages) {
        try {
          const entry = await inspect(selected.board, message);
          const size = Buffer.byteLength(JSON.stringify(entry)) + 1;
          if (bytes + size > 950_000) {
            if (consumed === command.afterSequence) refuse('COORDINATION_RESPONSE_LIMIT', 413);
            nextSequence = consumed; hasMore = true; break;
          }
          messages.push(entry); bytes += size; consumed = message.sequence;
        }
        catch (error) {
          // A board grant must not become another member's job or result read grant.
          if (error instanceof TerminalError && [403, 404].includes(error.status)) { withheld++; consumed = message.sequence; continue; }
          throw error;
        }
      }
      const visible = new Set(messages.map(item => item.message.id));
      await within(async () => undefined); // Recheck expiry/membership after potentially slow result verification.
      return { schema: 'payload.coordination.inbox.v1', ...selected.page, messages, withheld, nextSequence, hasMore,
        acknowledgements: selected.page.acknowledgements.filter(item => visible.has(item.messageId)) };
    }
    if (command.operation === 'message' || command.operation === 'acknowledge') {
      const selected = await within(async tx => ({ board: tx.board, message: await tx.message(command.messageId) }));
      if (!selected.message) refuse('RESOURCE_NOT_AVAILABLE', 404);
      const inspected = await inspect(selected.board, selected.message);
      if (command.operation === 'message') { await within(async () => undefined); return inspected; }
      if (selected.message.digest !== command.expectedDigest) refuse('COORDINATION_MESSAGE_DIGEST_MISMATCH');
      return within(async tx => ({ acknowledgement: await tx.acknowledge(command.messageId) }));
    }

    const board = await within(async tx => tx.board);
    const linkedJob = command.message.link ? await validateTerminalLink(this.terminal, who, board, command.message.link) : null;
    const message = await within(async tx => {
      if (!await tx.participant(tx.member.participantId)) refuse('COORDINATION_REGISTRATION_REQUIRED', 409);
      if (command.message.recipientId && !await tx.participant(command.message.recipientId)) refuse('RESOURCE_NOT_AVAILABLE', 404);
      if (command.message.kind === 'HANDOFF' && (!command.message.recipientId || command.message.recipientId === tx.member.participantId)) refuse('COORDINATION_HANDOFF_INVALID', 400);
      if (command.message.replyTo) {
        const parent = await tx.message(command.message.replyTo);
        if (!parent) refuse('RESOURCE_NOT_AVAILABLE', 404);
        if (parent.topic !== command.message.topic || commitment(parent.link) !== commitment(command.message.link)) refuse('COORDINATION_THREAD_BINDING_MISMATCH');
        // Replies to a directed thread cannot disclose it to a third participant or broadcast.
        if (parent.recipientId && ![parent.authorId, parent.recipientId].includes(command.message.recipientId ?? '')) refuse('COORDINATION_THREAD_RECIPIENT_REFUSED', 403);
      }
      return tx.appendMessage(command.message);
    });
    return { message, linkedJob };
  }
}
