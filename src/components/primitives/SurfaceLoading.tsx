import { Panel } from '@/components/hud/Instrument';

/**
 * What a surface shows while it is waiting for its source.
 *
 * The one this replaced was a bare line of muted text — "Loading case data
 * from the current source…" — centred in a 720px column, on every route in the
 * application. Three things were wrong with it and each matters here.
 *
 * It named the wrong thing. Most of these surfaces are not reading case data:
 * the release catalogue reads the corpus, the Earth Twin reads a release, the
 * production path reads a local rail. A terminal that will not call an
 * unreadable count a zero should not tell a reader it is fetching something it
 * is not, so the source is named by the surface that knows it.
 *
 * It was shaped like nothing else. A 720px centred column standing in for a
 * 1400px register meant the page arrived somewhere other than where the wait
 * had been, and the reader's eye had to start again.
 *
 * And it read as a broken page rather than as a waiting one. There was no
 * frame, no heading and no mark of the instrument — on a slow source, a blank
 * screen with one grey sentence is indistinguishable from a surface that
 * failed to render.
 *
 * WHY THERE IS NO SKELETON
 *
 * A skeleton draws rows that are not there. On these surfaces an empty region
 * is a fact about the corpus — a release with no retractions, a case with no
 * rulings — so a grey shape where a row will be is a shape the reader has been
 * told to expect and may not get. This states that the page is waiting instead
 * of miming the page it is waiting for. Nothing animates, for the same reason
 * nothing animates anywhere else here: progress is named, not spun.
 */
export function SurfaceLoading({ reading }: { reading: string }) {
  return (
    <div className="p-3 sm:p-4 max-w-[1400px] mx-auto w-full" role="status" aria-live="polite">
      <Panel label="Reading" testId="surface-loading">
        <p className="m-0 text-[13px]" style={{ color: 'var(--text-secondary)' }}>{reading}</p>
        <p className="m-0 mt-2 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
          Nothing is drawn until it has arrived. An empty region on these surfaces is a fact about the corpus, so this says the page is waiting rather than showing a shape it does not yet have.
        </p>
      </Panel>
    </div>
  );
}
