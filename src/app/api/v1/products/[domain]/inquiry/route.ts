import type { NextRequest } from 'next/server';
import { json, refusal } from '../../../_lib';
import { loadProductWorkspace } from '@/adapter/productWorkspace';
import { ProductWorkspaceError, type WorkspaceParams } from '@/domain/productWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest, context: { params: Promise<{ domain: string }> }) {
  const { domain } = await context.params;
  if (domain !== 'landshark' && domain !== 'tradewind') {
    return refusal(404, 'UNKNOWN_PRODUCT', `No product desk is served at ${domain}.`, 'Ask for landshark or tradewind.');
  }
  const params: WorkspaceParams = Object.create(null);
  for (const key of request.nextUrl.searchParams.keys()) {
    const values = request.nextUrl.searchParams.getAll(key);
    params[key] = values.length > 1 ? values : values[0];
  }
  try {
    const result = await loadProductWorkspace(domain === 'landshark' ? 'LANDSHARK' : 'TRADEWIND', params);
    // Through the feed's envelope like every other v1 route: a desk that
    // serves the corpus operationally is exactly where a client must not be
    // able to mistake a fixture for an admitted record.
    return json(result);
  } catch (error) {
    return error instanceof ProductWorkspaceError
      ? refusal(400, error.code, 'The inquiry could not be read as asked.', 'Check the release, subject and instant parameters against /api.')
      : refusal(503, 'READ_UNAVAILABLE', 'The corpus could not be read for this desk.', 'Retry; if it persists the configured corpus store is unreachable.');
  }
}
