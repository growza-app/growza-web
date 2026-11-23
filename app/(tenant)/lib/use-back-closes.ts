'use client';

import { useEffect, useRef } from 'react';

/**
 * QA of the overnight stack (item 11) — the phone's Back closes the sheet that is open, and does not leave the screen.
 *
 * Browser Back on /pos with a table's sheet open left the POS: the sheet is drawn over the page and is no history entry of
 * its own, so Back went to whatever page came before. While the sheet is mounted, one history entry is pushed for it (same
 * address, the router's own state kept); Back pops that entry and closes the sheet. Closed any other way (its own button,
 * Escape, the scrim, a payment), the entry is taken back off, so Back afterwards goes where it always did.
 *
 * The take-back waits one tick: a sheet mounted again straight away (React's development double mount, or one sheet
 * handing over to the next) keeps the same entry instead of popping it under itself.
 */
let pendingBack: ReturnType<typeof setTimeout> | null = null;

export function useBackCloses(onClose: () => void): void {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (pendingBack !== null) {
      clearTimeout(pendingBack);
      pendingBack = null;
    } else {
      window.history.pushState({ ...(window.history.state ?? {}), growzaSheet: true }, '');
    }
    let ours = true;
    const onPop = () => {
      ours = false;
      close.current();
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      if (!ours) return;
      pendingBack = setTimeout(() => {
        pendingBack = null;
        if ((window.history.state as { growzaSheet?: boolean } | null)?.growzaSheet) window.history.back();
      }, 0);
    };
  }, []);
}
