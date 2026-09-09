import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RulingRegister, type RulingRow } from './RulingRegister';

const ruling = (over: Partial<RulingRow> & Pick<RulingRow, 'rulingId'>): RulingRow => ({
  caseId: 'CASE-CAR-7C104', caseTitle: 'Specialty Cargo Lot 7C-104', revision: 1, status: 'SUPERSEDED',
  purpose: 'Cargo insurance declaration', scopeStatement: 'Ruled on one claim about lot 7C-104.',
  ruledAt: '2026-08-27T09:10:00Z', knownAt: '2026-08-27T09:00:00Z', validAt: '2026-08-26T10:00:00Z',
  assuranceClass: 'UNVERIFIED_EVALUATION', assuranceLabel: 'Unverified evaluation',
  assuranceMeaning: 'Deterministic checks completed by this system.',
  visibility: 'COUNTERPARTY_SHARED', visibilityMeaning: 'Visible to named relying parties on this case.',
  profileId: 'caravan.brokerage.specialty-cargo', profileVersion: '1.2.0',
  registerDigest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  manifestCommitment: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  ruledClaims: 1, consideredEvidence: 3,
  checks: { PASSED: 4, FAILED: 1, NOT_APPLICABLE: 0, NOT_EVALUATED: 2 }, ...over,
});

const RULINGS: RulingRow[] = [
  ruling({ rulingId: 'RUL-7C104-r2', revision: 2, status: 'REFUSED', ruledAt: '2026-08-29T09:45:00Z', supersedesRulingId: 'RUL-7C104-r1', transitionReason: 'A laboratory report contradicted the declared figure.' }),
  ruling({ rulingId: 'RUL-7C104-r1', supersededByRulingId: 'RUL-7C104-r2' }),
  ruling({ rulingId: 'RUL-2E118-r1', caseId: 'CASE-CAR-2E118', caseTitle: 'Specialty Cargo Lot 2E-118', status: 'ADMITTED', ruledAt: '2026-08-05T10:00:00Z', transitionReason: undefined, assuranceClass: 'HUMAN_REVIEWED', assuranceLabel: 'Human reviewed', checks: { PASSED: 6, FAILED: 0, NOT_APPLICABLE: 1, NOT_EVALUATED: 0 } }),
];

const at = (hash: string) => window.history.replaceState(null, '', `/rulings${hash}`);
beforeEach(() => at(''));
afterEach(() => at(''));

const inspector = () => screen.getByTestId('ruling-inspector');

describe('the register carries what is compared down a column of rulings', () => {
  it('shows one row per ruling and no inspector until one is chosen', () => {
    render(<RulingRegister rulings={RULINGS} />);
    expect(screen.getAllByRole('row')).toHaveLength(4);
    expect(screen.queryByTestId('ruling-inspector')).toBeNull();
  });

  it('keeps out of the table the four columns that were past its right edge', () => {
    render(<RulingRegister rulings={RULINGS} />);
    const table = screen.getByRole('table');
    // Measured before the change: 531px of table hidden inside a silent scroll
    // region at 1024 — the declared use, the knowledge cutoff, the visibility
    // class and the manifest commitment were all out there.
    expect(within(table).getAllByRole('columnheader').map((header) => header.textContent))
      .toEqual(['Ruling', 'Status', 'Case', 'Rulingissued on', 'Assurance']);
    expect(within(table).queryByText('Cargo insurance declaration')).toBeNull();
    expect(within(table).queryByText(/Counterparty/i)).toBeNull();
  });

  it('names the revision on the row, because two revisions of one case share a case title', () => {
    render(<RulingRegister rulings={RULINGS} />);
    const row = screen.getByRole('row', { name: /RUL-7C104-r2/ });
    expect(row).toHaveTextContent('revision 2');
  });
});

