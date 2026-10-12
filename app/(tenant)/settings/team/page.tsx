import { redirect } from 'next/navigation';
import { screenTitle } from '../../lib/page-title';

/**
 * Team access moved onto Staff (`/providers`).
 *
 * It was its own tab from GRW-63 until the owner said the obvious thing: a stylist appeared on two screens and a
 * receptionist on the one nobody opened, and neither screen said how they related. The people and their logins are
 * one list now — see `providers/TeamLogins`.
 *
 * The route stays as a redirect rather than a 404: owners have this address bookmarked, and a dead link is a worse
 * answer than the screen that replaced it.
 */
export default function TeamSettingsPage() {
  redirect('/providers');
}

// Never rendered — the redirect fires first — but every route declares one (`title-coverage`), and a redirect that
// is slow to arrive should not flash the business name alone.
export const metadata = screenTitle('Team access');
