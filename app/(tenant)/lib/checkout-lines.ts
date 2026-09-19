import type { Appointment, PaymentMode } from './api-types';

/**
 * Jira GRW-314 — what "Mark as done" is made of, and the request it sends.
 *
 * A combo is ONE line: one name, one price, taken off and put back as a whole. Its services are inside it,
 * not rows of their own, so it cannot be half-removed and its price is never left on a service that is
 * no longer part of it. Everything else is a line of its own. Kept out of the sheet so the rules can be
 * run and tested on their own.
 */

/** Rupees as typed ("500") to minor units — the inverse of `formatMoney`'s `/100`. */
export function toMinor(rupees: string): number {
  return Math.round(Number(rupees) * 100);
}

export function isValidAmount(rupees: string): boolean {
  return rupees.trim() !== '' && Number.isFinite(toMinor(rupees)) && toMinor(rupees) >= 0;
}

/** `service.priceMinor` ("50000") to the rupee string for an input ("500"). */
export function minorToRupees(minor: string | null): string {
  if (!minor) return '';
  return String(Number(minor) / 100);
}

/**
 * Splits a total across parts in proportion to what each costs on its own. The remainder lands on the last
 * part, so the parts add up to the total exactly. With nothing to weigh by, the parts are equal.
 */
export function splitByList(totalMinor: number, listMinors: number[]): number[] {
  const n = listMinors.length;
  const listTotal = listMinors.reduce((sum, m) => sum + m, 0);
  let allocated = 0;
  return listMinors.map((list, i) => {
    if (i === n - 1) return totalMinor - allocated;
    const share = listTotal > 0 ? Math.round((list / listTotal) * totalMinor) : Math.floor(totalMinor / n);
    allocated += share;
    return share;
  });
}

/** One service already booked on this visit. */
export interface Leg {
  id: string;
  name: string;
  /** What it costs on its own. */
  listMinor: number;
  providerId: string;
}

export interface BookedLine {
  kind: 'leg';
  key: string;
  leg: Leg;
  /** The rupee string in the input. */
  amount: string;
  removed: boolean;
}

export interface ComboLine {
  kind: 'combo';
  key: string;
  title: string;
  comboPriceMinor: number;
  legs: Leg[];
  amount: string;
  removed: boolean;
}

export type Line = BookedLine | ComboLine;

export interface AddedService {
  key: string;
  serviceId: string;
  name: string;
  amount: string;
  providerId: string;
}

export interface AddedCombo {
  key: string;
  offerId: string;
  title: string;
  comboPriceMinor: number;
  legs: Array<{ serviceId: string; name: string; listMinor: number; providerId: string }>;
  amount: string;
}

/**
 * The visit's lines, the appointment being settled first. Legs of one combo become one line, priced at the
 * combo's price; anything else booked beside it stays a line of its own at its own price.
 */
export function buildLines(appointments: Appointment[]): Line[] {
  const lines: Line[] = [];
  const comboAt = new Map<string, ComboLine>();
  for (const a of appointments) {
    const leg: Leg = { id: a.id, name: a.serviceName, listMinor: Number(a.priceMinor ?? 0), providerId: a.providerId ?? '' };
    if (a.offerTitle && a.comboPriceMinor) {
      const key = `combo:${a.offerTitle}:${a.comboPriceMinor}`;
      const existing = comboAt.get(key);
      if (existing) {
        existing.legs.push(leg);
        continue;
      }
      const line: ComboLine = {
        kind: 'combo',
        key,
        title: a.offerTitle,
        comboPriceMinor: Number(a.comboPriceMinor),
        legs: [leg],
        amount: minorToRupees(a.comboPriceMinor),
        removed: false,
      };
      comboAt.set(key, line);
      lines.push(line);
    } else {
      lines.push({ kind: 'leg', key: a.id, leg, amount: minorToRupees(String(leg.listMinor)), removed: false });
    }
  }
  return lines;
}

const listOf = (legs: Array<{ listMinor: number }>) => legs.reduce((sum, l) => sum + l.listMinor, 0);

