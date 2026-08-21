import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Picks the page size that fills the screen so a paginated list never scrolls:
 * show as many rows as physically fit, page the rest. Scales to any device —
 * a 1080p monitor shows more rows than a phone, no hardcoded breakpoints — and
 * works for the mobile card layout too, measuring whichever row is visible.
 *
 * It measures the ACTUAL rendered result rather than estimating from an assumed
 * row height (rows vary — an offer with a tagline is taller than one without,
 * so any single-number estimate over- or under-fills): render, then grow while
 * there's room for a whole row and shrink while it overflows.
 *
 * The subtle part is TIMING. An earlier version measured immediately and could
 * read a half-laid-out page (before fonts/images settle), record a wrong
 * "this size overflows" ceiling from that transient, and then sit one or more
 * rows short forever. So measurement is DEBOUNCED: it only runs once the layout
 * has been quiet for a moment, so every reading — and the ceiling derived from
 * it — reflects the settled page. A ResizeObserver (not the window 'resize'
 * event, which never fires in an installed PWA or when the mobile URL bar
 * moves) reschedules that debounce whenever the container actually changes.
 */
export function useFitRows({ fallback, min = 1 }: { fallback: number; min?: number }) {
  const listRef = useRef<HTMLDivElement>(null);
  const [pageSize, setPageSize] = useState(fallback);
  const sizeRef = useRef(fallback);
  // Smallest size proven (on a settled layout) to overflow. Growth stops one
  // below it, so a next row taller than the ones on screen can't cause an
  // endless grow/shrink flip. Reset when the container's height changes.
  const ceilingRef = useRef(Number.POSITIVE_INFINITY);
  const lastHeightRef = useRef(0);

  useLayoutEffect(() => {
    const list = listRef.current;
    const scroller = list?.closest('.page-body') as HTMLElement | null;
    if (!list || !scroller) return;

    const run = () => {
      const rows = Array.from(list.querySelectorAll<HTMLElement>('[data-row]')).filter((r) => r.offsetHeight > 0);
      if (rows.length === 0) return;
      const tallest = Math.max(...rows.map((r) => r.offsetHeight));
      if (tallest <= 0) return;

      const clientH = Math.round(scroller.clientHeight);
      if (clientH !== lastHeightRef.current) {
        lastHeightRef.current = clientH;
        ceilingRef.current = Number.POSITIVE_INFINITY;
      }

      const cur = sizeRef.current;
      const shown = rows.length; // == cur when the page is full; fewer when items ran out
      const overflow = scroller.scrollHeight - scroller.clientHeight;
      let next = cur;

      if (overflow > 1) {
        // What's on screen overflows — reduce from what's actually shown, in
        // one step, and remember this size as a ceiling.
        ceilingRef.current = Math.min(ceilingRef.current, shown);
        next = Math.max(min, shown - Math.max(1, Math.ceil(overflow / tallest)));
      } else if (shown >= cur) {
        // A full page that fits — measure the room left below the last content.
        // (If the page isn't full, every item already shows; nothing to add.)
        const sRect = scroller.getBoundingClientRect();
        const padBottom = parseFloat(getComputedStyle(scroller).paddingBottom) || 0;
        let contentBottom = list.getBoundingClientRect().bottom;
        for (let node: HTMLElement | null = list; node && node !== scroller; node = node.parentElement) {
          for (let sib = node.nextElementSibling; sib; sib = sib.nextElementSibling) {
            contentBottom = Math.max(contentBottom, (sib as HTMLElement).getBoundingClientRect().bottom);
          }
        }
        const free = sRect.top + scroller.clientHeight - padBottom - contentBottom;
        // A full row of space means a row genuinely fits — grow into it, capped
        // below any size already known to overflow.
        if (free >= tallest) {
          next = Math.min(cur + Math.floor(free / tallest), ceilingRef.current - 1);
        }
      }

      if (next !== cur && next >= min) {
        sizeRef.current = next;
        setPageSize(next);
      }
    };

    // Debounce: run only after the layout has been quiet briefly, so a
    // half-rendered frame never poisons the ceiling.
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(run, 160);
    };

    schedule();
    const ro = new ResizeObserver(schedule);
    ro.observe(scroller);
    ro.observe(list);
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    return () => {
      clearTimeout(timer);
      ro.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
    };
  }, [min]);

  return { pageSize, listRef };
}
