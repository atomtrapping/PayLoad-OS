'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

/**
 * The contextual inspector: what the selected object is, in context, with
 * the actions allowed on it. A right column on wide screens, an inline
 * detail view on small ones; the same content either way. Escape closes it
 * and focus returns to where it was.
 */
export function Inspector({ id, title, subtitle, kicker, onClose, children, actions, testId = 'inspector', focusOnNarrow = false }: { id: string; title: string; subtitle?: ReactNode; kicker?: string; onClose?: () => void; children: ReactNode; actions?: ReactNode; testId?: string; /** On screens below 1024px the inspector is an inline detail view that may sit far from what opened it: bring it into view and move focus to its heading when it opens. */ focusOnNarrow?: boolean }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!focusOnNarrow || typeof window.matchMedia !== 'function' || !window.matchMedia('(max-width: 1023px)').matches) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    section.current?.scrollIntoView?.({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
    heading.current?.focus({ preventScroll: true });
  }, [focusOnNarrow]);
  useEffect(() => {
    if (!onClose) return;
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      onClose();
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [onClose]);
  return (
    <section ref={section} className="inspector" aria-labelledby={`${id}-title`} data-testid={testId}>
      <div className="inspector-head">
        <div className="min-w-0">
          {kicker && <div className="label-sm">{kicker}</div>}
          <h2 id={`${id}-title`} ref={heading} tabIndex={-1} className="inspector-title">{title}</h2>
          {subtitle && <div className="inspector-subtitle">{subtitle}</div>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {actions}
          {onClose && <button type="button" className="btn btn-sm btn-quiet" onClick={onClose} aria-label={`Close ${title}`} title="Close (Esc)">✕</button>}
        </div>
      </div>
      <div className="inspector-body">{children}</div>
    </section>
  );
}

/**
 * One panel inside an inspector.
 *
 * Ten surfaces had each declared a local `Part` for this — the release, ruling,
 * corpus, coverage, class, stable, board and mining registers, the spatial
 * inquiry and the production inspector — and the ten were not the same
 * component. Eight rendered a bare `<section>` with an `<h3>` inside it; two
 * gave the section an accessible name and a test id. Nothing recorded a reason
 * for the split, which is what a split with no reason looks like: whichever
 * file was copied last decided.
 *
 * The named form is the one that survives. A `<section>` with no accessible
 * name is a generic box to a screen reader; with one it is a region the reader
 * can jump to and hear the name of, which is the whole point of dividing an
 * inspector into panels at all.
 *
 * The id comes from `useId` rather than a slug of the title, because two
 * inspectors can be open on one page — `/discovery` carries a class register
 * and a mining register — and two panels sharing a title would otherwise share
 * an id and point `aria-labelledby` at whichever heading rendered first.
 */
export function InspectorSection({ title, children, testId }: { title: string; children: ReactNode; testId?: string }) {
  const id = useId();
  return (
    <section className="inspector-section" aria-labelledby={id} data-testid={testId}>
      <h3 id={id}>{title}</h3>
      {children}
    </section>
  );
}
