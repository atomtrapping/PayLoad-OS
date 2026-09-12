/**
 * NotationsOS — MCP server (stdio).
 *
 *   npm run mcp
 *
 * Exposes the feed as MCP tools over the committed demonstration corpus.
 * Stdio transport: this opens no port. Every payload carries
 * fixture_only: true, as the HTTP feed does.
 *
 * THE SERVER IS A TERMINAL, AND IT SAYS SO
 *
 * Every call goes through `./serve.ts`, which admits or refuses it against a
 * declared session. Stdio is a local operator's console, so this process opens
 * one FIRM_INTERNAL session for internal research over the corpora the source
 * actually holds, and declares it in the log rather than assuming it. A
 * customer's terminal is a different session with a different class, purpose
 * and scope, and it is refused the things that class may not ask — which is
 * the point of routing even the operator's own calls through the same door.
 *
 * The session's identity is asserted by this process, not authenticated.
 * `@/domain/terminalPlane` says so in as many words, and binding an identity
 * to a credential is a separate, later thing.
 */
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { TerminalSession } from '@/domain/terminalPlane';
import { getCorpusSource } from '@/adapter/corpusSource';
import { MCP_TOOLS } from './tools';
import { serveToolCall } from './serve';

const server = new McpServer({ name: 'payload-os', version: '0.1.0' });

/** The operator's own console, declared: internal research over what this source holds. */
async function operatorSession(): Promise<TerminalSession> {
  const openedAt = new Date().toISOString();
  const releases = await getCorpusSource().listReleases();
  const corpusScope = [...new Set(releases.map((release) => release.corpusId))].sort();
  return {
    sessionId: `TS-${randomUUID()}`,
    terminalId: 'terminal:payload-os-stdio',
    terminalClass: 'FIRM_INTERNAL',
    purpose: 'internal_research',
    corpusScope,
    openedAt,
    /* A local console session stands for a working day and is then re-declared. */
    expiresAt: new Date(Date.parse(openedAt) + 12 * 60 * 60 * 1000).toISOString(),
  };
}

async function main() {
  const session = await operatorSession();
  console.error(`payload-os: ${session.terminalId} as ${session.terminalClass} for ${session.purpose} over ${session.corpusScope.join(', ') || 'no corpus'} until ${session.expiresAt}`);

  for (const tool of MCP_TOOLS) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.shape },
      async (args: Record<string, unknown>) => {
        try {
          const served = await serveToolCall(session, tool.name, args, new Date().toISOString());
          const body = served.refusal ?? served.result;
          return { content: [{ type: 'text' as const, text: JSON.stringify({ receipt: served.receipt, ...(served.refusal ? { refusal: served.refusal } : { result: body }) }, null, 2) }] };
        } catch (e) {
          return { content: [{ type: 'text' as const, text: `ERROR: ${e instanceof Error ? e.message : String(e)}` }], isError: true };
        }
      },
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
