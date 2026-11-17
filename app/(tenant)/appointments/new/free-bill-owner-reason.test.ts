import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import en from '../../../../messages/en.json';
import hi from '../../../../messages/hi.json';
import { API_MESSAGES_HI } from '../../lib/api-messages';
import { freeBillBlock, freeReasonOk, isFreeBill } from './bill-discount';

/**
 * Jira GRW-725 — owner decision 2026-11-17: a discount that takes the bill to ₹0 needs an OWNER login and a typed reason,
 * kept on the bill and shown where the bill's discount is shown. The counter and the manager can still give a smaller one.
 * The API refuses the rest (403 / 400, growza `free-bill.ts`); these hold the till to saying so before the tap.
 */
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

describe('which bill is free, and what stops Pay on it', () => {
  it('a ₹560 bill charged ₹0 is free — by 100% or by a ₹560 discount, the same total', () => {
    expect(isFreeBill(56_000, 0)).toBe(true);
  });

  it('99% off is not free (₹6 is still charged), and an item whose own price is ₹0 is no discount', () => {
    expect(isFreeBill(56_000, 600)).toBe(false);
    expect(isFreeBill(0, 0)).toBe(false);
  });

  it('the counter and the manager are stopped; the owner only until a reason is typed', () => {
    expect(freeBillBlock(56_000, 0, false, 'Staff meal')).toBe('ownerOnly');
    expect(freeBillBlock(56_000, 0, true, '')).toBe('needsReason');
    expect(freeBillBlock(56_000, 0, true, 'Staff meal')).toBeNull();
    expect(freeBillBlock(56_000, 600, false, '')).toBeNull();
  });

  it('a reason is 3 to 200 letters once trimmed — the same rule the server keeps', () => {
    expect(freeReasonOk('  ok ')).toBe(false);
    expect(freeReasonOk('Birthday')).toBe(true);
    expect(freeReasonOk('x'.repeat(200))).toBe(true);
    expect(freeReasonOk('x'.repeat(201))).toBe(false);
  });
});

describe('the till’s payment step', () => {
  const payFlow = read('./PayFlow.tsx');

  it('asks who is at the till by role, and holds every way of paying shut while the bill is blocked', () => {
    expect(payFlow).toContain("const isOwner = session?.role === 'owner';");
    expect(payFlow).toMatch(/if \(saving \|\| lines\.length === 0 \|\| freeBlock\) return;/);
    expect(payFlow).toContain('disabled={saving !== null || firstWay?.mode === mode || freeBlock !== null}');
    expect(payFlow).toContain('disabled={saving !== null || lines.length === 0 || freeBlock !== null}');
  });

  it('draws the sentence or the Reason beside the discount, on both tills (wide and phone)', () => {
    expect(payFlow.match(/\{discountRow\}\n\s+\{freeBillRow\}/g)).toHaveLength(2);
    expect(payFlow).toContain('<FreeBillReason block={freeBlock}');
  });

  it('sends the trimmed reason with both writes — the booking’s checkout and the counter sale', () => {
    expect(payFlow).toContain('const freeReasonSent = freeBill && !freeBlock ? { discountReason: freeReason.trim() } : {};');
    expect(payFlow.match(/\.\.\.freeReasonSent,/g)).toHaveLength(2);
  });

  it('the Discount sheet refuses the whole bill for anyone but the owner, in words', () => {
    expect(payFlow).toContain('ownerOnlyFree={!isOwner}');
    const sheet = read('./DiscountSheet.tsx');
    expect(sheet).toMatch(/const wholeBillRefused = ownerOnlyFree && 'offMinor' in result && listMinor > 0 && result\.offMinor >= listMinor;/);
    expect(sheet).toContain("t('ownerOnly')");
  });
});

describe('the Queue’s payment', () => {
  const pos = read('../../pos/PosClient.tsx');
  const screen = pos.slice(pos.indexOf('function QueueTokenPayScreen'), pos.indexOf('export function PosClient'));

  it('stops the ways of paying and sends the owner’s reason with the settle', () => {
    expect(screen).toContain("const isOwner = useSession()?.role === 'owner';");
    expect(screen).toContain('if (freeBlock) return;');
    expect(screen).toContain('disabled={saving !== null || firstWay?.mode === m || freeBlock !== null}');
    expect(screen).toContain('<FreeBillReason block={freeBlock}');
    expect(screen).toContain('ownerOnlyFree={!isOwner}');
    expect(pos).toContain('...(billOff.reason ? { discountReason: billOff.reason } : {}),');
  });
});

describe('the reason is read where the discount is shown', () => {
  it('on the order screen, under "Discount on the bill"', () => {
    const order = read('../../orders/[id]/OrderClient.tsx');
    expect(order).toContain("<dt>{t('detail.discountReason')}</dt>");
    expect(order).toContain('<dd>{order.discountReason}</dd>');
  });

  it('on a finished visit’s receipt, and on the Discounts report’s bill', () => {
    expect(read('../../components/BookingSummary.tsx')).toContain("<span>{t('freeReason')}</span>");
    expect(read('../../reports/money/DiscountReport.tsx')).toContain("d('reasonLine', { reason: b.reason })");
  });
});

describe('in English and Hindi', () => {
  it('every new word is in both, and the server’s two sentences have their Hindi', () => {
    for (const m of [en, hi]) {
      expect(m.payFlow.discount.ownerOnly).toBeTruthy();
      expect(m.payFlow.discount.reasonLabel).toBeTruthy();
      expect(m.payFlow.discount.reasonHint).toBeTruthy();
      expect(m.orders.detail.discountReason).toBeTruthy();
      expect(m.chrome.summary.freeReason).toBeTruthy();
      expect(m.moneyReports.discounts.reasonLine).toContain('{reason}');
    }
    expect(hi.payFlow.discount.ownerOnly).not.toBe(en.payFlow.discount.ownerOnly);
    expect(API_MESSAGES_HI['Only the owner can give the whole bill free. Give a smaller discount, or ask the owner.']).toBeTruthy();
    expect(API_MESSAGES_HI['Type why the whole bill is free, in 3 to 200 letters.']).toBeTruthy();
  });
});

describe('at 344px', () => {
  it('the Reason field is 44px tall, its type in rem, and the free text wraps', () => {
    const css = read('../../styles/99-bill-discount.css');
    const field = css.slice(css.indexOf('.pf-free-reason input {'));
    expect(field.slice(0, field.indexOf('}'))).toMatch(/min-height: 2\.75rem;[\s\S]*font-size: max\(1rem, var\(--fs-4\)\);/);
    expect(css).toMatch(/\.ord-d-discount-reason dd \{[^}]*overflow-wrap: anywhere;/);
  });
});
