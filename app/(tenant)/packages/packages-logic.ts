/**
 * Jira GRW-438 — what a package is, and the arithmetic every view of one agrees on.
 *
 * A package is not a new object. It is an `offer` row that carries a price for its services
 * (`comboPriceMinor`) and the services themselves (`serviceIds`) — what the product called a
 * "combo" while it lived inside Offers. Booking, checkout, counter sale and walk-ins already
 * understand those rows, so the split between Packages and Offers is a predicate, not a table.
 *
 * Kept pure and out of the component for the reason the Offers screen learned the hard way: the
 * list row, the builder's summary and the dialog all quote a saving, and three copies of
 * "parts total minus price" is how two of them end up disagreeing by a rupee.
 */
import { asMinor, priceAsked } from '../lib/service-match';
import type { Offer, Service } from '../lib/api';

/** The only thing that tells a package from an announcement. */
export function isPackage(offer: Pick<Offer, 'comboPriceMinor'>): boolean {
  return offer.comboPriceMinor != null;
}

/** Everything a row needs of a service. Narrower than `Service` so tests need not invent a photo. */
export type PricedPart = Pick<Service, 'id' | 'name' | 'priceMinor' | 'durationMin'>;

/**
 * The services a package sells, in the order the builder put them in.
 *
 * `missing` is the count of `serviceIds` with no service behind them any more. It is never silently
 * dropped: a package quoting ₹15,000 for three services when one of them has been deleted is
 * exactly the state GRW-442 exists to prevent, and until that lands the row has to be able to say so.
 */
export function partsOf(
  offer: Pick<Offer, 'serviceIds'>,
  byId: ReadonlyMap<string, PricedPart>,
): { parts: PricedPart[]; missing: number } {
  const parts: PricedPart[] = [];
  let missing = 0;
  for (const id of offer.serviceIds) {
    const part = byId.get(id);
    if (part) parts.push(part);
    else missing += 1;
  }
  return { parts, missing };
}

/** What the same services would cost bought one by one — the number the saving is measured against. */
export function partsTotalMinor(parts: readonly PricedPart[]): number {
  return parts.reduce((sum, p) => sum + Number(p.priceMinor ?? 0), 0);
}

/**
 * How long the visit is.
 *
 * The services' own durations, summed. Cleanup is deliberately not added: how a package is held on
 * the calendar — one block, one staff member, cleanup once at the end — is Jira GRW-443's decision,
 * and quoting a number here that the calendar does not yet honour would be a claim we cannot keep.
 */
export function partsMinutes(parts: readonly PricedPart[]): number {
  return parts.reduce((sum, p) => sum + p.durationMin, 0);
}

/** What the customer is told they keep. Never negative: a package priced above its parts saves nothing. */
export function savingMinor(offer: Pick<Offer, 'comboPriceMinor'>, parts: readonly PricedPart[]): number {
  if (offer.comboPriceMinor == null) return 0;
  return Math.max(0, partsTotalMinor(parts) - Number(offer.comboPriceMinor));
}

/** The same saving as a whole percent, for the chip on the row. 0 when there is nothing to divide by. */
export function savingPct(offer: Pick<Offer, 'comboPriceMinor'>, parts: readonly PricedPart[]): number {
  const total = partsTotalMinor(parts);
  if (total <= 0) return 0;
  return Math.round((savingMinor(offer, parts) / total) * 100);
}

/**
 * The three ways an owner can price a package.
 *
 * `sum` is a real choice, not the absence of one: "charge what the parts cost, show no discount".
 * It is stored as a price equal to the parts total rather than as NULL, because NULL is what makes
 * a row an announcement (`isPackage`) — a package with no price would vanish from this screen and
 * reappear on Offers.
 */
export type PriceMode = 'flat' | 'percent' | 'sum';

/**
 * What to store for a mode. `null` means the owner has not said enough yet, and the builder keeps
 * its Save disabled rather than guessing.
 */
export function pricedMinor(
  mode: PriceMode,
  partsTotal: number,
  input: { flat?: string; percent?: string },
): number | null {
  if (mode === 'sum') return partsTotal;
  if (mode === 'flat') {
    const raw = (input.flat ?? '').trim();
    if (raw === '') return null;
    const rupees = Number(raw);
    if (!Number.isFinite(rupees) || rupees < 0) return null;
    return Math.round(rupees * 100);
  }
  const raw = (input.percent ?? '').trim();
  if (raw === '') return null;
  const pct = Number(raw);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return null;
  return Math.round(partsTotal * (1 - pct / 100));
}

/**
 * Jira GRW-446 — what the "% off" field should say for a price, as a whole percent.
 *
 * Never negative and never over 100. Switching a flat ₹5,000 package whose parts cost ₹3,750 over to "% off"
 * used to put **−33** in a field whose own `min` is 0: a number the builder would then refuse to price from,
 * with nothing said about why. A package at or above its parts is 0% off — which is the truth, and which the
 * panel beside it already states.
 *
 * Empty string when there is nothing to divide by, because the field is then genuinely unanswered.
 */
export function percentOff(priceMinor: number | null, partsTotal: number): string {
  if (priceMinor == null || partsTotal <= 0) return '';
  const pct = Math.round((1 - priceMinor / partsTotal) * 100);
  return String(Math.min(100, Math.max(0, pct)));
}

/**
 * Jira GRW-446 — what the "% off" field holds once the owner leaves it.
 *
 * Clamped when they leave rather than as they type, for the reason the service sheet's steppers are: deleting
 * a digit before typing the next one should not be fought. 150 becomes 100 and −5 becomes 0, because a field
 * that quietly ignores what was typed — no saving, no error, Publish simply dead — is worse than one that
 * corrects it. An empty field stays empty; it is unanswered, not wrong.
 */
export function clampPercentInput(raw: string): string {
  const v = raw.trim();
  if (v === '') return '';
  const pct = Number(v);
  if (!Number.isFinite(pct)) return '';
  return String(Math.min(100, Math.max(0, Math.round(pct))));
}

/**
 * Searching a package finds it by its name, its description, any service inside it — or its price.
 *
 * The price is what the package SELLS for (owner, 2026-10-07), matched exactly. Not the separate total: that
 * is the "before" figure beside the saving, a number nobody is ever charged, and a list that answered 450
 * with a package costing 399 would be telling the owner something untrue about his own menu. Exact, because
 * `includes` would answer "300" with ₹1,300 and ₹300 alike.
 */
export function searchPackages(
  packages: readonly Offer[],
  byId: ReadonlyMap<string, PricedPart>,
  query: string,
): Offer[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [...packages];
  const asked = priceAsked(q);
  return packages.filter((p) => {
    if (asked !== null && asMinor(p.comboPriceMinor) === asked) return true;
    if (p.title.toLowerCase().includes(q)) return true;
    if ((p.description ?? '').toLowerCase().includes(q)) return true;
    return p.serviceIds.some((id) => byId.get(id)?.name.toLowerCase().includes(q));
  });
}
