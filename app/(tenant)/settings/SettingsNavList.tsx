import { useTranslations } from 'next-intl';
import { usePathname, useSearchParams } from 'next/navigation';
import type { SettingsSummary } from '../lib/api';
import { withBranch } from './branch-link';
import { IconChevronRight } from '../components/icons';
import { gridCanSee } from '../lib/nav-policy';
import { areaAllows } from '../lib/areas';
import { SETTINGS_GROUPS, type SettingsGroupKey, type SettingsRow } from './nav-data';
import { SignOutButton } from '../components/SignOutButton';
import { useBranch } from '../components/BranchProvider';
import { useAreas, useLive, useSession, useWhatsappLive } from '../components/SessionProvider';

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
  const whatsappLive = useWhatsappLive();
  // Jira GRW-556 — a row whose screen only works once the business is live (Payments).
  const live = useLive();
  // Jira GRW-610 — a business with no diary is not offered the settings of one.
  const areas = useAreas();
  // BR-03 (SessionProvider.tsx) — null for a dev-fallback or degraded session with no member is treated as owner.
  const role = useSession()?.role ?? 'owner';
  /*
   * Jira GRW-396 — the branch the per-branch rows edit: the address's, else the main one — the same rule the tabs
   * themselves load by (`scope.ts`). Only whether there IS one is used now: it decides the "This branch" tag, which
   * says "This branch" and not the branch's name because the header names it two rows above (design review,
   * 2026-10-07) — and the header and the form never name different branches.
   */
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
  /*
   * Grouped by what the owner is doing (owner, 2026-11-18), so a group's title no longer depends on the branches:
   * "Your shop" is the same words at one branch or five. Which rows are one branch's is the tag's job, below.
   */
  const groupTitle = (key: SettingsGroupKey): string => t(`groups.${key}`);
  const listed = (row: SettingsRow): boolean =>
    (!row.multiBranchOnly || multi) && (!row.whatsappOnly || whatsappLive) && (!row.liveOnly || live) && (!row.diaryOnly || areas.bookings) && (!row.shopOwnerOnly || (areas.shop && role === 'owner')) && (!row.ownerOnly || role === 'owner') && (!row.ownerOrManager || role === 'owner' || role === 'manager') && (!areas.pages || !row.href || gridCanSee(row.href, areas.pages)) && (!row.shopOnly || areas.shop) && (!row.href || areaAllows(row.href, areas));
  /*
   * A group with nothing left to list draws nothing — not a bare heading over an empty card. A salon has no Dining
   * rows; a stylist may have no Team or Money ones.
   */
  const groups = SETTINGS_GROUPS.map((group) => ({ key: group.key, rows: group.rows.filter(listed) })).filter((group) => group.rows.length > 0);
  /*
   * A real heading over a real list (design review, 2026-10-07). It was a div over a div, so a screen reader
   * heard eleven undifferentiated links and lost the groups the whole screen is built on —
   * "use a label or a header to help people understand the context" (HIG, Lists and tables). Nothing changes
   * on screen.
   */
  return (
    <>
      {groups.map((group) => (
        <section className="settings-group" key={group.key} aria-labelledby={`settings-group-${group.key}`}>
          <h2 className="settings-group-title" id={`settings-group-${group.key}`}>
            {groupTitle(group.key)}
          </h2>
          <ul className="menu-list">
            {group.rows.map((row) => {
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
                    {/* Jira GRW-396 — what the "This branch" group used to say, now on the row it is true of. One branch: nothing to tell apart. */}
                    {row.perBranch && shown ? <span className="menu-row-pill settings-row-tag">{t('thisBranch')}</span> : null}
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
