/**
 * Every fixture-backed screen says so. This banner is not decorative.
 *
 * Drawn as a stamp line rather than a tinted bar: the references print their
 * provenance into the chrome in mono, and a fill would be the one thing on the
 * page that is coloured without meaning something. The accent stays on the
 * label and the rule beneath, which is where a reader's eye lands first.
 */
export function FixtureBanner({ note }: { note?: string }) {
  return (
    <div
      role="note"
      aria-label="Demonstration fixture"
      className="flex items-start gap-3 px-3 py-1.5 text-[11.5px] border-b mono"
      style={{ borderColor: 'rgba(var(--accent-rgb), 0.45)', color: 'var(--text-secondary)' }}
    >
      <span className="label-sm shrink-0" style={{ color: 'var(--accent-strong)' }}>fixture_only: true</span>
      {/* min-w-0 lets the flex item shrink below its own text; break-words
          lets the text itself break when it still does not fit. Both are
          needed and the first alone was not: a note ending in a documentation
          path is one unbreakable 38-character token in mono, which measured
          249px inside a 229px box and pushed the document 9px past a 412px
          viewport — enough to widen the layout viewport and rescale the page.
          Every screen carries this banner, so it is fixed here once. */}
      <span className="min-w-0 break-words">{note ?? 'Demonstration data. Synthetic, deterministic and committed. Not a production endpoint.'}</span>
    </div>
  );
}
