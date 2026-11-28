import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { KEEP_DAYS, SHOW_DAYS, markMessaged, messagedDaysAgo, messagedKey, numberKey } from './messaged';

const code = (f: string) => readFileSync(join(__dirname, f), 'utf8');

// No DOM in this suite: a browser's localStorage, in memory.
const store = new Map<string, string>();
Object.assign(globalThis, {
  window: {
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), clear: () => store.clear() },
    addEventListener: () => {},
    removeEventListener: () => {},
  },
});
const A = 'tenant-a';
const B = 'tenant-b';
const book = (tenantId = A) => JSON.parse(store.get(`growza.messaged.v1:${tenantId}`) ?? '{}') as Record<string, string>;

/** Review, 2026-11-27 — one guest on three Guests lists is not sent three messages unseen; the day is remembered here. */
describe('the messaged record', () => {
  beforeEach(() => store.clear());

  it('remembers the day a number was messaged, by a hash — never the number itself', () => {
    markMessaged(A, '+91 98300 00001', '2026-11-27');
    expect(JSON.stringify(book())).not.toContain('98300');
    expect(messagedDaysAgo(book(), '+919830000001', '2026-11-27')).toBe(0);
    expect(messagedDaysAgo(book(), '9830000001', '2026-11-30')).toBe(3);
    expect(messagedDaysAgo(book(), '+919830000002', '2026-11-27')).toBeNull();
  });

  it(`shows within ${SHOW_DAYS} days, forgets after ${KEEP_DAYS}`, () => {
    markMessaged(A, '+919830000001', '2026-10-01');
    expect(messagedDaysAgo(book(), '+919830000001', '2026-10-08')).toBeNull();
    markMessaged(A, '+919830000002', '2026-11-27');
    expect(Object.keys(book())).toEqual([numberKey('+919830000002')]);
  });

  it('keeps one record per business: what one business messaged never shows on another', () => {
    expect(messagedKey(A)).toBe('growza.messaged.v1:tenant-a');
    markMessaged(A, '+919830000001', '2026-11-27');
    expect(messagedDaysAgo(book(A), '+919830000001', '2026-11-27')).toBe(0);
    expect(messagedDaysAgo(book(B), '+919830000001', '2026-11-27')).toBeNull();
    markMessaged(B, '+919830000002', '2026-11-27');
    expect(Object.keys(book(A))).toEqual([numberKey('+919830000001')]);
    expect(Object.keys(book(B))).toEqual([numberKey('+919830000002')]);
  });

  it('ignores the old record that had no business in its key', () => {
    store.set('growza.messaged.v1', JSON.stringify({ [numberKey('+919830000001')]: '2026-11-27' }));
    markMessaged(A, '+919830000002', '2026-11-27');
    expect(Object.keys(book(A))).toEqual([numberKey('+919830000002')]);
  });

  it('a session that cannot name its business keeps a record apart from every real one', () => {
    expect(messagedKey(null)).toBe('growza.messaged.v1:unknown');
    expect(messagedKey(undefined)).toBe(messagedKey(null));
  });

  it('the hook takes the business from the session the layout fills from /me', () => {
    expect(code('messaged.ts')).toContain('useSession()?.tenantId');
    expect(code('../layout.tsx')).toContain('tenantId = me.tenant?.id ?? null;');
    expect(code('../components/SessionProvider.tsx')).toMatch(/tenantId\?: string \| null;/);
  });

  it('every list and both sheets read and write the same record', () => {
    const rr = code('RestaurantReports.tsx');
    expect(rr.match(/onClick=\{\(\) => messaged\.mark\(g\.phone\)\}/g)?.length).toBe(3);
    expect(rr.match(/<Messaged ago=\{messaged\.daysAgo\(g\.phone\)\} \/>/g)?.length).toBe(3);
    for (const f of ['GuestMessageSheet.tsx', 'MissYouSheet.tsx']) {
      expect(code(f)).toContain('onClick={() => messaged.mark(g.phone)}');
      expect(code(f)).not.toContain('setSent');
    }
  });
});
