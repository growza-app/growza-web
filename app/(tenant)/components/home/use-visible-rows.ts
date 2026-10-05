import { useEffect, type RefObject } from 'react';

/** Jira GRW-547 — how many rows of a token list are in view on a phone; the rest scroll inside the list. */
export const VISIBLE_ROWS = 5;

/** How many rows a phone's list draws at first, and how many more each "Show more" adds. */
export const SHOW_STEP = 10;

/**
 * On a phone each token list is as tall as its first five rows, and scrolls inside itself past that.
 *
 * The height is MEASURED, not a number of pixels: a row is one line or three (a long name drops its wait under it,
 * the two buttons wrap), so five rows is not a fixed height. It is the distance from the first row's top to the
 * sixth's, which `offsetTop` gives against the same parent whatever the list has scrolled to. It is written as a
 * CSS variable, so the stylesheet decides where it applies (phone only) and a laptop keeps its own cap (GRW-452).
 *
 * Re-measured when the width changes (a rotation, Larger Text re-wrap the rows) and when the board's lists change.
 * `data-more` says there is more below, for the soft fade at the bottom edge: a list that scrolls must look like it.
 */
export function useVisibleRows(board: RefObject<HTMLElement | null>, enabled: boolean, deps: ReadonlyArray<unknown>) {
  useEffect(() => {
    const root = board.current;
    if (!root) return;
    const lists = Array.from(root.querySelectorAll<HTMLElement>('.tb-rows'));

    const measure = () => {
      for (const list of lists) {
        const rows = list.children;
        if (!enabled || list.offsetParent === null) {
          list.style.removeProperty('--tb-visible');
          list.removeAttribute('data-more');
          continue;
        }
        // Five rows or fewer: no row cap of its own, but the screen's cap (60dvh, in the sheet) can still make it scroll.
        if (rows.length <= VISIBLE_ROWS) {
          list.style.removeProperty('--tb-visible');
          flag(list);
          continue;
        }
        const first = rows[0] as HTMLElement;
        const sixth = rows[VISIBLE_ROWS] as HTMLElement;
        list.style.setProperty('--tb-visible', `${sixth.offsetTop - first.offsetTop}px`);
        flag(list);
      }
    };
    const flag = (list: HTMLElement) => {
      const more = list.scrollTop + list.clientHeight < list.scrollHeight - 1;
      if (more) list.setAttribute('data-more', '');
      else list.removeAttribute('data-more');
    };

    measure();
    const onScroll = (e: Event) => flag(e.currentTarget as HTMLElement);
    for (const list of lists) list.addEventListener('scroll', onScroll, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    for (const list of lists) observer?.observe(list);
    window.addEventListener('resize', measure);
    return () => {
      for (const list of lists) list.removeEventListener('scroll', onScroll);
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `deps` is the caller's list of what changes the rows
  }, [board, enabled, ...deps]);
}
