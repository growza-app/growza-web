'use client';

import { useRouter, useSearchParams } from 'next/navigation';

/**
 * Jira GRW-556 (follow-up) — a full-page form closes when it saves.
 *
 * Settings tabs and the staff edit page saved and then sat there saying "Saved", with the form still open and the owner
 * left to find Back. A form is a task: Save finishes it, so the screen goes back to the list it was opened from, and that
 * list says "Saved" for a moment (`SavedToast`, reading the marker this adds). `?branch=` is carried, so a branch owner
 * comes back to the same branch's list.
 */
export const SAVED_MARKER = 'saved';

export function savedHref(parent: string, branch: string | null): string {
  const params = new URLSearchParams();
  if (branch) params.set('branch', branch);
  params.set(SAVED_MARKER, '1');
  return `${parent}?${params.toString()}`;
}

/** Call after a save succeeded: back to `parent`, which shows "Saved". */
export function useCloseAfterSave(parent: string): () => void {
  const router = useRouter();
  const params = useSearchParams();
  return () => {
    router.push(savedHref(parent, params.get('branch')));
    router.refresh();
  };
}
