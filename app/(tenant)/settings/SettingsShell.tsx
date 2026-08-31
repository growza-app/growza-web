'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import type { SettingsSummary } from '../lib/api';
import { IconArrowLeft } from '../components/icons';
import { SettingsNavList } from './SettingsNavList';

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

  return (
    <div className="settings-shell">
      <div className={`settings-nav-pane ${isHub ? '' : 'settings-nav-pane-hidden-mobile'}`}>
        <SettingsNavList settings={settings} />
      </div>
      <div className={`settings-content-pane ${isHub ? 'settings-content-pane-hidden-mobile' : ''}`}>
        <a className="settings-back-link" href="/settings">
          <IconArrowLeft />
          Back to Settings
        </a>
        {children}
      </div>
    </div>
  );
}
