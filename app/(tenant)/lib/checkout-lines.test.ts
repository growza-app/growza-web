import { describe, expect, it } from 'vitest';
import type { Appointment } from './api-types';
import {
  amountsAreValid,
  buildCheckoutRequest,
  buildLines,
  comboSavingMinor,
  hasAnythingOnTheBill,
  splitByList,
  totalMinor,
  type AddedCombo,
  type Line,
} from './checkout-lines';

/**
 * Jira GRW-314 — Mark as done, run rather than read.
 *
 * The visit from the report: Weekly glow (Haircut ₹300 + Facial ₹800, ₹880 as a combo), and Women's Hair
 * Color ₹1,500 beside it. The combo is ONE line; the colour is its own.
 */
const leg = (id: string, name: string, price: number, extra: Partial<Appointment> = {}) =>
  ({ id, serviceName: name, priceMinor: String(price), providerId: 'arjun', offerTitle: null, comboPriceMinor: null, ...extra }) as unknown as Appointment;
const HAIR = leg('hair', 'Haircut', 30000, { offerTitle: 'Weekly glow', comboPriceMinor: '88000' });
const FACIAL = leg('facial', 'Facial', 80000, { offerTitle: 'Weekly glow', comboPriceMinor: '88000', providerId: 'kavita' });
const COLOUR = leg('colour', "Women's Hair Color", 150000);
const visit = () => buildLines([HAIR, FACIAL, COLOUR]);
const request = (lines: Line[], more: { addedServices?: never[]; addedCombos?: AddedCombo[] } = {}) =>
  buildCheckoutRequest({ originalId: 'hair', lines, addedServices: more.addedServices ?? [], addedCombos: more.addedCombos ?? [], paymentMode: 'cash' });
const without = (lines: Line[], key: string) => lines.map((l) => (l.key === key ? { ...l, removed: true } : l)) as Line[];

describe('splitting a price across its services', () => {
  it('in proportion to what each costs alone, adding up exactly', () => {
    expect(splitByList(88000, [30000, 80000])).toEqual([24000, 64000]);
    const odd = splitByList(10001, [1, 1, 1]);
    expect(odd.reduce((a, b) => a + b, 0)).toBe(10001);
  });

  it('equally when nothing has a price to weigh by', () => {
    expect(splitByList(9000, [0, 0, 0])).toEqual([3000, 3000, 3000]);
  });

  it('one part takes it all', () => {
    expect(splitByList(500, [123])).toEqual([500]);
  });
});

describe('the visit as lines', () => {
  it('a combo is one line at its price; the service beside it is its own line', () => {
    const lines = visit();
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ kind: 'combo', title: 'Weekly glow', amount: '880', removed: false });
    expect((lines[0] as { legs: unknown[] }).legs).toHaveLength(2);
    expect(lines[1]).toMatchObject({ kind: 'leg', amount: '1500' });
  });

  it('a plain booking is one line at its list price', () => {
    expect(buildLines([COLOUR])).toMatchObject([{ kind: 'leg', amount: '1500' }]);
  });

  it('the total, and what the combo saves', () => {
    expect(totalMinor(visit(), [], [])).toBe(88000 + 150000);
    expect(comboSavingMinor([{ listMinor: 30000 }, { listMinor: 80000 }], 88000)).toBe(22000);
  });

  it('taking a line off takes its amount off the total; a combo goes whole', () => {
    const lines = without(visit(), 'combo:Weekly glow:88000');
    expect(totalMinor(lines, [], [])).toBe(150000);
  });

  it('nothing left on the bill is not saveable', () => {
    const lines = visit().map((l) => ({ ...l, removed: true })) as Line[];
    expect(hasAnythingOnTheBill(lines, [], [])).toBe(false);
  });

  it('a blank or negative amount is not valid; one that is taken off does not count', () => {
    const lines = visit();
    expect(amountsAreValid(lines, [], [])).toBe(true);
    const blank = lines.map((l) => (l.kind === 'leg' ? { ...l, amount: '' } : l)) as Line[];
    expect(amountsAreValid(blank, [], [])).toBe(false);
    expect(amountsAreValid(without(blank, 'colour'), [], [])).toBe(true);
  });
});

