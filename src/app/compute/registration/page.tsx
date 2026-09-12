import type { Metadata } from 'next';
import { RegistrationAccessInspector } from '@/components/compute/RegistrationAccessInspector';
import { buildRegistrationAccessPreview } from '@/compute/registration-access-demo';

export const metadata: Metadata = { title: 'Registration and access' };

/** Pure synthetic preview: no retained acquisitions, operator histories or provider calls. */
export default function RegistrationAccessPage() {
  const preview = buildRegistrationAccessPreview();
  // Identifiers and digests cross to the browser; contents are read from the preview route on request and verified against these digests there.
  return <RegistrationAccessInspector mode={preview.mode} manifest={preview.manifest} result={preview.result} artifacts={preview.artifacts.map(({ id, contentDigest }) => ({ id, contentDigest }))} />;
}
