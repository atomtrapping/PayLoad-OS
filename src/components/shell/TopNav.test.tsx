import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DOMAINS } from '@/domain/domains';
import { TopNav } from './TopNav';
import { VerticalContextFrame } from './VerticalContext';

let pathname = '/earth';
let params = new URLSearchParams();
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useSearchParams: () => params,
  useRouter: () => ({ push: vi.fn() }),
}));

beforeEach(() => { pathname = '/earth'; params = new URLSearchParams(); });

describe('the shared terminal header', () => {
  it('keeps home, the operating model, current location and page search reachable', () => {
    render(<TopNav />);
    const header = within(screen.getByRole('banner'));
    expect(header.getByRole('link', { name: 'NotationsOS home' })).toHaveAttribute('href', '/');
    expect(header.getByRole('link', { name: 'Notation Systems product model' })).toHaveAttribute('href', '/product');
    expect(header.getByRole('group', { name: 'Where you are' })).toHaveTextContent('Inquiry/Earth Twin');
    expect(header.getByRole('button', { name: /Jump to a page/ })).toHaveAttribute('aria-haspopup', 'dialog');
  });

  it.each(DOMAINS)('shows $label as selected only when the URL scopes a supported corpus surface', (domain) => {
    pathname = '/releases';
    params.set('domain', domain.id);
    render(<TopNav />);
    const links = within(screen.getByRole('group', { name: 'Product' })).getAllByRole('link');
    expect(links.filter((link) => link.getAttribute('aria-current') === 'true')).toHaveLength(1);
    expect(links.find((link) => link.getAttribute('aria-current') === 'true')).toHaveTextContent(domain.label);
    for (const product of DOMAINS) {
      expect(screen.getByRole('link', { name: product.label })).toHaveAttribute('href', `/releases?domain=${product.id}`);
    }
  });

  it.each([
    ['/earth', 'CARAVAN'],
    ['/releases', 'not-a-product'],
    ['/releases', ''],
  ])('does not imply a product scope on %s?domain=%s', (route, domain) => {
    pathname = route;
    params.set('domain', domain);
    render(<TopNav />);
    for (const link of within(screen.getByRole('group', { name: 'Product' })).getAllByRole('link')) {
      expect(link).not.toHaveAttribute('aria-current');
      expect(link).toHaveAttribute('data-scoped', 'false');
    }
  });

  it('reports scope on correction history and updates the location on navigation', () => {
    const view = render(<TopNav />);
    pathname = '/retractions';
    params.set('domain', 'LANDSHARK');
    view.rerender(<TopNav />);
    expect(screen.getByRole('group', { name: 'Where you are' })).toHaveTextContent('Retractions');
    expect(screen.getByRole('link', { name: 'Landshark' })).toHaveAttribute('aria-current', 'true');
  });

  it('keeps the suspense frame unscoped until the URL is known', () => {
    render(<VerticalContextFrame />);
    expect(screen.getAllByRole('link')).toHaveLength(DOMAINS.length);
    for (const link of screen.getAllByRole('link')) expect(link).not.toHaveAttribute('aria-current');
  });

  it.each(['/landshark', '/tradewind'])('selects the fixed product desk at %s and offers the other desk', (route) => {
    pathname = route;
    params.set('domain', 'CARAVAN');
    render(<TopNav />);
    const links = within(screen.getByRole('group', { name: 'Product' })).getAllByRole('link');
    expect(links.find((link) => link.getAttribute('aria-current') === 'true')).toHaveAttribute('href', route);
    expect(screen.getByRole('link', { name: 'Landshark' })).toHaveAttribute('href', '/landshark');
    expect(screen.getByRole('link', { name: 'Tradewind' })).toHaveAttribute('href', '/tradewind');
  });
});
