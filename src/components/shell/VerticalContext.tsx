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
 * On one of those the control scopes the page you are on — choosing a line on
 * the globe shows that line's positions on the globe, not its release table.
 * Everywhere else the links still work and take you to that line's releases,
 * and nothing is drawn as pressed, because nothing on that page is scoped to a
 * line and a lit control would claim otherwise.
 */
export const SCOPED_ROUTES: readonly string[] = ['/releases', '/retractions', '/earth'];

/** The frame with no scope read: what renders before the URL is known. */
export function VerticalContextFrame({ active, on = '/releases' }: { active?: Domain; on?: string }) {
  return (
    <div className="shrink-0 flex items-center gap-1" role="group" aria-label="Product" data-testid="product-control">
      <span className="label-sm hidden md:inline mr-1">Product</span>
      {DOMAINS.map((d) => {
        const scoped = d.id === active;
        return (
          <Link
            key={d.id}
            href={`${on}?domain=${d.id}`}
            aria-current={scoped ? 'true' : undefined}
            data-domain={d.id}
            data-scoped={String(scoped)}
            title={`${d.scope}. ${d.note ?? ''}`.trim()}
            className="px-2 py-1 rounded-[var(--radius-md)] text-[12px] font-medium border"
            style={{
              borderColor: scoped ? 'var(--border-accent)' : 'var(--border-subtle)',
              color: scoped ? 'var(--accent-strong)' : 'var(--text-muted)',
              background: scoped ? 'rgba(var(--accent-rgb), 0.08)' : 'transparent',
            }}
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
  return <VerticalContextFrame active={active} on={scopable ? pathname : '/releases'} />;
}
