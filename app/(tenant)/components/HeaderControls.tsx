'use client';

import { HeaderBranchPicker } from './HeaderBranchPicker';
import { NotificationBell } from './NotificationBell';
import { AccountMenu } from './AccountMenu';
import { useLive } from './SessionProvider';

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
 * ## Search lives on Home, and nowhere else
 *
 * Jira GRW-448 — it used to be here too, as an icon on all fourteen screens.
 * It finds clients and bookings, and nothing else; beside a screen that has its
 * own search box a bare magnifier reads as "search this screen", which is how
 * the owner tapped it on Packages and was asked for a phone number.
 *
 * Home keeps it, as the wide "Find a client or booking" pill it draws itself
 * (`home/parts.tsx`) — the landing screen, with room for an invitation rather
 * than a shortcut. Every other screen's search is its own, about what is on it.
 */
export function HeaderControls() {
  // Jira GRW-556 — no feed of bookings to look at until the business is live.
  const live = useLive();
  return (
    <>
      {/* Jira GRW-395 — the branch the whole app is showing, first: every figure beside it depends on it. */}
      <HeaderBranchPicker />
      {live ? <NotificationBell /> : null}
      <AccountMenu />
    </>
  );
}
