import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceAtlas } from './WorkspaceAtlas';
import { readAtlas } from './atlas';
import { NAV_AREAS, NAV_DESTINATIONS } from './nav';

let pathname = '/releases';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

beforeEach(() => { pathname = '/releases'; });

const cells = () => [...screen.getByTestId('atlas-bands').querySelectorAll<HTMLAnchorElement>('a.atlas-cell')];

describe('the figure draws the registry, cell for cell', () => {
  it('draws every destination once, in registry order, as a link to it', () => {
    render(<WorkspaceAtlas />);
    const drawn = cells();
    expect(drawn.map((cell) => cell.getAttribute('href'))).toEqual(NAV_DESTINATIONS.map((destination) => destination.href));
    expect(drawn).toHaveLength(NAV_DESTINATIONS.length);
  });

  it('heads every band with its number, name, activity and size', () => {
    render(<WorkspaceAtlas />);
    for (const [index, area] of NAV_AREAS.entries()) {
      const band = screen.getByTestId('atlas-bands').querySelector<HTMLElement>(`[data-area="${area.id}"] .atlas-band-head`)!;
      expect(band.textContent).toContain(String(index + 1).padStart(2, '0'));
      expect(band.textContent).toContain(area.label);
      // The activity line has nowhere to be shown on the rail. This is the
      // surface that exists to say what an area is for, so it says it.
      expect(band.textContent).toContain(area.activity);
    }
  });

  it('numbers each cell with its place in the step order, which is what the numbers are for', () => {
    render(<WorkspaceAtlas />);
    expect(cells().map((cell) => cell.dataset.position)).toEqual(NAV_DESTINATIONS.map((_, index) => String(index + 1)));
  });

  it('states the scale of the figure so its geometry can be read', () => {
    render(<WorkspaceAtlas />);
    const scale = screen.getByTestId('atlas-scale').textContent ?? '';
    const atlas = readAtlas('/releases');
    expect(scale).toContain(String(atlas.areas));
    expect(scale).toContain(String(atlas.destinations));
    expect(scale).toContain(String(atlas.widest));
  });
});

describe('where you are, and what is either side of it', () => {
  it('marks the destination you are on, and only it', () => {
    render(<WorkspaceAtlas />);
    const marked = cells().filter((cell) => cell.getAttribute('aria-current') === 'page');
    expect(marked).toHaveLength(1);
    expect(marked[0]).toHaveAttribute('href', '/releases');
    expect(screen.getByTestId('atlas-position').textContent).toContain('Releases');
  });

  it('names the neighbours in step order with the keys that reach them', () => {
    render(<WorkspaceAtlas />);
    const position = screen.getByTestId('atlas-position').textContent ?? '';
    const atlas = readAtlas('/releases');
    expect(position).toContain(atlas.previous!.label);
    expect(position).toContain(atlas.next!.label);
    expect(position).toContain('Alt');
  });

  it('says it does not know where you are rather than marking a plausible cell', () => {
    pathname = '/nowhere';
    render(<WorkspaceAtlas />);
    expect(cells().some((cell) => cell.hasAttribute('aria-current'))).toBe(false);
    const position = screen.getByTestId('atlas-position').textContent ?? '';
    expect(position).toMatch(/not one of the \d+ destinations/);
    expect(position).not.toContain('Alt');
    // And the map is still drawn.
    expect(cells()).toHaveLength(NAV_DESTINATIONS.length);
  });
});

