import { describe, expect, it } from 'vitest';
import { buildClearancePreview } from '@/compute/clearance-demo';
import { localRecordDigest } from '@/data-os/local-json';
import { MAX_CLEARANCE_MANIFEST_BYTES } from '@/compute/limits';
import { GET } from './route';

const get = (id: string) => GET(new Request(`http://127.0.0.1:3000/api/compute/clearance/artifacts/${encodeURIComponent(id)}`), { params: Promise.resolve({ id }) });

describe('GET /api/compute/clearance/artifacts/[id]', () => {
  it('serves each preview artifact under the digest the manifest names, and the browser-side digest agrees', async () => {
    for (const artifact of buildClearancePreview().artifacts) {
      const response = await get(artifact.id);
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      const body = await response.json() as { id: string; contentDigest: string; content: unknown; retained: boolean; mode: string };
      expect(body.mode).toBe('IN_MEMORY_SYNTHETIC_PREVIEW_NOT_RETAINED');
      expect(body.retained).toBe(false);
      expect(body.id).toBe(artifact.id);
      expect(body.contentDigest).toBe(artifact.contentDigest);
      expect(localRecordDigest(body.content, MAX_CLEARANCE_MANIFEST_BYTES)).toBe(artifact.contentDigest);
    }
  });

  it('answers 404 for an identifier the preview does not hold', async () => {
    const response = await get('not-a-preview-artifact');
    expect(response.status).toBe(404);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe('PREVIEW_ARTIFACT_NOT_FOUND');
  });
});
