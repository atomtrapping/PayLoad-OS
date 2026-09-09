import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ReleaseRegister, type CorpusGroup, type ReleaseRow } from './ReleaseRegister';

const release = (over: Partial<ReleaseRow> & Pick<ReleaseRow, 'releaseId'>): ReleaseRow => ({
  corpusId: 'caravan.specialty-cargo', status: 'SUPERSEDED', knownAt: '2026-08-26T09:30:00Z',
  coverage: 'Lots 2E-118 and 3F-440.', note: '', buildId: 'build-caravan-sc-2026.08.25',
  methodologyId: 'payload-methodology', methodologyVersion: '0.1.0', methodologyStatus: 'research',
  releaseDigest: 'sha256:c7115d66aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaad48687',
  certificationStatus: 'CERTIFIED', verification: 'internal_recompute', records: 11, retractions: 1, ...over,
});

const GROUPS: CorpusGroup[] = [{
  corpusId: 'caravan.specialty-cargo', domain: 'caravan', title: 'Caravan — specialty cargo',
  description: 'Point-in-time facts about specialty-cargo lots.', records: 21, retractions: 2, releaseCount: 3,
  releases: [
    release({ releaseId: 'REL-CAR-2026.09.01', status: 'CURRENT', knownAt: '2026-09-01T12:00:00Z', supersedesReleaseId: 'REL-CAR-2026.08.25', records: 21, retractions: 2, coverage: 'All seven demonstration lots.' }),
    release({ releaseId: 'REL-CAR-2026.08.25', supersedesReleaseId: 'REL-CAR-2026.08.11', supersededByReleaseId: 'REL-CAR-2026.09.01' }),
    release({ releaseId: 'REL-CAR-2026.08.11', supersededByReleaseId: 'REL-CAR-2026.08.25', records: 4, retractions: 0, coverage: 'Certificates only.' }),
  ],
}];

const at = (hash: string) => window.history.replaceState(null, '', `/releases${hash}`);
beforeEach(() => at(''));
afterEach(() => at(''));

const inspector = () => screen.getByTestId('release-inspector');

describe('the register carries what is compared down a column', () => {
  it('shows one row per release and no inspector until one is chosen', () => {
    render(<ReleaseRegister groups={GROUPS} />);
    expect(screen.getAllByRole('row')).toHaveLength(4); // three releases and the header
    expect(screen.queryByTestId('release-inspector')).toBeNull();
  });

  it('keeps the paragraph fields out of the table, where they made every row six lines tall', () => {
    render(<ReleaseRegister groups={GROUPS} />);
    const table = screen.getByRole('table');
    // The coverage sentence, the build, the methodology and the digest are the
    // inspector's; the register is the release, its standing, its cutoff and
    // its counts.
    expect(within(table).queryByText(/All seven demonstration lots/)).toBeNull();
    expect(within(table).queryByText(/build-caravan-sc/)).toBeNull();
    expect(within(table).queryByText(/payload-methodology/)).toBeNull();
    expect(within(table).getAllByRole('columnheader').map((header) => header.textContent))
      .toEqual(['Release', 'Status', 'Informationknown by', 'Records', 'Retractions', 'Certification']);
  });
});

