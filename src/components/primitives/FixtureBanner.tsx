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
      <span>{note ?? 'Demonstration data. Synthetic, deterministic and committed. Not a production endpoint.'}</span>
    </div>
  );
}
