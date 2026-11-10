import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DIARY_AREAS, areasOf, hasOrderQueue } from '../lib/areas';

/** Owner, 10 Nov 2026 — "for saloon it's not required": the POS order queue is a kitchen's alone. */
const src = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');
const pos = src('PosClient.tsx');
const home = src('../components/home/ShopHome.tsx');

describe('who has an order queue', () => {
  it('a restaurant (stock not counted) does; a salon and a shop do not', () => {
    expect(hasOrderQueue(areasOf({ surface: 'shop', capabilities: { bookings: false, services: false, stockCounted: false } }))).toBe(true);
    expect(hasOrderQueue(DIARY_AREAS)).toBe(false);
    expect(hasOrderQueue(areasOf({ capabilities: { bookings: true, services: true } }))).toBe(false);
    expect(hasOrderQueue(areasOf({ surface: 'shop', capabilities: { bookings: false, services: false, stockCounted: true } }))).toBe(false);
  });
});

describe('the till without one', () => {
  it('draws no Queue tab or button, and ?mode=queue opens Sell', () => {
    expect(pos.match(/className=\{`page-tab pos-tab-queue/g)).toHaveLength(2);
    expect(pos.match(/\{orderQueue \? \(\n\s*<button type="button" role="tab" aria-selected=\{mode === 'queue'\}/g)).toHaveLength(2);
    expect(pos).toMatch(/\{orderQueue \? \(\n\s*<button\n\s*type="button"\n\s*className=\{`pos-fs-btn\$\{mode === 'queue'/);
    expect(pos).toContain("useState<PosMode>(initialMode === 'queue' && orderQueue ? 'queue' : 'sell')");
    expect(pos).toContain('if (raw && orderQueue) {');
  });

  it('offers no "Keep payment pending in queue": the button is drawn only when there is a queue to open', () => {
    expect(pos).toContain('onOpenQueue={orderQueue ? () => openQueue(lastQueuedIdRef.current ?? undefined) : undefined}');
    const payFlow = src('../appointments/new/PayFlow.tsx');
    expect(payFlow.match(/\{onOpenQueue \? \(\n\s*<button\n\s*type="button"\n\s*className="btn pos-charge-pending"/g)).toHaveLength(2);
  });

  it("a shop's Home links to no queue", () => {
    expect(home).toContain("...(isKitchen ? [{ href: '/pos?mode=queue'");
    expect(home).toContain("data.anyOrders && isKitchen && can('/pos') ? (");
    expect(home).toContain("isKitchen && can('/pos')\n                                    ? `/pos?mode=queue&token=");
  });
});