describe('one ruling, in context', () => {
  it('opens on the ruling chosen and marks that row alone', async () => {
    const user = userEvent.setup();
    render(<RulingRegister rulings={RULINGS} />);
    await user.click(screen.getByRole('button', { name: /RUL-7C104-r1/ }));
    expect(inspector()).toHaveTextContent('RUL-7C104-r1');
    const selected = screen.getAllByRole('row').filter((row) => row.getAttribute('aria-selected') === 'true');
    expect(selected.map((row) => row.dataset.rulingId)).toEqual(['RUL-7C104-r1']);
  });

  it('carries the fields the table no longer does', async () => {
    const user = userEvent.setup();
    render(<RulingRegister rulings={RULINGS} />);
    await user.click(screen.getByRole('button', { name: /RUL-7C104-r1/ }));
    const panel = inspector();
    expect(panel).toHaveTextContent('Cargo insurance declaration');
    expect(panel).toHaveTextContent('Visible to named relying parties on this case.');
    expect(panel).toHaveTextContent('caravan.brokerage.specialty-cargo');
    expect(within(panel).getByTestId('inspector-claims')).toHaveTextContent('1');
    expect(within(panel).getByTestId('inspector-evidence')).toHaveTextContent('3');
  });

  it('keeps the two clocks apart, which is the whole point of carrying both', async () => {
    const user = userEvent.setup();
    render(<RulingRegister rulings={RULINGS} />);
    await user.click(screen.getByRole('button', { name: /RUL-7C104-r1/ }));
    const panel = inspector();
    expect(panel).toHaveTextContent('Ruled at');
    expect(panel).toHaveTextContent('Information known by');
    expect(panel).toHaveTextContent('World state at');
    expect(panel).toHaveTextContent('They are different questions and are never merged');
  });

  it('counts the invariants by outcome and shows only the outcomes that occurred', async () => {
    const user = userEvent.setup();
    render(<RulingRegister rulings={RULINGS} />);
    await user.click(screen.getByRole('button', { name: /RUL-7C104-r1/ }));
    const checks = within(inspector()).getByTestId('inspector-checks');
    expect(checks).toHaveTextContent('passed 4');
    expect(checks).toHaveTextContent('failed 1');
    expect(checks).toHaveTextContent('not evaluated 2');
    // Nothing was not-applicable on this ruling, and a zero is not printed as
    // an outcome that happened.
    expect(checks).not.toHaveTextContent('not applicable');
  });
});

describe('a ruling is never edited, so the chain is walked', () => {
  it('moves to the revision that replaced it and back again', async () => {
    const user = userEvent.setup();
    render(<RulingRegister rulings={RULINGS} />);
    await user.click(screen.getByRole('button', { name: /RUL-7C104-r1/ }));
    await user.click(within(inspector()).getByTestId('inspector-superseded-by'));
    expect(inspector()).toHaveTextContent('RUL-7C104-r2');
    await user.click(within(inspector()).getByTestId('inspector-supersedes'));
    expect(inspector()).toHaveTextContent('RUL-7C104-r1');
  });

  it('shows the recorded reason with the link it explains', async () => {
    const user = userEvent.setup();
    render(<RulingRegister rulings={RULINGS} />);
    await user.click(screen.getByRole('button', { name: /RUL-7C104-r2/ }));
    expect(within(inspector()).getByTestId('inspector-transition'))
      .toHaveTextContent('A laboratory report contradicted the declared figure.');
  });

  it('says a reason is not recorded rather than leaving the question unanswered', async () => {
    const user = userEvent.setup();
    render(<RulingRegister rulings={RULINGS} />);
    await user.click(screen.getByRole('button', { name: /RUL-2E118-r1/ }));
    const panel = inspector();
    expect(within(panel).getByTestId('inspector-transition')).toHaveTextContent('No transition reason is recorded');
    expect(panel).toHaveTextContent('this is the first ruling on the case');
    expect(panel).toHaveTextContent('no later revision has replaced it');
  });
});

describe('a selection is a link here too', () => {
  it('opens on the ruling the URL names, and writes the one chosen', async () => {
    at('#ruling=RUL-2E118-r1');
    const user = userEvent.setup();
    render(<RulingRegister rulings={RULINGS} />);
    expect(inspector()).toHaveTextContent('RUL-2E118-r1');
    await user.click(screen.getByRole('button', { name: /RUL-7C104-r2/ }));
    expect(window.location.hash).toBe('#ruling=RUL-7C104-r2');
  });

  it('opens on nothing when the URL names a ruling this page does not hold, and stops claiming it does', () => {
    at('#ruling=RUL-NOPE-r9');
    render(<RulingRegister rulings={RULINGS} />);
    expect(screen.queryByTestId('ruling-inspector')).toBeNull();
    expect(window.location.hash).toBe('');
  });

  it('moves through the register with the arrow keys', async () => {
    const user = userEvent.setup();
    render(<RulingRegister rulings={RULINGS} />);
    await user.click(screen.getByRole('button', { name: /RUL-7C104-r2/ }));
    await user.keyboard('{ArrowDown}');
    expect(inspector()).toHaveTextContent('RUL-7C104-r1');
    await user.keyboard('{End}');
    expect(inspector()).toHaveTextContent('RUL-2E118-r1');
    await user.keyboard('{Home}');
    expect(inspector()).toHaveTextContent('RUL-7C104-r2');
  });
});
