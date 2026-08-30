import type { ReactNode } from 'react';
import { NotificationBell } from './NotificationBell';

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
        {initial && <div className="avatar-lg">{initial}</div>}
      </div>
    </header>
  );
}
