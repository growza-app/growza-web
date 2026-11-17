import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Appointment } from './api-types';
import { buildDailyTokens, tokenNumbersOf } from '../pos/pos-helpers';
import { orderNumber } from './order-number';
import { billTicket, kotTicket } from './print/ticket';

/**
 * Jira GRW-716 — the till keeps billing when the internet drops. The store keeps an order on the device under its till's
 * token ("A12", owner 2026-11-16, option B), sends it when the connection is back with its own id as the idempotency key,
 * and clears itself once it is sent (BR-05). An order taken offline is never given a plain number on any screen.
 */
const recordCounterSale = vi.fn();
vi.mock('./api', async () => {
  class ApiError extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message);
    }
  }
  return { ApiError, api: { recordCounterSale: (...a: unknown[]) => recordCounterSale(...a), registerTill: vi.fn() } };
});

function fakeStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    keys: () => [...m.keys()],
  };
}
let storage = fakeStorage();

beforeEach(() => {
  vi.resetModules();
  storage = fakeStorage();
  vi.stubGlobal('window', { localStorage: storage });
  recordCounterSale.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

const load = () => import('./offline-till');
const item = (id: string, branch = 'mg', takenAt = '2026-11-16T10:00:00.000Z') => ({
  id,
  branch,
  token: 'A01',
  takenAt,
  totalMinor: 24_000,
  body: { idempotencyKey: id, location: branch, offline: { deviceKey: 'dev', tokenNo: 1, takenAt } },
});

describe('BR-03 — the till’s own tokens', () => {
  it('"A01", "A12", "B07": the letter and the count, two digits at least', async () => {
    const { offlineTokenOf } = await load();
    expect([offlineTokenOf('A', 1), offlineTokenOf('A', 12), offlineTokenOf('B', 7), offlineTokenOf('C', 123), offlineTokenOf('AB', 3)]).toEqual(['A01', 'A12', 'B07', 'C123', 'AB03']);
  });

  it('counts per branch per day, and survives a reload', async () => {
    const { nextOfflineCount } = await load();
    expect([nextOfflineCount('mg', '2026-11-16'), nextOfflineCount('mg', '2026-11-16'), nextOfflineCount('airport', '2026-11-16'), nextOfflineCount('mg', '2026-11-17')]).toEqual([1, 2, 1, 1]);
    vi.resetModules();
    const again = await load();
    expect(again.nextOfflineCount('mg', '2026-11-16')).toBe(3);
  });

  it('a letter that is not one letter is not trusted', async () => {
    const { tillLetter } = await load();
    storage.setItem('growza.till.letter.mg', 'ABC');
    expect(tillLetter('mg')).toBeNull();
    // After Z, two letters: a branch never runs out of tills.
    storage.setItem('growza.till.letter.mg', 'AB');
    expect(tillLetter('mg')).toBe('AB');
    storage.setItem('growza.till.letter.mg', 'C');
    expect(tillLetter('mg')).toBe('C');
  });
});

describe('only what never reached the server is taken offline', () => {
  it('a failed connection or a proxy with the API away: yes. Any answer about the order itself: never', async () => {
    const { neverArrived } = await load();
    const { ApiError } = await import('./api');
    expect(neverArrived(new TypeError('Failed to fetch'))).toBe(true);
    for (const s of [502, 503, 504]) expect(neverArrived(new ApiError(s, 'down'))).toBe(true);
    for (const s of [400, 401, 403, 404, 409, 500]) expect(neverArrived(new ApiError(s, 'no'))).toBe(false);
    expect(neverArrived(new Error('other'))).toBe(false);
  });
});

describe('AC-02 · AC-03 · BR-05 — sent when back, once, and nothing left behind', () => {
  it('sends oldest first, each with its own id; the storage is empty after', async () => {
    const store = await load();
    store.keepOfflineOrder(item('b', 'mg', '2026-11-16T10:05:00.000Z'));
    store.keepOfflineOrder(item('a', 'mg', '2026-11-16T10:00:00.000Z'));
    recordCounterSale.mockResolvedValue({});
    await store.sendOfflineOrders(['mg']);
    expect(recordCounterSale.mock.calls.map((c) => (c[0] as { idempotencyKey: string }).idempotencyKey)).toEqual(['a', 'b']);
    expect(storage.keys()).not.toContain('growza.till.offline.v1');
  });

  it('keeping the same order twice keeps it once', async () => {
    const store = await load();
    store.keepOfflineOrder(item('a'));
    store.keepOfflineOrder(item('a'));
    expect(JSON.parse(storage.getItem('growza.till.offline.v1')!)).toHaveLength(1);
  });

  it('the connection drops halfway: what was sent is gone, the rest waits, and a later send finishes it', async () => {
    const store = await load();
    store.keepOfflineOrder(item('a', 'mg', '2026-11-16T10:00:00.000Z'));
    store.keepOfflineOrder(item('b', 'mg', '2026-11-16T10:01:00.000Z'));
    recordCounterSale.mockResolvedValueOnce({}).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await store.sendOfflineOrders(['mg']);
    const left = JSON.parse(storage.getItem('growza.till.offline.v1')!) as Array<{ id: string; state: string }>;
    expect(left).toEqual([expect.objectContaining({ id: 'b', state: 'waiting' })]);
    recordCounterSale.mockResolvedValue({});
    await store.sendOfflineOrders(['mg']);
    expect(storage.getItem('growza.till.offline.v1')).toBeNull();
  });

  it('a refusal keeps the order, marked with the server’s reason — never dropped; Retry sends it again', async () => {
    const store = await load();
    const { ApiError } = await import('./api');
    store.keepOfflineOrder(item('a'));
    recordCounterSale.mockRejectedValueOnce(new ApiError(409, 'This till was not set up for billing offline at this branch.'));
    await store.sendOfflineOrders(['mg']);
    const [kept] = JSON.parse(storage.getItem('growza.till.offline.v1')!) as Array<{ state: string; reason: string }>;
    expect(kept).toMatchObject({ state: 'failed', reason: 'This till was not set up for billing offline at this branch.' });
    recordCounterSale.mockResolvedValue({});
    store.retryOfflineOrder('a', ['mg']);
    await vi.waitFor(() => expect(storage.getItem('growza.till.offline.v1')).toBeNull());
  });

  it('signed out while offline (401): it waits for the next sign-in, it is not marked failed', async () => {
    const store = await load();
    const { ApiError } = await import('./api');
    store.keepOfflineOrder(item('a'));
    recordCounterSale.mockRejectedValueOnce(new ApiError(401, 'Sign in'));
    await store.sendOfflineOrders(['mg']);
    expect(JSON.parse(storage.getItem('growza.till.offline.v1')!)[0].state).toBe('waiting');
  });

  it('only this session’s branches are sent: another business’s waiting order on a shared phone stays where it is', async () => {
    const store = await load();
    store.keepOfflineOrder(item('a', 'other-business-branch'));
    recordCounterSale.mockResolvedValue({});
    await store.sendOfflineOrders(['mg']);
    expect(recordCounterSale).not.toHaveBeenCalled();
    expect(JSON.parse(storage.getItem('growza.till.offline.v1')!)).toHaveLength(1);
  });

  it('storage blocked (a private window): the order is not taken, and nothing breaks', async () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('blocked');
        },
        removeItem: () => {
          throw new Error('blocked');
        },
      },
    });
    const store = await load();
    expect(store.keepOfflineOrder(item('a'))).toBe(false);
    expect(store.tillLetter('mg')).toBeNull();
    expect(store.deviceKey()).toBeNull();
  });
});

