import { afterEach, describe, expect, it, vi } from 'vitest';
import { DateTime } from 'luxon';
import type { Offer, Product } from './api-types';
import { offerIsLive, offerShareItem, productShareItem, shareMessage, type ShareSession } from './share-on-whatsapp';
import { openWhatsApp, photoFile } from '../components/ShareOnWhatsApp';

/** Jira GRW-671 — when a row has something to share, and what the message says about it. */

const NOW = DateTime.fromISO('2026-11-05T10:00:00', { zone: 'Asia/Kolkata' });

const offer = (o: Partial<Offer> = {}): Offer => ({
  id: 'o1',
  locationId: 'b1',
  title: 'Diwali Glow Facial',
  description: null,
  active: true,
  sortOrder: null,
  updatedAt: '2026-11-01T00:00:00Z',
  serviceIds: ['s1', 's2'],
  comboPriceMinor: '99900',
  visibleWeekdays: null,
  visibleFrom: null,
  visibleUntil: null,
  bookingsCount: 0,
  revenueMinor: '0',
  ...o,
});

const product = (p: Partial<Product> = {}): Product =>
  ({
    id: 'p1',
    name: 'Veg Thali',
    priceMinor: '24900',
    currency: 'INR',
    stock: 0,
    imageUrl: null,
    active: true,
    locationId: 'b1',
    sold: 0,
    costMinor: null,
    lowStockAt: 0,
    categoryId: null,
    categoryName: null,
    sku: null,
    barcode: null,
    gstRateBp: null,
    hsn: null,
    ...p,
  }) as Product;

const SESSION: ShareSession = {
  lang: 'en',
  tone: 'casual',
  businessName: 'Glow Studio',
  businessPhone: '9829012345',
  timezone: 'Asia/Kolkata',
  branches: [
    { id: '11111111-1111-1111-1111-aaaaaaaaaaaa', name: 'Malviya Nagar', phone: '9829012345', mapsUrl: null },
    { id: '22222222-2222-2222-2222-bbbbbbbbbbbb', name: 'C-Scheme', phone: '9414011111', mapsUrl: 'https://www.google.com/maps/search/?api=1&query=26.9,75.8' },
  ],
  bookingLive: true,
};

describe('offerIsLive — BR-02: only a price the till charges today', () => {
  it('needs the switch on', () => {
    expect(offerIsLive(offer({ active: false }), NOW)).toBe(false);
  });
  it('is off before it starts and after it ends, on at both edges', () => {
    expect(offerIsLive(offer({ visibleFrom: '2026-11-06T00:00:00+05:30' }), NOW)).toBe(false);
    expect(offerIsLive(offer({ visibleUntil: '2026-11-04T23:59:00+05:30' }), NOW)).toBe(false);
    expect(offerIsLive(offer({ visibleFrom: '2026-11-05T10:00:00+05:30', visibleUntil: '2026-11-05T10:00:00+05:30' }), NOW)).toBe(true);
  });
  it('a weekday limit does not stop it: the message names the days', () => {
    expect(offerIsLive(offer({ visibleWeekdays: [1, 3, 5] }), NOW)).toBe(true);
  });
});

describe('offerShareItem', () => {
  it('a package carries its price, its was-price and its last day in the business zone', () => {
    // 18:29 UTC on the 15th is 23:59 on the 15th in India — the 15th, not the 16th or the 14th.
    const item = offerShareItem(offer({ visibleUntil: '2026-11-15T18:29:00Z' }), { timezone: 'Asia/Kolkata', partsTotalMinor: 149_900, now: NOW });
    expect(item).toEqual({ name: 'Diwali Glow Facial', detail: null, priceMinor: 99_900, wasMinor: 149_900, until: '2026-11-15', weekdays: null });
  });
  it('an announcement has no price, and keeps its words', () => {
    const item = offerShareItem(offer({ comboPriceMinor: null, description: '20% off every hair spa' }), { timezone: 'Asia/Kolkata', partsTotalMinor: 5000, now: NOW });
    expect(item?.priceMinor).toBeNull();
    expect(item?.wasMinor).toBeNull();
    expect(item?.detail).toBe('20% off every hair spa');
  });
  it('AC-03 — an ended offer has nothing to share', () => {
    expect(offerShareItem(offer({ visibleUntil: '2026-11-04T10:00:00Z' }), { timezone: 'Asia/Kolkata', now: NOW })).toBeNull();
  });
});

