'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

import type { Domain } from '@/domain/types';

import { DOMAINS } from '@/domain/domains';

/**
 * The product control: which of the three lines you are looking at.
 *
 * It used to be three buttons with a hardcoded active line, which was honest
 * while Caravan was the only line carrying records. It is not honest now. All
 * three lines carry a corpus, so a control that always says CARAVAN says
 * something false, and a button that cannot be pressed to any effect is worse
 * than no button.
 *
 * So each line is a link that scopes the corpus surfaces to it, and the
 * pressed state is read back from the URL rather than asserted. When no scope
 * is applied nothing is pressed, because "all three" is a real state and
 * drawing one line as active would misreport it.
 *
 * ROUTES THAT HONOUR THE SCOPE
 *
 * Corpus history surfaces read `?domain=`. The dedicated Landshark and
 * Tradewind desks have a fixed scope and switch directly between desks.
 * Other pages remain unscoped and link to each line's release history.
 */
export const SCOPED_ROUTES: readonly string[] = ['/releases', '/retractions'];

/** The frame with no scope read: what renders before the URL is known. */
export function VerticalContextFrame({ active, desks = false }: { active?: Domain; desks?: boolean }) {
  return (
    <div className="terminal-products" role="group" aria-label="Product" data-testid="product-control">
      <span className="terminal-products-label">Product</span>
      {DOMAINS.map((d) => {
        const on = d.id === active;
        return (
          <Link
            key={d.id}
            href={desks && d.id !== 'CARAVAN' ? `/${d.id.toLowerCase()}` : `/releases?domain=${d.id}`}
            aria-current={on ? 'true' : undefined}
            data-domain={d.id}
            data-scoped={String(on)}
            title={`${d.scope}. ${d.note ?? ''}`.trim()}
            className="terminal-product"
          >
            {d.label}
          </Link>
        );
      })}
    </div>
  );
}

export function VerticalContext() {
  const pathname = usePathname() ?? '/';
  const params = useSearchParams();
  const requested = params?.get('domain');
  const scopable = SCOPED_ROUTES.includes(pathname);
  const desk = pathname === '/landshark' ? 'LANDSHARK' : pathname === '/tradewind' ? 'TRADEWIND' : undefined;
  const active = desk ?? (scopable && DOMAINS.some((d) => d.id === requested) ? (requested as Domain) : undefined);
  return <VerticalContextFrame active={active} desks={Boolean(desk)} />;
}
