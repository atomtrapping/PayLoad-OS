import { NextResponse } from 'next/server';
import { requireLocalRequest } from '../coordination/http';
import { CoordinationError } from '../coordination/ledger';
import { StateKernelError } from './errors';
import { MAX_KERNEL_INPUT_BYTES } from './runtime';
import { stateKernelEnabled } from './store';
import { readBoundedBody } from '@/http/boundedBody';

export function stateJson(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Notation-State': 'local-development-v1' } });
}
export function stateError(error: unknown) {
  const failure = error instanceof StateKernelError ? error :
    new StateKernelError('LOCAL_STATE_UNAVAILABLE', 'Local notation storage is unavailable. Save is not confirmed; retain the draft and retry the identical batch.', 503);
  return stateJson({ error: { code: failure.code, message: failure.message } }, failure.status);
}
export function requireStateRequest(request: Request, writing = false) {
  if (writing && !stateKernelEnabled()) throw new StateKernelError('READ_ONLY', 'Start npm run dev:state-kernel to enable the local notation workspace.', 403);
  // The rail keeps one code for this refusal, which is its contract; what it
  // no longer does is throw away what the guard actually found. A relayed
  // request and a wrong origin are different problems with different remedies,
  // and a 403 saying only "same loopback origin" when the real answer was "a
  // proxy header named somewhere else" costs an operator an afternoon of
  // looking in the wrong place — which it did.
  try { requireLocalRequest(request); }
  catch (error) {
    const because = error instanceof CoordinationError ? ` ${error.code}: ${error.message}` : '';
    throw new StateKernelError('LOCAL_ONLY', `Use the notation workspace from the same loopback origin.${because}`, 403);
  }
}
export async function readStateRequest(request: Request): Promise<unknown> {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new StateKernelError('INVALID_CONTENT_TYPE', 'Send application/json.', 415);
  }
  if (!request.body) throw new StateKernelError('INVALID_REQUEST', 'A command batch is required.');
  const bytes = await readBoundedBody(request.body, MAX_KERNEL_INPUT_BYTES, () => {
    throw new StateKernelError('BODY_TOO_LARGE', 'Command batches are limited to 2 MiB.', 413);
  });
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new StateKernelError('INVALID_REQUEST', 'The command batch must be valid UTF-8 JSON.'); }
}
