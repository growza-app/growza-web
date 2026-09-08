import { api } from '../../lib/api';
import { ReportAccessForm } from './ReportAccessForm';

export const dynamic = 'force-dynamic';

export default async function ReportAccessSettingsPage() {
  const settings = await api.settings().catch(() => null);
  if (!settings) return <div className="banner">Could not load settings — check the server is running.</div>;
  return <ReportAccessForm initial={settings} />;
}
