import { redirect } from 'next/navigation';
import { screenTitle } from '../../lib/page-title';
import { api } from '../../lib/api';
import { AlertsForm } from './AlertsForm';

export const dynamic = 'force-dynamic';

/**
 * Jira GRW-647 — Settings › Phone alerts.
 *
 * Deliberately NOT part of Settings › Notifications, which is a different thing wearing a similar word: that
 * screen sets WhatsApp reminder times for CUSTOMERS, it is scoped to a branch, and it sends itself away when
 * `whatsapp.booking` is off. This one is one person's own phone, it belongs to no branch, and it has to work
 * for the many businesses that have WhatsApp off.
 *
 * Owner only for now (owner's call, 2026-10-24), and the API agrees: all five routes are classified `owner` in
 * `shared/src/route-pages.ts`, so a typed address is not a way in — this redirect only saves a role the trip.
 */
export default async function AlertsSettingsPage() {
  const me = await api.me().catch(() => null);
  if (me?.member && me.member.role !== 'owner') redirect('/settings');

  /*
   * The key is fetched HERE rather than in the form, so the screen knows before it draws whether alerts are
   * configured at all. A form that rendered four switches and then discovered there was no key would have
   * offered something it cannot do.
   *
   * A failure is `null`, which the form reads as "not set up" and says so plainly — a load-error banner would
   * be the wrong shape for a screen whose entire message in that case is one sentence.
   */
  const { publicKey } = await api.vapidKey().catch(() => ({ publicKey: null }));
  return <AlertsForm vapidPublicKey={publicKey} />;
}

// Jira GRW-192 — the tab says which screen this is.
export const metadata = screenTitle('Phone alerts');
