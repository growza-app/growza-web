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
  IconShield,
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
  | 'cancellationPolicy'
  | 'whatsapp'
  | 'notifications'
  | 'appearance'
  | 'privacy'
  | 'reportAccess'
  | 'teamAccess'
  | 'billing'
  | 'account'
  | 'logOut';

export interface SettingsRow {
  /** Present = a real, working page. Absent = shown but disabled — nothing exists to link to yet. */
  href?: string;
  /**
   * Jira GRW-66 · GRW-160 — a row that DOES something rather than going
   * somewhere. Only "Log out" so far.
   *
   * It needed its own kind because the two that existed did not fit: it has no
   * `href`, and without this it fell into the no-href branch and rendered as
   * disabled with a "Coming soon" pill — telling an owner that signing out was
   * a future feature.
   */
  action?: 'logout';
  /**
   * Jira GRW-227 — listed only for a business with more than one active
   * branch. With one, its address lives on Business profile and a Branches
   * screen with a single card would be the same form twice.
   */
  multiBranchOnly?: boolean;
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
      { href: '/settings/booking', key: 'bookingSettings', icon: IconCalendarPlus },
      { href: '/settings/booking', key: 'cancellationPolicy', icon: IconShield },
      { href: '/settings/notifications', key: 'notifications', icon: IconBell },
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
      { key: 'payments', icon: IconWallet },
      { key: 'whatsapp', icon: IconWhatsApp },
    ],
  },
  {
    key: 'preferences',
    rows: [
      { key: 'appearance', icon: IconPalette },
      { key: 'privacy', icon: IconLock },
    ],
  },
  {
    key: 'account',
    rows: [
      { key: 'account', icon: IconUser },
      { key: 'logOut', icon: IconLogout, action: 'logout' },
    ],
  },
];
