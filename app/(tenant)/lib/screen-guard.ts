import { redirect } from 'next/navigation';
import { api } from './api';
import { canSee, type MemberRole } from './nav-policy';

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
  try {
    const me = await api.me();
    role = (me.member?.role as MemberRole | undefined) ?? null;
    reportTabs = me.reportTabs;
  } catch {
    return;
  }
  // Outside the try: `redirect()` works by throwing.
  if (!canSee(href, role, reportTabs)) redirect('/');
}
