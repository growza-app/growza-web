'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Jira GRW-671 — "Offer saved. Tell your clients now?", once, for the offer or package just created.
 *
 * The form that creates one is not the list that shows it: Offers creates in a modal beside the list, and a package's
 * builder is its own page that steps Back to the list (so the list's own Back never lands on the editor — owner,
 * 2026-10-08). A query-string marker would add a history entry or survive in it; this keeps the new id for exactly
 * one read instead. The list takes it on mount (the builder's case) or on the event (the modal's case), and removes
 * it at once, so a refresh or a Back never asks again.
 *
 * It carries which list it is for. Without that, the first list to mount took it: build a package for all branches,
 * open Offers from the nav before Packages, and Offers swallowed the package's id and Packages never asked.
 *
 * Storage may be missing or refuse (a private window): then the question is simply not asked, and nothing breaks.
 */
export type JustCreatedKind = 'offer' | 'package';

const KEY = 'growza.justCreatedOffer';
const EVENT = 'growza:just-created-offer';

interface Marker {
  id: string;
  kind: JustCreatedKind;
}

export function markJustCreated(id: string, kind: JustCreatedKind): void {
  const marker: Marker = { id, kind };
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(marker));
  } catch {
    /* no storage: the event below still reaches a list that is already on screen */
  }
  window.dispatchEvent(new CustomEvent<Marker>(EVENT, { detail: marker }));
}

function read(): Marker | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const m = JSON.parse(raw) as Partial<Marker>;
    return typeof m.id === 'string' && (m.kind === 'offer' || m.kind === 'package') ? { id: m.id, kind: m.kind } : null;
  } catch {
    return null;
  }
}

/** Take the marker — only if it is this list's. Another list's is left for that list. */
export function takeJustCreated(kind: JustCreatedKind): string | null {
  const m = read();
  if (!m || m.kind !== kind) return null;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to remove from */
  }
  return m.id;
}

/** The id of the offer or package just created for THIS list, until the owner answers; and how to answer. */
export function useJustCreated(kind: JustCreatedKind): [string | null, () => void] {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    const first = takeJustCreated(kind);
    if (first) setId(first);
    const onCreated = (e: Event) => {
      const detail = (e as CustomEvent<Marker>).detail;
      if (!detail || detail.kind !== kind) return;
      takeJustCreated(kind);
      setId(detail.id);
    };
    window.addEventListener(EVENT, onCreated);
    return () => window.removeEventListener(EVENT, onCreated);
  }, [kind]);
  const dismiss = useCallback(() => setId(null), []);
  return [id, dismiss];
}
