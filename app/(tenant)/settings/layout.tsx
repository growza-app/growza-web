import type { ReactNode } from 'react';
import { api } from '../lib/api';
import { copy } from '../lib/copy';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { loadErrorKind } from '../lib/load-error';
import { PageHeader } from '../components/PageHeader';
import { SettingsShell } from './SettingsShell';
import { SettingsBranchPicker } from './SettingsBranchPicker';

export const dynamic = 'force-dynamic';

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  let settings;
  try {
    settings = await api.settings();
  } catch (error) {
    return (
      <>
        <PageHeader title={copy.nav.settings} />
        <div className="page-body">
          <LoadErrorBanner kind={loadErrorKind(error)} />
        </div>
      </>
    );
  }

  const branches = settings.branchCount > 1 ? ((await api.branchSettings().catch(() => null))?.branches ?? []) : [];

  return (
    <>
      <PageHeader
        title={copy.nav.settings}
        subtitle="How your business and bookings work."
        // Jira GRW-230 — a business with branches picks whose settings these are.
        actions={branches.length > 1 ? <SettingsBranchPicker branches={branches} /> : undefined}
      />
      {/* Jira GRW-228 — `settings-page`: on a laptop the shell fills the page and
          the list and the form scroll on their own, so the page itself never does. */}
      <div className="page-body settings-page">
        <SettingsShell settings={settings}>{children}</SettingsShell>
      </div>
    </>
  );
}
