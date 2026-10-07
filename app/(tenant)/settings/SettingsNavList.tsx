import { useTranslations } from 'next-intl';
import { usePathname, useSearchParams } from 'next/navigation';
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
  /*
   * Which row the reader is looking at (design review, 2026-10-07).
   *
   * On a desktop this list stays beside the screen it opened, and every row looked the same whichever
   * one was open — "a table that helps people navigate through a hierarchy persistently highlights the
   * selected row to clarify the path people are taking" (HIG, Lists and tables). `aria-current` carries
   * it for a screen reader, and matters as much as the fill: without it the list reads as eleven
   * identical links.
   *
   * Compared on the PATH alone, never the query: `?branch=` changes which branch a screen is showing,
   * not which screen it is.
   */
  const here = usePathname();
  const isHere = (href: string) => {
    const path = href.split('?')[0] ?? href;
    return here === path || here.startsWith(`${path}/`);
  };
  const groupTitle = (key: SettingsGroupKey): string => {
    /*
     * "This branch", not "MG Road branch" (design review, 2026-10-07). The header names the branch two rows
     * above — "Settings" over an "MG Road" line — so the group title was saying it a second time, and the
     * contrast that earns the title is with "Whole business" below, which "This branch" carries on its own.
     */
    if (key === 'branch') return shown ? t('groups.thisBranch') : t('groups.business');
    if (key === 'business') return multi ? t('groups.wholeBusiness') : t('groups.teamAndBilling');
    return t(`groups.${key}`);
  };
  /*
   * A real heading over a real list (design review, 2026-10-07). It was a div over a div, so a screen reader
   * heard eleven undifferentiated links and lost the branch-and-business split the whole screen is built on —
   * "use a label or a header to help people understand the context" (HIG, Lists and tables). Nothing changes
   * on screen.
   */
  return (
    <>
      {SETTINGS_GROUPS.map((group) => (
        <section className="settings-group" key={group.key} aria-labelledby={`settings-group-${group.key}`}>
          <h2 className="settings-group-title" id={`settings-group-${group.key}`}>
            {groupTitle(group.key)}
          </h2>
          <ul className="menu-list">
            {group.rows.filter((row) => !row.multiBranchOnly || multi).map((row) => {
              const Icon = row.icon;
              const key = multi && row.multiBranchKey ? row.multiBranchKey : row.key;
              if (row.action === 'logout') {
                return (
                  <li key={row.key}>
                    <SignOutButton className="settings-row settings-row-action">
                      <span className="settings-row-icon">
                        <Icon />
                      </span>
                      <div className="settings-row-body">
                        <div className="settings-row-title">{t(`rows.${key}.label`)}</div>
                        <div className="settings-row-sub">{t(`rows.${key}.sub`)}</div>
                      </div>
                    </SignOutButton>
                  </li>
                );
              }
              /*
               * There is no "Coming soon" row any more (owner, 2026-10-04). Five of them were drawn
               * greyed out here; a row is worth drawing when it goes somewhere, and `nav-data` now
               * lists only rows that do. A row with no `href` and no action would render as a dead
               * link, so the type keeps `href` required for everything but an action.
               */
              const current = isHere(row.href);
              return (
                <li key={row.key}>
                  <a
                    className={`settings-row ${current ? 'settings-row-current' : ''}`}
                    href={withBranch(row.href, branch)}
                    aria-current={current ? 'page' : undefined}
                  >
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
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}
