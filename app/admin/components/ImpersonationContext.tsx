'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * Impersonation session state (GRW-90), held client-side for this design
 * port. A real session is server-issued and audited (13-platform-
 * administration.md §7); this is the visual behaviour only — the banner
 * that follows the admin across every screen until they exit, and the
 * "never allow silent impersonation" rule reflected as a mandatory reason.
 */
export interface ImpersonationSession {
  business: string;
  user: string;
  reason: string;
}

interface ImpersonationValue {
  session: ImpersonationSession | null;
  start: (session: ImpersonationSession) => void;
  exit: () => void;
}

const ImpersonationCtx = createContext<ImpersonationValue | null>(null);

export function ImpersonationProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<ImpersonationSession | null>(null);
  const start = useCallback((s: ImpersonationSession) => setSession(s), []);
  const exit = useCallback(() => setSession(null), []);
  const value = useMemo(() => ({ session, start, exit }), [session, start, exit]);
  return <ImpersonationCtx.Provider value={value}>{children}</ImpersonationCtx.Provider>;
}

export function useImpersonation(): ImpersonationValue {
  const ctx = useContext(ImpersonationCtx);
  if (!ctx) throw new Error('useImpersonation() must be used inside <ImpersonationProvider>');
  return ctx;
}
