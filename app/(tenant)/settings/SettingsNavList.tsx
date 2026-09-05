import type { SettingsSummary } from '../lib/api';
import { IconChevronRight } from '../components/icons';
import { SETTINGS_GROUPS } from './nav-data';
import { SignOutButton } from '../components/SignOutButton';

/** The mobile hub's top card — desktop hides it via CSS (`.settings-header-card` under the 861px breakpoint) since the persistent left pane there has no room for it and goes straight into the section groups. */
function HeaderCard({ settings }: { settings: SettingsSummary }) {
  const locationLine = settings.location ? [settings.location.name, settings.location.addressCity].filter(Boolean).join(', ') : null;
  return (
    <a className="settings-header-card" href="/settings/profile">
      {settings.tenant.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
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
  return (
    <>
      <HeaderCard settings={settings} />
      {SETTINGS_GROUPS.map((group) => (
        <div className="settings-group" key={group.title}>
          <div className="settings-group-title">{group.title}</div>
          <div className="menu-list">
            {group.rows.map((row) => {
              const Icon = row.icon;
              // Before the href check: a row with an action has no href either,
              // and would otherwise render as disabled with "Coming soon".
              if (row.action === 'logout') {
                return (
                  <SignOutButton key={row.label} className="settings-row settings-row-action">
                    <span className="settings-row-icon">
                      <Icon />
                    </span>
                    <div className="settings-row-body">
                      <div className="settings-row-title">{row.label}</div>
                      <div className="settings-row-sub">{row.sub}</div>
                    </div>
                  </SignOutButton>
                );
              }
              if (!row.href) {
                return (
                  <div className="settings-row settings-row-disabled" key={row.label}>
                    <span className="settings-row-icon">
                      <Icon />
                    </span>
                    <div className="settings-row-body">
                      <div className="settings-row-title">{row.label}</div>
                      <div className="settings-row-sub">{row.sub}</div>
                    </div>
                    <span className="settings-row-soon">Coming soon</span>
                  </div>
                );
              }
              return (
                <a className="settings-row" href={row.href} key={row.label}>
                  <span className="settings-row-icon">
                    <Icon />
                  </span>
                  <div className="settings-row-body">
                    <div className="settings-row-title">{row.label}</div>
                    <div className="settings-row-sub">{row.sub}</div>
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
