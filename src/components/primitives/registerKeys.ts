import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

/**
 * Arrow-key navigation down a register, in one place.
 *
 * Nine registers had grown their own copy of this handler — the case queue,
 * the release, ruling, corpus, coverage, class, stable, board and mining
 * registers — and the nine differed only in which list they walked, which
 * attribute the row button carries, and which setter they called. Two of the
 * nine had a keyboard test. The other seven were carried along by copy-paste
 * and checked by nobody, which is the arrangement where one register quietly
 * stops behaving like the rest and no test notices.
 *
 * THE ONE DIFFERENCE THAT WAS NOT A DIFFERENCE
 *
 * Three of the nine returned early on an empty list and six did not, with
 * nothing to say why. On an empty list `indexOf` gives -1, ArrowDown computes
 * `Math.min(-1, 0)` and the selection is set to `ids[-1]`, which is undefined.
 * The three static registers could never reach it; the six dynamic ones could
 * only reach it if focus were inside a tbody that has no rows to focus. The
 * split was not a decision, so this guards always.
 *
 * WHY FOCUS MOVES AND NOT JUST SELECTION
 *
 * A reader arrowing down a table expects the keyboard to be somewhere. Setting
 * the selection without moving focus leaves the next arrow press starting from
 * wherever focus was stranded, so the row button is focused by the attribute
 * the register stamps on it. That is why `attribute` is a parameter rather than
 * a convention: each register names its rows differently, and a handler that
 * guessed the name would silently stop moving focus the day one was renamed.
 */
export function registerKeys<T extends string>(register: {
  /** The rows, in the order the reader sees them. */
  ids: readonly T[];
  selected: T | null;
  select: (id: T) => void;
  /** The data attribute the row button carries, e.g. `data-case-select`. */
  attribute: string;
}) {
  return (event: ReactKeyboardEvent<HTMLElement>) => {
    const { ids, selected, select, attribute } = register;
    if (ids.length === 0) return;
    const at = ids.indexOf((selected ?? '') as T);
    let next: number;
    if (event.key === 'ArrowDown') next = Math.min(ids.length - 1, at + 1);
    else if (event.key === 'ArrowUp') next = Math.max(0, at < 0 ? 0 : at - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = ids.length - 1;
    else return;
    event.preventDefault();
    select(ids[next]);
    (event.currentTarget.querySelector(`[${attribute}="${ids[next]}"]`) as HTMLElement | null)?.focus();
  };
}
