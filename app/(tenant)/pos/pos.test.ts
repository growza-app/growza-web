import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canSee, gridCanSee } from '../lib/nav-policy';
import { homeCopy } from '../lib/home-copy';
import { buildDailyTokens, formatTokenNo, mayTakeReturns, posModeOf, posQueueStorageKey, returnLookbackFrom } from './pos-helpers';
import type { Appointment } from '../lib/api-types';

const src = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');

describe('who is offered the POS tab', () => {
  it('gives it to whoever may open the till, and to nobody else', () => {
    expect(canSee('/pos', 'owner')).toBe(true);
    expect(canSee('/pos', 'manager')).toBe(true);
    expect(canSee('/pos', 'receptionist')).toBe(true);
    expect(canSee('/pos', 'staff')).toBe(false);
  });

  it('is exactly the answer the old till address gave, for every role', () => {
    for (const role of ['owner', 'manager', 'receptionist', 'staff'] as const) {
      expect(canSee('/pos', role)).toBe(canSee('/products/sell', role));
    }
  });

  it('opens only once the business is live', () => {
    expect(canSee('/pos', 'owner', undefined, false)).toBe(false);
    expect(canSee('/pos', 'owner', undefined, true)).toBe(true);
  });
});

describe('the role grid treats POS as the till', () => {
  const grid = { bookings: 'manage', clients: 'none', services: 'manage', offers: 'none', staff: 'none', attendance: 'none', reports: 'none', settings: 'none' } as const;
  it('opens for a role holding Bookings and Stock at Change, and for no one without both', () => {
    expect(gridCanSee('/pos', grid)).toBe(true);
    expect(gridCanSee('/pos', { ...grid, services: 'none' })).toBe(false);
    expect(gridCanSee('/pos', { ...grid, bookings: 'none' })).toBe(false);
  });
  it('needs Change, not See: there is no read-only till', () => {
    expect(gridCanSee('/pos', { ...grid, bookings: 'view' })).toBe(false);
  });
});

describe('Return mode follows the refund rule the API enforces', () => {
  it('owner, manager and a session with no role may take returns', () => {
    expect(mayTakeReturns('owner')).toBe(true);
    expect(mayTakeReturns('manager')).toBe(true);
    expect(mayTakeReturns(null)).toBe(true);
  });

  it('a front desk may only when the owner has opened Sales to them', () => {
    expect(mayTakeReturns('receptionist')).toBe(false);
    expect(mayTakeReturns('receptionist', ['todo', 'overview'])).toBe(false);
    expect(mayTakeReturns('receptionist', ['sales'])).toBe(true);
  });

  it('a member who holds a role never may: the grid gives no refund, whatever they work like', () => {
    expect(mayTakeReturns('manager', undefined, true)).toBe(false);
    expect(mayTakeReturns('receptionist', ['sales'], true)).toBe(false);
  });

  it('a stylist never may', () => {
    expect(mayTakeReturns('staff', ['sales'])).toBe(false);
  });

  it('?mode=return opens Return only for someone who may use it', () => {
    expect(posModeOf('return', true)).toBe('return');
    expect(posModeOf('return', false)).toBe('sell');
    expect(posModeOf(undefined, true)).toBe('sell');
    expect(posModeOf('anything', true)).toBe('sell');
  });
});

describe('how far back Return looks', () => {
  it('is 60 days when the window is shorter, the whole window when it is longer', () => {
    expect(returnLookbackFrom('2026-10-22', 7)).toBe('2026-08-24');
    expect(returnLookbackFrom('2026-10-22', 59)).toBe('2026-08-24');
    expect(returnLookbackFrom('2026-10-22', 90)).toBe('2026-07-24');
  });

  it('survives a nonsense window', () => {
    expect(returnLookbackFrom('2026-10-22', Number.NaN)).toBe('2026-08-24');
  });
});

