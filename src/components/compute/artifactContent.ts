'use client';

import { useEffect, useState } from 'react';
import { localRecordDigest } from '@/data-os/local-json';

/**
 * A synthetic preview artifact's contents, read when the operator asks and
 * shown only if they digest to what the manifest names.
 *
 * The inspectors used to receive every artifact's contents as props. They
 * receive identifiers and digests now; the contents come from a route that
 * rebuilds the same in-memory preview, and are held to the manifest's exact
 * content digest here, in the browser, before anything is drawn. A served
 * body that digests to something else is refused and the digests are shown
 * side by side, which is the rule the inspectors state in words.
 */
export type ArtifactContent =
  | { state: 'IDLE' }
  | { state: 'READING' }
  | { state: 'MATCH'; content: unknown }
  | { state: 'MISMATCH'; served: string; expected: string }
  | { state: 'UNAVAILABLE'; reason: string };

export function useArtifactContent(route: string | null, expectedDigest: string | null, wanted: boolean, maxBytes: number): ArtifactContent {
  // What was last read, keyed by route and digest; a read in flight is not
  // stored, it is derived: asked for and not yet held is READING.
  const [held, setHeld] = useState<{ key: string; value: ArtifactContent }>({ key: '', value: { state: 'IDLE' } });
  const key = route && expectedDigest ? `${route}|${expectedDigest}` : '';
  const settled = held.key === key;
  useEffect(() => {
    if (!wanted || !key || settled) return;
    let cancelled = false;
    (async () => {
      let value: ArtifactContent;
      try {
        const response = await fetch(route!, { cache: 'no-store' });
        if (!response.ok) value = { state: 'UNAVAILABLE', reason: `The preview route answered ${response.status}.` };
        else {
          const body = await response.json() as { content?: unknown };
          const served = localRecordDigest(body.content, maxBytes);
          value = served === expectedDigest ? { state: 'MATCH', content: body.content } : { state: 'MISMATCH', served, expected: expectedDigest! };
        }
      } catch (failure) {
        value = { state: 'UNAVAILABLE', reason: failure instanceof Error ? failure.message : 'The preview route could not be read.' };
      }
      if (!cancelled) setHeld({ key, value });
    })();
    return () => { cancelled = true; };
  }, [wanted, key, settled, route, expectedDigest, maxBytes]);
  if (settled) return held.value;
  return wanted && key ? { state: 'READING' } : { state: 'IDLE' };
}