/** What a combo saves: its services' list prices added up, less its price. Never below nothing. */
export function comboSavingMinor(legs: Array<{ listMinor: number }>, comboPriceMinor: number): number {
  return Math.max(0, listOf(legs) - comboPriceMinor);
}

const amountOf = (amount: string) => (isValidAmount(amount) ? toMinor(amount) : 0);

/** What is on the bill: everything not taken off, at the amounts in the inputs. */
export function totalMinor(lines: Line[], addedServices: AddedService[], addedCombos: AddedCombo[]): number {
  return (
    lines.filter((l) => !l.removed).reduce((sum, l) => sum + amountOf(l.amount), 0) +
    addedServices.reduce((sum, s) => sum + amountOf(s.amount), 0) +
    addedCombos.reduce((sum, c) => sum + amountOf(c.amount), 0)
  );
}

export function hasAnythingOnTheBill(lines: Line[], addedServices: AddedService[], addedCombos: AddedCombo[]): boolean {
  return lines.some((l) => !l.removed) || addedServices.length > 0 || addedCombos.length > 0;
}

/** True when every amount that will be saved is a real, non-negative number. */
export function amountsAreValid(lines: Line[], addedServices: AddedService[], addedCombos: AddedCombo[]): boolean {
  return (
    lines.filter((l) => !l.removed).every((l) => isValidAmount(l.amount)) &&
    addedServices.every((s) => s.serviceId !== '' && isValidAmount(s.amount)) &&
    addedCombos.every((c) => isValidAmount(c.amount))
  );
}

/**
 * The body of the checkout request.
 *
 * `originalId` is the appointment the request is addressed to. Kept, it is completed at its amount; taken
 * off, it is cancelled (paidAmountMinor omitted). The other booked services go the same way: kept ones
 * are completed (`groupMembers`), taken-off ones cancelled (`cancelMemberIds`). A combo's typed amount is
 * split across its services by list price, so it is what the customer pays and its services add up to it.
 * Added services and added combos are new rows (`extraServices`); every service of an added combo carries
 * its offer.
 */
export function buildCheckoutRequest(input: {
  originalId: string;
  lines: Line[];
  addedServices: AddedService[];
  addedCombos: AddedCombo[];
  paymentMode: PaymentMode;
}) {
  const { originalId, lines, addedServices, addedCombos, paymentMode } = input;
  const flat: Array<{ leg: Leg; kept: boolean; amountMinor: number }> = [];
  for (const line of lines) {
    if (line.kind === 'leg') {
      flat.push({ leg: line.leg, kept: !line.removed, amountMinor: toMinor(line.amount) });
    } else {
      const shares = splitByList(toMinor(line.amount), line.legs.map((l) => l.listMinor));
      line.legs.forEach((leg, i) => flat.push({ leg, kept: !line.removed, amountMinor: shares[i]! }));
    }
  }
  const original = flat.find((f) => f.leg.id === originalId);
  const others = flat.filter((f) => f.leg.id !== originalId);
  const extraServices = [
    ...addedServices.map((s) => ({ serviceId: s.serviceId, paidAmountMinor: toMinor(s.amount), schedulableId: s.providerId || undefined })),
    ...addedCombos.flatMap((c) => {
      const shares = splitByList(toMinor(c.amount), c.legs.map((l) => l.listMinor));
      return c.legs.map((l, i) => ({ serviceId: l.serviceId, paidAmountMinor: shares[i]!, schedulableId: l.providerId || undefined, offerId: c.offerId }));
    }),
  ];
  const cancelMemberIds = others.filter((f) => !f.kept).map((f) => f.leg.id);
  return {
    paidAmountMinor: original?.kept ? original.amountMinor : undefined,
    schedulableId: original?.kept ? original.leg.providerId || undefined : undefined,
    paymentMode,
    groupMembers: others
      .filter((f) => f.kept)
      .map((f) => ({ appointmentId: f.leg.id, paidAmountMinor: f.amountMinor, schedulableId: f.leg.providerId || undefined })),
    ...(cancelMemberIds.length > 0 ? { cancelMemberIds } : {}),
    extraServices,
  };
}
