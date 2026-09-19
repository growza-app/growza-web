import { NotificationBell } from './NotificationBell';
import { AccountMenu } from './AccountMenu';
import { IconSearch } from './icons';
import { useTranslations } from 'next-intl';

/**
 * Jira GRW-30 — search, notifications and account, in that order, on every screen.
 *
 * The design board (`2a`) asks for one header: title and subtitle left, these
 * three right. What was actually shipped was three different headers and a
 * screen with none:
 *
 * | screen | search | bell | account |
 * |---|---|---|---|
 * | Home (`.home-head`) | ✅ | ✅ | a `<div>` with a letter in it |
 * | 14 screens (`.topbar`) | ❌ | ✅ | ✅ |
 * | Reports (`.rp-header`) | ❌ | ❌ | ❌ |
 * | Search | — no header at all — |
 *
 * Two of those rows are worth stating plainly. **Reports had none of the
 * three** — the screen the owner named as one of the three things they are
 * buying the product for could not reach notifications or sign out. And
 * **Home's avatar was a bare `<div>`**, which is exactly the defect GRW-202
 * fixed and GRW-203 made unconditional — fixed inside `PageHeader`, on the one
 * screen that does not use `PageHeader`.
 *
 * That is the argument for a component rather than a convention: three headers
 * that "should" each carry three controls carried seven of nine between them,
 * and nothing anywhere said so.
 *
 * ## Search is one control at two widths
 *
 * Home had a 302px "Search anything..." pill and, below 860px, a separate
 * 48px icon button — two elements, one shown and one hidden. Keeping that
 * would mean every screen inheriting a pair of controls to keep in step.
 *
 * Here it is one `<a>` whose label collapses. `wide` asks for the pill, and
 * only Home passes it: Home is the landing screen with room to spare, and the
 * pill is an invitation rather than a shortcut. Everywhere else the title
 * beside it is the thing to read, so search is the icon.
 */
export function HeaderControls({ wide = false, hideSearch = false }: { wide?: boolean; hideSearch?: boolean }) {
  const t = useTranslations('search');
  return (
    <>
      {/* Jira GRW-307 — not on the Search screen, where it would only reload the page you are on. */}
      {hideSearch ? null : (
        <a
          className={`hdr-search ${wide ? 'hdr-search-wide' : ''}`}
          href="/search"
          aria-label={t('title')}
        >
          <IconSearch />
          {wide && <span>{t('prompt')}</span>}
        </a>
      )}
      <NotificationBell />
      <AccountMenu />
    </>
  );
}
