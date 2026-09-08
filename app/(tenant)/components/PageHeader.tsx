import type { ReactNode } from 'react';
import { NotificationBell } from './NotificationBell';

import { AccountMenu } from './AccountMenu';

export function PageHeader({
  title,
  subtitle,
  initial,
  actions,
  mobileSubtitle,
}: {
  title: string;
  subtitle?: string;
  initial?: string;
  actions?: ReactNode;
  /** Keep the (short) subtitle visible on mobile too — off by default, since long subtitles eat the screen. */
  mobileSubtitle?: boolean;
}) {
  return (
    <header className={`topbar ${mobileSubtitle ? 'topbar-with-sub' : ''}`}>
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {/* One group, not three loose children: .topbar is space-between, so
          bare siblings get spread across the width — a page with no `actions`
          stranded the bell in the middle of the header instead of keeping it
          next to the avatar. */}
      <div className="topbar-actions">
        {actions}
        <NotificationBell />
        {/*
          GRW-202 — was a bare <div>: it looked like every other product's
          account button and did nothing.
          GRW-203 — and it is UNCONDITIONAL now. `initial` was optional and
          eleven of fourteen screens never passed it, so the account button did
          not exist on most of the product. A control somebody needs on every
          screen cannot be opt-in per page.
        */}
        <AccountMenu />
      </div>
    </header>
  );
}
