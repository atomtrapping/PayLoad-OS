'use client';

import Link from 'next/link';
import { Suspense, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { CommandPalette } from './CommandPalette';
import { NotationMark } from './NotationMark';
import { VerticalContext, VerticalContextFrame } from './VerticalContext';
import { locate } from './nav';

export { NAV_AREAS, PRIMARY_NAV } from './nav';

/**
 * The top bar: brand, where you are (area · page), the product. The
 * primary navigation itself lives in the sidebar, which is a left rail on
 * wide screens and a strip beneath this bar on small ones.
 */
export function TopNav() {
  const pathname = usePathname() ?? '/';
  const here = locate(pathname);
  // The arrival wipe is for a navigation inside the terminal, not for the
  // first paint of a hard load, so the document is marked once the route has
  // changed from the one it was loaded on. The stylesheet scopes the reveal
  // to that mark.
  const loadedOn = useRef<string | null>(null);
  useEffect(() => {
    if (loadedOn.current === null) { loadedOn.current = pathname; return; }
    if (loadedOn.current !== pathname) document.documentElement.setAttribute('data-navigated', '');
  }, [pathname]);
  return (
    <header className="app-topbar" style={{ position: 'sticky' }}>
      <div className="terminal-brand">
        <Link href="/" className="terminal-brand-name" aria-label="NotationsOS home" title="NotationsOS — the internal terminal for the backend behind Caravan, Tradewind and Landshark"><NotationMark size={22} />NotationsOS</Link>
        <Link href="/product" className="terminal-brand-caption" aria-label="Notation Systems product model">Notation Systems / internal</Link>
      </div>
      <div className="terminal-location" role="group" aria-label="Where you are" data-testid="where">
        {here ? (
          <>
            <span className="terminal-location-area">{here.area.label}</span>
            <span aria-hidden="true" className="terminal-location-divider">/</span>
            <span className="terminal-location-page">{here.item.label}</span>
          </>
        ) : <span className="label-sm">NotationsOS</span>}
      </div>
      <CommandPalette />
      <Suspense fallback={<VerticalContextFrame />}><VerticalContext /></Suspense>
      {/* Keyed on the route, so a soft navigation remounts it and the sweep plays again. */}
      <span key={pathname} className="route-beacon" aria-hidden="true" data-testid="route-beacon" />
    </header>
  );
}