describe('one release, in context', () => {
  it('opens the inspector on the release chosen, and marks that row alone', async () => {
    const user = userEvent.setup();
    render(<ReleaseRegister groups={GROUPS} />);
    await user.click(screen.getByRole('button', { name: /REL-CAR-2026\.08\.25/ }));
    expect(inspector()).toHaveTextContent('REL-CAR-2026.08.25');
    const selected = screen.getAllByRole('row').filter((row) => row.getAttribute('aria-selected') === 'true');
    expect(selected).toHaveLength(1);
    expect(selected[0].dataset.releaseId).toBe('REL-CAR-2026.08.25');
  });

  it('carries the fields the table no longer does', async () => {
    const user = userEvent.setup();
    render(<ReleaseRegister groups={GROUPS} />);
    await user.click(screen.getByRole('button', { name: /REL-CAR-2026\.08\.25/ }));
    const panel = inspector();
    expect(panel).toHaveTextContent('Lots 2E-118 and 3F-440.');
    expect(panel).toHaveTextContent('build-caravan-sc-2026.08.25');
    expect(panel).toHaveTextContent('payload-methodology');
    expect(panel).toHaveTextContent('internal recompute');
    expect(within(panel).getByTestId('inspector-records')).toHaveTextContent('11');
    expect(within(panel).getByTestId('inspector-retractions')).toHaveTextContent('1');
  });

  it('walks the supersession chain, which is the argument for the inspector on this surface', async () => {
    const user = userEvent.setup();
    render(<ReleaseRegister groups={GROUPS} />);
    await user.click(screen.getByRole('button', { name: /REL-CAR-2026\.09\.01/ }));
    // Back down the chain, one release at a time, without leaving the page.
    await user.click(within(inspector()).getByTestId('inspector-supersedes'));
    expect(inspector()).toHaveTextContent('REL-CAR-2026.08.25');
    await user.click(within(inspector()).getByTestId('inspector-supersedes'));
    expect(inspector()).toHaveTextContent('REL-CAR-2026.08.11');
    // And forward again.
    await user.click(within(inspector()).getByTestId('inspector-superseded-by'));
    expect(inspector()).toHaveTextContent('REL-CAR-2026.08.25');
  });

  it('says what each end of the chain is when there is nothing there, rather than showing an empty row', async () => {
    const user = userEvent.setup();
    render(<ReleaseRegister groups={GROUPS} />);
    await user.click(screen.getByRole('button', { name: /REL-CAR-2026\.08\.11/ }));
    expect(inspector()).toHaveTextContent('this is the first release of the corpus');
    await user.click(screen.getByRole('button', { name: /REL-CAR-2026\.09\.01/ }));
    expect(inspector()).toHaveTextContent('no later release has replaced it');
  });

  it('closes back to no selection, and pressing the selected row again closes it too', async () => {
    const user = userEvent.setup();
    render(<ReleaseRegister groups={GROUPS} />);
    await user.click(screen.getByRole('button', { name: /REL-CAR-2026\.08\.25/ }));
    await user.click(screen.getByRole('button', { name: /^Close/ }));
    expect(screen.queryByTestId('release-inspector')).toBeNull();
    const row = screen.getByRole('button', { name: /REL-CAR-2026\.08\.25/ });
    await user.click(row);
    await user.click(row);
    expect(screen.queryByTestId('release-inspector')).toBeNull();
  });

  it('moves through the register with the arrow keys, as every other register does', async () => {
    const user = userEvent.setup();
    render(<ReleaseRegister groups={GROUPS} />);
    await user.click(screen.getByRole('button', { name: /REL-CAR-2026\.09\.01/ }));
    await user.keyboard('{ArrowDown}');
    expect(inspector()).toHaveTextContent('REL-CAR-2026.08.25');
    await user.keyboard('{End}');
    expect(inspector()).toHaveTextContent('REL-CAR-2026.08.11');
    await user.keyboard('{Home}');
    expect(inspector()).toHaveTextContent('REL-CAR-2026.09.01');
  });
});

describe('a selection is a link here too', () => {
  it('opens on the release the URL names, and writes the one chosen', async () => {
    at('#release=REL-CAR-2026.08.11');
    const user = userEvent.setup();
    render(<ReleaseRegister groups={GROUPS} />);
    expect(inspector()).toHaveTextContent('REL-CAR-2026.08.11');
    await user.click(screen.getByRole('button', { name: /REL-CAR-2026\.09\.01/ }));
    expect(window.location.hash).toBe('#release=REL-CAR-2026.09.01');
  });

  it('opens on nothing when the URL names a release this page does not hold, and stops claiming it does', () => {
    at('#release=REL-CAR-1999.01.01');
    render(<ReleaseRegister groups={GROUPS} />);
    expect(screen.queryByTestId('release-inspector')).toBeNull();
    expect(screen.getAllByRole('row')).toHaveLength(4);
    // The render guard alone would leave the page showing nothing while the
    // address bar still named a release — a link that would be copied and sent
    // and open on nothing again. The unheld name is not taken up, so the URL
    // says what the page actually has, which is no selection.
    expect(window.location.hash).toBe('');
    expect(screen.getAllByRole('row').some((row) => row.getAttribute('aria-selected') === 'true')).toBe(false);
  });
});
