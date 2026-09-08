/**
 * The primitives enforce one thing rather than describing it: a value that is
 * UNKNOWN draws as UNKNOWN whatever the caller said it was.
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Panel, Readout, Rule, Segments } from './Instrument';

describe('a readout cannot be told to draw an unknown as measured', () => {
  it('overrides the caller and draws the word, never a digit', () => {
    render(<Readout label="Admitted records" value="UNKNOWN" state="MEASURED" testId="r" />);
    const readout = screen.getByTestId('r');
    expect(readout).toHaveAttribute('data-epistemic', 'UNKNOWN');
    expect(readout).toHaveTextContent('UNKNOWN');
    expect(readout.textContent).not.toMatch(/\d/);
  });

  it('suppresses the unit on an unknown, because a unit implies a quantity', () => {
    render(<Readout label="Mass" value="UNKNOWN" unit="t" testId="r" />);
    expect(screen.getByTestId('r').textContent).not.toContain('t');
  });

  it('draws a measured zero as measured, because a zero that was read is not unknown', () => {
    render(<Readout label="Admitted records" value={0} testId="r" />);
    expect(screen.getByTestId('r')).toHaveAttribute('data-epistemic', 'MEASURED');
    expect(screen.getByTestId('r')).toHaveTextContent('0');
  });

  it('takes a declared state for a value it did not measure', () => {
    render(<Readout label="Positioned" value={2} state="DERIVED" testId="r" />);
    expect(screen.getByTestId('r')).toHaveAttribute('data-epistemic', 'DERIVED');
  });
});

describe('a meter draws its denominator', () => {
  it('renders every cell of the scale, lit and unlit, so the total is visible', () => {
    render(<Segments label="Steps" filled={3} of={5} testId="m" />);
    const cells = screen.getByTestId('m').querySelectorAll('.hud-seg > i');
    expect(cells).toHaveLength(5);
    expect([...cells].filter((cell) => cell.getAttribute('data-on') === 'true')).toHaveLength(3);
    expect(screen.getByTestId('m')).toHaveTextContent('3 / 5');
  });

  it('lights nothing and says UNKNOWN when there is no reading, rather than showing a measured zero', () => {
    render(<Segments label="Steps" filled="UNKNOWN" of={5} testId="m" />);
    const meter = screen.getByTestId('m');
    expect(meter).toHaveTextContent('UNKNOWN');
    expect(meter.querySelector('.hud-seg')).toHaveAttribute('data-epistemic', 'UNKNOWN');
    expect([...meter.querySelectorAll('i')].every((cell) => cell.getAttribute('data-on') === 'false')).toBe(true);
  });

  it('clamps a reading to its scale rather than drawing past the end of it', () => {
    render(<Segments label="Steps" filled={99} of={4} testId="m" />);
    expect(screen.getByTestId('m').querySelectorAll('i[data-on="true"]')).toHaveLength(4);
  });

  it('names its reading for a screen reader, since the cells are decoration to one', () => {
    render(<Segments label="Steps" filled={3} of={5} testId="m" />);
    expect(screen.getByRole('img', { name: 'Steps: 3 of 5' })).toBeInTheDocument();
    render(<Segments label="Other" filled="UNKNOWN" of={5} testId="n" />);
    expect(screen.getByRole('img', { name: 'Other: unknown' })).toBeInTheDocument();
  });
});

describe('a panel is a frame that can carry its own provenance', () => {
  it('prints the stamp into the frame with each key beside its value', () => {
    render(
      <Panel label="Operator instrument" right="DERIVED" state="DERIVED" testId="p"
        stamp={[{ k: 'RELEASE', v: 'REL-CAR-2026.09.01' }, { k: 'SEAT', v: 'COUNTERPARTY_SHARED' }]}>
        <p>body</p>
      </Panel>,
    );
    const panel = screen.getByTestId('p');
    expect(panel).toHaveAttribute('data-epistemic', 'DERIVED');
    const stamp = screen.getByTestId('p-stamp');
    expect(within(stamp).getByText('REL-CAR-2026.09.01')).toHaveAttribute('data-k', 'RELEASE');
    expect(within(stamp).getByText('COUNTERPARTY_SHARED')).toHaveAttribute('data-k', 'SEAT');
  });

  it('takes no hue when it carries no state, because chrome is not a channel', () => {
    render(<Panel testId="p"><p>body</p></Panel>);
    expect(screen.getByTestId('p')).not.toHaveAttribute('data-epistemic');
    expect(screen.queryByTestId('p-stamp')).toBeNull();
  });

  it('rules a label to a state word', () => {
    render(<Rule label="Conveniences taken" right="NONE" />);
    expect(screen.getByText('Conveniences taken')).toBeInTheDocument();
    expect(screen.getByText('NONE')).toHaveClass('hud-bar-state');
  });

  it('uses the same rule markup inside and outside a panel, including a measured zero', () => {
    render(<><Panel label="Inside" right={0} state="MEASURED"><p>body</p></Panel><Rule label="Outside" right={0} state="MEASURED" /></>);
    const inside = screen.getByText('Inside').parentElement!;
    const outside = screen.getByText('Outside').parentElement!;
    expect(inside).toHaveClass('hud-bar');
    expect(inside).toHaveAttribute('data-epistemic', outside.getAttribute('data-epistemic'));
    expect(inside.querySelector('.hud-bar-state')?.outerHTML).toBe(outside.querySelector('.hud-bar-state')?.outerHTML);
    expect(inside.querySelector('.hud-bar-state')).toHaveTextContent('0');
  });
});
