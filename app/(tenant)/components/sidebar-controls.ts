'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

/**
 * Owner, 2026-11-20 ("move the user avatar in side bar nav bottom", option A): on a laptop the business and the account
 * menu live in the sidebar, the bell in the page head beside the screen's actions (`PageHeadBell`), and the header bar
 * they all sat in is gone.
 *
 * Each of them must exist ONCE. The bell polls the notification feed and raises a toast; two mounted bells would
 * fetch twice and toast twice. So the header does not merely hide its copy — it unmounts it once the sidebar has
 * claimed the controls. The sidebar claims them only when it is drawn at a laptop's width: a phone keeps them in its
 * header, and a login with no sidebar at all (a Kitchen login) keeps them in its header on a laptop too.
 *
 * Until the first effect runs nothing is claimed, so the server and the first paint draw the header's copy — on a
 * laptop CSS hides it (`.shell:has(> .sidebar)`), on a phone it is the one that stays.
 */

/** The laptop layout's edge, the same 861px every `min-width` rule in styles/ uses. */
export const WIDE_QUERY = '(min-width: 861px)';

/** `null` until mounted (the server cannot know), then whether the window is a laptop's width, kept current. */
export function useWideScreen(): boolean | null {
  const [wide, setWide] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia(WIDE_QUERY);
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return wide;
}

let claims = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The sidebar calls this with whether it is drawing the controls itself. */
export function useClaimHeaderControls(on: boolean): void {
  useEffect(() => {
    if (!on) return;
    claims += 1;
    emit();
    return () => {
      claims -= 1;
      emit();
    };
  }, [on]);
}

/** True when the sidebar has the business, the bell and the account menu — the header then draws none of them. */
export function useControlsInSidebar(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => claims > 0,
    () => false,
  );
}