const row = (id: string, startAt: string, extra: Partial<Appointment>): Appointment =>
  ({
    id, startAt, endAt: startAt, status: 'completed', createdVia: 'dashboard', channel: 'counter', customerName: 'Meena', customerPhone: null,
    serviceId: null, serviceName: '', priceMinor: null, paidAmountMinor: null, paymentMode: 'cash', providerId: null, providerName: null,
    bookingGroupId: null, offerTitle: null, comboPriceMinor: null, locationId: 'loc-1', bookedAhead: false, movedTo: null, reminderSent: false,
    customerIsNew: false, products: [{ id: `vp-${id}`, productId: 'p-1', name: 'Masala Dosa', priceMinor: '12000', qty: 1, paidMinor: '12000', returnedQty: 0, returnedMinor: '0' }],
    payments: [], refunds: [], ...extra,
  }) as Appointment;

describe('the loopholes (owner, 2026-11-17)', () => {
  it('L2 — the server already had it as #12: the till says "A01 is #12" until OK is tapped', async () => {
    const m = await load();
    m.keepOfflineOrder(item('o1'));
    recordCounterSale.mockResolvedValueOnce({ appointmentId: 'sale-1', tokenNo: 12, offlineToken: null });
    await m.sendOfflineOrders(['mg']);
    const notices = JSON.parse(storage.getItem('growza.till.renumbered.v1')!);
    expect(notices).toEqual([{ id: 'o1', branch: 'mg', was: 'A01', now: '#12', saleId: 'sale-1' }]);
    m.dismissRenumbered('o1');
    expect(storage.getItem('growza.till.renumbered.v1')).toBeNull();
  });

  it('L2 — sent and recorded as A01: no notice', async () => {
    const m = await load();
    m.keepOfflineOrder(item('o2'));
    recordCounterSale.mockResolvedValueOnce({ appointmentId: 'sale-2', tokenNo: null, offlineToken: 'A01' });
    await m.sendOfflineOrders(['mg']);
    expect(storage.getItem('growza.till.renumbered.v1')).toBeNull();
  });

  it('L3 — a refused order can be removed; one still waiting to send never can', async () => {
    const m = await load();
    m.keepOfflineOrder(item('o3', 'mg', '2026-11-16T09:00:00.000Z'));
    m.keepOfflineOrder(item('o4', 'other'));
    const { ApiError } = await import('./api');
    recordCounterSale.mockRejectedValueOnce(new ApiError(400, 'That price changed'));
    await m.sendOfflineOrders(['mg']);
    m.removeOfflineOrder('o4');
    m.removeOfflineOrder('o3');
    const left = JSON.parse(storage.getItem('growza.till.offline.v1')!) as Array<{ id: string }>;
    expect(left.map((i) => i.id)).toEqual(['o4']);
  });

  it('L1 — the till asks before the tab closes while anything waits, and says to keep the browser', () => {
    const src = readFileSync(path.join(__dirname, 'offline-till.ts'), 'utf8');
    expect(src).toMatch(/if \(!waiting\) return;\s*const ask = \(e: BeforeUnloadEvent\)/);
    const bar = readFileSync(path.join(__dirname, '../components/OfflineTillBar.tsx'), 'utf8');
    expect(bar).toContain("{waiting > 0 ? <span className=\"otb-keep\">{t('keepBrowser')}</span> : null}");
  });
});

