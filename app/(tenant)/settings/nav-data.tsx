import type { ComponentType } from 'react';
import {
  IconReports,
  IconRupee,
  IconBell,
  IconCalendarPlus,
  IconClock,
  IconLock,
  IconLogout,
  IconMapPin,
  IconPalette,
  IconPayUpi,
  IconShop,
  IconStar,
  IconTable,
  IconUser,
  IconUserPlus,
  IconWallet,
  IconWhatsApp,
  IconFlame,
  IconPercent,
} from '../components/icons';

export type SettingsGroupKey = 'shop' | 'dining' | 'money' | 'team' | 'plan' | 'account';
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
  | 'phoneAlerts'
  | 'rewards'
  | 'tables'
  | 'kitchenStations'
  | 'billOffers'
  | 'checkIn'
  | 'appearance'
  | 'privacy'
  | 'reportAccess'
  | 'roles'
  | 'channels'
  | 'gst'
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
   * Jira GRW-610 — listed only for a business that takes bookings. A shop has no diary, so Booking settings (times and
   * closed days) and Location check-in (staff marking themselves in at a chair) set up something it does not have:
   * absent for it, never an empty form. `areas.ts` closes the same two addresses to it.
   */
  diaryOnly?: boolean;
  /**
   * Jira GRW-72 — listed only for a shop, and only for its owner. A salon keeps its fixed roles and is shown nothing about
   * this; the API answers 404 to it all the same, so a typed address is not a way in.
   */
  shopOwnerOnly?: boolean;

  /**
   * Jira GRW-641 — listed only for a shop. Which branch Flipkart and Amazon sell from means nothing to a business with a diary, which has
   * no marketplaces: absent for it, never a screen that answers 404.
   */
  shopOnly?: boolean;
  /**
   * Jira GRW-647 — listed for the owner alone.
   *
   * Not `shopOwnerOnly`: that one also wants a shop. Phone alerts are every vertical's, and only the owner is
   * sent anything today — a row that showed a stylist four switches which change nothing would be the
   * written-displayed-never-read control this codebase has been caught by three times.
   */
  ownerOnly?: boolean;
  /**
   * Jira GRW-719 — listed for the owner and a manager: the owner switches Table orders on, and either sets out the room.
   */
  ownerOrManager?: boolean;
  /**
   * Listed only once the business is live.
   *
   * Payments is the one row like this. Settings is open before go-live so an
   * owner can set the salon up, but the QR is for taking money from a customer
   * at the till, which a business that has not gone live is not doing — and the
   * API classifies its four writes as live-day for exactly that reason
   * (`permission-matrix`), so a row shown earlier would open a screen whose
   * every button 403s.
   */
  liveOnly?: boolean;
  /**
   * Jira GRW-396 — the row edits the header's branch: its screen loads through `loadScopedSettings` (`scope.ts`) and
   * the header offers no "All" on it. With more than one branch the row carries a "This branch" tag, which is what
   * the old "This branch" GROUP said before the hub was grouped by task; with one branch there is nothing to tell
   * apart and no tag. `settings-per-branch.test.ts` checks every flagged row against `wholeBusiness`.
   *
   * Not set on Kitchen stations or Coupons and offers, although each branch has its own: those screens carry their own
   * branch picker and the header picks nothing on them (`wholeBusiness`), so "This branch" would name no branch. Not
   * set on GST either: most of that screen is the whole business's registration.
   */
  perBranch?: boolean;
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
 * drift apart. Every row names a page that exists — the union above makes a
 * row without one unspellable.
 *
 * Grouped by what the owner is doing, not by whose setting it is (owner, 2026-11-18). Jira GRW-396 split the list
 * into "this branch" and "the whole business", and the owner's phone then showed Payment QR, Phone alerts, Reward
 * points, Tables, Kitchen stations, Who sees what, Team and roles and Billing under one heading — rows with nothing
 * in common but their scope. GRW-396's meaning is kept on the row instead: `perBranch` draws a "This branch" tag
 * at a business with several branches. A group whose rows are all filtered out draws no heading.
 *
 * Deliberately NOT listed here: Services and Staff. Both already have their
 * own top-level entry in the sidebar/bottom-nav — repeating them inside
 * Settings just put the same destination on screen twice at once (visible
 * in the persistent sidebar alongside the Settings list itself).
 */
