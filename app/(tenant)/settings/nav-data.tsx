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

export type SettingsGroupKey = 'business' | 'booking' | 'preferences' | 'account';
export type SettingsRowKey =
  | 'profile'
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
 * Deliberately NOT listed here: Services and Staff. Both already have their
 * own top-level entry in the sidebar/bottom-nav — repeating them inside
 * Settings just put the same destination on screen twice at once (visible
 * in the persistent sidebar alongside the Settings list itself).
 */
export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    key: 'business',
    rows: [
      { href: '/settings/profile', key: 'profile', icon: IconShop },
      { href: '/settings/branches', key: 'branches', icon: IconMapPin, multiBranchOnly: true },
      { href: '/settings/working-hours', key: 'workingHours', icon: IconClock },
    ],
  },
  {
    key: 'booking',
    rows: [
      { href: '/settings/booking', key: 'bookingSettings', icon: IconCalendarPlus },
      { key: 'payments', icon: IconWallet },
      { href: '/settings/booking', key: 'cancellationPolicy', icon: IconShield },
      { key: 'whatsapp', icon: IconWhatsApp },
    ],
  },
  {
    key: 'preferences',
    rows: [
      { href: '/settings/notifications', key: 'notifications', icon: IconBell },
      { key: 'appearance', icon: IconPalette },
      { key: 'privacy', icon: IconLock },
    ],
  },
  {
    key: 'account',
    rows: [
      { href: '/settings/report-access', key: 'reportAccess', icon: IconReports },
      { href: '/settings/team', key: 'teamAccess', icon: IconUserPlus },
      // Jira GRW-243 — what the owner pays Growza, each branch, the next bill and past bills.
      { href: '/settings/billing', key: 'billing', icon: IconWallet },
      { key: 'account', icon: IconUser },
      { key: 'logOut', icon: IconLogout, action: 'logout' },
    ],
  },
];
