import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LANDSHARK_CORPUS } from '@/fixtures/landshark/release';
import { TRADEWIND_CORPUS } from '@/fixtures/tradewind/release';
import { buildProductWorkspace } from '@/domain/productWorkspace';
import { ProductDesk, ProductDeskView } from './ProductDesk';

describe('product desk controls', () => {
  it.each([
    ['LANDSHARK', LANDSHARK_CORPUS, 'Landshark', '/landshark'],
    ['TRADEWIND', TRADEWIND_CORPUS, 'Tradewind', '/tradewind'],
  ] as const)('makes %s evidence and exact release operations reachable', (domain, corpus, title, href) => {
    const model = buildProductWorkspace(corpus, domain, {});
    render(<ProductDeskView model={model} />);
    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    expect(screen.getByText(/synthetic released records/)).toBeInTheDocument();
    expect(screen.getByRole('form', { name: `${title} as-of inquiry` })).toHaveAttribute('action', href);
    expect(screen.getByRole('button', { name: 'Run inquiry' })).toHaveAttribute('type', 'submit');
    expect(screen.getByRole('link', { name: 'Explore spatial records' })).toHaveAttribute('href', `/earth?release=${model.release.releaseId}`);
    expect(screen.getByRole('link', { name: 'Shared preparation apparatus' })).toHaveAttribute('href', '/production');
    const link = new URL(screen.getByRole('link', { name: 'Exact reading link' }).getAttribute('href')!, 'http://test');
    expect(link.searchParams.get('release')).toBe(model.release.releaseId);
    expect(link.searchParams.get('question')).toBe('WHAT_WE_HELD');
    expect(link.searchParams.get('knownAt')).toBe(model.reading!.query.knownAt);
    expect(screen.getByRole('link', { name: 'Inquiry JSON' }).getAttribute('href')).toContain(link.search);
  });

  it('reads navigation changes back into uncontrolled form fields without losing precision', () => {
    const original = buildProductWorkspace(LANDSHARK_CORPUS, 'LANDSHARK', {});
    const view = render(<ProductDeskView model={original} />);
    const next = buildProductWorkspace(LANDSHARK_CORPUS, 'LANDSHARK', { subject: 'PARCEL-BR-1207', predicate: 'entitlement.status', validAt: '2026-08-20T00:00:00.500Z', knownAt: '2026-08-20T09:00:00.250Z' });
    view.rerender(<ProductDeskView model={next} />);
    const form = screen.getByRole('form', { name: 'Landshark as-of inquiry' }) as HTMLFormElement;
    const q = within(form);
    expect(q.getByRole('combobox', { name: 'Subject' })).toHaveValue('PARCEL-BR-1207');
    expect(q.getByRole('combobox', { name: 'Field' })).toHaveValue('entitlement.status');
    expect(q.getByLabelText('World time (UTC)')).toHaveAttribute('step', '0.001');
    const inputs = Object.fromEntries(new FormData(form)) as Record<string, string>;
    expect(buildProductWorkspace(LANDSHARK_CORPUS, 'LANDSHARK', inputs).reading?.query).toEqual(next.reading?.query);
    view.rerender(<ProductDeskView model={buildProductWorkspace(LANDSHARK_CORPUS, 'LANDSHARK', { release: 'REL-LS-2026.08.20' })} />);
    expect(screen.getByRole('combobox', { name: 'Release' })).toHaveValue('REL-LS-2026.08.20');
    expect(screen.getByText('No previous release is available.')).toBeInTheDocument();
  });

  it('never renders withheld Tradewind identities and never treats refusal as a numeric delta', () => {
    const model = buildProductWorkspace(TRADEWIND_CORPUS, 'TRADEWIND', { subject: 'POS-TW-1180', predicate: 'exposure.notional', validAt: '2026-08-17T00:00:00Z' });
    const view = render(<ProductDeskView model={model} />);
    expect(view.container.innerHTML).not.toMatch(/TW-0102|TW-0103|1250000|EV-BOOK-HL-1180/);
    expect(screen.getByTestId('desk-comparison')).toHaveTextContent('A numeric change cannot be computed');
    expect(screen.getByRole('status')).toHaveTextContent('NOT_DELIVERABLE');
  });

  it('provides recovery without rendering a replacement corpus on an invalid request', async () => {
    render(await ProductDesk({ domain: 'LANDSHARK', params: { release: 'REL-TW-2026.09.01' } }));
    expect(screen.getByRole('alert')).toHaveTextContent('CORPUS_NOT_AVAILABLE');
    expect(screen.queryByTestId('product-desk')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open current release' })).toHaveAttribute('href', '/landshark');
  });
});
