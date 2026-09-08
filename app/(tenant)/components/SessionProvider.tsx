'use client';

import { createContext, useContext, type ReactNode } from 'react';

/**
 * Jira GRW-63 · GRW-203 — who is signed in, for any client component.
 *
 * The layout already resolves this from `/me` on every request. Without a
 * bridge, a component low in the tree either drills four levels of props or
 * re-fetches `/me` for itself — and the account menu did the second, which is a
 * request per page for a panel most visits never open.
 *
 * Exactly the same reasoning as `LabelsProvider` beside it.
 */
export interface SessionInfo {
  /** The letter on the avatar — the business's initial. */
  initial: string;
  /** Null for a degraded session with no member; treated as owner (BR-03). */
  role: string | null;
  /** What they sign in with (GRW-198). Null where none was recorded. */
  phone: string | null;
  businessName: string | null;
}

const SessionContext = createContext<SessionInfo | null>(null);

export function SessionProvider({ session, children }: { session: SessionInfo; children: ReactNode }) {
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

/** Null only outside the provider — every tenant screen renders inside it. */
export function useSession(): SessionInfo | null {
  return useContext(SessionContext);
}
