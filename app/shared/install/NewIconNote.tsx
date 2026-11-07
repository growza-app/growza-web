'use client';

import './install-banner.css';
import { APP_ICONS } from '../../icons.generated';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { iconNoteCopy } from './install-copy';
import { chromeOffset } from './InstallBanner';
import { iconNoteDue, iconNoteKey, mayOfferOn, SHOW_DELAY_MS, SOMETHING_OPEN_SELECTOR, type InstallApp } from './install-logic';

/**
 * 2026-11-07 — tells an iPhone running the installed app that Growza's icon changed, and how to get it: iOS never
 * refreshes a home-screen icon by itself (see `iconNoteDue`). Once per icon per device; laid out as the install banner
 * is, and offered under the same rule — on Home, with nothing else open, a moment after the page settles.
 */
function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage blocked: it may ask again next time, which is harmless */
  }
}

function runningInstalled(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function NewIconNote({ app }: { app: InstallApp }) {
  const [open, setOpen] = useState(false);
  const [host, setHost] = useState('');
  const [offset, setOffset] = useState(0);
  const pathname = usePathname() ?? '/';
  const key = iconNoteKey(APP_ICONS.appleTouch);

  useEffect(() => {
    setHost(window.location.host);
    setOpen(false);
    const due = iconNoteDue({
      userAgent: navigator.userAgent,
      maxTouchPoints: navigator.maxTouchPoints ?? 0,
      standalone: runningInstalled(),
      seen: read(key) === '1',
    });
    if (!due || !mayOfferOn(app, pathname)) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const start = () => {
      timer = setTimeout(() => {
        if (document.querySelector(SOMETHING_OPEN_SELECTOR)) {
          start();
          return;
        }
        setOpen(true);
      }, SHOW_DELAY_MS);
    };
    if (document.readyState === 'complete') start();
    else window.addEventListener('load', start, { once: true });
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('load', start);
    };
  }, [app, pathname, key]);

  useEffect(() => {
    if (!open) return;
    const measure = () => setOffset(chromeOffset());
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open]);

  if (!open) return null;

  const copy = iconNoteCopy(document.documentElement.lang === 'hi' ? 'hi' : 'en', host);
  const done = () => {
    write(key, '1');
    setOpen(false);
  };

  return (
    <section
      className="install-banner"
      // A labelled region, not a dialog: it takes no focus and blocks nothing — the page stays usable around it.
      aria-labelledby={`icon-note-title-${app}`}
      style={offset > 0 ? { bottom: `${offset + 12}px` } : undefined}
      data-mode="icon-note"
    >
      <p id={`icon-note-title-${app}`} className="install-banner-title">
        {copy.title}
      </p>
      <div className="install-banner-app">
        <img className="install-banner-icon" src={APP_ICONS.icon192} alt="" width={48} height={48} />
        <div className="install-banner-app-text">
          <p className="install-banner-lead">{copy.lead}</p>
        </div>
      </div>
      <ol className="install-banner-steps">
        {copy.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <div className="install-banner-actions">
        <button type="button" className="install-banner-install" onClick={done}>
          {copy.ok}
        </button>
      </div>
    </section>
  );
}