export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    key: 'shop',
    rows: [
      { href: '/settings/profile', key: 'profile', multiBranchKey: 'branchProfile', perBranch: true, icon: IconShop },
      { href: '/settings/business', key: 'business', icon: IconShop, multiBranchOnly: true },
      { href: '/settings/branches', key: 'branches', icon: IconMapPin, multiBranchOnly: true },
      { href: '/settings/working-hours', key: 'workingHours', perBranch: true, icon: IconClock },
      /*
       * "Cancellation policy" used to be a second row here opening this same page, for the one field on it that
       * names a cancel (owner, 2026-10-10). Two rows, one destination, and the owner tapped both to find out.
       */
      { href: '/settings/booking', key: 'bookingSettings', diaryOnly: true, perBranch: true, icon: IconCalendarPlus },
      { href: '/settings/notifications', key: 'notifications', icon: IconBell, whatsappOnly: true, perBranch: true },
      // Jira GRW-563 — where this branch is, for a stylist's "I'm in" from her phone.
      { href: '/settings/check-in', key: 'checkIn', icon: IconMapPin, perBranch: true },
      // Jira GRW-641 — which shop's shelves the marketplaces sell from.
      { href: '/settings/channels', key: 'channels', icon: IconShop, shopOnly: true },
    ],
  },
  /*
   * Only a restaurant ever sees this group: `areaAllows` closes both addresses everywhere else (TABLE_ROUTES), so at a
   * salon or a shop both rows are filtered out and the heading goes with them.
   */
  {
    key: 'dining',
    rows: [
      /*
       * Jira GRW-718 — which branches seat their guests. One screen with a switch per branch, not a per-branch row:
       * the owner decides it for the whole business at a glance ("MG Road yes, Airport no"), the way the story asks,
       * rather than flipping the header branch once per branch to find out — so the header picks nothing here.
       *
       * Owner and manager (GRW-719 — a manager sets rooms up; the switches stay the owner's).
       */
      { href: '/settings/tables', key: 'tables', icon: IconTable, ownerOrManager: true },
      /*
       * Jira GRW-733 — a branch's kitchen stations, and which station makes each menu category. Beside Tables: the owner or
       * a manager sets the kitchen up the way they set the room up. Its own branch picker, as the stations are each
       * branch's own, so no "This branch" tag — the header picks nothing on it.
       */
      { href: '/settings/kitchen-stations', key: 'kitchenStations', icon: IconFlame, ownerOrManager: true },
    ],
  },
  {
    key: 'money',
    rows: [
      // The QR the till shows a customer. Live-day: see `liveOnly` above.
      { href: '/settings/payments', key: 'payments', icon: IconPayUpi, liveOnly: true },
      /*
       * Jira GRW-582 — the details that turn a receipt into a tax invoice.
       *
       * Most of the screen is the whole business's: the registration, the invoice prefix, GST on top. One card on it is
       * a branch's — the state it supplies from, which decides CGST and SGST or IGST — so it is not tagged
       * "This branch": the tag would say the whole screen is one branch's, and the registration is not.
       *
       * Asked here and not at enrolment (owner, 2026-10-17): most businesses do not have the number to hand on
       * their first day, and a guess typed to get past a signup form would be printed on real documents.
       */
      { href: '/settings/gst', key: 'gst', icon: IconRupee },
      // Jira GRW-735 — a branch's coupon codes and buy-get offers, picked on the screen itself. The owner's or a manager's; a business that rings up no products never sees it.
      { href: '/settings/offers', key: 'billOffers', icon: IconPercent, ownerOrManager: true },
      /*
       * Jira GRW-648 — whether this business gives reward points, and how generous it is.
       *
       * Not a per-branch row: points earned at MG Road are spendable at Koramangala (the owner's decision, and the
       * ledger is keyed on the person rather than the branch record), so there is nothing here to set differently
       * per branch.
       *
       * Owner only, like Phone alerts and for a plainer reason: an earn rate is a standing promise to every
       * client the business has, and it is the owner who pays for it.
       */
      { href: '/settings/rewards', key: 'rewards', icon: IconStar, ownerOnly: true },
    ],
  },
  {
    key: 'team',
    rows: [
      // Jira GRW-72 — what each role on a shop's team can open.
      { href: '/settings/roles', key: 'roles', icon: IconLock, shopOwnerOnly: true },
      { href: '/settings/report-access', key: 'reportAccess', icon: IconReports },
      /*
       * Jira GRW-647 — which events reach the owner's own phone.
       *
       * Not a per-branch row, and that is the whole reason it is not a section of Settings › Notifications: a phone
       * belongs to a person, not to a branch, and there is nothing here to set differently at MG Road than at
       * Koramangala.
       */
      { href: '/settings/alerts', key: 'phoneAlerts', icon: IconBell, ownerOnly: true },
    ],
  },
  {
    key: 'plan',
    // Jira GRW-243 — what the owner pays Growza, each branch, the next bill and past bills.
    rows: [{ href: '/settings/billing', key: 'billing', icon: IconWallet }],
  },
  /*
   * Gone: WhatsApp settings, Appearance, Privacy and Account (owner, 2026-10-04).
   * Payments came back on 2026-10-11, when it became a screen that does something:
   * the QR the till shows. It sits in the Money group above.
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
