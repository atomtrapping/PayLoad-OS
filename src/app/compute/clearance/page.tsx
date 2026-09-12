import type { Metadata } from 'next';
import { ClearanceInspector } from '@/components/compute/ClearanceInspector';
import { buildClearancePreview } from '@/compute/clearance-demo';

export const metadata: Metadata = { title: 'Clearance measurement design' };

/** Pure synthetic preview: no retained acquisitions, operator histories or provider calls. */
export default function ClearancePage() {
  const preview = buildClearancePreview();
  // Identifiers and digests cross to the browser; contents are read from the preview route on request and verified against these digests there.
  return <ClearanceInspector mode={preview.mode} manifest={preview.manifest} result={preview.result} artifacts={preview.artifacts.map(({ id, contentDigest }) => ({ id, contentDigest }))} />;
}
