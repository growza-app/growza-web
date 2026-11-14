import { getTranslations } from 'next-intl/server';
import { screenTitle } from '../lib/page-title';
import { SettingsOpenFirst } from './SettingsOpenFirst';
/** Desktop-only placeholder shown in the content pane when nothing under Settings is selected yet — see SettingsShell. Invisible on mobile (the hub route shows the nav pane instead). */
export default async function SettingsHubPage() {
  const t = await getTranslations('settingsHub');
  return (
    <>
      <SettingsOpenFirst />
      <div className="settings-empty-state">{t('emptyPane')}</div>
    </>
  );
}

// Jira GRW-192 — the tab says which screen this is.
export const metadata = screenTitle('Settings');
