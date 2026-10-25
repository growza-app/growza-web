import type { HelpRole } from './links';

/**
 * What has been added lately, newest first — the Help screen's last section.
 *
 * Owners find out what their own product can do by being told in a WhatsApp message, or not at all. A feature
 * nobody knows about is a feature nobody switched on: reward points shipped off for every business and stays
 * off until somebody opens a screen they have no reason to look for.
 *
 * This file is only STRUCTURE — what exists, who is offered it, when it arrived and where it lives. The words
 * are `help.new.items.*` in the messages, in both languages, and the test beside this file holds the two
 * together so an entry cannot be half-added.
 *
 * Rules for an entry, learnt from the quick fixes above it:
 *
 * - **One line, in the owner's words.** Not the ticket's title and not the module's name. "Points your clients
 *   earn" rather than "Loyalty programme (GRW-648)".
 * - **Roles.** A reader offered a screen they cannot open is worse off than one told nothing. Most of these are
 *   the owner's.
 * - **`href` only where there is somewhere to go.** A line about something that happens by itself — the day
 *   summary, or a restaurant's own menu screen — has no link, and says so by not having one.
 * - **Say when a thing is only for some businesses in the LINE ITSELF** ("If you take orders from Swiggy…"),
 *   rather than filtering by vertical here. The reader knows what kind of shop they run; the alternative is a
 *   second rule in a second place that can disagree with the first.
 * - **Oldest entries come off the bottom.** This is what is new, not a changelog. Twelve is plenty.
 */
export interface NewThing {
  /** Matches `help.new.items.<id>` in the messages. */
  id: string;
  /** ISO date it reached businesses, used to order and to show the month. */
  on: string;
  roles: 'all' | readonly HelpRole[];
  /** Where it lives, when it is a screen the reader can open. */
  href?: string;
}

export const WHATS_NEW: readonly NewThing[] = [
  { id: 'rewards', on: '2026-10-25', roles: ['owner'], href: '/settings/rewards' },
  { id: 'phone-alerts', on: '2026-10-24', roles: ['owner'], href: '/settings/alerts' },
  { id: 'day-summary', on: '2026-10-24', roles: ['owner'] },
  { id: 'delivery-apps', on: '2026-10-24', roles: ['owner', 'manager', 'receptionist'] },
  { id: 'restaurant', on: '2026-10-23', roles: 'all' },
  { id: 'returns-why', on: '2026-10-22', roles: ['owner', 'manager', 'receptionist'] },
  { id: 'stock-reports', on: '2026-10-22', roles: ['owner', 'manager'], href: '/reports' },
  { id: 'marketplace', on: '2026-10-21', roles: ['owner', 'manager'] },
  { id: 'sizes', on: '2026-10-20', roles: ['owner', 'manager', 'receptionist'], href: '/products' },
];

/** The entries this reader is offered, newest first. An unknown role is offered the ones everybody gets. */
export function whatsNewFor(role: HelpRole | null): NewThing[] {
  return WHATS_NEW.filter((t) => t.roles === 'all' || (role !== null && t.roles.includes(role))).sort((a, b) =>
    b.on.localeCompare(a.on),
  );
}
