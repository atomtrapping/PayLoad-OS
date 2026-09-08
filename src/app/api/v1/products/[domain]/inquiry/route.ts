import type { NextRequest } from 'next/server';
import { loadProductWorkspace } from '@/adapter/productWorkspace';
import { ProductWorkspaceError, type WorkspaceParams } from '@/domain/productWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest, context: { params: Promise<{ domain: string }> }) {
  const { domain } = await context.params;
  if (domain !== 'landshark' && domain !== 'tradewind') return Response.json({ error: 'UNKNOWN_PRODUCT' }, { status: 404 });
  const params: WorkspaceParams = Object.create(null);
  for (const key of request.nextUrl.searchParams.keys()) {
    const values = request.nextUrl.searchParams.getAll(key);
    params[key] = values.length > 1 ? values : values[0];
  }
  try {
    const result = await loadProductWorkspace(domain === 'landshark' ? 'LANDSHARK' : 'TRADEWIND', params);
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof ProductWorkspaceError ? error.code : 'READ_UNAVAILABLE' }, { status: error instanceof ProductWorkspaceError ? 400 : 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
