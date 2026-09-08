import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { reportHarvest, runSpecimenHarvest } from '@/adapter/statutoryHarvester';
import { STATUTORY_SPECIMENS } from '@/fixtures/insurability/statutoryFilings';
import { serveAdmittedAsOf, serveInForceAsOf } from '@/domain/statutoryServing';
import { StatutoryHarvester, type HarvesterInstant } from './StatutoryHarvester';

const run = runSpecimenHarvest();
const report = reportHarvest(run, run.receipt.ruledAt, null);
const rows = run.receipt.rows;

const KNOWLEDGE: HarvesterInstant[] = [
  { value: '2026-01-01T00:00:00.000Z', label: `2026-01-01T00:00:00.000Z — ${serveAdmittedAsOf(rows, '2026-01-01T00:00:00.000Z').length} of ${rows.length} rows knowable` },
  { value: '2026-04-02T00:00:00.000Z', label: `2026-04-02T00:00:00.000Z — ${serveAdmittedAsOf(rows, '2026-04-02T00:00:00.000Z').length} of ${rows.length} rows knowable` },
];
const WORLD: HarvesterInstant[] = [
  { value: '2026-03-01T00:00:00.000Z', label: `2026-03-01T00:00:00.000Z — ${serveInForceAsOf(rows, '2026-04-02T00:00:00.000Z', '2026-03-01T00:00:00.000Z').length} of ${rows.length} rows in force` },
  { value: '2026-04-15T00:00:00.000Z', label: `2026-04-15T00:00:00.000Z — ${serveInForceAsOf(rows, '2026-04-02T00:00:00.000Z', '2026-04-15T00:00:00.000Z').length} of ${rows.length} rows in force` },
];

const mount = () => render(
  <StatutoryHarvester
    report={report}
    extractions={run.extractions}
    specimens={STATUTORY_SPECIMENS.map((entry) => ({ captureId: entry.declaration.captureId, jurisdiction: entry.declaration.jurisdiction, demonstrates: entry.demonstrates }))}
    knowledgeInstants={KNOWLEDGE}
    worldInstants={WORLD}
  />,
);

describe('StatutoryHarvester', () => {
  it('shows the funnel from supplied bytes to served rows', () => {
    mount();
    const stages = screen.getByTestId('harvester-stages');
    expect(stages).toHaveTextContent('Supplied4');
    expect(stages).toHaveTextContent('Captured4');
    expect(stages).toHaveTextContent('In horizon3');
    expect(stages).toHaveTextContent('Candidates14');
    expect(stages).toHaveTextContent('Admitted5');
    expect(stages).toHaveTextContent('Refused9');
  });

  it('states that nothing on the page was collected', () => {
    mount();
    expect(screen.getByText(/no path to a network/)).toBeInTheDocument();
  });

  it('lists every filing with its identity and world-time outcome', () => {
    mount();
    expect(within(screen.getByTestId('harvester-filing-fl-oir-302214-26-co')).getByText('RESOLVED')).toBeInTheDocument();
    expect(within(screen.getByTestId('harvester-filing-ca-cdi-2026-04')).getByText('NO_USABLE_IDENTIFIER')).toBeInTheDocument();
    expect(within(screen.getByTestId('harvester-filing-tx-tdi-2026-8871')).getByText('REFUSED')).toBeInTheDocument();
  });

  it('names the filing the knowledge horizon excluded rather than dropping it', () => {
    mount();
    expect(screen.getByTestId('harvester-excluded')).toHaveTextContent('fl-oir-302214-26-co-a1');
    expect(screen.getByTestId('harvester-excluded')).toHaveTextContent('hindsight it did not have');
  });

  it('tallies the refusals with the check each candidate failed', () => {
    mount();
    const tally = screen.getByTestId('harvester-tally');
    expect(tally).toHaveTextContent('BOTH_CLOCKS');
    expect(tally).toHaveTextContent('SUBJECT_IDENTIFIED');
    expect(tally).toHaveTextContent('stays on the rail with its reasons');
  });

  /** The bitemporal control. Moving the knowledge clock back empties the corpus. */
  it('serves nothing before the corpus could have known it', async () => {
    const user = userEvent.setup();
    mount();
    expect(screen.queryByTestId('harvester-rows-empty')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByTestId('harvester-as-of'), '2026-01-01T00:00:00.000Z');
    expect(screen.getByTestId('harvester-rows-empty')).toHaveTextContent('not the same as saying nothing was happening');
  });

  /**
   * The two clocks are separate questions. In March the consent order is
   * knowable and not yet in force, and the page must be able to say both.
   */
  it('answers the world-time question separately from the knowledge-time one', async () => {
    const user = userEvent.setup();
    mount();
    expect(screen.getByTestId('harvester-clock-note')).toHaveTextContent('5 of 5 rows were knowable');
    await user.selectOptions(screen.getByTestId('harvester-in-force'), '2026-03-01T00:00:00.000Z');
    expect(screen.getByTestId('harvester-rows-empty')).toBeInTheDocument();
    expect(screen.getByTestId('harvester-clock-note')).toHaveTextContent('knowable two months before it binds anyone');
    await user.selectOptions(screen.getByTestId('harvester-in-force'), '2026-04-15T00:00:00.000Z');
    expect(screen.queryByTestId('harvester-rows-empty')).not.toBeInTheDocument();
  });

  /** The omission the served payload also had: admitted is not written, and nothing collected. */
  it('states that canonical state is unchanged and that nothing collected', () => {
    mount();
    const boundaries = screen.getByTestId('harvester-boundaries');
    expect(boundaries).toHaveTextContent('Canonical state unchanged');
    expect(boundaries).toHaveTextContent('admitting a candidate and writing a row are two acts');
    expect(boundaries).toHaveTextContent('REFUSED_DRAFTED_SPECIMEN');
    expect(boundaries).toHaveTextContent('indistinguishable from one descending from a real filing');
    expect(boundaries).toHaveTextContent('0 of 1 registered sources collect');
  });

  it('names what an operator must settle for each jurisdiction before a connector is legitimate', () => {
    mount();
    const boundaries = screen.getByTestId('harvester-boundaries');
    for (const jurisdiction of ['FL_OIR', 'CA_CDI', 'TX_TDI']) expect(boundaries).toHaveTextContent(jurisdiction);
    expect(boundaries).toHaveTextContent('terms of use');
    expect(boundaries).toHaveTextContent('admission authority');
  });

  it('opens an inspector distinguishing a field the document omitted from one it stated unreadably', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('button', { name: 'tx-tdi-2026-8871' }));
    const inspector = screen.getByTestId('inspector');
    expect(within(inspector).getByText('MALFORMED')).toBeInTheDocument();
    expect(inspector).toHaveTextContent('Upon exhaustion of administrative appeals');
    expect(inspector).toHaveTextContent('which is not the same, and the printed text is kept');
    expect(inspector).toHaveTextContent('BOTH_CLOCKS');
  });

  it('shows the conditions travelling with an admitted ruling', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('button', { name: 'fl-oir-302214-26-co' }));
    const inspector = screen.getByTestId('inspector');
    expect(within(inspector).getAllByText('ADMITTED_WITH_CONDITIONS').length).toBe(5);
    expect(inspector).toHaveTextContent('Condition: Republication must attribute the issuing department');
  });

  it('explains a field that produced no candidate rather than leaving a silent gap', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('button', { name: 'ca-cdi-2026-04' }));
    const inspector = screen.getByTestId('inspector');
    expect(inspector).toHaveTextContent('capacityReductionPct produced no candidate');
    expect(inspector).toHaveTextContent('lack of a claim');
  });
});
