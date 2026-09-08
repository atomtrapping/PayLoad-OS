import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useState } from 'react';
import { openedWith, useLinkedSelection } from './useLinkedSelection';

/** A surface with one selection, so the hook is tested through the thing it is for. */
function Surface({ ready = true, holds = ['a', 'b'] }: { ready?: boolean; holds?: string[] }) {
  const [selected, setSelected] = useState<string | null>(() => {
    const opened = openedWith().row;
    return opened && holds.includes(opened) ? opened : null;
  });
  useLinkedSelection({ row: selected }, (values) => { if (values.row && holds.includes(values.row)) setSelected(values.row); }, ready);
  return (
    <div>
      <output data-testid="selected">{selected ?? 'none'}</output>
      {['a', 'b'].map((row) => <button key={row} type="button" onClick={() => setSelected(row)}>{row}</button>)}
      <button type="button" onClick={() => setSelected(null)}>clear</button>
    </div>
  );
}

const at = (hash: string) => { window.history.replaceState(null, '', `/surface${hash}`); };

beforeEach(() => { at(''); });
afterEach(() => { at(''); });

describe('a selection is a link', () => {
  it('writes what is selected into the URL, without a hash when nothing is', async () => {
    const user = userEvent.setup();
    render(<Surface />);
    expect(window.location.hash).toBe('');
    await user.click(screen.getByRole('button', { name: 'a' }));
    expect(window.location.hash).toBe('#row=a');
    await user.click(screen.getByRole('button', { name: 'b' }));
    expect(window.location.hash).toBe('#row=b');
    await user.click(screen.getByRole('button', { name: 'clear' }));
    expect(window.location.hash).toBe('');
    expect(window.location.pathname).toBe('/surface');
  });

  it('opens on what the link named', () => {
    at('#row=b');
    render(<Surface />);
    expect(screen.getByTestId('selected')).toHaveTextContent('b');
  });

  it('opens on nothing when the link names something this surface does not hold', () => {
    // An inspector opened on an id the page has never seen is a worse answer
    // than no inspector, so the guard is the surface's and it is applied.
    at('#row=zzz');
    render(<Surface />);
    expect(screen.getByTestId('selected')).toHaveTextContent('none');
  });

  it('takes a link pasted into the bar this page is already in', () => {
    render(<Surface />);
    at('#row=a');
    act(() => { window.dispatchEvent(new HashChangeEvent('hashchange')); });
    expect(screen.getByTestId('selected')).toHaveTextContent('a');
  });

  it('replaces rather than pushes, so Back still means the page before this one', async () => {
    const user = userEvent.setup();
    render(<Surface />);
    const before = window.history.length;
    await user.click(screen.getByRole('button', { name: 'a' }));
    await user.click(screen.getByRole('button', { name: 'b' }));
    // Six selections down a register would otherwise be six entries in the
    // back button, and Back is the one control that has to mean one thing.
    expect(window.history.length).toBe(before);
  });

  it('writes nothing before the surface is ready, so a link survives its own page loading', () => {
    // The first render of a surface waiting on data has selected nothing. If
    // that were written, the link would be erased before it was read.
    at('#row=a');
    render(<Surface ready={false} holds={[]} />);
    expect(screen.getByTestId('selected')).toHaveTextContent('none');
    expect(window.location.hash).toBe('#row=a');
  });
});
