'use client';

import { createContext, useContext, type ReactNode } from 'react';

/**
 * The vertical's nouns, available to any client component without threading them
 * through four levels of props.
 *
 * `/CLAUDE.md`: every customer- or dashboard-visible noun comes from `ctx.labels`.
 * A "stylist" is a Doctor to a clinic and a Mechanic to a garage, so the word can
 * never be written into a component — but the components that were leaking
 * salon-isms (checkout, booking summary, the staff editor) sit well below the
 * layout that already loads them. This is that bridge.
 */
const LabelsContext = createContext<Record<string, string>>({});

export function LabelsProvider({ labels, children }: { labels: Record<string, string>; children: ReactNode }) {
  return <LabelsContext.Provider value={labels}>{children}</LabelsContext.Provider>;
}

/**
 * One vertical noun, with a neutral fallback for when the API is down and the
 * layout rendered with no labels at all. The fallback is never salon-specific.
 */
export function useLabel(key: string, fallback: string): string {
  return useContext(LabelsContext)[key] ?? fallback;
}

export function useLabels(): Record<string, string> {
  return useContext(LabelsContext);
}
