import { redirect } from 'next/navigation';
import { api } from './api';
import { canSee, type MemberRole } from './nav-policy';
import { isLive, isSetupDestination } from './go-live';
import { isWritable } from './read-only';

/**
 * Jira GRW-409 · GRW-319 — a screen the nav does not offer a role, reached by
 * its address, lands on Home.
 *
 * The nav hid Services, Offers, Staff, Settings, Free times and Try WhatsApp
 * from a receptionist and a stylist; the pages themselves did not know. Typed
 * or bookmarked, Services drew its whole editor — add, edit, retire, import —
 * for a receptionist whose every tap there answered 403 (QA, 2026-09-25);
 * Staff's edit screen drew a Save the API refuses; Settings drew an error
 * about a load that was never going to work. A Reports tab a role cannot open
 * already landed on one they can (GRW-197), and Free times already sent a
 * refused stylist Home (GRW-377). This is that, for every such screen, asked
 * of the same `canSee` the sidebar, the tab bar and the More menu ask.
 *
 * `/me` failing is left to the page (BR-03): a degraded session renders as the
 * owner rather than being thrown out of the product, and the page's own load
 * reports what went wrong. `/me` is memoised per render, so this costs the
 * page nothing it was not already asking.
 */
export async function guardScreen(href: string): Promise<void> {
  let role: MemberRole | null = null;
  let reportTabs: string[] | undefined;
  let live = true;
  try {
    const me = await api.me();
    role = (me.member?.role as MemberRole | undefined) ?? null;
    reportTabs = me.reportTabs;
    live = isLive(me.tenant?.status);
  } catch {
    return;
  }
  // Outside the try: `redirect()` works by throwing.
  // The role question first, and asked WITHOUT the live flag: the two refusals are different screens, and a role
  // that may never see this one should be told that rather than that it opens later.
  if (!canSee(href, role, reportTabs)) redirect('/');
  if (closedUntilGoLive(live, href)) redirect(NOT_LIVE_PATH);
}

/** Jira GRW-556 — where a screen that opens at go-live sends somebody who reached it by its address. */
export const NOT_LIVE_PATH = '/not-live-yet';

/** The one question both guards ask, so they cannot answer it differently. */
function closedUntilGoLive(live: boolean, href: string): boolean {
  return !live && !isSetupDestination(href);
}

/**
 * Jira GRW-556 — the same `/me`, asked only whether the business is live.
 *
 * For the screens `guardScreen` does not cover because its role question is not theirs (New booking and Search
 * are in no role's destination list, so `canSee` would send a receptionist Home from a screen they may use once
 * the business is live). A business being set up is sent to the page that says so, rather than shown a screen
 * whose every action the API refuses. Fails open like `guardScreen`: a `/me` that cannot answer is not an
 * account that is not live.
 */
export async function guardLive(href: string): Promise<void> {
  let live = true;
  try {
    live = isLive((await api.me()).tenant?.status);
  } catch {
    return;
  }
  if (closedUntilGoLive(live, href)) redirect(NOT_LIVE_PATH);
}

/**
 * Jira GRW-556 (follow-up) — a screen whose whole job is a write, for a business that may not write.
 *
 * A business suspended for non-payment signs in read-only. The Package builder and Try WhatsApp are not views of
 * anything: every control on them saves, and the API answers each with "suspended". Sent to `fallback` — the list
 * the builder came from — instead of drawn. Fails open like the other guards: a `/me` that cannot answer is not a
 * business that may not write.
 */
export async function guardWritable(fallback: string): Promise<void> {
  let writable = true;
  try {
    writable = isWritable((await api.me()).tenant?.status);
  } catch {
    return;
  }
  if (!writable) redirect(fallback);
}