describe('the figure is one tab stop and moves on two axes', () => {
  it('makes exactly one cell tabbable, and it is where you are', async () => {
    const user = userEvent.setup();
    render(<WorkspaceAtlas />);
    const tabbable = cells().filter((cell) => cell.tabIndex === 0);
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toHaveAttribute('aria-current', 'page');
    await user.tab();
    expect(document.activeElement).toHaveAttribute('href', '/releases');
  });

  it('falls back to the first cell when the figure marks none', () => {
    pathname = '/nowhere';
    render(<WorkspaceAtlas />);
    const tabbable = cells().filter((cell) => cell.tabIndex === 0);
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toHaveAttribute('href', NAV_DESTINATIONS[0].href);
  });

  it('moves left and right along the destinations, wrapping at the ends', async () => {
    const user = userEvent.setup();
    render(<WorkspaceAtlas />);
    const drawn = cells();
    drawn[0].focus();
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(drawn[1]);
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(document.activeElement).toBe(drawn[drawn.length - 1]);
  });

  it('moves up and down between bands, because here the two axes are different things', async () => {
    const user = userEvent.setup();
    render(<WorkspaceAtlas />);
    const atlas = readAtlas('/releases');
    const drawn = cells();
    // The first cell of the first band; Down lands on the first cell of the second.
    drawn[0].focus();
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toHaveAttribute('href', atlas.bands[1].cells[0].href);
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toHaveAttribute('href', atlas.bands[0].cells[0].href);
  });

  it('keeps your place along the band when the next one is long enough to hold it', async () => {
    // The clamp below is only visible where it does not bite. Without this
    // case, a vertical move that always landed on a band's first cell passed
    // every other test here — it did, until this one.
    const user = userEvent.setup();
    render(<WorkspaceAtlas />);
    const atlas = readAtlas('/releases');
    const at = atlas.bands.findIndex((band, index) => band.count >= 2 && (atlas.bands[index + 1]?.count ?? 0) >= 2);
    expect(at, 'two adjacent bands of two or more').toBeGreaterThanOrEqual(0);
    const from = cells().find((cell) => cell.getAttribute('href') === atlas.bands[at].cells[1].href)!;
    from.focus();
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toHaveAttribute('href', atlas.bands[at + 1].cells[1].href);
  });

  it('lands on a short band’s last cell rather than losing the movement', async () => {
    const user = userEvent.setup();
    render(<WorkspaceAtlas />);
    const atlas = readAtlas('/releases');
    // Products holds eight; System, above it, holds one. Moving up from the
    // eighth of a long band has nowhere to be but the end of the short one.
    const products = atlas.bands.find((band) => band.id === 'products')!;
    const last = cells().find((cell) => cell.getAttribute('href') === products.cells[products.count - 1].href)!;
    last.focus();
    await user.keyboard('{ArrowUp}');
    const system = atlas.bands.find((band) => band.id === 'system')!;
    expect(document.activeElement).toHaveAttribute('href', system.cells[system.count - 1].href);
  });

  it('reaches both ends with Home and End', async () => {
    const user = userEvent.setup();
    render(<WorkspaceAtlas />);
    const drawn = cells();
    drawn[3].focus();
    await user.keyboard('{End}');
    expect(document.activeElement).toBe(drawn[drawn.length - 1]);
    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(drawn[0]);
  });

  it('leaves Alt to the shell, which is what steps pages', async () => {
    const user = userEvent.setup();
    render(<WorkspaceAtlas />);
    const drawn = cells();
    drawn[0].focus();
    await user.keyboard('{Alt>}{ArrowRight}{/Alt}');
    expect(document.activeElement).toBe(drawn[0]);
  });
});

describe('what the figure says it is not', () => {
  it('states the loss on the surface, not only in the module', () => {
    render(<WorkspaceAtlas />);
    const loss = screen.getByTestId('atlas-loss').textContent ?? '';
    expect(loss).toMatch(/count of pages and not an importance/);
    expect(loss).toMatch(/reads no store, no rail and no clock/);
  });

  it('gives no cell a state, a colour or a mark beyond where you are', () => {
    render(<WorkspaceAtlas />);
    for (const cell of cells()) {
      const marked = cell.getAttribute('aria-current') === 'page';
      expect(cell.dataset.here).toBe(String(marked));
      // Nothing on a cell reports health, freshness or standing: the only
      // attributes it carries are its place and whether you are on it.
      expect([...cell.attributes].map((attribute) => attribute.name).sort())
        .toEqual(marked
          ? ['aria-current', 'class', 'data-here', 'data-position', 'href', 'tabindex']
          : ['class', 'data-here', 'data-position', 'href', 'tabindex']);
    }
  });
});
