import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { Sidebar } from './Sidebar';
import { NAV_DESTINATIONS } from './nav';

const push = vi.fn();
let pathname = '/releases';
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }), usePathname: () => pathname }));

beforeEach(() => {
  push.mockClear();
  pathname = '/releases';
  // The page-stepping shortcut reads the address bar, so the address bar is
  // part of the fixture rather than something jsdom happens to have left set.
  window.history.replaceState(null, '', '/releases');
});
afterEach(() => { vi.unstubAllGlobals(); });

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

  /*
   * The origin of a step is the address bar, not the render.
   *
   * They are the same at rest and they are not during a navigation: the router
   * writes the URL, and the effect that re-attaches the listener runs a commit
   * later. Here the address bar moves with no re-render at all, which is that
   * window held open. Before this was read from `window.location`, the second
   * press of a reader stepping forward and back was computed from where they
   * started: /releases, Alt+Right to /retractions, Alt+Left to /stream. It was
   * measured in a browser at a CPU throttled eight times, and it is arithmetic
   * here, so it cannot come back as a test that passes on a fast machine.
   */
  it('steps from the page the address bar names, not the one it rendered for', async () => {
    const user = userEvent.setup();
    render(<Sidebar />);
    const at = NAV_DESTINATIONS.findIndex((entry) => entry.href === '/releases');
    window.history.replaceState(null, '', NAV_DESTINATIONS[at + 1].href);
    await user.keyboard('{Alt>}{ArrowLeft}{/Alt}');
    expect(push).toHaveBeenCalledWith('/releases');
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

describe('the rail reveals destinations in the actual scroll owner', () => {
  it('scrolls the desktop sidebar on navigation, not its non-scrolling list', () => {
    const view = render(<Sidebar />);
    const sidebar = screen.getByRole('complementary');
    const rail = screen.getByTestId('nav-rail');
    const scroll = vi.fn();
    Object.defineProperties(sidebar, {
      clientHeight: { value: 300 }, scrollHeight: { value: 1300 },
      scrollTo: { value: scroll },
      getBoundingClientRect: { value: () => ({ top: 80, bottom: 380, height: 300 }) },
    });
    const earth = screen.getByRole('link', { name: 'Earth Twin' });
    earth.getBoundingClientRect = () => ({ top: 800, bottom: 832, height: 32 }) as DOMRect;
    pathname = '/earth';
    view.rerender(<Sidebar />);
    expect(scroll).toHaveBeenCalledWith({ top: 586, behavior: 'instant' });
    expect(rail.scrollTop).toBe(0);
  });

  it('keeps the narrow horizontal strip as its own scroll owner', () => {
    const view = render(<Sidebar />);
    const rail = screen.getByTestId('nav-rail');
    const scroll = vi.fn();
    Object.defineProperties(rail, {
      clientWidth: { value: 400 }, scrollWidth: { value: 3000 },
      scrollTo: { value: scroll },
      getBoundingClientRect: { value: () => ({ left: 0, right: 400, width: 400 }) },
    });
    const earth = screen.getByRole('link', { name: 'Earth Twin' });
    earth.getBoundingClientRect = () => ({ left: 2000, right: 2100, width: 100 }) as DOMRect;
    pathname = '/earth';
    view.rerender(<Sidebar />);
    expect(scroll).toHaveBeenCalledWith({ left: 1850, behavior: 'instant' });
  });

  it('names all product lines without asserting a hardcoded active domain', () => {
    render(<Sidebar />);
    expect(screen.getByTestId('shell-context')).toHaveTextContent('Caravan / Tradewind / Landshark');
    expect(screen.getByTestId('shell-context')).toHaveTextContent('Every screen says which.');
  });

  it.each([true, false])('respects reduced motion (%s) when arrow keys reveal a destination', async (reduced) => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: reduced })));
    const user = userEvent.setup();
    render(<Sidebar />);
    const sidebar = screen.getByRole('complementary');
    const scroll = vi.fn();
    Object.defineProperties(sidebar, {
      clientHeight: { value: 300 }, scrollHeight: { value: 1300 },
      scrollTo: { value: scroll },
      getBoundingClientRect: { value: () => ({ top: 80, bottom: 380, height: 300 }) },
    });
    const links = railLinks();
    links[1].getBoundingClientRect = () => ({ top: 800, bottom: 832, height: 32 }) as DOMRect;
    links[0].focus();
    await user.keyboard('{ArrowDown}');
    expect(window.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
    expect(scroll).toHaveBeenCalledWith({ top: 586, behavior: reduced ? 'instant' : 'smooth' });
  });
});
