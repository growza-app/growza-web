'use client';

import { useEffect, useState } from 'react';
import { api } from './api';

/**
 * Jira GRW-582 — whether this business's prices already include GST (Settings › GST).
 *
 * Read when a sheet opens rather than cached for the session: the owner can change it on another screen, and a hint
 * that says "includes GST" after they switched it off would be a wrong sentence under a price. One small read.
 *
 * `true` until the answer arrives, and if it never does: that is the default the settings screen starts from, and a
 * hint that errs towards "your price is what the client pays" is the one that cannot make anyone charge too much.
 */
export function usePricesIncludeTax(): boolean {
  const [includes, setIncludes] = useState(true);
  useEffect(() => {
    let live = true;
    api
      .settings()
      .then((s) => {
        if (live) setIncludes(s.gst?.pricesIncludeTax ?? true);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return includes;
}
