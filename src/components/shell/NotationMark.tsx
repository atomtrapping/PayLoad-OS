/**
 * The Notation Systems mark: an eighth note, one filled silhouette.
 *
 * Traced as a vector from the raster the operator supplied, so it is a faithful
 * copy and not the original artwork. It is one file and one path on purpose: if
 * the authoritative vector exists, replacing the contents of this component and
 * `src/app/icon.svg` swaps the mark everywhere it appears, and nothing else in
 * the shell knows its shape.
 *
 * It paints in `currentColor` and carries no ground of its own, so it takes the
 * colour of whatever it sits in and reads correctly in both themes. The favicon
 * is the one place that needs its own ground, because a browser tab supplies
 * none.
 *
 * Decorative by declaration: every place it appears sits inside a link or
 * heading that already carries the accessible name, so announcing it again
 * would read the brand twice.
 */
export function NotationMark({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} fill="currentColor" aria-hidden="true" focusable="false" role="presentation" data-testid="notation-mark">
      <ellipse cx="33" cy="73" rx="18" ry="16.5" transform="rotate(-18 33 73)" />
      <path d="M39 12 C58 6 78 8 82 26 C85 42 77 54 71 62 C76 46 78 33 73 28 C67 23 59 26 54 30 C53 45 51 58 49 70 C48 79 38 79 40 68 C45 48 46 30 39 12 Z" />
    </svg>
  );
}
