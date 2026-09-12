import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthenticatedCoordinationClient } from '../../clients/javascript/coordination.mjs';
import { coordinationCommand } from './contracts';
import { coordinationConfiguration } from './admin';
import { terminalHttp } from '@/terminal/http';
import { tokenDigest, type AuthenticatedTerminal } from '@/terminal/auth';
import type { TerminalService } from '@/terminal/service';

const token = 'a'.repeat(48);
const client = () => new AuthenticatedCoordinationClient({ origin: 'http://127.0.0.1:3000', token, boardId: 'board-one' });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe('authenticated board clients and operation boundary', () => {
  it('uses the terminal endpoint, server-bound board and explicit digest ACK, never author/ACK selectors', async () => {
    const transport = vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify({ protocol: 'payload.terminal.v1', result: { accepted: true } })));
    vi.stubGlobal('fetch', transport);
    const instance = client();
    await instance.identity(); await instance.inbox({ limit: 2 }); await instance.acknowledge('MSG-one', `sha256:${'b'.repeat(64)}`);
    for (const [url, options] of transport.mock.calls) {
      expect(String(url)).toBe('http://127.0.0.1:3000/api/v1/terminal');
      expect(options?.redirect).toBe('error');
      expect(options?.headers).toEqual({ authorization: `Bearer ${token}`, 'content-type': 'application/json' });
      const body = JSON.parse(String(options?.body));
      expect(body.command).toBe('coordination');
      expect(body.request.boardId).toBe('board-one');
      expect(coordinationCommand.safeParse(body.request).success).toBe(true);
      expect(body.request).not.toHaveProperty('participantId');
    }
    instance.forget(); expect(() => instance.identity()).toThrow('AUTHENTICATION_REQUIRED');
    expect(transport).toHaveBeenCalledTimes(3);
  });
  it('does not automatically repeat an uncertain post', async () => {
    const transport = vi.fn().mockRejectedValue(new Error('connection lost')); vi.stubGlobal('fetch', transport);
    await expect(client().post({ requestId: 'fixed-request' })).rejects.toThrow('connection lost');
    expect(transport).toHaveBeenCalledOnce();
  });
  it('refuses caller-selected identities and operator configuration in terminal request vocabulary', () => {
    for (const operation of [
      { operation: 'identity', principalId: 'admin' },
      { operation: 'inbox', participantId: 'someone-else' },
      { operation: 'acknowledge', messageId: 'm', participantId: 'someone-else', expectedDigest: `sha256:${'a'.repeat(64)}` },
      { operation: 'grant-member', member: {} }, { operation: 'create-board', corpusId: 'x' },
    ]) expect(coordinationCommand.safeParse({ boardId: 'board-one', ...operation }).success).toBe(false);
    expect(coordinationConfiguration.safeParse({ operation: 'grant-member', boardId: 'board-one',
      audit: { actor: 'operator', reason: 'Explicit setup' }, member: { principalId: 'p', participantId: 'x', kind: 'AGENT', displayName: 'A', canReview: true } }).success).toBe(false);
  });
  it('authenticates board commands through the same HTTP Bearer boundary before service access', async () => {
    vi.stubEnv('PAYLOAD_TERMINAL_PRINCIPALS', JSON.stringify([{ principalId: 'PRINCIPAL-A', terminalId: 'TERMINAL-A',
      displayName: 'A', kind: 'AGENT', terminalClass: 'FIRM_INTERNAL', purpose: 'internal_research',
      corpusScope: ['landshark.terminal-parcels'], canReview: false, tokenSha256: tokenDigest(token), expiresAt: '2099-01-01T00:00:00Z' }]));
    const command = vi.fn(async (who: AuthenticatedTerminal, input: unknown) => ({ principalId: who.principalId, input }));
    const service = vi.fn(async () => ({ command }) as unknown as TerminalService);
    const request = (authorization: string) => new Request('http://localhost/api/v1/terminal', { method: 'POST',
      headers: { authorization, 'content-type': 'application/json' }, body: JSON.stringify({ command: 'coordination', request: { operation: 'identity', boardId: 'board-one' } }) });
    expect((await terminalHttp(request('Basic abc'), service)).status).toBe(401); expect(service).not.toHaveBeenCalled();
    const response = await terminalHttp(request(`Bearer ${token}`), service);
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
    expect((await response.json()).result.principalId).toBe('PRINCIPAL-A');
    expect(command.mock.calls[0][0].canReview).toBe(false);
  });
});
