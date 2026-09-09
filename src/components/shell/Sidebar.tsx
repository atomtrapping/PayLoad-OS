'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';
import { DOMAINS } from '@/domain/domains';
import { useNotationDraftStatus } from '@/components/notations/NotationWorkspace';
import { NAV_AREAS, step } from './nav';
import { SHORTCUT_DESCRIPTION, usePlatformKeys } from './platformKeys';

/**
 * Keep the current destination where the reader can see it.
 *
 * The rail is one list in two layouts: a column on a wide screen and a strip on
 * a narrow one. Both overflow — twenty-six destinations across six areas — and
 * the browser restores neither on a soft navigation, so the strip sat at
 * scrollLeft 0 with the current page 2113 pixels off-screen on a 412-pixel
 * viewport. You could not see where you were, and the neighbouring tab was a
 * hand-scroll away.
 *
 * Scrolling is done by setting the container's own scroll offset rather than by
 * `scrollIntoView`, which walks up the ancestors and would move the page as
 * well as the rail. Whichever axis actually overflows is the one that moves.
 */
function keepInView(container: HTMLElement | null, active: HTMLElement | null, smooth = false): void {
  if (!container || !active) return;
  const overflowsX = container.scrollWidth > container.clientWidth + 1;
  const overflowsY = container.scrollHeight > container.clientHeight + 1;
  if (!overflowsX && !overflowsY) return;
  const box = active.getBoundingClientRect();
  const frame = container.getBoundingClientRect();
  // Assigning `scrollLeft` obeys the rail's `scroll-behavior: smooth`, which
  // animates — so placing the current tab on arrival left the rail mid-flight
  // at roughly zero. Arriving is instant; moving under the arrow keys keeps the
  // animation, because there the motion is the feedback.
  const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const behavior: ScrollBehavior = smooth && !reduced ? 'smooth' : 'instant';
  if (overflowsX) {
    const centred = container.scrollLeft + (box.left - frame.left) - (frame.width - box.width) / 2;
    container.scrollTo({ left: Math.max(0, Math.min(centred, container.scrollWidth - container.clientWidth)), behavior });
  }
  if (overflowsY) {
    const above = box.top < frame.top;
    const below = box.bottom > frame.bottom;
    // Vertically, only move when the item is actually out of the frame: a
    // column that re-centred on every navigation would jump under the reader.
    if (above || below) {
      const centred = container.scrollTop + (box.top - frame.top) - (frame.height - box.height) / 2;
      container.scrollTo({ top: Math.max(0, Math.min(centred, container.scrollHeight - container.clientHeight)), behavior });
    }
  }
}

/**
 * The one primary navigation: six activity areas over the existing routes, with
 * the context that never changes here.
 *
 * Twenty-six links used to be twenty-six tab stops, which made the rail
 * something to get past rather than something to move around in. It is now one
 * stop — a roving tabindex, so Tab enters the rail and Tab leaves it — and
 * inside it the arrow keys move: Up and Down because the wide layout is a
 * column, Left and Right because the narrow one is a strip, and both everywhere
 * because the reader should not have to know which layout they are in. Home and
 * End reach the ends. Alt with Left or Right steps to the next destination
 * without opening the rail at all.
 */