describe('the POS tab is wired into every menu', () => {
  it('names itself in English and Hindi', () => {
    expect(homeCopy('en', {}).nav.pos).toBe('POS');
    expect(homeCopy('hi', {}).nav.pos).not.toBe('');
  });

  it('is in the sidebar right under Home, and absent when the business has no products', () => {
    const sidebar = src('../components/Sidebar.tsx');
    expect(sidebar).toContain("...(products === false ? [] : [{ href: '/pos', label: t.nav.pos, icon: <IconPos /> }])");
    expect(sidebar.indexOf("href: '/pos'")).toBeGreaterThan(sidebar.indexOf("href: '/', label: t.nav.home"));
    expect(sidebar.indexOf("href: '/pos'")).toBeLessThan(sidebar.indexOf("href: '/orders'"));
  });

  it('is the first row of the phone menu, with the same products rule', () => {
    const more = src('../more/page.tsx');
    expect(more).toContain("...(products ? [{ href: '/pos', label: nav.nav.pos, icon: <IconPos /> }] : [])");
  });
});

describe('the POS screen', () => {
  const page = src('./page.tsx');
  const client = src('./PosClient.tsx');

  it('asks what the till always asked: the screen guard, the go-live gate and the payment permission', () => {
    expect(page).toContain("await guardScreen('/pos')");
    expect(page).toContain("await guardLive('/pos')");
    expect(page).toContain("mayUse(me.member?.role, 'visit.recordPayment'");
  });

  it('names the till as a shop does, from the same heading /orders/new uses', () => {
    expect(page).toContain('homeCopy(await serverLang(), me.labels).shop.takeOrder');
    expect(client).toContain('heading={heading}');
  });

  it('draws the Sell | Return tabs only for someone who may take a return', () => {
    expect(client).toContain('{canReturn ? (');
    expect(page).toContain('mayTakeReturns(me.member?.role, me.reportTabs, Boolean(areas.pages))');
  });

  it('keeps the till mounted under the return sheet so a sale in progress is never lost', () => {
    expect(client).toContain('<SellProductClient');
    expect(client.indexOf('<SellProductClient')).toBeLessThan(client.indexOf('<ReturnProductSheet'));
  });

  it('reads the bills when Return opens, and only the latest open may answer', () => {
    expect(client).toContain('includeSales: true');
    expect(client).toContain('opened.current');
    expect(client).toContain('setBills(null)');
  });

  it('refreshes shelf stock and queue totals in place when a return or exchange is recorded', () => {
    const sellClient = src('../products/sell/SellProductClient.tsx');
    const payFlow = src('../appointments/new/PayFlow.tsx');
    expect(client).toContain('reloadKey={reloadKey}');
    expect(client).toContain('setReloadKey((k) => k + 1);');
    expect(client).toContain('void loadTodayTokens();');
    expect(sellClient).toContain('reloadKey={reloadKey}');
    expect(payFlow).toContain('if (!reloadKey) return;');
  });

  it('hides daily revenue and per-order money on the Queue board when the desk may not view sales/returns', () => {
    expect(client).toContain('{canReturn ? <span className="pos-queue-kpi-sub">{formatMoney(String(todayTotalMinor))}</span> : null}');
    expect(client).toContain('{canReturn ? <span className="pos-qcard-item-amt">{formatMoney(String(item.paidMinor))}</span> : null}');
    expect(client).toContain('{canReturn ? <strong className="pos-qcard-total">{formatMoney(String(tk.totalMinor))}</strong> : <span />}');
  });

  it('supports toggleable full-screen POS terminal mode with keyboard shortcuts and rich bill drawer', () => {
    const payFlow = src('../appointments/new/PayFlow.tsx');
    const deskGrid = src('../appointments/new/DeskServiceGrid.tsx');
    const posBill = src('../appointments/new/PosBillRows.tsx');
    const css = src('../styles/99-pos.css');
    expect(client).toContain('pos-shell is-fullscreen');
    expect(client).toContain('pos-fs-bar');
    expect(client).toContain('enterFullScreen');
    expect(client).toContain('exitFullScreen');
    expect(client).toContain('requestFullscreen');
    expect(client).toContain("document.addEventListener('fullscreenchange', onFsChange)");
    expect(deskGrid).toContain("e.key === 'F2'");
    expect(deskGrid).toContain('pf-tile-inbill');
    expect(payFlow).toContain("e.key === 'F4'");
    expect(payFlow).toContain("e.key === 'F8'");
    expect(payFlow).toContain("e.key === 'F9'");
    expect(payFlow).toContain('<PosBillRows');
    expect(payFlow).toContain('pos-charge-cta');
    expect(payFlow).toContain('completePosSale');
    expect(payFlow).toContain('guideClient');
    expect(payFlow).toContain('guideMode');
    expect(payFlow).toContain('guideReady');
    expect(payFlow).toContain("t('desk.needPaymentMode')");
    expect(payFlow).toContain('if (productsOnly) {\n      nextCustomer();\n      return;\n    }');
    expect(posBill).toContain('pos-bill-stepper');
    expect(css).toContain('.pos-shell.is-fullscreen');
    expect(css).toContain('.pos-cat-pills-wrap');
    expect(css).toContain('@keyframes pos-step-pulse');
  });

  it('provides Option C daily resetting token numbers, live queue strip above the till, and two-column Queue board', () => {
    const css = src('../styles/99-pos.css');
    expect(posModeOf('queue', true)).toBe('queue');
    expect(posModeOf('queue', false)).toBe('queue');
    expect(formatTokenNo(1)).toBe('#01');
    expect(formatTokenNo(14)).toBe('#14');
    expect(posQueueStorageKey('loc-1', '2026-10-24')).toBe('growza.pos.queue.loc-1.2026-10-24');

    const nowMs = Date.parse('2026-10-24T13:00:00Z');
    const sampleRows: Appointment[] = [
      {
        id: 'sale-1',
        startAt: '2026-10-24T11:30:00Z',
        endAt: '2026-10-24T11:30:00Z',
        status: 'completed',
        createdVia: 'dashboard',
        channel: 'counter',
        customerName: 'Vikram Negi',
        customerPhone: null,
        serviceId: null,
        serviceName: '',
        priceMinor: null,
        paidAmountMinor: null,
        paymentMode: 'upi',
        providerId: null,
        providerName: null,
        bookingGroupId: null,
        offerTitle: null,
        comboPriceMinor: null,
        locationId: 'loc-1',
        bookedAhead: false,
        movedTo: null,
        reminderSent: false,
        customerIsNew: false,
        products: [{ id: 'vp-1', productId: 'p-1', name: 'County Tikka', priceMinor: '25000', qty: 2, paidMinor: '50000', returnedQty: 0, returnedMinor: '0' }],
        payments: [],
        refunds: [],
      },
      {
        id: 'sale-2',
        startAt: '2026-10-24T12:55:00Z',
        endAt: '2026-10-24T12:55:00Z',
        status: 'completed',
        createdVia: 'dashboard',
        channel: 'swiggy',
        customerName: 'Karan Rawat',
        customerPhone: null,
        serviceId: null,
        serviceName: '',
        priceMinor: null,
        paidAmountMinor: null,
        paymentMode: 'other',
        providerId: null,
        providerName: null,
        bookingGroupId: null,
        offerTitle: null,
        comboPriceMinor: null,
        locationId: 'loc-1',
        bookedAhead: false,
        movedTo: null,
        reminderSent: false,
        customerIsNew: false,
        products: [{ id: 'vp-2', productId: 'p-2', name: 'Chicken Roll', priceMinor: '15000', qty: 1, paidMinor: '15000', returnedQty: 0, returnedMinor: '0' }],
        payments: [],
        refunds: [],
      },
    ];

    const tokens = buildDailyTokens(sampleRows, 'loc-1', {}, nowMs);
    expect(tokens.map((t) => [t.tokenLabel, t.state, t.itemsSummary])).toEqual([
      ['#01', 'completed', '2× County Tikka'],
      ['#02', 'preparing', 'Chicken Roll'],
    ]);

    const overridden = buildDailyTokens(sampleRows, 'loc-1', { 'sale-2': 'completed' }, nowMs);
    expect(overridden[1]?.state).toBe('completed');

    expect(client).toContain('pos-token-strip');
    expect(client).toContain('pos-bar-completed');
    expect(client).toContain('pos-queue-board');
    expect(css).toContain('.pos-token-strip');
    expect(css).toContain('.pos-bar-completed');
    expect(css).toMatch(/\.pos-token-strip\.is-empty\s*\{\s*display:\s*none;/);
    expect(css).toContain('.pos-queue-board');
  });
});
