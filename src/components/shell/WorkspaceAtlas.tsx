'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useRef } from 'react';
import { Panel } from '@/components/hud/Instrument';
import { ATLAS_LOSS, readAtlas, type Atlas } from './atlas';
import { SHORTCUT_DESCRIPTION, usePlatformKeys } from './platformKeys';

/**
 * The workspace as a figure you can move around in.
 *
 * The rail answers "where do I go from here" one screenful at a time. It does
 * not answer "what is here", and on a terminal with twenty-eight destinations
 * across seven areas that is the question someone arriving actually has. The
 * atlas answers it in one picture, drawn from the same registry the rail reads,
 * so the two can never disagree about what exists.
 *
 * THE DRAWING IS AN ARGUMENT, SO ITS GEOMETRY IS ONE QUANTITY
 *
 * Every cell is the same size and there is one per destination, so an area's
 * block is exactly as large as the number of destinations it holds — and the
 * ragged right edge of the figure is the shape of this system, not an
 * arrangement chosen to look like one. Nothing is scaled to fill, nothing is
 * weighted, and no second quantity is smuggled in through colour or size: the
 * only hues here are the navigation chrome and the selection gold, neither of
 * which asserts observation, verification or runtime health.
 *
 * Reading order is registry order, which is the order the rail reads and the
 * order `Alt`+←/→ steps in. So the numbers on the cells are the step order, and
 * the figure is a picture of the movement rather than a second arrangement of
 * the same names. `ATLAS_LOSS` states what the geometry is not, on the surface,
 * because a drawing that means one thing will be read as meaning several.
 *
 * MOVING IN IT
 *
 * Twenty-eight links would be twenty-eight tab stops, so the figure is one: a
 * roving tabindex, the same discipline the rail uses. Inside it the arrows move
 * as the figure looks — Left and Right along the destinations of a band, Up and
 * Down between bands — because here, unlike the rail, the two axes are actually
 * different things.
 */
export function WorkspaceAtlas() {
  const pathname = usePathname() ?? '/';
  const atlas = readAtlas(pathname);
  const figure = useRef<HTMLOListElement>(null);

  const cells = useCallback(
    () => [...(figure.current?.querySelectorAll<HTMLAnchorElement>('a.atlas-cell') ?? [])],
    [],
  );

  /** Where each band starts in the flat list, so Up and Down can move by band. */
  const starts = atlas.bands.reduce<number[]>((at, band) => [...at, (at[at.length - 1] ?? 0) + band.count], [0]);
  const bandOf = (index: number) => starts.findIndex((start, band) => index >= start && index < starts[band + 1]);

  const onKey = (event: React.KeyboardEvent) => {
    // Alt is the shell's page-stepping shortcut; the figure does not claim it.
    if (event.altKey || event.metaKey || event.ctrlKey) return;
    const all = cells();
    if (all.length === 0) return;
    const at = Math.max(0, all.indexOf(document.activeElement as HTMLAnchorElement));
    let next: number | null = null;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = all.length - 1;
    else if (event.key === 'ArrowRight') next = (at + 1) % all.length;
    else if (event.key === 'ArrowLeft') next = (at - 1 + all.length) % all.length;
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const band = bandOf(at);
      const within = at - starts[band];
      const to = (band + (event.key === 'ArrowDown' ? 1 : -1) + atlas.bands.length) % atlas.bands.length;
      // Keep the position within the band where the next band is long enough,
      // and land on its last cell where it is not, so a short band never
      // swallows the movement.
      next = starts[to] + Math.min(within, atlas.bands[to].count - 1);
    }
    if (next === null) return;
    event.preventDefault();
    all[next].focus();
  };

  // Exactly one cell is tabbable: the one you are on, or the first when the
  // figure marks none, so Tab lands somewhere meaningful either way.
  const tabbable = atlas.here?.cell.href ?? atlas.bands[0]?.cells[0]?.href ?? null;

  return (
    <Panel label="Workspace atlas" testId="workspace-atlas" right={<span className="mono text-[11px]" style={{ color: 'var(--text-muted)' }}>{atlas.destinations}</span>} className="atlas">
      <p className="atlas-scale" data-testid="atlas-scale">
        <span className="mono">{atlas.areas}</span> areas, <span className="mono">{atlas.destinations}</span> destinations, one cell each — so an area&rsquo;s block is as large as the number of places in it, and the largest holds <span className="mono">{atlas.widest}</span>.
      </p>

      <nav className="atlas-figure" aria-label="Workspace atlas" data-located={String(atlas.here !== null)}>
        <ol className="atlas-bands" ref={figure} onKeyDown={onKey} data-testid="atlas-bands">
          {atlas.bands.map((band) => (
            <li key={band.id} className="atlas-band" data-area={band.id} data-here={String(band.here)}>
              <div className="atlas-band-head">
                <span className="atlas-band-number" aria-hidden="true">{String(band.number).padStart(2, '0')}</span>
                <span className="atlas-band-label">{band.label}</span>
                {/* The activity line is the best short answer to "what is this
                    area for" and the rail has nowhere to put it. The atlas is
                    the surface that exists to answer that, so it is shown. */}
                <span className="atlas-band-activity">{band.activity}</span>
                <span className="atlas-band-count" aria-hidden="true">{band.count}</span>
              </div>
              <ol className="atlas-cells" aria-label={`${band.label}: ${band.count} ${band.count === 1 ? 'destination' : 'destinations'}`}>
                {band.cells.map((cell) => (
                  <li key={cell.href}>
                    <Link
                      href={cell.href}
                      className="atlas-cell"
                      aria-current={cell.here ? 'page' : undefined}
                      tabIndex={cell.href === tabbable ? 0 : -1}
                      data-position={cell.position}
                      data-here={String(cell.here)}
                    >
                      <span className="atlas-cell-position" aria-hidden="true">{String(cell.position).padStart(2, '0')}</span>
                      <span className="atlas-cell-label">{cell.label}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ol>
      </nav>

      <Position atlas={atlas} />

      <ul className="atlas-loss" data-testid="atlas-loss">
        {ATLAS_LOSS.map((loss) => <li key={loss}>{loss}</li>)}
      </ul>
    </Panel>
  );
}

/**
 * Where you are in the order, and what is either side of you in it.
 *
 * The numbers here are the numbers on the cells, so the sentence and the
 * drawing are the same statement twice. On a page the rail does not name there
 * is no position, and this says so rather than showing a plausible one.
 */
function Position({ atlas }: { atlas: Atlas }) {
  // The same modifier the rail names, named the same way: the figure and the
  // rail describe one movement and must not print two different keys for it.
  const keys = usePlatformKeys();
  if (!atlas.here) {
    return (
      <p className="atlas-position" data-testid="atlas-position">
        This page is not one of the {atlas.destinations} destinations the navigation names, so the figure marks none of them and there is no step from here.
      </p>
    );
  }
  const { position, band, cell } = atlas.here;
  return (
    <p className="atlas-position" data-testid="atlas-position">
      <span className="atlas-position-here">
        <span className="mono">{String(position).padStart(2, '0')}</span> of <span className="mono">{atlas.destinations}</span> · {band.label} / <strong>{cell.label}</strong>
      </span>
      {atlas.previous && atlas.next && (
        <span className="atlas-position-step">
          <kbd>{keys.alt}</kbd><kbd>←</kbd> {atlas.previous.label} · <kbd>{keys.alt}</kbd><kbd>→</kbd> {atlas.next.label}
          <span className="sr-only"> {SHORTCUT_DESCRIPTION.step}</span>
        </span>
      )}
    </p>
  );
}
