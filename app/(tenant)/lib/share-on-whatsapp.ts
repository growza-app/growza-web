import { DateTime } from 'luxon';
import { bookingLinkUrl, sharePhone, shareTextFor, type ShareItem, type ShareLang, type ShareTone } from '@growza-app/shared';
import type { MeBranch, Offer, Product } from './api-types';

/**
 * Jira GRW-671 — what the Share on WhatsApp button says about each kind of thing, and when there is nothing to share.
 *
 * The words themselves are `shareTextFor` in @growza-app/shared. This file only turns a row the screen already holds
 * into the item that function takes, and says no when the price on the row is not one the till would charge today
 * (BR-02): an offer switched off, one that has ended or not started, a counted product with none on the shelf.
 *
 * Every row already belongs to ONE branch — an offer "at all branches" is a copy per branch (GRW-381), and a service,
 * product or dish is at one branch (GRW-376) — so the branch is the row's own and there is never a branch to ask for.
 */

/** Is this offer running now? Switched on, inside its dates. A weekday limit does not stop it: the message names the days. */
export function offerIsLive(offer: Pick<Offer, 'active' | 'visibleFrom' | 'visibleUntil'>, now: DateTime = DateTime.now()): boolean {
  if (!offer.active) return false;
  const from = offer.visibleFrom ? DateTime.fromISO(offer.visibleFrom) : null;
  const until = offer.visibleUntil ? DateTime.fromISO(offer.visibleUntil) : null;
  if (from?.isValid && from > now) return false;
  if (until?.isValid && until < now) return false;
  return true;
}

/** The last day an offer runs, as a date in the business's zone. */
function lastDay(visibleUntil: string | null, timezone: string): string | null {
  if (!visibleUntil) return null;
  const at = DateTime.fromISO(visibleUntil).setZone(timezone);
  return at.isValid ? at.toISODate() : null;
}

/**
 * An announcement or a package, as a shareable item; null when it is not running.
 *
 * `partsTotalMinor` is what its services cost one by one — the was-price — passed only when every service is still
 * there: a package whose service has been deleted must not quote a saving against a price nobody can buy.
 */
export function offerShareItem(
  offer: Offer,
  { timezone, partsTotalMinor = null, now }: { timezone: string; partsTotalMinor?: number | null; now?: DateTime },
): ShareItem | null {
  if (!offerIsLive(offer, now)) return null;
  const price = offer.comboPriceMinor == null ? null : Number(offer.comboPriceMinor);
  return {
    name: offer.title,
    detail: offer.description,
    priceMinor: price != null && Number.isFinite(price) ? price : null,
    wasMinor: price != null ? partsTotalMinor : null,
    until: lastDay(offer.visibleUntil, timezone),
    weekdays: offer.visibleWeekdays,
  };
}

/**
 * QA 10 Nov 2026 (GRW-671 loophole) — the "was" a shared package quotes: the LOWER of what its services cost today and
 * what they cost when its set of services was chosen (API 0175). Raising a service's price after making the package —
 * or just before sharing it — must never make the saving look bigger than it was: a fake strikethrough discount.
 */
export function wasPriceMinor(todayMinor: number, whenMadeMinor: string | null | undefined): number {
  const then = whenMadeMinor == null ? NaN : Number(whenMadeMinor);
  return Number.isFinite(then) ? Math.min(todayMinor, then) : todayMinor;
}

/**
 * A product or a dish, as a shareable item; null when it is retired, or counted and none is left.
 *
 * A product sold in sizes at different prices says "from" its cheapest size; sizes all at one price say that price.
 */
export function productShareItem(product: Product, { counted }: { counted: boolean }): ShareItem | null {
  if (!product.active) return null;
  if (counted && product.stock <= 0) return null;
  const min = product.sizePriceMinMinor == null ? null : Number(product.sizePriceMinMinor);
  const max = product.sizePriceMaxMinor == null ? null : Number(product.sizePriceMaxMinor);
  if (min != null && max != null && Number.isFinite(min) && Number.isFinite(max)) {
    return { name: product.name, priceMinor: min, priceIsFrom: max > min };
  }
  const price = Number(product.priceMinor);
  return { name: product.name, priceMinor: Number.isFinite(price) ? price : null };
}

export interface ShareSession {
  lang: ShareLang;
  tone: ShareTone;
  businessName: string;
  businessPhone: string | null;
  timezone: string;
  branches: readonly MeBranch[];
  /** WhatsApp booking is live AND the business takes bookings — only then is there a booking link to give. */
  bookingLive: boolean;
}

/** The branch a row is shared from: its own, never a guess (see `shareMessage`). */
function branchOf(branchId: string | null | undefined, session: ShareSession): MeBranch | undefined {
  return branchId ? session.branches.find((b) => b.id === branchId) : session.branches.length === 1 ? session.branches[0] : undefined;
}

/**
 * QA 10 Nov 2026 (GRW-671 loophole) — does the message tell a client how to reach the business? A booking link or a
 * phone WhatsApp can dial. Without either, a forwarded message brings nobody back, so the button asks first.
 */
export function shareReachesSomeone({ branchId, bookable }: { branchId: string | null | undefined; bookable: boolean }, session: ShareSession): boolean {
  const branch = branchOf(branchId, session);
  if (bookable && session.bookingLive && branch && bookingLinkUrl(session.businessPhone, branch.name, branch.id)) return true;
  return sharePhone(branch?.phone ?? session.businessPhone) != null;
}

/**
 * The finished message for one item at its branch.
 *
 * The booking link goes only on something that is booked (`bookable`: an offer or a package), and only where WhatsApp
 * booking is live (BR-05). A product's message gives the branch's phone instead: "I'd like to book" is the wrong
 * first line for a bottle of shampoo.
 */
export function shareMessage(
  item: ShareItem,
  { branchId, bookable }: { branchId: string | null | undefined; bookable: boolean },
  session: ShareSession,
  now: DateTime = DateTime.now(),
): string {
  /*
   * The row's own branch, and never a guess: a branch this session is not sent (closed since, or not this person's)
   * must not be signed with the main branch's name, phone and pin — clients would ring or walk into the wrong shop.
   * With no branch the message signs with the business alone and gives the business's phone. Only a row that names no
   * branch at all (an API a deploy behind) at a ONE-branch business takes that branch, since there is no other.
   */
  const branch = branchOf(branchId, session);
  const bookingUrl = bookable && session.bookingLive && branch ? bookingLinkUrl(session.businessPhone, branch.name, branch.id) : null;
  return shareTextFor(item, {
    lang: session.lang,
    tone: session.tone,
    businessName: session.businessName,
    branchName: branch?.name ?? null,
    bookingUrl,
    phone: branch?.phone ?? session.businessPhone,
    mapsUrl: branch?.mapsUrl ?? null,
    today: now.setZone(session.timezone).toISODate() ?? now.toISODate()!,
  });
}
