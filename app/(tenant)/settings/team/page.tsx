import { redirect } from 'next/navigation';
import { screenTitle } from '../../lib/page-title';
import { api } from '../../lib/api';
import { areasOf } from '../../lib/areas';

/**
 * Team access moved onto Staff (`/providers`).
 *
 * It was its own tab from GRW-63 until the owner said the obvious thing: a stylist appeared on two screens and a
 * receptionist on the one nobody opened, and neither screen said how they related. The people and their logins are
 * one list now — see `providers/TeamLogins`.
 *
 * The route stays as a redirect rather than a 404: owners have this address bookmarked, and a dead link is a worse
 * answer than the screen that replaced it.
 *
 * QA 2026-11-14 (F5) — a shop has no Staff roster, so `/providers` sent a retail owner on to Home. A shop's people and
 * their logins are on Settings › Team and roles; that is where this address goes for a shop.
 */
export default async function TeamSettingsPage() {
  const me = await api.me().catch(() => null);
  redirect(areasOf(me).shop ? '/settings/roles' : '/providers');
}

// Never rendered — the redirect fires first — but every route declares one (`title-coverage`), and a redirect that
// is slow to arrive should not flash the business name alone.
export const metadata = screenTitle('Team access');
