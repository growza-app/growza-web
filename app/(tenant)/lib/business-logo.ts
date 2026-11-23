'use client';

import { useEffect, useState } from 'react';
import { api } from './api';

/**
 * Jira GRW-728 — the business's logo as a data URI, read once a page load and shared by everything that draws it on
 * a canvas (the bill image the till shares on WhatsApp). Null while it loads, when there is none, and when it could
 * not be read: the bill then shows its letter, as it always did.
 */
let pending: Promise<string | null> | null = null;

export function readBusinessLogo(): Promise<string | null> {
  pending ??= api.businessLogo().then(
    (r) => r.logo,
    () => {
      pending = null;
      return null;
    },
  );
  return pending;
}

/** The owner just changed or removed it: the next reader asks again. */
export function forgetBusinessLogo(): void {
  pending = null;
}

export function useBusinessLogo(enabled = true): string | null {
  const [logo, setLogo] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void readBusinessLogo().then((l) => {
      if (live) setLogo(l);
    });
    return () => {
      live = false;
    };
  }, [enabled]);
  return logo;
}