describe('what is sent', () => {
  it('untouched: everything completed, combo split by list price, nothing cancelled', () => {
    const body = request(visit());
    expect(body.paidAmountMinor).toBe(24000);
    expect(body.groupMembers).toEqual([
      { appointmentId: 'facial', paidAmountMinor: 64000, schedulableId: 'kavita' },
      { appointmentId: 'colour', paidAmountMinor: 150000, schedulableId: 'arjun' },
    ]);
    expect(body).not.toHaveProperty('cancelMemberIds');
    expect(body.extraServices).toEqual([]);
  });

  it('the whole combo off, including the first service: it is cancelled, and so is its other service', () => {
    const body = request(without(visit(), 'combo:Weekly glow:88000'));
    expect(body.paidAmountMinor).toBeUndefined();
    expect(body.schedulableId).toBeUndefined();
    expect(body.cancelMemberIds).toEqual(['facial']);
    expect(body.groupMembers).toEqual([{ appointmentId: 'colour', paidAmountMinor: 150000, schedulableId: 'arjun' }]);
  });

  it('only the colour off: it is cancelled and the combo is untouched', () => {
    const body = request(without(visit(), 'colour'));
    expect(body.cancelMemberIds).toEqual(['colour']);
    expect(body.paidAmountMinor).toBe(24000);
    expect(body.groupMembers.map((m) => m.appointmentId)).toEqual(['facial']);
  });

  it('a combo\'s typed price is what is paid: its services add up to it', () => {
    const lines = visit().map((l) => (l.kind === 'combo' ? { ...l, amount: '800' } : l)) as Line[];
    const body = request(lines);
    expect(body.paidAmountMinor! + body.groupMembers[0]!.paidAmountMinor).toBe(80000);
  });

  it('a combo added at the till: every service carries its offer, split to the price typed', () => {
    const added: AddedCombo = {
      key: 'combo-1',
      offerId: 'offer-1',
      title: 'Weekly glow',
      comboPriceMinor: 88000,
      amount: '880',
      legs: [
        { serviceId: 's-hair', name: 'Haircut', listMinor: 30000, providerId: 'arjun' },
        { serviceId: 's-facial', name: 'Facial', listMinor: 80000, providerId: '' },
      ],
    };
    const body = request(buildLines([COLOUR]).map((l) => ({ ...l })) as Line[], { addedCombos: [added] });
    expect(body.extraServices).toEqual([
      { serviceId: 's-hair', paidAmountMinor: 24000, schedulableId: 'arjun', offerId: 'offer-1' },
      { serviceId: 's-facial', paidAmountMinor: 64000, schedulableId: undefined, offerId: 'offer-1' },
    ]);
    expect(totalMinor(buildLines([COLOUR]), [], [added])).toBe(150000 + 88000);
  });

  it('a service added at the till is a plain extra, with no offer', () => {
    const body = buildCheckoutRequest({
      originalId: 'colour',
      lines: buildLines([COLOUR]),
      addedServices: [{ key: 's', serviceId: 's-facial', name: 'Facial', amount: '800', providerId: 'arjun' }],
      addedCombos: [],
      paymentMode: 'upi',
    });
    expect(body.extraServices).toEqual([{ serviceId: 's-facial', paidAmountMinor: 80000, schedulableId: 'arjun' }]);
    expect(body.paymentMode).toBe('upi');
  });

  it('a combo taken off and put back sends what it would have', () => {
    const off = without(visit(), 'combo:Weekly glow:88000');
    const back = off.map((l) => ({ ...l, removed: false })) as Line[];
    expect(request(back)).toEqual(request(visit()));
  });
});
