/**
 * The one handler nine registers now share, tested once and properly.
 *
 * Before it was shared, two of the nine copies had a keyboard test and seven
 * had none. The point of consolidating was not the fifty lines; it was that
 * arrow-key navigation is now checked in one place rather than assumed in
 * seven.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { registerKeys } from './registerKeys';

const ROWS = ['a', 'b', 'c'] as const;

function Harness({ rows = ROWS as readonly string[], onSelect }: { rows?: readonly string[]; onSelect?: (id: string) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const select = (id: string) => { setSelected(id); onSelect?.(id); };
  return (
    <table>
      <tbody
        data-testid="rows"
        onKeyDown={registerKeys({ ids: rows, selected, select, attribute: 'data-row-select' })}
      >
        {rows.map((id) => (
          <tr key={id}>
            <td>
              <button type="button" data-row-select={id} aria-pressed={selected === id}>{id}</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const body = () => screen.getByTestId('rows');

describe('walking a register with the keyboard', () => {
  it('starts at the first row from nothing selected, and steps down', () => {
    render(<Harness />);
    fireEvent.keyDown(body(), { key: 'ArrowDown' });
    expect(screen.getByRole('button', { name: 'a' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(body(), { key: 'ArrowDown' });
    expect(screen.getByRole('button', { name: 'b' })).toHaveAttribute('aria-pressed', 'true');
  });

  /* Both ends hold rather than wrapping: a reader at the bottom pressing down
     again has not asked to go back to the top. */
  it('stops at the last row rather than wrapping', () => {
    render(<Harness />);
    fireEvent.keyDown(body(), { key: 'End' });
    expect(screen.getByRole('button', { name: 'c' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(body(), { key: 'ArrowDown' });
    expect(screen.getByRole('button', { name: 'c' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('stops at the first row rather than wrapping', () => {
    render(<Harness />);
    fireEvent.keyDown(body(), { key: 'Home' });
    expect(screen.getByRole('button', { name: 'a' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(body(), { key: 'ArrowUp' });
    expect(screen.getByRole('button', { name: 'a' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('jumps to either end', () => {
    render(<Harness />);
    fireEvent.keyDown(body(), { key: 'End' });
    expect(screen.getByRole('button', { name: 'c' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(body(), { key: 'Home' });
    expect(screen.getByRole('button', { name: 'a' })).toHaveAttribute('aria-pressed', 'true');
  });

  /* The keyboard has to be somewhere. Moving the selection without moving
     focus leaves the next press starting from wherever focus was stranded. */
  it('moves focus to the row it selected', () => {
    render(<Harness />);
    fireEvent.keyDown(body(), { key: 'ArrowDown' });
    expect(screen.getByRole('button', { name: 'a' })).toHaveFocus();
    fireEvent.keyDown(body(), { key: 'End' });
    expect(screen.getByRole('button', { name: 'c' })).toHaveFocus();
  });

  it('leaves every other key to the page', () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    for (const key of ['Enter', ' ', 'Tab', 'Escape', 'a', 'PageDown']) {
      fireEvent.keyDown(body(), { key });
    }
    expect(onSelect).not.toHaveBeenCalled();
  });

  /*
   * Three of the nine copies guarded this and six did not, with nothing to say
   * why. Unguarded, ArrowDown on an empty list selects `ids[-1]` — undefined —
   * and the register's selected id becomes a value it does not hold.
   */
  it('selects nothing when the register is empty', () => {
    const onSelect = vi.fn();
    render(<Harness rows={[]} onSelect={onSelect} />);
    for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End']) {
      fireEvent.keyDown(body(), { key });
    }
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('walks a one-row register without leaving it', () => {
    render(<Harness rows={['only']} />);
    for (const key of ['ArrowDown', 'ArrowDown', 'ArrowUp', 'End', 'Home']) {
      fireEvent.keyDown(body(), { key });
    }
    expect(screen.getByRole('button', { name: 'only' })).toHaveAttribute('aria-pressed', 'true');
  });

  /* A register whose rows are named differently still moves focus, because the
     attribute is a parameter rather than a convention this guesses. */
  it('follows whichever attribute the register stamps on its rows', () => {
    function Other() {
      const [selected, setSelected] = useState<string | null>(null);
      return (
        <table><tbody data-testid="rows" onKeyDown={registerKeys({ ids: ROWS, selected, select: setSelected, attribute: 'data-thing' })}>
          {ROWS.map((id) => <tr key={id}><td><button type="button" data-thing={id}>{id}</button></td></tr>)}
        </tbody></table>
      );
    }
    render(<Other />);
    fireEvent.keyDown(body(), { key: 'End' });
    expect(screen.getByRole('button', { name: 'c' })).toHaveFocus();
  });

  it('takes the arrow keys from the page so the register does not scroll under the reader', () => {
    render(<Harness />);
    const event = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
    body().dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
