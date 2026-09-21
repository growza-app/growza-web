import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import type { SettingsSummary } from '../lib/api';
import { withBranch } from './SettingsBranchPicker';
import { IconChevronRight } from '../components/icons';
import { SETTINGS_GROUPS } from './nav-data';
import { SignOutButton } from '../components/SignOutButton';

/** The mobile hub's top card — desktop hides it via CSS (`.settings-header-card` under the 861px breakpoint) since the persistent left pane there has no room for it and goes straight into the section groups. */
function HeaderCard({ settings }: { settings: SettingsSummary }) {
  const locationLine = settings.location ? [settings.location.name, settings.location.addressCity].filter(Boolean).join(', ') : null;
  return (
    <a className="settings-header-card" href="/settings/profile">
      {settings.tenant.logoUrl ? (
         
        <img
          src={settings.tenant.logoUrl}
          alt=""
          className="settings-header-avatar"
          style={{ objectFit: 'cover' }}
        />
      ) : (
        <div className="settings-header-avatar">{settings.tenant.name.charAt(0).toUpperCase()}</div>
      )}
      <div className="settings-header-body">
        <div className="settings-header-name">{settings.tenant.name}</div>
        {locationLine && <div className="settings-header-sub">{locationLine}</div>}
      </div>
      <span className="settings-row-chev">
        <IconChevronRight />
      </span>
    </a>
  );
}

export function SettingsNavList({ settings }: { settings: SettingsSummary }) {
  // Jira GRW-230 — moving between tabs keeps the branch that is picked.
  const branch = useSearchParams().get('branch');
  const t = useTranslations('settingsHub');
  return (
    <>
      <HeaderCard settings={settings} />
      {SETTINGS_GROUPS.map((group) => (
        <div className="settings-group" key={group.key}>
          <div className="settings-group-title">{t(`groups.${group.key}`)}</div>
          <div className="menu-list">
            {group.rows.filter((row) => !row.multiBranchOnly || settings.branchCount > 1).map((row) => {
              const Icon = row.icon;
              // Before the href check: a row with an action has no href either,
              // and would otherwise render as disabled with "Coming soon".
              if (row.action === 'logout') {
                return (
                  <SignOutButton key={row.key} className="settings-row settings-row-action">
                    <span className="settings-row-icon">
                      <Icon />
                    </span>
                    <div className="settings-row-body">
                      <div className="settings-row-title">{t(`rows.${row.key}.label`)}</div>
                      <div className="settings-row-sub">{t(`rows.${row.key}.sub`)}</div>
                    </div>
                  </SignOutButton>
                );
              }
              if (!row.href) {
                return (
                  <div className="settings-row settings-row-disabled" key={row.key}>
                    <span className="settings-row-icon">
                      <Icon />
                    </span>
                    <div className="settings-row-body">
                      <div className="settings-row-title">{t(`rows.${row.key}.label`)}</div>
                      <div className="settings-row-sub">{t(`rows.${row.key}.sub`)}</div>
                    </div>
                    <span className="settings-row-soon">{t('comingSoon')}</span>
                  </div>
                );
              }
              return (
                <a className="settings-row" href={withBranch(row.href, branch)} key={row.key}>
                  <span className="settings-row-icon">
                    <Icon />
                  </span>
                  <div className="settings-row-body">
                    <div className="settings-row-title">{t(`rows.${row.key}.label`)}</div>
                    <div className="settings-row-sub">{t(`rows.${row.key}.sub`)}</div>
                  </div>
                  <span className="settings-row-chev">
                    <IconChevronRight />
                  </span>
                </a>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}