describe('productShareItem', () => {
  it('AC-03 — a counted product with none left has nothing to share; a kitchen dish is never counted', () => {
    expect(productShareItem(product({ stock: 0 }), { counted: true })).toBeNull();
    expect(productShareItem(product({ stock: 0 }), { counted: false })).toEqual({ name: 'Veg Thali', priceMinor: 24_900 });
    expect(productShareItem(product({ stock: 3 }), { counted: true })).toEqual({ name: 'Veg Thali', priceMinor: 24_900 });
  });
  it('a retired product has nothing to share', () => {
    expect(productShareItem(product({ active: false, stock: 9 }), { counted: true })).toBeNull();
  });
  it('AC-10 — sizes at different prices say "from" the cheapest; sizes at one price say that price', () => {
    expect(productShareItem(product({ name: 'Cotton Kurta', stock: 5, sizePriceMinMinor: '79900', sizePriceMaxMinor: '89900' }), { counted: true })).toEqual({
      name: 'Cotton Kurta',
      priceMinor: 79_900,
      priceIsFrom: true,
    });
    expect(productShareItem(product({ stock: 5, sizePriceMinMinor: '79900', sizePriceMaxMinor: '79900' }), { counted: true })?.priceIsFrom).toBe(false);
  });
});

describe('shareMessage', () => {
  it('AC-01 — an offer where WhatsApp booking is live carries that branch’s booking link', () => {
    const text = shareMessage({ name: 'Diwali Glow Facial', priceMinor: 99_900 }, { branchId: SESSION.branches[0]!.id, bookable: true }, SESSION, NOW);
    expect(text).toMatch(/Book on WhatsApp: https:\/\/wa\.me\/919829012345\?text=/);
    expect(decodeURIComponent(text)).toContain('(ref: B-aaaaaaaaaaaa)');
    expect(text).toMatch(/— Glow Studio, Malviya Nagar$/);
  });
  it('AC-04 — the row’s own branch: C-Scheme’s name, phone and map', () => {
    const text = shareMessage({ name: 'Facial' }, { branchId: SESSION.branches[1]!.id, bookable: true }, { ...SESSION, bookingLive: false }, NOW);
    expect(text).toContain('Call or WhatsApp: 94140 11111');
    expect(text).toContain('Map: https://www.google.com/maps/search/?api=1&query=26.9,75.8');
    expect(text).toMatch(/— Glow Studio, C-Scheme$/);
  });
  it('a branch this session was not sent is never swapped for the main one: the business signs, with its own phone', () => {
    const text = shareMessage({ name: 'Facial' }, { branchId: 'closed-branch-id', bookable: true }, SESSION, NOW);
    expect(text).not.toContain('Malviya Nagar');
    expect(text).not.toContain('C-Scheme');
    expect(text).not.toContain('Book on');
    expect(text).toContain('Call or WhatsApp: 98290 12345');
    expect(text).toMatch(/— Glow Studio$/);
  });
  it('a row naming no branch takes the only branch of a one-branch business, and none of a two-branch one', () => {
    const one = { ...SESSION, branches: [SESSION.branches[0]!] };
    expect(shareMessage({ name: 'Facial' }, { branchId: undefined, bookable: false }, one, NOW)).toMatch(/— Glow Studio, Malviya Nagar$/);
    expect(shareMessage({ name: 'Facial' }, { branchId: undefined, bookable: false }, SESSION, NOW)).toMatch(/— Glow Studio$/);
  });
  it('BR-05 — no booking link while WhatsApp booking is off, and never for a product', () => {
    expect(shareMessage({ name: 'Facial' }, { branchId: SESSION.branches[0]!.id, bookable: true }, { ...SESSION, bookingLive: false }, NOW)).not.toContain('Book on');
    expect(shareMessage({ name: 'Shampoo' }, { branchId: SESSION.branches[0]!.id, bookable: false }, SESSION, NOW)).not.toContain('Book on');
  });
  it('AC-06 — Hindi', () => {
    const text = shareMessage({ name: 'Diwali Glow Facial', until: '2026-11-15' }, { branchId: SESSION.branches[0]!.id, bookable: true }, { ...SESSION, lang: 'hi' }, NOW);
    expect(text).toContain('15 नवंबर तक');
    expect(text).toContain('व्हाट्सऐप पर बुक करें:');
  });
});

