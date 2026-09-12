import { NextResponse } from 'next/server';
import { buildClearancePreview } from '@/compute/clearance-demo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * One synthetic preview artifact of the clearance experiment, by identifier.
 * The preview is rebuilt in memory for every read, so the digest the route
 * answers with is the one the manifest names; nothing is fetched, retained
 * or admitted. The inspector holds the served contents to the manifest's
 * digest again in the browser before drawing them.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const artifact = buildClearancePreview().artifacts.find((candidate) => candidate.id === id);
  if (!artifact) return NextResponse.json({ schema: 'payload.synthetic-preview-artifact.v1', mode: 'IN_MEMORY_SYNTHETIC_PREVIEW_NOT_RETAINED', error: { code: 'PREVIEW_ARTIFACT_NOT_FOUND', message: 'No synthetic preview artifact has this identifier.' } }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  return NextResponse.json({ schema: 'payload.synthetic-preview-artifact.v1', mode: 'IN_MEMORY_SYNTHETIC_PREVIEW_NOT_RETAINED', id: artifact.id, contentDigest: artifact.contentDigest, content: artifact.content, retained: false, canonicalAdmission: false }, { headers: { 'Cache-Control': 'no-store' } });
}
