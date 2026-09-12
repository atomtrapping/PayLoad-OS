import { ZodError } from 'zod';
import { readBoundedBody } from '@/http/boundedBody';
import { authenticateTerminal } from './auth';
import { TerminalError, refuse, TERMINAL_PROTOCOL } from './contracts';
import type { TerminalService } from './service';

const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-payload-protocol': TERMINAL_PROTOCOL };
export async function terminalHttp(request: Request, service: () => Promise<TerminalService>): Promise<Response> {
  try {
    if (request.method !== 'POST') return new Response(JSON.stringify({ protocol: TERMINAL_PROTOCOL, error: 'METHOD_NOT_ALLOWED' }), { status: 405, headers: { ...headers, allow: 'POST' } });
    const who = authenticateTerminal(request);
    if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') ?? '')) refuse('JSON_REQUIRED', 415);
    const origin = request.headers.get('origin');
    if (origin !== null && origin !== new URL(request.url).origin) refuse('ORIGIN_REFUSED', 403);
    if (!request.body) refuse('JSON_REQUIRED', 400);
    const bytes = await readBoundedBody(request.body, 65_536, () => refuse('BODY_TOO_LARGE', 413), { timeoutMs: 10_000, signal: request.signal });
    let value: unknown;
    try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { return refuse('JSON_INVALID', 400); }
    const result = await (await service()).command(who, value);
    const body = JSON.stringify({ protocol: TERMINAL_PROTOCOL, result });
    if (Buffer.byteLength(body) > 1_100_000) refuse('RESPONSE_LIMIT', 413);
    return new Response(body, { status: 200, headers });
  } catch (error) {
    const code = error instanceof TerminalError ? error.code : error instanceof ZodError ? 'COMMAND_INVALID'
      : error instanceof Error && ['BODY_READ_TIMEOUT','BODY_READ_ABORTED'].includes(error.message) ? error.message : 'TERMINAL_UNAVAILABLE';
    const status = error instanceof TerminalError ? error.status : error instanceof ZodError ? 400 : code === 'BODY_READ_TIMEOUT' ? 408 : code === 'BODY_READ_ABORTED' ? 400 : 503;
    return new Response(JSON.stringify({ protocol: TERMINAL_PROTOCOL, error: code }), { status, headers });
  }
}
