import { screenTitle } from '../lib/page-title';
import { guardLive } from '../lib/screen-guard';
import { NotificationsClient } from './NotificationsClient';

// Jira GRW-301 — "Notifications" is the same word in every vertical (unlike
// Clients/Patients or Bookings/Visits), so this is `screenTitle`, not `labelledTitle`.
export const metadata = screenTitle('Notifications');

export default async function NotificationsPage() {
  // Jira GRW-556 — there is no feed of bookings until the business is live.
  await guardLive('/notifications');
  return <NotificationsClient />;
}
