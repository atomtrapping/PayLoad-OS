'use client';

import { useSyncExternalStore } from 'react';

const subscribeToNothing = () => () => {};
/** True once React is running in the browser; false in the server render and during hydration, so both agree. */
export function useIsClient(): boolean {
  return useSyncExternalStore(subscribeToNothing, () => true, () => false);
}

/**
 * A pretty-printed JSON block drawn in the browser, not in the server render.
 *
 * The compute inspectors print manifests, results and artifacts as JSON
 * inside disclosures. Server-rendered, those blocks were 142 KB of the
 * clearance page's markup for objects that were already crossing to the
 * client as the inspector's props. Drawn after hydration from those props,
 * the markup carries none of it and the DOM holds all of it, so the
 * disclosure, overflow and accessibility checks still see every block.
 */
export function ClientJson({ value, className = 'm-0 p-3 text-[11px] whitespace-pre-wrap break-words [overflow-wrap:anywhere] min-w-0 rounded', style = { background: 'var(--bg-inset)' } }: { value: unknown; className?: string; style?: React.CSSProperties }) {
  const client = useIsClient();
  if (!client) return null;
  return <pre className={className} style={style}>{JSON.stringify(value, null, 2)}</pre>;
}
