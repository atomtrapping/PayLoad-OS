import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mockNextNavigation } from '@/test/mocks';
import { FIXTURE_CASES } from '@/fixtures';
import { CaseQueue } from './CaseQueue';

beforeAll(() => mockNextNavigation('/cases'));
/**
 * The selection is written into the URL, and jsdom keeps one document for the
 * whole file — so a test that selected a case left the next one already open
 * on it, and a single click closed rather than opened. Each case starts from a
 * clean address bar.
 */
beforeEach(() => window.history.replaceState(null, '', '/cases'));

/**
 * The row's own selector, rather than its accessible name: once the panel is
 * open its close button is named "Close <case title>", which matches the row
 * by name too. A test that picked the wrong one of those would be testing the
 * panel's close button and calling it the row.
 */
const rowFor = (caseId: string) => document.querySelector<HTMLElement>(`[data-case-select="${caseId}"]`)!;

describe('CaseQueue', () => {
  it('opens with what requires action and a small textual summary', () => {
    render(<CaseQueue cases={[...FIXTURE_CASES]} lastSeenAt="2026-08-31T12:00:00Z" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('5 cases require action');
    const table = screen.getByRole('table', { name: 'Case queue' });
    expect(within(table).getAllByRole('row').length - 1).toBe(5);
    expect(within(table).getByText('Specialty Cargo Lot 7C-104')).toBeInTheDocument();
    expect(within(table).getByText(/CAR-101 · E_LOT_IDENTITY_UNRECONCILED/)).toBeInTheDocument();
    // Three columns, and they are the three a reviewer triages on. 596px of the
    // nine sat past the right edge of a 1440px viewport, and 1012px past a
    // 1024px one — more table hidden than shown. The instant of the last
    // change is in the panel; the register carries what the reader wants from
    // it, which is the newest-first order and the mark that says a case moved
    // since they last looked.
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent))
      .toEqual(['Case', 'Status', 'Required action']);
    expect(within(table).getAllByText('new').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('case-inspector')).toBeNull();
  });

  it('puts the columns it dropped in the panel, and opening the case is its primary action', async () => {
    const user = userEvent.setup();
    render(<CaseQueue cases={[...FIXTURE_CASES]} lastSeenAt="2026-08-31T12:00:00Z" />);
    await user.click(rowFor('CASE-CAR-7C104'));
    const panel = screen.getByTestId('case-inspector');
    expect(panel).toHaveTextContent('World state valid on');
    expect(panel).toHaveTextContent('Information known by');
    expect(panel).toHaveTextContent('Use code');
    expect(within(panel).getByTestId('inspector-assurance')).toBeInTheDocument();
    // The queue's job is deciding whether to open; the panel answers that and
    // then hands over.
    expect(within(panel).getByTestId('inspector-open-case')).toHaveAttribute('href', '/cases/CASE-CAR-7C104');
  });

  it('marks the selected row alone, and closes back to no selection', async () => {
    const user = userEvent.setup();
    render(<CaseQueue cases={[...FIXTURE_CASES]} lastSeenAt="2026-08-31T12:00:00Z" />);
    const row = rowFor('CASE-CAR-7C104');
    await user.click(row);
    const selected = screen.getAllByRole('row').filter((r) => r.getAttribute('aria-selected') === 'true');
    expect(selected.map((r) => (r as HTMLElement).dataset.caseId)).toEqual(['CASE-CAR-7C104']);
    await user.click(row);
    expect(screen.queryByTestId('case-inspector')).toBeNull();
  });

  it('keeps a case a filter excludes, and says the row is not there rather than pretending it is', async () => {
    const user = userEvent.setup();
    render(<CaseQueue cases={[...FIXTURE_CASES]} lastSeenAt="2026-08-31T12:00:00Z" />);
    await user.click(rowFor('CASE-CAR-7C104'));
    expect(screen.queryByTestId('inspector-out-of-filter')).toBeNull();
    // A filter hides rows, not cases.
    await user.type(screen.getByLabelText(/Search case, manifest, lot, shipment, claim/), 'nothing-matches-this');
    expect(await screen.findByTestId('inspector-out-of-filter')).toHaveTextContent('not in the current filter');
    expect(screen.getByTestId('case-inspector')).toHaveTextContent('CASE-CAR-7C104');
  });

  it('opens on the case the URL names, and writes the one chosen', async () => {
    window.history.replaceState(null, '', '/cases#case=CASE-CAR-7C104');
    const user = userEvent.setup();
    render(<CaseQueue cases={[...FIXTURE_CASES]} lastSeenAt="2026-08-31T12:00:00Z" />);
    expect(screen.getByTestId('case-inspector')).toHaveTextContent('CASE-CAR-7C104');
    await user.click(rowFor('CASE-CAR-5B221'));
    expect(window.location.hash).toBe('#case=CASE-CAR-5B221');
  });

  it('filters by status and searches by shipment identifier', async () => {
    const user = userEvent.setup();
    render(<CaseQueue cases={[...FIXTURE_CASES]} lastSeenAt="2026-08-31T12:00:00Z" />);
    await user.selectOptions(screen.getByLabelText('Status'), 'ALL');
    expect(screen.getByText('7 of 7 cases')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Search case, manifest, lot, shipment, claim/), 'BAL-77812');
    expect(await screen.findByText('1 of 7 cases')).toBeInTheDocument();
    expect(screen.getByText('Specialty Cargo Lot 7C-104')).toBeInTheDocument();
  });
});
