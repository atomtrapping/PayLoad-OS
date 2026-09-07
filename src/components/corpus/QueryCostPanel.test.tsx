import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { QueryCostPanel } from './QueryCostPanel';

const row = (shape: string) => screen.getByTestId(`cost-${shape}`);

describe('QueryCostPanel', () => {
  it('shows the recorded number at a size that was actually run', () => {
    render(<QueryCostPanel />);
    expect(within(row('AS_OF')).getByText('MEASURED')).toBeInTheDocument();
    expect(row('AS_OF')).toHaveTextContent('141.6 ms');
  });

  /** The refusal, on the surface where a decimal would be most persuasive. */
  it('says UNKNOWN past the last size that was run, instead of a projected figure', async () => {
    const user = userEvent.setup();
    render(<QueryCostPanel />);
    await user.selectOptions(screen.getByTestId('cost-size'), '50000000');
    expect(row('AS_OF')).toHaveTextContent('UNKNOWN');
    expect(within(row('AS_OF')).getByText('OUTSIDE_MEASURED_RANGE')).toBeInTheDocument();
    expect(row('AS_OF')).toHaveTextContent('would invent a number');
  });

  it('marks a size between two runs as interpolated rather than measured', async () => {
    const user = userEvent.setup();
    render(<QueryCostPanel />);
    await user.selectOptions(screen.getByTestId('cost-size'), '500000');
    expect(within(row('AS_OF')).getByText('INTERPOLATED')).toBeInTheDocument();
    expect(row('AS_OF')).toHaveTextContent('actually run');
  });

  /** The scan grows with the corpus; the prepared walk does not. That is the whole point. */
  it('tells a scan apart from a prepared index, in the label and in the numbers', () => {
    render(<QueryCostPanel />);
    expect(within(row('AS_OF')).getByText('SCAN')).toBeInTheDocument();
    expect(within(row('DEPENDENCY_FAN_OUT')).getByText('PREPARED_INDEX')).toBeInTheDocument();
    expect(row('AS_OF')).toHaveTextContent('141.6 ms');
    expect(row('DEPENDENCY_FAN_OUT')).toHaveTextContent('9 µs');
    expect(row('DEPENDENCY_INDEX_BUILD')).toHaveTextContent('710.6 ms');
  });

  it('reports the five-leg tree as measured, with no assumption attached', () => {
    render(<QueryCostPanel />);
    const condition = screen.getByTestId('cost-condition');
    expect(condition).toHaveTextContent('A 5-leg condition over 1,000,000 records');
    expect(condition).toHaveTextContent('2,346 ms');
    expect(condition).toHaveTextContent('not a scaling of it');
    expect(condition).not.toHaveTextContent('Assumption carried');
  });

  it('shows the assumption the moment the leg count leaves the one that was run', async () => {
    const user = userEvent.setup();
    render(<QueryCostPanel />);
    await user.selectOptions(screen.getByTestId('cost-legs'), '8');
    const condition = screen.getByTestId('cost-condition');
    expect(condition).toHaveTextContent('COST_SCALES_LINEARLY_IN_LEGS');
    expect(condition).toHaveTextContent('ran five legs and only five');
  });

  it('carries what the numbers do not say, conditions included', () => {
    render(<QueryCostPanel />);
    expect(screen.getByText(/What these numbers do not say/)).toBeInTheDocument();
    expect(screen.getByText(/IN_PROCESS_SYNTHETIC_NO_STORE/)).toBeInTheDocument();
    expect(screen.getByText(/A cost is not a defect/)).toBeInTheDocument();
  });
});
