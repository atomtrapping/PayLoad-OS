'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { searchNav, type NavDestination } from './nav';

/**
 * Jump to any of the twenty-six destinations by typing part of its name.
 *
 * The rail lists everything, which is right for orientation and slow for
 * travel: reaching Clearance from Releases is a scan down six areas on a wide
 * screen, and on a phone it is a 2336-pixel horizontal scroll. This is the
 * direct route, and it is the same list — nothing is reachable here that the
 * rail does not show, so the palette is a shortcut rather than a second
 * navigation to keep in sync.
 *
 * Opened with Cmd/Ctrl+K, or from the button in the top bar. The button matters
 * as much as the shortcut: a keyboard-only affordance is invisible to anyone
 * who has not been told it exists, and unusable on a touch screen.
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);
  const listId = useId();

  const matches = useMemo(() => searchNav(query).map((entry) => entry.destination), [query]);
  const chosen: NavDestination | undefined = matches[active];

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setActive(0);
    // Focus goes back where it came from, so opening the palette and thinking
    // better of it does not cost the reader their place.
    restoreTo.current?.focus?.();
  }, []);

  const go = useCallback((destination: NavDestination | undefined) => {
    if (!destination) return;
    setOpen(false);
    setQuery('');
    setActive(0);
    router.push(destination.href);
  }, [router]);

  // Cmd/Ctrl+K anywhere, and Escape from inside a field is left to the field.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        restoreTo.current = document.activeElement as HTMLElement | null;
        setOpen((was) => !was);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => { if (open) input.current?.focus(); }, [open]);

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    if (!open) return;
    // Optional call: an environment without it should not take the palette down with it.
    list.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [active, open]);

  const onFieldKey = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive((i) => (i + 1) % Math.max(matches.length, 1)); return; }
    if (event.key === 'ArrowUp') { event.preventDefault(); setActive((i) => (i - 1 + Math.max(matches.length, 1)) % Math.max(matches.length, 1)); return; }
    if (event.key === 'Home') { event.preventDefault(); setActive(0); return; }
    if (event.key === 'End') { event.preventDefault(); setActive(Math.max(matches.length - 1, 0)); return; }
    if (event.key === 'Enter') { event.preventDefault(); go(chosen); }
  };

  return (
    <>
      <button
        type="button"
        className="palette-open"
        onClick={() => { restoreTo.current = document.activeElement as HTMLElement | null; setOpen(true); }}
        data-testid="palette-open"
        aria-haspopup="dialog"
      >
        <span aria-hidden="true">⌕</span>
        <span className="hidden sm:inline">Jump to…</span>
        <kbd className="hidden md:inline palette-kbd" aria-hidden="true">⌘K</kbd>
        <span className="sr-only">Jump to a page. Keyboard shortcut: Command or Control K.</span>
      </button>

      {open && (
        <div className="palette-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }} data-testid="palette-scrim">
          <div className="palette" role="dialog" aria-modal="true" aria-label="Jump to a page" data-testid="palette">
            <input
              ref={input}
              type="text"
              role="combobox"
              className="palette-field"
              placeholder="Jump to a page…"
              aria-label="Jump to a page"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={chosen ? `${listId}-${active}` : undefined}
              aria-autocomplete="list"
              value={query}
              // The highlight resets where the query changes rather than in an
              // effect watching it: one event, one state change, no second render
              // in which the old highlight points at a row that no longer matches.
              onChange={(event) => { setQuery(event.target.value); setActive(0); }}
              onKeyDown={onFieldKey}
              data-testid="palette-field"
            />
            <ul id={listId} ref={list} role="listbox" aria-label="Pages" className="palette-list" data-testid="palette-list">
              {matches.map((destination, index) => (
                <li
                  key={destination.href}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === active}
                  data-active={index === active}
                  data-href={destination.href}
                  className="palette-row"
                  onMouseEnter={() => setActive(index)}
                  onMouseDown={(event) => { event.preventDefault(); go(destination); }}
                >
                  <span className="palette-row-label">{destination.label}</span>
                  <span className="palette-row-area">{destination.area}</span>
                </li>
              ))}
              {matches.length === 0 && (
                <li className="palette-empty" data-testid="palette-empty">
                  Nothing here is called that. The rail lists every destination; this searches the same list and no other.
                </li>
              )}
            </ul>
            <p className="palette-hint" data-testid="palette-hint">
              <kbd>↑</kbd><kbd>↓</kbd> move · <kbd>↵</kbd> go · <kbd>Esc</kbd> close · <kbd>Alt</kbd>+<kbd>←</kbd>/<kbd>→</kbd> step through the rail
            </p>
          </div>
        </div>
      )}
    </>
  );
}
