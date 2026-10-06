'use client';

import { useTranslations } from 'next-intl';
import { usePathname, useSearchParams } from 'next/navigation';
import { withBranch } from './branch-link';
import type { ReactNode } from 'react';
import type { SettingsSummary } from '../lib/api';
import { IconArrowLeft } from '../components/icons';
import { SettingsNavList } from './SettingsNavList';
import { ReadOnlyFields } from '../components/ReadOnlyFields';

/**
 * Desktop: a persistent left nav pane beside the section content (both
 * panes always visible — see the `min-width: 861px` override in globals.css).
 * Mobile: exactly one pane at a time, picked by route — the hub (`/settings`
 * itself) shows the nav pane as the whole screen; any other settings route
 * shows only the content pane, with a "Back to Settings" link standing in
 * for the nav pane mobile doesn't have room to show alongside it.
 */
export function SettingsShell({ settings, children }: { settings: SettingsSummary; children: ReactNode }) {
  const pathname = usePathname();
  const isHub = pathname === '/settings';
  const t = useTranslations('settingsHub');
  const branch = useSearchParams().get('branch');
  /*
   * Jira GRW-556 (follow-up) — a business suspended for non-payment reads every Settings page and changes none of them: the
   * content pane is one `ReadOnlyFields`, so every field, switch and button inside goes inert while the values stay on show.
   * Billing is the exception — paying is the way back — and the back link sits outside it.
   */
  const onBilling = pathname.startsWith('/settings/billing');

  return (
    /* Jira GRW-229 — `settings-hub` marks the one route where the LIST is the screen, so the phone
       rules in 85-settings-fit.css can tighten that screen without touching a form's own layout.
       A class rather than a `:has()` chain: the shell already knows which route it is on. */
    <div className={`settings-shell ${isHub ? 'settings-hub' : ''}`}>
      <div className={`settings-nav-pane ${isHub ? '' : 'settings-nav-pane-hidden-mobile'}`}>
        <SettingsNavList settings={settings} />
      </div>
      <div className={`settings-content-pane ${isHub ? 'settings-content-pane-hidden-mobile' : ''}`}>
        <a className="settings-back-link" href={withBranch('/settings', branch)}>
          <IconArrowLeft />
          {t('back')}
        </a>
        <ReadOnlyFields exempt={onBilling}>{children}</ReadOnlyFields>
      </div>
    </div>
  );
}
