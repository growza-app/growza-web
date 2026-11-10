/**
 * Jira GRW-701 — one line that says whether a business is using Growza.
 *
 * "Active" means it booked or billed something (the API's `lastActiveAt`, the latest booking or bill in 90 days).
 * Fourteen days with nothing is quiet, and shown in the warning colour, so the admin can call before they leave. A
 * business enrolled today that has done nothing is new, not quiet.
 */
export const QUIET_AFTER_DAYS = 14;

const ZONE = 'Asia/Kolkata';
const dayNumber = (d: Date) => Math.floor(new Date(new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(d)).getTime() / 86_400_000);

export interface HealthInput {
  lastActiveAt?: string | null;
  weekActivity?: number;
  createdAt: string;
}

export interface Health {
  text: string;
  quiet: boolean;
}

/** `null` when the API does not send activity yet (older than growza#514): show nothing rather than guess. */
export function businessHealth(b: HealthInput, now: Date = new Date()): Health | null {
  if (b.weekActivity === undefined || b.lastActiveAt === undefined) return null;
  const today = dayNumber(now);
  const week = b.weekActivity === 1 ? '1 booking or bill this week' : `${b.weekActivity} bookings & bills this week`;
  if (b.lastActiveAt === null) {
    const age = today - dayNumber(new Date(b.createdAt));
    if (age === 0) return { text: 'New today', quiet: false };
    if (age < QUIET_AFTER_DAYS) return { text: 'No bookings or bills yet', quiet: false };
    return { text: age > 90 ? 'Quiet for over 90 days' : `Quiet ${age} days`, quiet: true };
  }
  const days = today - dayNumber(new Date(b.lastActiveAt));
  if (days >= QUIET_AFTER_DAYS) return { text: `Quiet ${days} days`, quiet: true };
  const when = days <= 0 ? 'Active today' : days === 1 ? 'Active yesterday' : `Active ${days} days ago`;
  return { text: `${when} · ${week}`, quiet: false };
}
