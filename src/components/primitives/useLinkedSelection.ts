'use client';

import { useEffect, useRef } from 'react';
import { formatHash, readHash } from '@/lib/hashSelection';

/**
 * Make a surface's selection addressable: written into the URL as it changes,
 * and read back when a link is pasted into the bar this page is already in.
 *
 * An inspector that opens on a row and cannot be linked is half an inspector —
 * the reader can see the thing and cannot say which thing they saw. Every
 * surface here already knows what it has selected; this is the part that makes
 * it something you can send.
 *
 * THE HASH, AND REPLACE RATHER THAN PUSH
 *
 * A hash is a client fact: writing one re-runs no server component, so moving
 * down a register costs nothing and the server render never depends on which
 * row a particular reader had open. And the history is replaced, not pushed —
 * six selections would otherwise put six entries in the back button, and Back
 * would stop meaning "the page before this one", which is the one thing it has
 * to mean. A selection is where you are in a page, not a page.
 *
 * WHAT THE SURFACE STILL DECIDES
 *
 * Everything about which selections exist. This writes what it is given and
 * reports what it reads; a URL naming something the page does not hold is the
 * page's to refuse, because only the page knows what it holds. And it writes
 * nothing until `ready` — a surface whose data has not arrived selects nothing
 * yet, and would otherwise erase the link it was opened with before reading it.
 */
export function useLinkedSelection(
  selection: Readonly<Record<string, string | null>>,
  onLinked: (values: Readonly<Record<string, string>>) => void,
  ready: boolean,
): void {
  const hash = formatHash(selection);
  // The callback is re-made every render and the subscription must not be, so
  // the latest one is kept in a ref — written after the commit, because a ref
  // read or written during render is a value React has not been told about.
  const linked = useRef(onLinked);
  useEffect(() => { linked.current = onLinked; });

  useEffect(() => {
    if (!ready) return;
    const { pathname, search } = window.location;
    window.history.replaceState(null, '', hash === '' ? `${pathname}${search}` : `${pathname}${search}#${hash}`);
  }, [hash, ready]);

  useEffect(() => {
    // A link pasted into this page's own address bar is a selection too. It
    // arrives as an event rather than as a render, which is why this is a
    // subscription and not a read.
    const onHashChange = () => linked.current(Object.fromEntries(readHash(window.location.hash)));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
}

/** What the URL named when this document was opened. Empty on the server, which has no URL fragment. */
export const openedWith = (): Readonly<Record<string, string>> =>
  (typeof window === 'undefined' ? {} : Object.fromEntries(readHash(window.location.hash)));
