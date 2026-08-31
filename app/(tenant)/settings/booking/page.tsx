import { api } from '../../lib/api';
import { BookingRulesForm } from './BookingRulesForm';

export const dynamic = 'force-dynamic';

export default async function BookingSettingsPage() {
  const settings = await api.settings().catch(() => null);
  if (!settings) return <div className="banner">Could not load settings — check the server is running.</div>;
  return <BookingRulesForm initial={settings} />;
}
