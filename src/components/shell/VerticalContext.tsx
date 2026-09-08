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
 * Only the corpus surfaces read `?domain=`, so only they light the control.
 * On every other page the links still work — they take you to that line's
 * releases — and nothing is drawn as pressed, because nothing on that page is
 * scoped to a line and a lit control would claim otherwise.
 */
export const SCOPED_ROUTES: readonly string[] = ['/releases', '/retractions'];

/** The frame with no scope read: what renders before the URL is known. */
export function VerticalContextFrame({ active }: { active?: Domain }) {
  return (
    <div className="terminal-products" role="group" aria-label="Product" data-testid="product-control">
      <span className="terminal-products-label">Product</span>
      {DOMAINS.map((d) => {
        const on = d.id === active;
        return (
          <Link
            key={d.id}
            href={`/releases?domain=${d.id}`}
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
  const active = scopable && DOMAINS.some((d) => d.id === requested) ? (requested as Domain) : undefined;
  return <VerticalContextFrame active={active} />;
}
