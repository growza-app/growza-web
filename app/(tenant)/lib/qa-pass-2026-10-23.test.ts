import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import { stockTone } from '../products/ProductsList';
import { rupees } from '../components/home/parts';

/**
 * QA of develop, 2026-10-23 — the dashboard's smaller findings, each pinned where it was fixed.
 */
const src = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

describe('Stock flags a style whose sizes run out (F14)', () => {
  const base = { active: true, lowStockAt: 3 };
  it('a comfortable total with one size gone is low, not fine', () => {
    expect(stockTone({ ...base, stock: 79, sizesLow: 0, sizesOut: 1 })).toBe('low');
    expect(stockTone({ ...base, stock: 79, sizesLow: 2, sizesOut: 0 })).toBe('low');
  });
  it('a style with every size in hand, and a product with no sizes, read as before', () => {
    expect(stockTone({ ...base, stock: 79, sizesLow: 0, sizesOut: 0 })).toBe('ok');
    expect(stockTone({ ...base, stock: 2 })).toBe('low');
    expect(stockTone({ ...base, stock: 0 })).toBe('out');
    expect(stockTone({ ...base, stock: 10 })).toBe('ok');
  });
});

describe('Home money is whole rupees (F22)', () => {
  it('paise do not reach a Home figure', () => {
    expect(rupees(2_712_737)).not.toContain('.');
    expect(rupees(2_712_737)).toContain('27,127');
  });
});

describe('the words say what each figure is, in English and Hindi', () => {
  it('Stock value at selling price on Stock, at cost on Home and the report (F13)', () => {
    expect(en.products.strip.worth).toMatch(/selling/i);
    expect(en.products.stockReport.worth).toMatch(/cost/i);
    expect(src('lib/home-copy.ts')).toContain("stockWorthTitle: S('Stock at cost price'");
    for (const m of [en, hi]) expect(m.products.strip.worth).not.toBe(m.products.stockReport.worth);
  });
  it('every new sentence has its Hindi', () => {
    for (const m of [en, hi]) {
      expect(m.products.shownBranch).toContain('{branch}');
      expect(m.products.sizesShort).toContain('count');
      expect(m.products.form.belowZero).toBeTruthy();
      expect(m.payFlow.size.from).toContain('{price}');
      expect(m.orders.detail.confirmMove.returned.saleableQuestion).toBeTruthy();
      expect(m.orders.detail.cameBackResult.back).toContain('count');
    }
  });
});

describe('each screen carries its fix', () => {
  it('Stock names the branch it shows under "All branches" (F12)', () => {
    expect(src('products/ProductsScreen.tsx')).toMatch(/shownBranchName=\{branch\.multi && branch\.choice === null/);
  });
  it('the size picker shows each size its price when they differ, and the header says "from" (F6)', () => {
    const sheet = src('appointments/new/SizeSheet.tsx');
    expect(sheet).toContain("pricesDiffer ? ts('from'");
    expect(sheet).toContain('psz-cell-price');
  });
  it('the second way to pay cannot be the first one again (F7)', () => {
    expect(src('appointments/new/PayFlow.tsx')).toContain('disabled={saving !== null || firstWay?.mode === mode}');
  });
  it('Orders use the Indian day-month order (F9)', () => {
    for (const f of ['orders/OrdersClient.tsx', 'orders/held/HeldClient.tsx', 'orders/[id]/OrderClient.tsx']) {
      expect(src(f), f).not.toContain('new Intl.DateTimeFormat(locale, {');
    }
  });
  it('Add product says why Save is off for a minus (F16)', () => {
    expect(src('products/ProductSheet.tsx')).toContain("t('belowZero')");
  });
  it('salon Home counts the no-shows its total includes (F21)', () => {
    expect(src('components/home/OwnerHome.tsx')).toContain("rowState(g) === 'no_show'");
  });
  it('Bookings leave a moved booking out of the total (F23)', () => {
    expect(src('appointments/BookingsList.tsx')).toContain('const bookingCount = inView.filter((b) => !b.movedTo).length;');
  });
  it('a destructive dialog opens on Cancel, not on the destructive button (F27)', () => {
    expect(src('components/ConfirmDialog.tsx')).toContain("(tone === 'danger' ? cancelRef : confirmRef).current?.focus()");
  });
  it('came back asks whether it sells again, and sends the answer only where there is a shelf (F3)', () => {
    const order = src('orders/[id]/OrderClient.tsx');
    expect(order).toContain("to === 'returned' && counted ? { saleable } : {}");
  });
});
