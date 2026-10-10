'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { adminFetch, AdminApiError } from '../lib/api';

/**
 * Admin audit 2026-10-09, batch D — who is signed in and what they may do, read ONCE.
 *
 * `/me` was fetched in five places: the shell (for the nav) and four pages that each needed one or two permissions.
 * The pages that did NOT fetch it — Roles, Users, Plans, the Subscriptions list, the dashboard's quick actions —
 * showed every control to every role, and the admin found out which ones they could use by pressing them and
 * reading a 403. One answer, shared, is what lets every screen hide what the API will refuse.
 *
 * The API is still the gate. This only stops the screen offering what the gate will turn down.
 */

export interface AdminMe {
  admin: { id: string; name: string; phone: string | null; roleName: string | null };
  /** Already expanded on the server: a `manage` grant includes its `view`. */
  permissions: string[];
}

export type AdminMeState =
  | { status: 'loading' }
  | { status: 'ready'; me: AdminMe }
  /** `unauthorised` — a 401 is handled by adminFetch's own sign-out; nothing for a screen to show. */
  | { status: 'error'; message: string; unauthorised: boolean };

interface AdminMeValue {
  state: AdminMeState;
  me: AdminMe | null;
  /**
   * Whether this admin holds `permission`. False while loading and when /me failed: a control nobody can vouch for
   * is not offered — the safe direction, the same default `SubscriptionPanel`'s permission props take. (The NAV
   * reads `state` itself and shows everything on failure instead; an empty sidebar is worse than a wide one.)
   */
  can: (permission: string) => boolean;
  /** Whether every permission in `keys` is one this admin holds — what the server's "beyond your reach" rule asks. */
  holdsAll: (keys: readonly string[]) => boolean;
}

/** The two questions every screen asks of `/me`, as a pure function so they can be tested without React. */
export function permissionChecks(me: AdminMe | null): Pick<AdminMeValue, 'can' | 'holdsAll'> {
  const held = new Set(me?.permissions ?? []);
  return {
    can: (permission) => held.has(permission),
    holdsAll: (keys) => me !== null && keys.every((k) => held.has(k)),
  };
}

const AdminMeContext = createContext<AdminMeValue | null>(null);

export function AdminMeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AdminMeState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    adminFetch<AdminMe>('/me')
      .then((me) => {
        if (!cancelled) setState({ status: 'ready', me });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          status: 'error',
          message: err instanceof AdminApiError ? err.message : 'Could not check your permissions.',
          unauthorised: err instanceof AdminApiError && err.status === 401,
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AdminMeValue>(() => {
    const me = state.status === 'ready' ? state.me : null;
    return { state, me, ...permissionChecks(me) };
  }, [state]);

  return <AdminMeContext.Provider value={value}>{children}</AdminMeContext.Provider>;
}

export function useAdminMe(): AdminMeValue {
  const value = useContext(AdminMeContext);
  if (!value) throw new Error('useAdminMe must be used inside AdminMeProvider (SessionGate mounts it).');
  return value;
}
