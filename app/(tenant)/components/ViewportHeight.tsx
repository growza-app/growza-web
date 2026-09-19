'use client';

import { useEffect, useState } from 'react';

/**
 * Publishes the window's real visible height as `--app-h`, which the shell
 * takes as a CAP on its `100dvh` (01-shell.css).
 *
 * The shell is a `100dvh` grid with the mobile tab bar as its last row, so it
 * is only as right as `dvh` is. On some Android builds (seen on a Galaxy S25
 * Ultra) `dvh` reports the full screen while the page is laid out between the
 * status bar and the gesture bar — the shell comes out ~55px taller than the
 * window and the tab bar sits below the fold with nothing to scroll it.
 * `innerHeight` is the height the page can actually paint into, so the shell
 * is never allowed to be taller than it. `min()` means a browser whose `dvh`
 * is right, or smaller, behaves exactly as before.
 *
 * ## The readout
 *
 * Whether `innerHeight` is the number that is right on that phone is not
 * something an emulator can answer, so `?vpdebug=1` (once, in Chrome — an
 * installed app shares the origin's storage) turns on a small panel printing
 * every height the phone reports. `?vpdebug=0` turns it off.
 */
export function ViewportHeight() {
  const [report, setReport] = useState<string | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    let debug = false;
    try {
      const flag = new URLSearchParams(location.search).get('vpdebug');
      if (flag === '1') localStorage.setItem('vpdebug', '1');
      if (flag === '0') localStorage.removeItem('vpdebug');
      debug = localStorage.getItem('vpdebug') === '1';
    } catch {
      /* storage blocked: the cap still works, only the readout is off */
    }

    /** A throwaway element whose height IS the unit or inset being asked about. */
    const probe = (css: string) => {
      const el = document.createElement('div');
      el.style.cssText = `position:fixed;visibility:hidden;pointer-events:none;width:1px;${css}`;
      document.body.appendChild(el);
      const h = Math.round(el.getBoundingClientRect().height);
      el.remove();
      return h;
    };

    /*
     * A floor, and it is load-bearing rather than defensive.
     *
     * `--app-h` is read as `min(100dvh, var(--app-h))`, so a value of 0 does not
     * degrade the layout — it collapses `.shell`, `.sidebar` and `.content` to
     * zero height behind `overflow: hidden`, i.e. a blank app. Browsers really
     * do report `innerHeight === 0` for a moment: a bfcache restore, a page laid
     * out while its tab is hidden, mid-rotation on some Android builds. Because
     * this is an inline style it would then persist until the next resize, and a
     * zero on the very first `sync()` has nothing to re-fire it.
     *
     * So an implausible height is ignored rather than published, which leaves
     * the CSS on its `100dvh` fallback — the behaviour this whole file is a
     * narrowing of. 200px is below every device in the matrix (the shortest is
     * 320) and far above the transient zeros.
     */
    const MIN_PLAUSIBLE_PX = 200;

    const sync = () => {
      const h = window.innerHeight;
      if (h >= MIN_PLAUSIBLE_PX) root.style.setProperty('--app-h', `${h}px`);
      if (!debug) return;
      const vv = window.visualViewport;
      const shell = document.querySelector('.shell')?.getBoundingClientRect();
      const nav = document.querySelector('.bottom-nav')?.getBoundingClientRect();
      const standalone = matchMedia('(display-mode: standalone)').matches;
      setReport(
        [
          `inner ${window.innerWidth}x${window.innerHeight}  vv ${Math.round(vv?.height ?? 0)}  clientH ${root.clientHeight}`,
          `dvh ${probe('height:100dvh')}  svh ${probe('height:100svh')}  lvh ${probe('height:100lvh')}  vh ${probe('height:100vh')}`,
          `screen ${screen.width}x${screen.height}  avail ${screen.availHeight}  dpr ${window.devicePixelRatio}`,
          `inset t${probe('height:env(safe-area-inset-top)')} b${probe('height:env(safe-area-inset-bottom)')}  ${standalone ? 'standalone' : 'browser tab'}`,
          `shell h ${Math.round(shell?.height ?? 0)}  nav ${Math.round(nav?.top ?? 0)}–${Math.round(nav?.bottom ?? 0)}`,
        ].join('\n'),
      );
    };

    sync();
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);
    window.visualViewport?.addEventListener('resize', sync);
    return () => {
      window.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', sync);
      window.visualViewport?.removeEventListener('resize', sync);
      root.style.removeProperty('--app-h');
    };
  }, []);

  if (!report) return null;
  return (
    <pre
      aria-hidden="true"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 99999,
        margin: 0,
        padding: '4px 6px',
        font: '10px/1.35 ui-monospace, monospace',
        color: '#0f0',
        background: 'rgba(0,0,0,0.82)',
        pointerEvents: 'none',
        whiteSpace: 'pre-wrap',
      }}
    >
      {report}
    </pre>
  );
}
