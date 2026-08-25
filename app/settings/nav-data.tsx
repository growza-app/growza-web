import type { ComponentType } from 'react';
import {
  IconBell,
  IconCalendarPlus,
  IconClock,
  IconLock,
  IconLogout,
  IconPalette,
  IconShield,
  IconShop,
  IconUser,
  IconWallet,
  IconWhatsApp,
} from '../components/icons';

export interface SettingsRow {
  /** Present = a real, working page. Absent = shown but disabled — nothing exists to link to yet. */
  href?: string;
  label: string;
  sub: string;
  icon: ComponentType;
}

export interface SettingsGroup {
  title: string;
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
    title: 'Business',
    rows: [
      { href: '/settings/profile', label: 'Business profile', sub: 'Name, address, contact details', icon: IconShop },
      { href: '/settings/working-hours', label: 'Working hours', sub: 'Manage open hours and days', icon: IconClock },
    ],
  },
  {
    title: 'Booking',
    rows: [
      { href: '/settings/booking', label: 'Booking settings', sub: 'Slot length, notice, horizon', icon: IconCalendarPlus },
      { label: 'Payments', sub: 'Manage UPI and payouts', icon: IconWallet },
      { href: '/settings/booking', label: 'Cancellation policy', sub: 'Set rules for cancellations', icon: IconShield },
      { label: 'WhatsApp settings', sub: 'Auto replies and notifications', icon: IconWhatsApp },
    ],
  },
  {
    title: 'Preferences',
    rows: [
      { href: '/settings/notifications', label: 'Notifications', sub: 'Manage alerts and reminders', icon: IconBell },
      { label: 'Appearance', sub: 'Theme, language', icon: IconPalette },
      { label: 'Privacy', sub: 'Data and privacy settings', icon: IconLock },
    ],
  },
  {
    title: 'Account',
    rows: [
      { label: 'Account', sub: 'Manage your account', icon: IconUser },
      { label: 'Log out', sub: 'Sign out from this device', icon: IconLogout },
    ],
  },
];
