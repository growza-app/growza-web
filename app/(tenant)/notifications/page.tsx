import { screenTitle } from '../lib/page-title';
import { NotificationsClient } from './NotificationsClient';

// Jira GRW-301 — "Notifications" is the same word in every vertical (unlike
// Clients/Patients or Bookings/Visits), so this is `screenTitle`, not `labelledTitle`.
export const metadata = screenTitle('Notifications');

export default function NotificationsPage() {
  return <NotificationsClient />;
}
