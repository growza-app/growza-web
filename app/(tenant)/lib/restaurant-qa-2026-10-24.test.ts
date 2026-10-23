import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import { HELD_BILLS_TTL_MS, heldBillsKey, loadHeldBills, saveHeldBills } from './held-bills';
import { receiptRows, rowsToText, type ReceiptCopy } from './receipt-text';

/**
 * Restaurant QA of develop, 2026-10-24 — the dashboard's findings, each pinned where it was fixed.
 */
const src = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

/** A Storage that lives in a Map, as the tab's session storage would. */
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

describe('a held bill survives a reload (R3)', () => {
  const bill = (id: string, heldAt: number) => ({ id, heldAt, client: { kind: 'none' }, lines: [{ name: 'Butter Naan', priceMinor: 6000 }], override: null });

  it('comes back from the tab, for the same branch and person only', () => {
    const s = memoryStorage();
    const key = heldBillsKey('branch-1', '+919800079001');
    saveHeldBills(key, [bill('a', 1_000)], s);
    expect(loadHeldBills(key, 2_000, s).map((b) => b.id)).toEqual(['a']);
    expect(loadHeldBills(heldBillsKey('branch-2', '+919800079001'), 2_000, s)).toEqual([]);
    expect(loadHeldBills(heldBillsKey('branch-1', '+919800000000'), 2_000, s)).toEqual([]);
  });

  it('a bill held more than a day ago is dropped, and an empty list leaves nothing behind', () => {
    const s = memoryStorage();
    const key = heldBillsKey('branch-1', null);
    saveHeldBills(key, [bill('old', 0), bill('new', HELD_BILLS_TTL_MS)], s);
    expect(loadHeldBills(key, HELD_BILLS_TTL_MS + 1, s).map((b) => b.id)).toEqual(['new']);
    saveHeldBills(key, [], s);
    expect(s.length).toBe(0);
  });

  it('no branch, junk, or a browser that keeps nothing: an empty list, never a throw', () => {
    expect(heldBillsKey(null, 'x')).toBeNull();
    expect(loadHeldBills(null)).toEqual([]);
    const s = memoryStorage();
    s.setItem('k', '{not json');
    expect(loadHeldBills('k', 0, s)).toEqual([]);
    expect(() => saveHeldBills('k', [bill('a', 0)], null)).not.toThrow();
  });

  it('the till reads and writes them through that module', () => {
    const pay = src('appointments/new/PayFlow.tsx');
    expect(pay).toContain('setHeldBillsState(loadHeldBills<HeldBill>(heldKey));');
    expect(pay).toContain('saveHeldBills(heldKey, out);');
  });
});

describe('a discounted bill reads as one (R4)', () => {
  const copy: ReceiptCopy = {
    title: 'Payment receipt',
    thanks: 'Thanks',
    services: 'Services',
    products: 'Menu',
    token: (n) => `Token ${n}`,
    stylist: (n) => n,
    packageName: (t) => t,
    separately: () => '',
    total: (a) => `Total paid: ${a}`,
    discount: (a) => `Discount: −${a}`,
    extra: (a) => `Added to the bill: ${a}`,
    saved: (a) => a,
    paidBy: (m) => `Paid by ${m}`,
    seeYou: 'Bye',
  };
  const money = (m: number) => `₹${m / 100}`;
  const input = {
    businessName: 'Spice Garden',
    branchName: null,
    when: 'today',
    tokenNo: null,
    stylist: null,
    singles: [],
    pkg: null,
    products: [
      { name: 'Paneer Tikka', amountMinor: 24000 },
      { name: 'Salted Lassi', amountMinor: 9000 },
    ],
    totalMinor: 30000,
    paidBy: 'Cash',
  };

  it('each dish at its menu price, then one Discount line, then the total', () => {
    const text = rowsToText(receiptRows({ ...input, adjustMinor: -3000 }, copy, money));
    expect(text).toContain('Paneer Tikka — ₹240');
    expect(text).toContain('Salted Lassi — ₹90');
    expect(text).toContain('Discount: −₹30\n*Total paid: ₹300*');
    expect(text).not.toContain('218.18');
  });

  it('a bill typed up says what was added; an untouched bill has neither line', () => {
    expect(rowsToText(receiptRows({ ...input, totalMinor: 35000, adjustMinor: 2000 }, copy, money))).toContain('Added to the bill: ₹20');
    const plain = rowsToText(receiptRows({ ...input, totalMinor: 33000, adjustMinor: 0 }, copy, money));
    expect(plain).not.toContain('Discount');
    expect(plain).not.toContain('Added');
  });

  it('the till sends the lines at their own price and the difference apart', () => {
    const pay = src('appointments/new/PayFlow.tsx');
    expect(pay).toContain('adjustMinor: totalMinor - listMinor,');
    expect(pay).toContain("products: lines.map((l, i) => ({ name: l.name, amountMinor: baseAmounts[i]! })).filter((_, i) => lines[i]!.product),");
    for (const m of [en, hi]) {
      expect(m.newVisit.receiptDiscount).toContain('{amount}');
      expect(m.newVisit.receiptExtra).toContain('{amount}');
    }
  });
});

describe('a laptop does not show the phone’s money card (R1)', () => {
  it('the card’s own display rule only applies below 861px, so the desktop block that hides it is not overridden', () => {
    const css = src('styles/99-shop-home.css');
    // Every `.shp-phone-money {` that sets a display other than none sits inside a max-width: 860px block.
    const at = css.indexOf('.shp-phone-money {\n    display: flex;');
    expect(at).toBeGreaterThan(-1);
    const opened = css.lastIndexOf('@media (max-width: 860px) {', at);
    expect(opened).toBeGreaterThan(-1);
    // Nothing closes that block between its opening and the rule: the rule is inside it.
    expect(css.slice(opened, at)).not.toMatch(/\n\}/);
    expect(css).not.toMatch(/\n\.shp-phone-money \{\n\s*display: flex;/);
  });
});

describe('a shop is offered only the grant that does something there (R5)', () => {
  it('Who sees what shows a shop the returns grant, under its own words, and saves only what it shows', () => {
    const form = src('settings/report-access/ReportAccessForm.tsx');
    expect(form).toContain("const SHOP_TABS = TABS.filter((tab) => tab.key === 'sales');");
    expect(form).toContain('const tabs = shop ? SHOP_TABS : TABS;');
    expect(form).toContain('.filter((tab) => shown.has(tab))');
    for (const m of [en, hi]) {
      expect(m.settingsReports.shopTitle).toBeTruthy();
      expect(m.settingsReports.shopHint).toBeTruthy();
      expect(m.settingsReports.shopTabs.sales).toBeTruthy();
    }
  });
});
