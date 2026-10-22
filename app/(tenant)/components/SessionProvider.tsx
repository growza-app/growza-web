'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import type { Lang } from '../lib/lang';
import { gridCanChange, mayUse, type UiAction } from '../lib/nav-policy';
import { DIARY_AREAS, type Areas } from '../lib/areas';

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
  /** The person's own name, for the avatar and the account menu. Null until they (or the invite) set one. */
  name?: string | null;
  /** Jira GRW-235 — open branches, main first; one or none means there is no branch to choose. */
  branches?: Array<{ id: string; name: string }>;
  /** Jira GRW-306 — the language the page was rendered in, for the language switch in the account menu. */
  lang?: Lang;
  /**
   * Jira GRW-556 — false only while the business is still being set up. Absent reads as live: a session that cannot
   * say is never shut out of the product.
   */
  live?: boolean;
  /**
   * Jira GRW-556 (follow-up) — false only for a business suspended for non-payment, which signs in read-only: every
   * control that writes is left undrawn except the bill. Absent reads as writable, for the same reason `live` does.
   */
  writable?: boolean;
  /**
   * Jira GRW-556 (follow-up) — `me.capabilities.walkIn`. The API has always sent it and nothing read it, so a paused
   * business drew the walk-in queue's "Give" and the token board's "Arrived" and the API answered every tap with a
   * refusal (`requireFeature('booking.walk_in')`). Absent reads as on: only an explicit `false` hides a control.
   */
  walkIn?: boolean;
  /**
   * Jira GRW-608 — which areas of the app this business has (bookings, services, the shop's Orders and Stock), from
   * `me.capabilities.bookings`, `.services` and `me.surface`. Absent reads as the salon's full set: a session that cannot
   * say is never shut out of a screen it had.
   */
  areas?: Areas;
  /**
   * Jira GRW-598 — `me.capabilities.sizes`: sizes are a switch (the `sizes` flag), off for every business until the
   * platform turns them on for one. Absent reads as OFF, the honest direction: an unknown answer must not draw a button
   * that opens a screen the server would refuse.
   */
  sizes?: boolean;
  /**
   * `me.whatsapp.booking` — whether clients book and cancel through WhatsApp at this business. Settings that only
   * bind a client booking by WhatsApp are left undrawn while it is off (owner, 2026-10-10). Absent reads as OFF, the
   * honest direction: an unknown answer must not offer a setting that would do nothing.
   */
  whatsappLive?: boolean;
  /** Jira GRW-563 — marks waiting for a Yes / No at the branches this person sees. Absent reads as none. */
  pendingAttendance?: number;
  /** Jira GRW-563 — whether a stylist's own branch offers phone check-in. Absent reads as not offered. */
  selfCheckIn?: boolean;
  /**
   * The business's timezone, from the `/api/v1/me` the layout already read for this page. The bell and the
   * Notifications screen used to ask for `/me` again from the browser just to learn it — a whole tenant summary (five
   * queries) on every page load, for one string the server already held.
   */
  timezone?: string;
}

const SessionContext = createContext<SessionInfo | null>(null);

export function SessionProvider({ session, children }: { session: SessionInfo; children: ReactNode }) {
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

/** Null only outside the provider — every tenant screen renders inside it. */
export function useSession(): SessionInfo | null {
  return useContext(SessionContext);
}

/**
 * Jira GRW-409 · GRW-319 — may the person signed in use this control?
 *
 * `mayUse` from @growza-app/shared, which asks the API's own `mayReach` about
 * every route the control calls. The one question a component asks before
 * drawing a control a limited role might not have — not `role === 'owner'`.
 */
export function useMayUse(action: UiAction): boolean {
  const session = useSession();
  // Jira GRW-76 — the screen's own read-only-ness counts too: a control that writes is not drawn on a screen its role holds at See.
  const writable = useWritable();
  if (session?.walkIn === false && WALK_IN_ONLY.includes(action)) return false;
  return mayUse(session?.role, action, writable);
}

/**
 * The controls whose every route needs the walk-in capability (`requireFeature('booking.walk_in')`: the queue's give,
 * a token). "New visit" and "Record payment" are not here — each also books or settles something that is not a walk-in.
 */
const WALK_IN_ONLY: readonly UiAction[] = ['queue.give', 'token.arrive'];

/** Jira GRW-598 — are sizes switched on for this business? False when unknown, and for every salon today. */
export function useSizesOn(): boolean {
  return useSession()?.sizes ?? false;
}

/** Jira GRW-556 (follow-up) — may the business change anything? False only while it is suspended for non-payment. Not the screen's: the till's "+" belongs to Bookings, wherever it is drawn. */
export function useBusinessWritable(): boolean {
  return useSession()?.writable ?? true;
}

/** Jira GRW-76 — may THIS control write here? The business is not suspended (`useBusinessWritable`) AND the screen is not held at See for this role. */
export function useWritable(): boolean {
  const screenWritable = useContext(ScreenWritableContext);
  return (useSession()?.writable ?? true) && screenWritable;
}

/**
 * Jira GRW-76 — may THIS person change things on the screen they are looking at? A role holder whose page is held at See is read-only there: the
 * controls that write are left undrawn, the way a suspended business's are. Provided once, by the layout, from the address — which is why it is a
 * context and not a call to `usePathname` inside `useWritable`: that hook is read by two dozen components, and a screen with no router (a test, a
 * preview) must still draw. Absent (no provider) reads as writable.
 */
const ScreenWritableContext = createContext<boolean>(true);

export function ScreenAccess({ children }: { children: ReactNode }) {
  const pages = useSession()?.areas?.pages;
  const pathname = usePathname();
  return <ScreenWritableContext.Provider value={!pages || gridCanChange(pathname, pages)}>{children}</ScreenWritableContext.Provider>;
}

/** Do clients book through WhatsApp here? False when unknown — see `whatsappLive` above. */
export function useWhatsappLive(): boolean {
  return useSession()?.whatsappLive ?? false;
}

/** Jira GRW-608 — which areas this business has. The salon's full set when unknown (the nav errs open). */
export function useAreas(): Areas {
  return useSession()?.areas ?? DIARY_AREAS;
}

/** Jira GRW-556 — is the business live? False only while it is being set up, when only the setup screens are offered. */
export function useLive(): boolean {
  return useSession()?.live ?? true;
}

/** Jira GRW-563 — how many self-marked days wait for a decision; 0 when unknown. */
export function usePendingAttendance(): number {
  return useSession()?.pendingAttendance ?? 0;
}

/** Jira GRW-563 — does this stylist's branch offer "I'm in" from her phone? False when unknown. */
export function useSelfCheckIn(): boolean {
  return useSession()?.selfCheckIn ?? false;
}
