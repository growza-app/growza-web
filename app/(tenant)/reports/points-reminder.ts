/**
 * Owner, 2026-11-27 — "Points waiting to be used": the reminder an owner sends to a guest who could spend their points
 * today, from Reports › Guests. Like the "we miss you" messages: no guest's name, no "Hi", English only (the guest's
 * words, not the dashboard's), sent as a `wa.me` link from the owner's own WhatsApp.
 */

/** Where the words say how many points, and what they are worth. Left in the editable message so the owner can move them. */
export const POINTS = '{points}';
export const WORTH = '{worth}';

export interface PointsGuest {
  points: number;
  worthMinor: number;
  expiring: { points: number; on: string } | null;
}

const place = (business: string | null | undefined) => business?.trim() || 'us';
export const pointsNumber = (n: number) => n.toLocaleString('en-IN');
export const rupees = (minor: number) => `₹${(minor / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** "5 Dec" — an ISO date read as the calendar day it names, never shifted by the reader's clock. */
export function shortDay(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** The words, with the restaurant named and the numbers left for each guest. */
export function pointsTemplate(business: string | null | undefined): string {
  return `You have ${POINTS} points at ${place(business)}, worth ${WORTH}. Use them on your next visit 🎁`;
}

/**
 * One guest's message: their own numbers in place of {points} and {worth}; then, when a bill may only partly be paid with
 * points, how much ("Points can pay up to 20% of a bill.") — or "worth ₹500" promises more than one visit can take
 * (review, 2026-11-27); then — only when some die within the month — when. All of them dying that day reads "They
 * expire on 5 Dec."; some, "120 of them expire on 5 Dec."
 */
export function pointsFor(template: string, g: PointsGuest, capPct = 100): string {
  let text = template.split(POINTS).join(pointsNumber(g.points)).split(WORTH).join(rupees(g.worthMinor)).trim();
  if (capPct > 0 && capPct < 100) text = `${text} Points can pay up to ${capPct}% of a bill.`;
  if (!g.expiring) return text;
  const day = shortDay(g.expiring.on);
  return g.expiring.points >= g.points
    ? `${text} They expire on ${day}.`
    : `${text} ${pointsNumber(g.expiring.points)} of them expire on ${day}.`;
}
