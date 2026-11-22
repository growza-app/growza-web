import { useEffect } from 'react';

/** Never squeezed below this: a few lines and the buttons still read on the shortest laptop window. */
export const FIT_MIN_PX = 240;
/** Room left under the panel, so its border and shadow are not cut by the window's edge. */
export const FIT_GAP_PX = 12;

/**
 * How tall a sticky panel may be so its bottom stays on screen: from where it starts now to the bottom of what
 * scrolls it, less a small gap. Pure, so the arithmetic is tested without a browser.
 */
export function fitHeight(scrollerBottom: number, panelTop: number, gap = FIT_GAP_PX): number {
  return Math.max(FIT_MIN_PX, Math.floor(scrollerBottom - panelTop - gap));
}

/**
 * Owner, 2026-11-22 — the till's bill panel on a laptop. The panel sticks while the menu scrolls, but nothing capped
 * its height: with a discount row, a coupon, the ways to pay and Complete sale it was 793px in a 768px window, so
 * Complete sale started off screen and "Paid two ways" could not be reached until the whole menu (about 6,500px)
 * had been scrolled past.
 *
 * CSS alone cannot say "the window's bottom, less where I start": the panel starts lower (under the tabs) until the
 * page scrolls and it sticks. So this writes `--fit-max` on the panel as the room it has right now; the stylesheet
 * caps it with that and lets it scroll inside, with its buttons pinned at the bottom. Scrolling the page moves the
 * panel's top up and its room grows by the same amount, so its bottom edge stays where the window ends.
 *
 * Only while the panel is sticky (the wide till). A ResizeObserver on the scroller, not the window's `resize` event,
 * which an installed PWA never fires (see `use-fit-rows`). Takes the element itself (a callback ref's state), so a
 * panel that appears after the first render is still fitted.
 */
export function useFitToWindow(panel: HTMLElement | null, on: boolean): void {
  useEffect(() => {
    if (!on || !panel) return;
    const scroller = panel.closest<HTMLElement>('.page-body');
    let frame = 0;
    const fit = () => {
      frame = 0;
      if (getComputedStyle(panel).position !== 'sticky') {
        panel.style.removeProperty('--fit-max');
        return;
      }
      const bottom = scroller ? scroller.getBoundingClientRect().bottom : window.innerHeight;
      panel.style.setProperty('--fit-max', `${fitHeight(bottom, panel.getBoundingClientRect().top)}px`);
    };
    const ask = () => {
      if (!frame) frame = requestAnimationFrame(fit);
    };
    fit();
    const target: HTMLElement | Window = scroller ?? window;
    target.addEventListener('scroll', ask, { passive: true });
    // The window, and anything above the panel that settles late (the tabs, a font) and so moves where it starts.
    const seen = new ResizeObserver(ask);
    seen.observe(scroller ?? document.documentElement);
    if (scroller?.firstElementChild) seen.observe(scroller.firstElementChild);
    seen.observe(panel);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      target.removeEventListener('scroll', ask);
      seen.disconnect();
      panel.style.removeProperty('--fit-max');
    };
  }, [panel, on]);
}
