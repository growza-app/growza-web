import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import type { SettingsSummary } from '../lib/api';
import { withBranch } from './branch-link';
import { IconChevronRight } from '../components/icons';
import { SETTINGS_GROUPS, type SettingsGroupKey } from './nav-data';
import { SignOutButton } from '../components/SignOutButton';
import { useBranch } from '../components/BranchProvider';

/*
 * Jira GRW-229 — the business card that used to open this list is gone.
 *
 * It was a phone-only card (desktop hid it at 861px: the left pane is 276px wide
 * and goes straight into the groups) showing the business name, its logo and how
 * many branches, linking to Business profile. Two things ended it:
 *
 * - it cost 62px of a 723px screen, and eleven tappable rows at 44px already take
 *   484px of that, so the hub could not fit with it. Even stripped to a 24px
 *   avatar on one line it left 402×874 16px over — measured, not assumed;
 * - where it went is a row in the list directly beneath it ("Business name and
 *   logo" with several branches, "Business profile" with one), so the only thing
 *   lost with the card is the NAME, not a destination.
 *
 * That the name is now nowhere on the phone hub is a real cost and was weighed
 * rather than waved away: the header there reads "Settings · <branch>", and the
 * business name survives on a phone only inside the account menu. If it belongs
 * on this screen the header is where it belongs, which is a different ticket
 * from "make the tabs fit". `settingsHub.headerBranches` went with it.
 */

export function SettingsNavList({ settings }: { settings: SettingsSummary }) {
  // Jira GRW-230 — moving between tabs keeps the branch that is picked.
  const branch = useSearchParams().get('branch');
  const t = useTranslations('settingsHub');
  const multi = settings.branchCount > 1;
  // Jira GRW-396 — the branch the branch tabs are showing: the address's, else the main one — the same rule
  // the tabs themselves load by (`scope.ts`), so the title and the form never name different branches.
  const { branches } = useBranch();
  const shown = multi ? (branches.find((b) => b.id === branch) ?? branches[0] ?? null) : null;
  const groupTitle = (key: SettingsGroupKey): string => {
    if (key === 'branch') return shown ? t('groups.branchNamed', { name: shown.name }) : t('groups.business');
    if (key === 'business') return multi ? t('groups.wholeBusiness') : t('groups.teamAndBilling');
    return t(`groups.${key}`);
  };
  return (
    <>
      {SETTINGS_GROUPS.map((group) => (
        <div className="settings-group" key={group.key}>
          <div className="settings-group-title">{groupTitle(group.key)}</div>
          <div className="menu-list">
            {group.rows.filter((row) => !row.multiBranchOnly || multi).map((row) => {
              const Icon = row.icon;
              const key = multi && row.multiBranchKey ? row.multiBranchKey : row.key;
              // Before the href check: a row with an action has no href either,
              // and would otherwise render as disabled with "Coming soon".
              if (row.action === 'logout') {
                return (
                  <SignOutButton key={row.key} className="settings-row settings-row-action">
                    <span className="settings-row-icon">
                      <Icon />
                    </span>
                    <div className="settings-row-body">
                      <div className="settings-row-title">{t(`rows.${key}.label`)}</div>
                      <div className="settings-row-sub">{t(`rows.${key}.sub`)}</div>
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
                      <div className="settings-row-title">{t(`rows.${key}.label`)}</div>
                      <div className="settings-row-sub">{t(`rows.${key}.sub`)}</div>
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
                    <div className="settings-row-title">{t(`rows.${key}.label`)}</div>
                    <div className="settings-row-sub">{t(`rows.${key}.sub`)}</div>
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