describe('openWhatsApp — share sheet, then wa.me, then Copy', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const stubWindow = (opts: { coarse: boolean; open: () => unknown }) => {
    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: opts.coarse }),
      open: vi.fn(opts.open),
    });
  };

  it('a phone uses the share sheet, and a cancel ends it quietly', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError'));
    vi.stubGlobal('navigator', { share });
    stubWindow({ coarse: true, open: () => ({}) });
    await expect(openWhatsApp('hello')).resolves.toBeNull();
    expect(share).toHaveBeenCalledWith({ text: 'hello' });
    expect((window.open as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it('a share sheet that fails for another reason falls back to wa.me', async () => {
    vi.stubGlobal('navigator', { share: vi.fn().mockRejectedValue(new DOMException('no', 'NotAllowedError')) });
    stubWindow({ coarse: true, open: () => ({ opener: {} }) });
    await expect(openWhatsApp('hi there')).resolves.toBeNull();
    expect(window.open).toHaveBeenCalledWith('https://wa.me/?text=hi%20there', '_blank');
  });

  it('a phone sends the photo with the words when it can take a file, and calls the sheet without waiting first', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share, canShare: () => true });
    stubWindow({ coarse: true, open: () => ({}) });
    const thali = new File(['png'], 'photo.png', { type: 'image/png' });
    // The sheet must be asked for in the same turn as the tap: no fetch, no await, before `share`.
    void openWhatsApp('thali', thali);
    expect(share).toHaveBeenCalledTimes(1);
    expect(share.mock.calls[0]![0]).toEqual({ files: [thali], text: 'thali' });
  });

  it('no photo in hand by the tap: the words go alone', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share, canShare: () => true });
    stubWindow({ coarse: true, open: () => ({}) });
    await openWhatsApp('thali', null);
    expect(share).toHaveBeenCalledWith({ text: 'thali' });
  });

  it('a phone that refuses the file gets the words alone, not the copy dialog', async () => {
    const share = vi.fn().mockRejectedValueOnce(new DOMException('no files', 'NotAllowedError')).mockResolvedValueOnce(undefined);
    vi.stubGlobal('navigator', { share, canShare: () => true });
    stubWindow({ coarse: true, open: () => ({}) });
    await expect(openWhatsApp('thali', new File(['png'], 'photo.png', { type: 'image/png' }))).resolves.toBeNull();
    expect(share).toHaveBeenLastCalledWith({ text: 'thali' });
    expect(window.open).not.toHaveBeenCalled();
  });

  it('photoFile: an image becomes a file; a missing or non-image answer becomes nothing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Blob(['png'], { type: 'image/png' }))));
    expect((await photoFile('https://cdn.example/thali.png'))?.type).toBe('image/png');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 404 })));
    expect(await photoFile('https://cdn.example/missing.png')).toBeNull();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>', { headers: { 'content-type': 'text/html' } })));
    expect(await photoFile('https://cdn.example/login')).toBeNull();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    expect(await photoFile('https://cdn.example/thali.png')).toBeNull();
  });

  it('a desktop opens wa.me; a blocked tab hands the text back to copy', async () => {
    vi.stubGlobal('navigator', {});
    stubWindow({ coarse: false, open: () => null });
    await expect(openWhatsApp('copy me')).resolves.toBe('copy me');
  });
});
