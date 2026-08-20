'use client';

import { useEffect } from 'react';

/** Registers the service worker once the page has loaded — kept out of layout's render path so a registration failure can never break the page itself. */
export function PwaRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    // Dev-mode Turbopack chunk names can stay stable across edits, unlike a
    // production build's content-hashed filenames — so the SW's cache-first
    // /_next/static/* strategy would pin a device to stale JS through every
    // future code change. Offline support only matters for the real app.
    if (process.env.NODE_ENV !== 'production') {
      // A device that hit an earlier dev session may already have one
      // registered and pinned to a stale cache — undo that, not just skip
      // registering a new one.
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((reg) => reg.unregister());
      });
      if (window.caches) {
        caches.keys().then((keys) => keys.forEach((key) => caches.delete(key)));
      }
      return;
    }
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
