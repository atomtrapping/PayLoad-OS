'use client';

import { ClientJson } from '@/components/primitives/ClientJson';
import { useArtifactContent } from './artifactContent';

/** The states of a read artifact, each named on the surface; the contents are drawn only on a digest match. */
export function ArtifactContents({ route, expectedDigest, wanted, maxBytes, testId }: { route: string; expectedDigest: string; wanted: boolean; maxBytes: number; testId: string }) {
  const held = useArtifactContent(route, expectedDigest, wanted, maxBytes);
  const muted = { color: 'var(--text-secondary)' };
  if (held.state === 'IDLE' || held.state === 'READING') return <p className="m-0" style={muted} data-testid={`${testId}-reading`}>Reading the synthetic preview artifact from this process. Nothing is fetched from a provider and nothing is retained.</p>;
  if (held.state === 'MISMATCH') return <p className="m-0" style={{ color: 'var(--status-refused)' }} data-testid={`${testId}-refused`}>Not shown: the served contents digest to <span className="mono break-all">{held.served}</span>, and the manifest names <span className="mono break-all">{held.expected}</span>. Contents that do not match the manifest’s exact digest are not substituted.</p>;
  if (held.state === 'UNAVAILABLE') return <p className="m-0" style={muted} data-testid={`${testId}-unavailable`}>The artifact could not be read: {held.reason}</p>;
  return <div data-testid={testId} className="min-w-0"><ClientJson value={held.content} /></div>;
}