describe('an order taken offline is never given a plain number', () => {
  it('the Queue calls it A01, and the server’s next #02 is not taken by it', () => {
    const now = Date.parse('2026-11-16T10:30:00Z');
    const tokens = buildDailyTokens(
      [row('s1', '2026-11-16T10:00:00Z', { tokenNo: 1 }), row('s2', '2026-11-16T10:05:00Z', { tokenNo: null, offlineToken: 'A01' }), row('s3', '2026-11-16T10:10:00Z', { tokenNo: null })],
      'loc-1',
      {},
      now,
    );
    expect(tokens.map((t) => t.tokenLabel)).toEqual(['#01', 'A01', '#02']);
  });

  it('Home’s numbering skips it too', () => {
    const map = tokenNumbersOf(
      [
        { id: 'a', soldAt: '2026-11-16T10:00:00Z', tokenNo: 1 },
        { id: 'b', soldAt: '2026-11-16T10:05:00Z', tokenNo: null, offlineToken: 'B03' },
        { id: 'c', soldAt: '2026-11-16T10:10:00Z', tokenNo: null },
      ],
      () => true,
    );
    expect(map.has('b')).toBe(false);
    expect(map.get('c')).toBe(2);
  });

  it('the Orders list and the order page name it by its till’s token', () => {
    expect(orderNumber({ code: '2c26f314', tokenNo: null, offlineToken: 'A12' })).toBe('A12');
    expect(orderNumber({ code: '2c26f314', tokenNo: 8 })).toBe('#08');
  });
});

