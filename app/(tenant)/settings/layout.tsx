import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { api } from '../lib/api';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { loadErrorKind } from '../lib/load-error';
import { PageHeader } from '../components/PageHeader';
import { BranchUrlSync } from '../components/BranchUrlSync';
import { SettingsHeader } from './SettingsHeader';
import { SettingsShell } from './SettingsShell';
import { guardScreen } from '../lib/screen-guard';

export const dynamic = 'force-dynamic';

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  // Jira GRW-409 — a role the nav does not offer this screen lands on Home, not on controls that answer 403.
  await guardScreen('/settings');
  const t = await getTranslations('settingsHub');
  const title = (await getTranslations('nouns'))('settingsTitle');
  let settings;
  try {
    settings = await api.settings();
  } catch (error) {
    return (
      <>
        <PageHeader title={title} />
        <div className="page-body">
          <LoadErrorBanner kind={loadErrorKind(error)} />
        </div>
      </>
    );
  }

  return (
    <>
      {/* Jira GRW-396 — whose settings these are is the header's branch, as on every other screen: this puts
          it into the address, where each tab reads it (`scope.ts`). Settings' own picker is gone. */}
      <BranchUrlSync />
      <SettingsHeader sectionTitle={title} subtitle={t('subtitle')} />
      {/* Jira GRW-228 — `settings-page`: on a laptop the shell fills the page and
          the list and the form scroll on their own, so the page itself never does. */}
      <div className="page-body settings-page">
        <SettingsShell settings={settings}>{children}</SettingsShell>
      </div>
    </>
  );
}
