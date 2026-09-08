/**
 * The workspace drawn from its own registry.
 *
 * The rail is a good list and a poor map: twenty-eight destinations in seven
 * areas, read a screenful at a time, with no way to see the shape of the thing
 * you are moving around in. Someone arriving at this terminal can find a page
 * they can name and cannot find out what else there is.
 *
 * The atlas is the same registry as a figure. It adds no destination, renames
 * nothing, and reads no store: everything below is derived from `nav.ts`, so an
 * eighth area appears in the drawing the moment it appears in the registry and
 * needs no drawing code of its own. That is the same rule the rail's numbered
 * bands already follow.
 *
 * WHAT THE GEOMETRY MEANS
 *
 * One cell per destination, every cell the same size. An area's block is
 * therefore exactly as large as the number of destinations it holds, and that
 * is the one quantity the figure carries. Reading order — left to right within
 * a band, then down — is registry order, which is the order the rail reads and
 * the order `Alt`+←/→ steps in, so the figure is a picture of the step order
 * rather than a second arrangement of the same names.
 *
 * WHAT IT DOES NOT MEAN
 *
 * `ATLAS_LOSS` says so on the surface, and the tests hold it to saying so. The
 * short of it: size is a count and not an importance, adjacency is an order and
 * not a workflow, and nothing here reports whether a destination works.
 */
import { NAV_AREAS, NAV_DESTINATIONS, indexOf, step, type NavArea, type NavDestination } from './nav';

export interface AtlasCell {
  href: string;
  label: string;
  /** Position in the flat registry order, from 1, so the readout and the figure agree. */
  position: number;
  here: boolean;
}

export interface AtlasBand {
  id: NavArea['id'];
  label: string;
  activity: string;
  /** The area's number, from 1, the same number the rail's band head carries. */
  number: number;
  /** How many destinations the area holds. This is the band's size and its only quantity. */
  count: number;
  cells: AtlasCell[];
  /** Whether the destination you are on is in this band. */
  here: boolean;
}

export interface Atlas {
  bands: AtlasBand[];
  areas: number;
  destinations: number;
  /** The widest band, which is how many cells a row of the figure has to hold. */
  widest: number;
  /** Where you are, or null when the path is not a registered destination. */
  here: { position: number; band: AtlasBand; cell: AtlasCell } | null;
  /** The neighbours in step order, reported only from a known position. */
  previous: NavDestination | null;
  next: NavDestination | null;
}

/**
 * Read the atlas for a path.
 *
 * Pure: it takes a string and returns a shape. No clock, no store, no
 * environment — which is what lets it be tested as arithmetic and what keeps
 * the figure from acquiring a claim about the system's state by accident.
 */
export function readAtlas(pathname: string): Atlas {
  const at = indexOf(pathname);
  const bands: AtlasBand[] = [];
  for (const [index, area] of NAV_AREAS.entries()) {
    const cells: AtlasCell[] = [];
    for (const item of area.items) {
      // Anchors are a second way into a page already in the figure. Drawing
      // them would put one place in two cells and make the count a count of
      // links rather than of destinations.
      if (item.href.includes('#')) continue;
      const position = NAV_DESTINATIONS.findIndex((destination) => destination.href === item.href) + 1;
      cells.push({ href: item.href, label: item.label, position, here: position - 1 === at });
    }
    bands.push({
      id: area.id, label: area.label, activity: area.activity, number: index + 1,
      count: cells.length, cells, here: cells.some((cell) => cell.here),
    });
  }

  const band = bands.find((entry) => entry.here) ?? null;
  const cell = band?.cells.find((entry) => entry.here) ?? null;
  return {
    bands,
    areas: bands.length,
    destinations: NAV_DESTINATIONS.length,
    widest: bands.reduce((widest, entry) => Math.max(widest, entry.count), 0),
    here: band && cell ? { position: cell.position, band, cell } : null,
    // From an unregistered path there is no position, so there is no step from
    // it either. `step` would answer anyway, from an assumed start; the atlas
    // would rather say it does not know than draw an arrow it invented.
    previous: at < 0 ? null : step(pathname, -1),
    next: at < 0 ? null : step(pathname, 1),
  };
}

export const ATLAS_LOSS = [
  'A band is as large as the number of destinations in its area. That is a count of pages and not an importance, a size, a workload, a completeness or a share of the system.',
  'Reading order is registry order — the order the rail reads and the order Alt with the arrow keys steps in. Two neighbouring cells are neighbours in that list and not stages of a workflow, and nothing here says one is done before another.',
  'This is drawn from the navigation registry alone. It reads no store, no rail and no clock, so no cell reports whether its destination is reachable, holds data, or is working; a cell is a place in this terminal and says nothing more.',
  'One cell per destination, so a page reachable by more than one route appears once. The figure maps places rather than links.',
] as const;