describe('the slip and the receipt printed offline', () => {
  const kotCopy = { title: 'KOT', added: 'ADDED', cancelled: 'CANCELLED', packed: 'PACK', reprint: 'REPRINT', kotNo: (n: number) => `KOT ${n}`, token: (n: number | string) => `Token ${n}`, items: (n: number) => `${n} items` };
  it('the kitchen slip says A12 and has no kitchen number yet', () => {
    const text = kotTicket({ number: 0, kind: 'new', tokenNo: null, offlineToken: 'A12', destination: 'TAKEAWAY', when: '16 Nov, 3:05 pm', items: [{ name: 'Masala Dosa', qty: 2 }] }, kotCopy)
      .lines.map((l) => ('text' in l ? l.text : 'left' in l ? `${l.left}|${l.right}` : ''))
      .join('\n');
    expect(text).toContain('Token A12');
    expect(text).not.toContain('KOT 0');
  });

  it('the receipt says A12, no bill number, and that the number comes when back online', () => {
    const lines = billTicket(
      {
        businessName: 'Brew Haven', docTitle: 'Receipt', customerName: 'Meena', when: '16/11/26 15:05', orderLabel: null, cashier: 'Pooja', number: null,
        tokenNo: null, offlineToken: 'A12', numberLater: 'Bill number is given when you are back online',
        items: [{ name: 'Masala Dosa', qty: 2, price: '120.00', amount: '240.00' }], totalQty: 2, subTotal: '240.00', adjustments: [], roundOff: null, grandTotal: '₹240.00', paidBy: 'Paid by Cash',
      },
      { reprint: 'R', phone: (v) => v, gstin: (v) => v, fssai: (v) => v, name: (v) => `Name: ${v}`, date: (v) => v, cashier: (v) => v, billNo: (v) => `Bill No: ${v}`, token: (n) => `Token ${n}`, colItem: 'Item', colQty: 'Qty', colPrice: 'Price', colAmount: 'Amt', totalQty: (n) => `${n}`, subTotal: 'Sub', roundOff: 'RO', grandTotal: 'Total', thanks: 'Thanks' },
    ).lines.map((l) => ('text' in l ? l.text : 'right' in l ? `${l.left}|${l.right}` : ''));
    expect(lines).toContain('Token A12');
    expect(lines).toContain('Bill number is given when you are back online');
    expect(lines.join('\n')).not.toContain('Bill No:');
  });
});

describe('UX — plain words, both languages', () => {
  const en = JSON.parse(readFileSync(path.resolve(__dirname, '../../../messages/en.json'), 'utf8'));
  const hi = JSON.parse(readFileSync(path.resolve(__dirname, '../../../messages/hi.json'), 'utf8'));
  it('every offline line is in English and Hindi, and none says KOT, sync or idempotent', () => {
    const keys = Object.keys(en.payFlow.offline);
    expect(Object.keys(hi.payFlow.offline).sort()).toEqual([...keys].sort());
    for (const k of keys) {
      expect(String(hi.payFlow.offline[k]).trim(), k).not.toBe('');
      expect(String(en.payFlow.offline[k])).not.toMatch(/\bKOT\b|sync|idempoten/i);
    }
    expect(en.payFlow.offline.offlineWaiting).toContain('waiting to send');
  });
});
