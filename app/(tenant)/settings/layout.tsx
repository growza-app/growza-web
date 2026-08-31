import type { ReactNode } from 'react';
import { api } from '../lib/api';
import { copy } from '../lib/copy';
import { PageHeader } from '../components/PageHeader';
import { SettingsShell } from './SettingsShell';

export const dynamic = 'force-dynamic';

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  let settings;
  try {
    settings = await api.settings();
  } catch {
    return (
      <>
        <PageHeader title={copy.nav.settings} />
        <div className="page-body">
          <div className="banner">
            <strong>{copy.errors.apiDown}</strong> {copy.errors.apiDownHelp} <code>npm run dev</code>.
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title={copy.nav.settings} subtitle="How your business and bookings work." />
      <div className="page-body">
        <SettingsShell settings={settings}>{children}</SettingsShell>
      </div>
    </>
  );
}
