'use client';

import dynamic from 'next/dynamic';
import { useDraftControllerWanted } from './draftStatus';

/**
 * The draft controller's seat at the root of the document.
 *
 * Rendered by the root layout on every route, and empty on all of them until
 * the notation workspace asks for the controller. Then the controller's
 * module is loaded (on /notations its chunk is already in the page's bundle;
 * the dynamic import fetches only its 5 KB facade) and its provider mounts
 * here, beside the routes, where it stays: navigating away and back finds
 * the draft, the selection, the pending commands and any request in flight
 * where they were. The other forty-five routes carry this component and the
 * status store, and not the editor. Each controller update is two commits,
 * the provider's and then the workspace's through the store, both before
 * paint; the context it replaces did it in one, and the difference has not
 * been measurable.
 */
const NotationDraftProvider = dynamic(() => import('./NotationWorkspace').then((module) => ({ default: module.NotationDraftProvider })), { ssr: false });

export function NotationDraftHost() {
  const wanted = useDraftControllerWanted();
  return wanted ? <NotationDraftProvider /> : null;
}
