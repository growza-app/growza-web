import type { ComponentType } from 'react';
import {
  IconReports,
  IconBell,
  IconCalendarPlus,
  IconClock,
  IconLock,
  IconLogout,
  IconMapPin,
  IconPalette,
  IconShop,
  IconUser,
  IconUserPlus,
  IconWallet,
  IconWhatsApp,
} from '../components/icons';

export type SettingsGroupKey = 'branch' | 'business' | 'preferences' | 'account';
export type SettingsRowKey =
  | 'profile'
  | 'branchProfile'
  | 'business'
  | 'branches'
  | 'workingHours'
  | 'bookingSettings'
  | 'payments'
  | 'whatsapp'
  | 'notifications'
  | 'appearance'
  | 'privacy'
  | 'reportAccess'
  | 'teamAccess'
  | 'billing'
  | 'account'
  | 'logOut';

/**
 * A row either goes somewhere or does something — never neither (owner, 2026-10-04).
 *
 * `href` used to be optional, and a row without one rendered greyed out with a "Coming soon" pill.
 * Five of them shipped that way. The union makes that state unspellable: a new row has to name the
 * page it opens, and it earns its line here on the day that page exists.
 */
export type SettingsRow = SettingsRowBase & ({ href: string; action?: never } | { href?: never; action: 'logout' });

interface SettingsRowBase {
  /**
   * Jira GRW-227 — listed only for a business with more than one active
   * branch. With one, its address lives on Business profile and a Branches
   * screen with a single card would be the same form twice.
   */
  multiBranchOnly?: boolean;
  /**
   * Listed only while clients book through WhatsApp (`me.whatsapp.booking`). Reminders go out by WhatsApp and by
   * nothing else, so with it off the screen sets times for a message that is never sent (owner, 2026-10-10).
   */
  whatsappOnly?: boolean;
  /**
   * Jira GRW-396 — the row's words at a business with more than one branch, when they differ: there,
   * "Business profile" is one branch's profile.
   */
  multiBranchKey?: SettingsRowKey;
  /** Names the row in `settingsHub.rows` — the words live in the message files, not here. */
  key: SettingsRowKey;
  icon: ComponentType;
}

export interface SettingsGroup {
  /** Names the group in `settingsHub.groups`. */
  key: SettingsGroupKey;
  rows: SettingsRow[];
}

/**
 * The single source of truth for what the Settings hub lists — shared by
 * the mobile hub page and the desktop sub-nav pane so the two can never
 * drift apart. Rows without `href` are real, named destinations from the
 * product's own design that nothing has been built for yet (payments,
 * WhatsApp auto-replies, theming, real auth/login) — shown so the map of
 * what's coming is honest, not hidden.
 *
 * Jira GRW-396 — two groups an owner can tell apart at a glance:
 * - `branch`: what can differ from branch to branch (its profile, hours,
 *   booking rules, reminders). With several branches the group is titled
 *   with the header's branch, and every row in it edits that branch.
 * - `business`: what exists once (the name and logo, the branches, who signs
 *   in, who sees what, the bill). The header shows no branch on these.
 *
 * Deliberately NOT listed here: Services and Staff. Both already have their
 * own top-level entry in the sidebar/bottom-nav — repeating them inside
 * Settings just put the same destination on screen twice at once (visible
 * in the persistent sidebar alongside the Settings list itself).
 */
export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    key: 'branch',
    rows: [
      { href: '/settings/profile', key: 'profile', multiBranchKey: 'branchProfile', icon: IconShop },
      { href: '/settings/working-hours', key: 'workingHours', icon: IconClock },
      /*
       * "Cancellation policy" used to be a second row here opening this same page, for the one field on it that
       * names a cancel (owner, 2026-10-10). Two rows, one destination, and the owner tapped both to find out.
       */
      { href: '/settings/booking', key: 'bookingSettings', icon: IconCalendarPlus },
      { href: '/settings/notifications', key: 'notifications', icon: IconBell, whatsappOnly: true },
    ],
  },
  {
    key: 'business',
    rows: [
      { href: '/settings/business', key: 'business', icon: IconShop, multiBranchOnly: true },
      { href: '/settings/branches', key: 'branches', icon: IconMapPin, multiBranchOnly: true },
      { href: '/settings/team', key: 'teamAccess', icon: IconUserPlus },
      { href: '/settings/report-access', key: 'reportAccess', icon: IconReports },
      // Jira GRW-243 — what the owner pays Growza, each branch, the next bill and past bills.
      { href: '/settings/billing', key: 'billing', icon: IconWallet },
    ],
  },
  /*
   * Gone: Payments, WhatsApp settings, Appearance, Privacy and Account (owner, 2026-10-04).
   *
   * Five rows with no href, drawn greyed out with a "Coming soon" pill — a third of this screen
   * promising things that do not exist, on the one screen an owner opens when something is already
   * not where they expected. Settings is now only what Settings can actually do. They come back as
   * rows when they come back as screens, which is the only moment a row is worth drawing.
   */
  {
    key: 'account',
    rows: [{ key: 'logOut', icon: IconLogout, action: 'logout' }],
  },
];
