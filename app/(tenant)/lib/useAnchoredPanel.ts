'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

/**
 * Jira GRW-433 — a row menu that its own row cannot clip.
 *
 * `.dropdown-panel` was absolutely positioned inside `.dropdown-anchor`, which sits inside a card that is
 * `overflow: hidden` — and so is every ancestor above it: `.page-body.page-fit`, `.content`, `.shell`, `body`.
 * On the Offers list that cut 20px off the bottom of **Delete**, and `document.elementFromPoint` at the middle
 * of the word returned the list behind it. The owner could see the item and pressing it selected the offer
 * underneath.
 *
 * The clip is not the thing to remove. `overflow: hidden` on that card is load-bearing (GRW-193 · GRW-216: on
 * landscape tablets the footer's unshrinkable children were pushed past the row's right edge and the clip is
 * what stopped them spilling), and four more clipping ancestors are waiting behind it anyway.
 *
 * So the panel leaves the flow instead. `position: fixed` is measured against the viewport, not against any
 * ancestor, so no amount of clipping upstream can reach it.
 *
 * Two things follow from that, and both are handled here rather than left to each caller:
 *
 * - **It does not travel with its row.** A fixed panel stays where it was put while the list scrolls out from
 *   under it, so any scroll or resize closes it. Repositioning on every scroll frame was the alternative and is
 *   worse: a menu that follows the page is a menu you cannot escape by scrolling.
 * - **It flips up when there is no room below**, which is the whole point for the last card on screen — the one
 *   most likely to be the one somebody wants to delete.
 */
export function useAnchoredPanel(open: boolean, onClose: () => void) {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  // Hidden until it has been measured and placed: one frame at the wrong coordinates reads as a flicker.
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden' });

  const place = useCallback(() => {
    const anchor = anchorRef.current?.getBoundingClientRect();
    const panel = panelRef.current?.getBoundingClientRect();
    if (!anchor || !panel) return;

    const GAP = 6;
    const EDGE = 8;
    /*
     * The floor is the bottom navigation, not the bottom of the window.
     *
     * Found on Clients while fixing Offers: the Filter menu ended at y=784 of an 812px viewport, so by every
     * measure it was "on screen" — and its last option, "Never been in", could not be clicked, because
     * `.bottom-nav` is painted over it and its link took the press. A menu that is visible and inert is worse
     * than one that is cut off, since nothing tells the owner why nothing happened.
     */
    const nav = document.querySelector('.bottom-nav')?.getBoundingClientRect();
    const floor = Math.min(window.innerHeight, nav && nav.height > 0 ? nav.top : window.innerHeight);
    const roomBelow = floor - anchor.bottom;
    const top = roomBelow >= panel.height + GAP ? anchor.bottom + GAP : Math.max(EDGE, anchor.top - panel.height - GAP);
    // Right-aligned to the trigger, then pulled back inside the viewport — on a 344px screen a 260px panel
    // hanging off the ⋮ would otherwise start past the left edge.
    const left = Math.min(Math.max(EDGE, anchor.right - panel.width), window.innerWidth - panel.width - EDGE);

    setStyle({ position: 'fixed', top: Math.round(top), left: Math.round(left), right: 'auto', visibility: 'visible' });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setStyle({ visibility: 'hidden' });
      return;
    }
    place();
  }, [open, place]);

  /*
   * A press anywhere else, or Escape, closes it. Before this the panel only closed on `mouseleave` — which a
   * finger never fires — so on a phone the menu stayed open over the list until a row was picked.
   * `pointerdown` (not `click`) so it closes before the press lands on whatever is underneath.
   */
  useEffect(() => {
    if (!open) return;
    const onPress = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (target && (panelRef.current?.contains(target) || anchorRef.current?.contains(target))) return;
      onClose();
      /*
       * The press that closes the menu must not also act on what is under it: tapping card B to dismiss the menu
       * on card A would otherwise open B. The click that follows this press is swallowed once; the timeout stops
       * a press that never produces a click (a drag, a scroll) from eating the next, unrelated one.
       */
      const swallow = (ev: MouseEvent) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, true), 400);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPress, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPress, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    // `true` so a scroll inside the list itself closes it, not only one on the window.
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
    };
  }, [open, onClose]);

  return { anchorRef, panelRef, style };
}