export function Sidebar() {
  const pathname = usePathname() ?? '/';
  const router = useRouter();
  const draft = useNotationDraftStatus();
  const sidebar = useRef<HTMLElement>(null);
  const keys = usePlatformKeys();
  const scroller = useRef<HTMLUListElement>(null);

  const links = useCallback(
    () => [...(scroller.current?.querySelectorAll<HTMLAnchorElement>('a.nav-link') ?? [])],
    [],
  );

  const reveal = useCallback((active: HTMLElement | null, smooth = false) => {
    const rail = scroller.current;
    // The narrow strip scrolls horizontally; on desktop its parent owns the
    // vertical scroll, including the section bands and the context footer.
    const container = rail && rail.scrollWidth > rail.clientWidth + 1 ? rail : sidebar.current;
    keepInView(container, active, smooth);
  }, []);

  useEffect(() => {
    reveal(scroller.current?.querySelector<HTMLElement>('a.nav-link[aria-current="page"]') ?? null);
  }, [pathname, reveal]);

  /**
   * Alt+Left / Alt+Right step through the rail in order, from anywhere on the page.
   *
   * The step is taken from the address bar and not from `pathname`, and the
   * difference is not pedantic. `pathname` is read during render; this listener
   * is attached by an effect, which runs a commit later. Between the router
   * writing the new URL and this effect running again, the attached listener
   * still holds the page the reader has already left, and a second press in
   * that window steps from the wrong origin. Measured, on a CPU throttled eight
   * times: /releases, Alt+Right to /retractions, Alt+Left back to /stream —
   * a destination past where the reader started, and no way to tell why.
   *
   * `window.location.pathname` is written synchronously by the push, is what
   * the reader can actually see, and cannot be staler than the render. It also
   * makes this one subscription for the life of the rail rather than one per
   * navigation. No `basePath` is configured; if one is ever added it appears
   * here and not in `usePathname`, and this must strip it.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!event.altKey || event.metaKey || event.ctrlKey) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const next = step(window.location.pathname, event.key === 'ArrowRight' ? 1 : -1);
      if (!next) return;
      event.preventDefault();
      router.push(next.href);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [router]);

  const onRailKey = (event: React.KeyboardEvent) => {
    // Alt is the page-stepping shortcut above; the rail does not also claim it.
    if (event.altKey || event.metaKey || event.ctrlKey) return;
    const moves: Record<string, number> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
    const all = links();
    if (all.length === 0) return;
    const at = all.indexOf(document.activeElement as HTMLAnchorElement);
    if (event.key === 'Home') { event.preventDefault(); all[0].focus(); return; }
    if (event.key === 'End') { event.preventDefault(); all[all.length - 1].focus(); return; }
    const delta = moves[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    const from = at < 0 ? 0 : at;
    const next = (from + delta + all.length) % all.length;
    all[next].focus();
    reveal(all[next], true);
  };

  // Exactly one link is tabbable, so the rail is one stop rather than
  // twenty-six. It is the current page where there is one, and the first
  // destination otherwise, so Tab lands somewhere meaningful either way.
  const currentHref = NAV_AREAS.flatMap((area) => area.items)
    .find((item) => item.match.test(pathname) && !item.href.includes('#'))?.href ?? null;
  const firstHref = NAV_AREAS[0].items[0].href;
  const tabbable = currentHref ?? firstHref;

  return (
    <aside ref={sidebar} className="app-sidebar" aria-label="Navigation and context">
      <div className="nav-index" aria-hidden="true"><span>Workspace index</span><span>{String(NAV_AREAS.length).padStart(2, '0')}</span></div>
      <nav aria-label="Primary">
        <ul className="nav-areas list-none m-0 p-0" ref={scroller} onKeyDown={onRailKey} data-testid="nav-rail">
          {NAV_AREAS.map((area, index) => (
            <li key={area.id} className="nav-area" data-area={area.id}>
              <div className="nav-area-head" title={area.activity}>
                <span className="label-sm"><span className="nav-area-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>{area.label}</span>
                <span className="nav-area-activity">{area.activity}</span>
              </div>
              <ul className="nav-links" aria-label={area.label}>
                {area.items.map((item) => {
                  const active = item.match.test(pathname) && !item.href.includes('#');
                  return (
                    <li key={item.href} className="flex items-center gap-1">
                      <Link
                        href={item.href}
                        className="nav-link"
                        aria-current={active ? 'page' : undefined}
                        tabIndex={item.href === tabbable ? 0 : -1}
                      >{item.label}</Link>
                      {item.href === '/notations' && draft?.unsaved && <span className="nav-mark" data-testid="nav-draft-marker" title={`Unsaved notation work kept in this tab: ${draft.pendingCount} validated ${draft.pendingCount === 1 ? 'command' : 'commands'}, ${draft.textCount} ${draft.textCount === 1 ? 'field' : 'fields'} of text`}>draft<span className="sr-only">: unsaved notation work kept in this tab</span></span>}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      </nav>
      {/* The modifiers are named for the keyboard in front of the reader. Both
          until a browser has said which it is, because both work; naming ⌘
          alone to a reader with no ⌘ key is the kind of small untruth this
          terminal refuses everywhere else. */}
      <p className="nav-keys" data-testid="nav-keys" data-platform={keys?.platform ?? 'UNKNOWN'}>
        <span className="sr-only">Keyboard: </span>
        <kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> move in the rail · <kbd>{keys.alt}</kbd>+<kbd>←</kbd>/<kbd>→</kbd> step pages · <kbd>{keys.paletteChord}</kbd> jump
        <span className="sr-only"> {SHORTCUT_DESCRIPTION.step}</span>
      </p>
      <div className="app-context" data-testid="shell-context">
        <span><span className="label-sm">Product lines</span> {DOMAINS.map((domain) => domain.label).join(' / ')}</span>
        <span><span className="label-sm">Data</span> Committed demonstration fixtures; local rails where enabled. Every screen says which.</span>
      </div>
    </aside>
  );
}
