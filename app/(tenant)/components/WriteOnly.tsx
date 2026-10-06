'use client';

import type { ReactNode } from 'react';
import { useWritable } from './SessionProvider';

/**
 * Jira GRW-556 (follow-up) — children are drawn only while the business may change things.
 *
 * A business suspended for non-payment signs in read-only: the page keeps its list, its numbers and its search, and
 * loses the control that creates, edits or deletes — which the API would answer with "suspended". For a server page
 * that hands a write control to a header slot or a card, where there is no client component of its own to ask
 * `useWritable()` in. Absent reads as writable (see `SessionProvider`), so a degraded session keeps its controls.
 */
export function WriteOnly({ children }: { children: ReactNode }) {
  return useWritable() ? <>{children}</> : null;
}
