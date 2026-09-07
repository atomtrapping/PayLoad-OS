import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { CommandPalette } from './CommandPalette';
import { NAV_DESTINATIONS } from './nav';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

beforeEach(() => { push.mockClear(); });

const rows = () => within(screen.getByTestId('palette-list')).getAllByRole('option');
const openPalette = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByTestId('palette-open'));
  return screen.getByTestId('palette-field');
};

describe('CommandPalette', () => {
  it('offers a visible button, not only a shortcut nobody was told about', () => {
    render(<CommandPalette />);
    const button = screen.getByTestId('palette-open');
    expect(button).toBeInTheDocument();
    expect(button).toHaveAccessibleName(/Jump to a page/i);
    expect(screen.queryByTestId('palette')).not.toBeInTheDocument();
  });

  it('opens on Cmd+K and on Ctrl+K, and closes on the same keys', async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);
    await user.keyboard('{Meta>}k{/Meta}');
    expect(screen.getByTestId('palette')).toBeInTheDocument();
    await user.keyboard('{Meta>}k{/Meta}');
    expect(screen.queryByTestId('palette')).not.toBeInTheDocument();
    await user.keyboard('{Control>}k{/Control}');
    expect(screen.getByTestId('palette')).toBeInTheDocument();
  });

  it('lists every rail destination when nothing is typed', async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);
    await openPalette(user);
    expect(rows()).toHaveLength(NAV_DESTINATIONS.length);
    expect(rows()[0]).toHaveTextContent(NAV_DESTINATIONS[0].label);
  });

  it('narrows as you type and names the area each destination lands in', async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);
    const field = await openPalette(user);
    await user.type(field, 'harvest');
    const found = rows();
    expect(found).toHaveLength(1);
    expect(found[0]).toHaveTextContent('Statutory Harvester');
    expect(found[0]).toHaveTextContent('Acquisition');
  });

  it('goes to the highlighted destination on Enter', async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);
    const field = await openPalette(user);
    await user.type(field, 'clearance');
    await user.keyboard('{Enter}');
    expect(push).toHaveBeenCalledWith('/compute/clearance');
    expect(screen.queryByTestId('palette')).not.toBeInTheDocument();
  });

  it('moves the highlight with the arrow keys, and wraps', async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);
    const field = await openPalette(user);
    expect(rows()[0]).toHaveAttribute('data-active', 'true');
    await user.keyboard('{ArrowDown}');
    expect(rows()[1]).toHaveAttribute('data-active', 'true');
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(rows()[rows().length - 1]).toHaveAttribute('data-active', 'true');
    await user.keyboard('{Home}');
    expect(rows()[0]).toHaveAttribute('data-active', 'true');
    await user.keyboard('{End}');
    expect(rows()[rows().length - 1]).toHaveAttribute('data-active', 'true');
    expect(field).toHaveFocus();
  });

  /** A stale highlight would send Enter to a row that no longer matches. */
  it('returns the highlight to the top when the query changes', async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);
    const field = await openPalette(user);
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(rows()[2]).toHaveAttribute('data-active', 'true');
    await user.type(field, 'c');
    expect(rows()[0]).toHaveAttribute('data-active', 'true');
  });

  it('goes on a click', async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);
    const field = await openPalette(user);
    await user.type(field, 'earth');
    await user.click(rows()[0]);
    expect(push).toHaveBeenCalledWith('/earth');
  });

  it('says nothing matched rather than showing an empty box', async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);
    const field = await openPalette(user);
    await user.type(field, 'zzzznotathing');
    expect(screen.getByTestId('palette-empty')).toHaveTextContent('searches the same list and no other');
    await user.keyboard('{Enter}');
    expect(push).not.toHaveBeenCalled();
  });

  it('closes on Escape and on a click outside, without navigating', async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);
    await openPalette(user);
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('palette')).not.toBeInTheDocument();
    await openPalette(user);
    await user.click(screen.getByTestId('palette-scrim'));
    expect(screen.queryByTestId('palette')).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  /** Thinking better of it should not cost the reader their place. */
  it('returns focus to where it came from', async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);
    const button = screen.getByTestId('palette-open');
    await user.click(button);
    await user.keyboard('{Escape}');
    expect(button).toHaveFocus();
  });

  it('states the keys it answers to', async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);
    await openPalette(user);
    const hint = screen.getByTestId('palette-hint');
    expect(hint).toHaveTextContent('move');
    expect(hint).toHaveTextContent('go');
    expect(hint).toHaveTextContent('close');
    expect(hint).toHaveTextContent('step through the rail');
  });

  it('is a dialog with a combobox, so a screen reader is told what it is', async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);
    const field = await openPalette(user);
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    expect(field).toHaveAttribute('role', 'combobox');
    expect(field).toHaveAttribute('aria-expanded', 'true');
    expect(field.getAttribute('aria-activedescendant')).toBe(rows()[0].id);
  });
});
