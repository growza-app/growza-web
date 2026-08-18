'use client';

import { useEffect } from 'react';

/** Registers the service worker once the page has loaded — kept out of layout's render path so a registration failure can never break the page itself. */
export function PwaRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Offline/PWA support is a progressive enhancement — a failed
        // registration (e.g. unsupported browser, dev-mode quirk) should
        // never surface as a user-facing error.
      });
    });
  }, []);

  return null;
}
