/**
 * The instrument primitives: a drawn frame, a labelled rule, a readout, a
 * segmented meter and a provenance stamp.
 *
 * Five pieces, because the references get their density from repeating a few
 * marks rather than from inventing a widget per panel. Everything here is
 * line-work over the void ground; nothing fills, glows or animates.
 *
 * The one rule these enforce rather than describe: a value that is UNKNOWN is
 * drawn as UNKNOWN whatever the caller said. `Readout` derives that state from
 * the value instead of trusting the prop, so a surface cannot label an
 * unreadable count as measured — by mistake or otherwise.
 */
import type { ReactNode } from 'react';
import { epistemicOfReading, type Epistemic } from '@/domain/epistemic';

export type { Epistemic };

/**
 * A drawn panel: one hairline, two corner registration marks, and an optional
 * stamp printed into its own frame. `state` tints the marks from the epistemic
 * scale; without one the panel is chrome and takes no hue.
 */
export function Panel({ state, label, right, stamp, children, className = '', testId }: {
  state?: Epistemic;
  /** The section rule above the body. Omitted for a panel that is only a frame. */
  label?: string;
  /** A state word or count carried at the right end of the rule. */
  right?: ReactNode;
  /** Provenance printed into the frame: the release, the digest, the clock. */
  stamp?: Array<{ k: string; v: string }>;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <section className={`hud-panel ${className}`} data-epistemic={state} data-testid={testId}>
      {label && (
        <div className="hud-bar" data-epistemic={state}>
          <span>{label}</span>
          {right !== undefined && <span className="hud-bar-state">{right}</span>}
        </div>
      )}
      <div className={label ? 'pt-2' : ''}>{children}</div>
      {stamp && stamp.length > 0 && (
        <div className="hud-stamp" data-testid={testId ? `${testId}-stamp` : undefined}>
          {stamp.map((entry) => <span key={entry.k} data-k={entry.k}>{entry.v}</span>)}
        </div>
      )}
    </section>
  );
}

/** The labelled rule on its own, for sectioning inside a panel that already has a frame. */
export function Rule({ label, right, state }: { label: string; right?: ReactNode; state?: Epistemic }) {
  return (
    <div className="hud-bar" data-epistemic={state}>
      <span>{label}</span>
      {right !== undefined && <span className="hud-bar-state">{right}</span>}
    </div>
  );
}

/**
 * A tiny caps label over a mono value.
 *
 * `'UNKNOWN'` prints the word and is drawn hollow. It is never a digit and
 * never a dash: a dash in a column of numbers reads as a zero, and this system
 * spends a great deal of effort upstream keeping those apart.
 */
export function Readout({ label, value, state, unit, layout = 'stack', testId }: {
  label: string;
  value: number | string;
  /** Ignored when the value is UNKNOWN, which is drawn as unknown regardless. */
  state?: Epistemic;
  unit?: string;
  /** 'row' rules the label to the value across the panel; 'stack' is for the one number a panel exists to show. */
  layout?: 'row' | 'stack';
  testId?: string;
}) {
  const unknown = value === 'UNKNOWN';
  const resolved: Epistemic = unknown ? 'UNKNOWN' : (state ?? epistemicOfReading(typeof value === 'number' ? value : 0));
  return (
    <div className="hud-readout" data-layout={layout} data-epistemic={resolved} data-testid={testId} data-value={String(value)}>
      <span className="hud-readout-label">{label}</span>
      <span className="hud-readout-value">
        {typeof value === 'number' ? value.toLocaleString('en-US') : value}
        {unit && !unknown && <span className="text-[11px] ml-1" style={{ color: 'var(--text-muted)' }}>{unit}</span>}
      </span>
    </div>
  );
}

/**
 * A meter drawn as discrete cells.
 *
 * The empty cells are drawn too, so the denominator is visible rather than
 * implied — a bar that only draws its filled part asks the reader to guess the
 * scale. With no reading the whole scale is dashed, because an empty
 * continuous bar reads as a measured zero and a dashed one does not.
 */
export function Segments({ label, filled, of, state, testId }: {
  label: string;
  /** 'UNKNOWN' draws the scale with nothing lit and every cell dashed. */
  filled: number | 'UNKNOWN';
  of: number;
  state?: Epistemic;
  testId?: string;
}) {
  const unknown = filled === 'UNKNOWN';
  const resolved: Epistemic = unknown ? 'UNKNOWN' : (state ?? 'MEASURED');
  const lit = unknown ? 0 : Math.max(0, Math.min(of, filled));
  return (
    <div className="flex flex-col gap-1 min-w-0" data-testid={testId}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="hud-readout-label">{label}</span>
        <span className="mono text-[11px]" data-epistemic={resolved} style={{ background: 'transparent' }}>
          {unknown ? 'UNKNOWN' : `${lit} / ${of}`}
        </span>
      </div>
      <div className="hud-seg" data-epistemic={resolved} role="img" aria-label={unknown ? `${label}: unknown` : `${label}: ${lit} of ${of}`}>
        {Array.from({ length: of }, (_, index) => <i key={index} data-on={String(!unknown && index < lit)} />)}
      </div>
    </div>
  );
}
