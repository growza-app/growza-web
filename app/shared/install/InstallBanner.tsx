'use client';

import './install-banner.css';
import { useEffect, useRef, useState } from 'react';
import { installBannerCopy } from './install-copy';
import {
  installModeFor,
  parseDismissedAt,
  SHOW_DELAY_MS,
  storageKeys,
  type InstallApp,
  type InstallMode,
} from './install-logic';

/**
 * Jira GRW-265 · GRW-270 — "Install app", offered by the app itself.
 *
 * Chrome's own install offer is up to Chrome and may never appear; iPhone
 * Safari has none. So every sign-in and dashboard page renders this card, laid
 * out like the browser's install dialog: 2.5 s after the page has loaded it
 * shows the app, Cancel, and Install where the browser can install — or short
 * steps where it cannot. Never inside the installed app; Cancel snoozes a week.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

declare global {
  interface Window {
    __growzaInstall?: { prompt: BeforeInstallPromptEvent | null; installed: boolean };
  }
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null; // storage blocked (private mode): behave as a first visit
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage blocked: the banner simply cannot remember */
  }
}

function runningInstalled(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * How far above the viewport bottom the salon dashboard's bottom nav and +
 * button reach. Descendants count, not only the bar: the raised "New booking"
 * circle sits inside `.bottom-nav` but rises above its box.
 */
function chromeOffset(): number {
  let top = window.innerHeight;
  for (const element of document.querySelectorAll('.bottom-nav, .bottom-nav *, .fab')) {
    const rect = element.getBoundingClientRect();
    if (rect.height > 0 && rect.width > 0 && rect.bottom > 0) top = Math.min(top, rect.top);
  }
  return Math.max(0, Math.round(window.innerHeight - top));
}

export function InstallBanner({ app }: { app: InstallApp }) {
  const [mode, setMode] = useState<InstallMode | null>(null);
  const [offset, setOffset] = useState(0);
  const [host, setHost] = useState('');
  const due = useRef(false);

  useEffect(() => {
    const keys = storageKeys(app);
    setHost(window.location.host);

    if (runningInstalled()) {
      // Remembered on this device, so the same browser later knows it is
      // installed even outside the app (Android shares storage with Chrome).
      write(keys.installed, '1');
      return;
    }

    const decide = () =>
      installModeFor({
        userAgent: navigator.userAgent,
        maxTouchPoints: navigator.maxTouchPoints ?? 0,
        standalone: false,
        hasPrompt: Boolean(window.__growzaInstall?.prompt),
        installed: read(keys.installed) === '1' || Boolean(window.__growzaInstall?.installed),
        dismissedAt: parseDismissedAt(read(keys.dismissedAt)),
        now: Date.now(),
      });

    let timer: ReturnType<typeof setTimeout> | undefined;
    const start = () => {
      timer = setTimeout(() => {
        due.current = true;
        setMode(decide());
      }, SHOW_DELAY_MS);
    };
    // Mounted after hydration, usually after `load` — waiting for an event
    // that already fired would never show the banner at all.
    if (document.readyState === 'complete') start();
    else window.addEventListener('load', start, { once: true });

    // A prompt that arrives after the banner is up turns the steps into an Install button.
    const onPrompt = () => {
      if (due.current) setMode(decide());
    };
    const onInstalled = () => {
      write(keys.installed, '1');
      setMode(null);
    };
    window.addEventListener('growza:installprompt', onPrompt);
    window.addEventListener('growza:appinstalled', onInstalled);

    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('load', start);
      window.removeEventListener('growza:installprompt', onPrompt);
      window.removeEventListener('growza:appinstalled', onInstalled);
    };
  }, [app]);

  useEffect(() => {
    if (!mode) return;
    const measure = () => setOffset(chromeOffset());
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [mode]);

  if (!mode) return null;

  const copy = installBannerCopy(app, mode);

  const cancel = () => {
    write(storageKeys(app).dismissedAt, String(Date.now()));
    setMode(null);
  };

  const install = async () => {
    const prompt = window.__growzaInstall?.prompt;
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    // A prompt can only be used once, whatever the answer.
    if (window.__growzaInstall) window.__growzaInstall.prompt = null;
    if (outcome === 'accepted') {
      write(storageKeys(app).installed, '1');
      setMode(null);
    } else {
      cancel();
    }
  };

  return (
    <section
      className="install-banner"
      role="dialog"
      aria-modal="false"
      aria-labelledby={`install-banner-title-${app}`}
      style={offset > 0 ? { bottom: `${offset + 12}px` } : undefined}
      data-mode={mode}
    >
      <p id={`install-banner-title-${app}`} className="install-banner-title">
        {copy.title}
      </p>
      <div className="install-banner-app">
        <img className="install-banner-icon" src="/icons/icon-192.png" alt="" width={48} height={48} />
        <div className="install-banner-app-text">
          <p className="install-banner-name">{copy.appName}</p>
          <p className="install-banner-host">{host}</p>
        </div>
      </div>
      {copy.steps.length > 0 ? (
        <ol className="install-banner-steps">
          {copy.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      ) : null}
      <div className="install-banner-actions">
        <button type="button" className="install-banner-cancel" onClick={cancel}>
          {copy.cancel}
        </button>
        {copy.install ? (
          <button type="button" className="install-banner-install" onClick={install}>
            {copy.install}
          </button>
        ) : null}
      </div>
    </section>
  );
}
