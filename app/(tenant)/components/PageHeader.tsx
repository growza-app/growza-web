import type { ReactNode } from 'react';
import { HeaderControls } from './HeaderControls';

/**
 * Jira GRW-30 — the one header. Title and subtitle left; the page's primary
 * action, then search, notifications and account, right.
 *
 * ## `actions` is the primary-action slot, and it is the header's
 *
 * The design board asks for the primary action "always in the same position",
 * and four screens had four answers: Clients and Offers put Add in the header,
 * Staff and Services put it in the filter row beneath, Bookings had neither.
 *
 * The header wins, for reasons that are not symmetry:
 *
 * - The row beneath is a row for **finding** things — a search field and tabs
 *   over a list that is already there. Mixing "make a new one" into it is what
 *   let Staff and Services disagree about the order (`[search][Add]` against
 *   `[Add][search][Export]`) without either looking wrong.
 * - Offers is `page-fit`: `useFitRows` sizes its card count to the room left
 *   over, so a toolbar row there costs a row of content on every screen size.
 * - It is the only position that exists on all fourteen screens already.
 *
 * So: `actions` creates, and the row beneath filters. A screen with no create
 * action passes nothing and the controls simply sit further right.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  mobileSubtitle,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  /** Keep the (short) subtitle visible on mobile too — off by default, since long subtitles eat the screen. */
  mobileSubtitle?: boolean;
}) {
  return (
    <header className={`topbar ${mobileSubtitle ? 'topbar-with-sub' : ''}`}>
      <div className="topbar-title">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {/* One group, not loose children: .topbar is space-between, so bare
          siblings get spread across the width — a page with no `actions`
          stranded the bell in the middle of the header instead of keeping it
          next to the avatar. */}
      <div className="topbar-actions">
        {actions}
        <HeaderControls />
      </div>
    </header>
  );
}
