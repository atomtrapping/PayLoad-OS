/**
 * The little the shell needs to know about the notation draft, kept apart
 * from the draft itself.
 *
 * The draft controller (in NotationWorkspace.tsx) is a 44 KB module: the
 * state machine, the kernel client, the forms and the inspector. It used to
 * be imported by the root layout so that its provider could live above every
 * route, which put that module in the client bundle of all 46 routes for the
 * sake of one marker on the rail. This module is what the root imports
 * instead: two stores of a few lines each, read with useSyncExternalStore.
 *
 * - The status store carries what the rail shows: whether unsaved work
 *   exists and how much. The controller publishes into it; the rail reads
 *   it on every route without loading the controller.
 * - The wanted flag is how the workspace asks the root host to mount the
 *   controller. Once mounted it stays for the life of the document, so the
 *   draft, the selection and a request in flight survive navigation exactly
 *   as they did when the provider was a static ancestor.
 *
 * On a hard load of another route the status is null, as it was before: the
 * controller only learns what is stored in this tab when the workspace first
 * loads, and nothing here pretends to know earlier.
 */
import { useSyncExternalStore } from 'react';

export type InFlight = 'load' | 'preview' | 'save' | 'reload' | null;
export type DraftStatus = { unsaved: boolean; pendingCount: number; textCount: number; inFlight: InFlight };

export function createStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next: T) => {
      if (Object.is(next, value)) return;
      value = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

const status = createStore<DraftStatus | null>(null);
const wanted = createStore(false);
const noStatus = () => null;
const notWanted = () => false;

/** The controller publishes after each render; the store changes only when a field does, so the rail is not redrawn per keystroke. */
export function publishDraftStatus(next: DraftStatus | null) {
  const current = status.get();
  if (current && next && current.unsaved === next.unsaved && current.pendingCount === next.pendingCount && current.textCount === next.textCount && current.inFlight === next.inFlight) return;
  status.set(next);
}

/** What the rest of the shell may know about the draft: whether unsaved work exists, and how much. Null until the controller has loaded in this document. */
export function useNotationDraftStatus(): DraftStatus | null {
  return useSyncExternalStore(status.subscribe, status.get, noStatus);
}

/** The workspace asks for the controller; the root host answers by mounting it, once, for the life of the document. */
export function requestDraftController() { wanted.set(true); }
export function useDraftControllerWanted(): boolean {
  return useSyncExternalStore(wanted.subscribe, wanted.get, notWanted);
}
