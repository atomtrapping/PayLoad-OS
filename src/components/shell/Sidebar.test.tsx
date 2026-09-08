import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Sidebar } from './Sidebar';
import { NAV_DESTINATIONS } from './nav';

const push = vi.fn();
let pathname = '/releases';
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }), usePathname: () => pathname }));
vi.mock('@/components/notations/NotationWorkspace', () => ({ useNotationDraftStatus: () => null }));

beforeEach(() => { push.mockClear(); pathname = '/releases'; });

const railLinks = () => [...screen.getByTestId('nav-rail').querySelectorAll<HTMLAnchorElement>('a.nav-link')];

describe('the rail is one tab stop, not twenty-six', () => {
  it('makes exactly one link tabbable, and it is the current page', () => {
    render(<Sidebar />);
    const tabbable = railLinks().filter((link) => link.tabIndex === 0);
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toHaveAttribute('aria-current', 'page');
    expect(tabbable[0]).toHaveTextContent('Releases');
  });

  it('falls back to the first destination when the page is not on the rail', () => {
    pathname = '/nowhere';
    render(<Sidebar />);
    const tabbable = railLinks().filter((link) => link.tabIndex === 0);
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toHaveTextContent(NAV_DESTINATIONS[0].label);
  });

  it('reaches the rail in one Tab from the start of the document', async () => {
    const user = userEvent.setup();
    render(<Sidebar />);
    await user.tab();
    expect(document.activeElement).toHaveAttribute('aria-current', 'page');
  });
});

describe('the arrow keys move in the rail, on both axes', () => {
  /** The same list is a column on a wide screen and a strip on a narrow one, so both pairs move. */
  it('moves down and up, and right and left, through the whole rail', async () => {
    const user = userEvent.setup();
    render(<Sidebar />);
    const links = railLinks();
    links[0].focus();
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(links[1]);
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(links[2]);
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(links[1]);
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(links[0]);
  });

  it('crosses from one area into the next rather than stopping at its edge', async () => {
    const user = userEvent.setup();
    render(<Sidebar />);
    const links = railLinks();
    const lastOfFirstArea = links.findIndex((link) => link.textContent?.trim() === 'Operating model');
    expect(lastOfFirstArea).toBeGreaterThan(0);
    links[lastOfFirstArea].focus();
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(links[lastOfFirstArea + 1]);
  });

  it('wraps at both ends, and Home and End reach them', async () => {
    const user = userEvent.setup();
    render(<Sidebar />);
    const links = railLinks();
    links[0].focus();
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(links[links.length - 1]);
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(links[0]);
    await user.keyboard('{End}');
    expect(document.activeElement).toBe(links[links.length - 1]);
    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(links[0]);
  });

  it('leaves other keys to the browser', async () => {
    const user = userEvent.setup();
    render(<Sidebar />);
    const links = railLinks();
    links[0].focus();
    await user.keyboard('{PageDown}');
    expect(document.activeElement).toBe(links[0]);
  });
});

describe('Alt with an arrow steps to the next page from anywhere', () => {
  it('steps forward and back through the rail order', async () => {
    const user = userEvent.setup();
    render(<Sidebar />);
    const at = NAV_DESTINATIONS.findIndex((entry) => entry.href === '/releases');
    await user.keyboard('{Alt>}{ArrowRight}{/Alt}');
    expect(push).toHaveBeenCalledWith(NAV_DESTINATIONS[at + 1].href);
    push.mockClear();
    await user.keyboard('{Alt>}{ArrowLeft}{/Alt}');
    expect(push).toHaveBeenCalledWith(NAV_DESTINATIONS[at - 1].href);
  });

  /** Someone arrowing through a text field is editing, not navigating. */
  it('does not steal the arrow keys from a text field', async () => {
    const user = userEvent.setup();
    render(<><Sidebar /><input aria-label="a field" /></>);
    await user.click(screen.getByLabelText('a field'));
    await user.keyboard('{Alt>}{ArrowRight}{/Alt}');
    expect(push).not.toHaveBeenCalled();
  });

  it('leaves the rail’s own arrow keys alone when Alt is held', async () => {
    const user = userEvent.setup();
    render(<Sidebar />);
    const links = railLinks();
    links[0].focus();
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
    expect(document.activeElement).toBe(links[0]);
  });
});

describe('the keys are stated where the rail is', () => {
  it('tells the reader which keys move, rather than leaving them to be discovered', () => {
    render(<Sidebar />);
    const keys = screen.getByTestId('nav-keys');
    expect(keys).toHaveTextContent('move in the rail');
    expect(keys).toHaveTextContent('step pages');
    expect(keys).toHaveTextContent('jump');
  });
});
