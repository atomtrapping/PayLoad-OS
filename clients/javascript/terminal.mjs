/** Independent terminal client: only the versioned HTTP contract, no application imports. */
export async function terminalCall({ origin, token, command, signal }) {
  const url = new URL(origin);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
    !(url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname)))) throw new Error('TERMINAL_ORIGIN_REFUSED');
  const response = await fetch(new URL('/api/v1/terminal', url), {
    method: 'POST', redirect: 'error', signal: AbortSignal.any([AbortSignal.timeout(15000), ...(signal ? [signal] : [])]),
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(command),
  });
  if (!response.body) throw new Error('TERMINAL_EMPTY_RESPONSE');
  const reader = response.body.getReader();
  const buffer = new Uint8Array(1_100_000); let size = 0;
  try {
    for (;;) { const part = await reader.read(); if (part.done) break;
      if (size + part.value.length > buffer.length) { void reader.cancel().catch(() => {}); throw new Error('TERMINAL_RESPONSE_LIMIT'); }
      buffer.set(part.value, size); size += part.value.length;
    }
  } finally { reader.releaseLock(); }
  const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0,size)));
  if (!response.ok) throw new Error(body.error ?? 'TERMINAL_REFUSED');
  if (body.protocol !== 'payload.terminal.v1') throw new Error('TERMINAL_PROTOCOL_MISMATCH');
  return body.result;
}
