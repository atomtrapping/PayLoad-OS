import { NextResponse, type NextRequest } from 'next/server';
import { AccessError } from './access/config';
import { authenticateProxyRequest, isTerminalApiRequest } from './access/request';
import { TerminalError, TERMINAL_PROTOCOL } from './terminal/contracts';

const privateHeaders = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Pragma': 'no-cache',
  'Vary': 'Authorization',
};

/** All paths, including assets, RSC/data requests and APIs: internal mode has no public bypass. */
export function proxy(request: NextRequest) {
  try {
    const identity = authenticateProxyRequest(request);
    return NextResponse.next(identity ? { headers: privateHeaders } : undefined);
  } catch (error) {
    if (isTerminalApiRequest(request)) {
      const failure = error instanceof TerminalError || error instanceof AccessError ? error : new AccessError('ACCESS_CONFIGURATION_INVALID', 503);
      return NextResponse.json({ protocol: TERMINAL_PROTOCOL, error: failure.code }, {
        status: failure.status,
        headers: { ...privateHeaders, 'X-Payload-Protocol': TERMINAL_PROTOCOL,
          ...(failure.status === 401 ? { 'WWW-Authenticate': 'Bearer realm="Payload terminal"' } : {}) },
      });
    }
    const failure = error instanceof AccessError ? error : new AccessError('ACCESS_CONFIGURATION_INVALID', 503);
    return NextResponse.json({ error: { code: failure.code, message: failure.message } }, {
      status: failure.status,
      headers: { ...privateHeaders, ...(failure.status === 401 ? { 'WWW-Authenticate': 'Basic realm="Payload internal", charset="UTF-8"' } : {}) },
    });
  }
}

export const config = { matcher: '/:path*' };
