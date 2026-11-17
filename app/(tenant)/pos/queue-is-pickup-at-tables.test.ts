import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';

/**
 * Owner, 2026-11-17 — at a restaurant with tables on, the Queue holds only takeaway and delivery, so it is "Pickup".
 * Tables off (and every salon and shop) keeps "Queue". Source-reading; the restaurant browser suite drives both.
 */
const pos = readFileSync(resolve(__dirname, 'PosClient.tsx'), 'utf8');
const till = readFileSync(resolve(__dirname, '../appointments/new/PayFlow.tsx'), 'utf8');

const POS_KEYS = ['queue', 'recallToQueue', 'openQueue', 'preparingColTitle', 'backToQueueDone', 'cancelOrderBody'] as const;
const DESK_KEYS = ['keepPendingInQueue', 'pendingDoneTitle', 'sentToQueueBannerWithToken', 'viewInQueue'] as const;

describe('Queue is Pickup when tables are on', () => {
  it('the POS picks the Pickup words only when this branch has Table orders on', () => {
    expect(pos).toContain('const tablesOn = Boolean(session?.branches?.find((b) => b.id === location)?.tableOrders);');
    expect(pos).toContain('(tablesOn ? `${key}Pickup` : key)');
    for (const k of POS_KEYS) expect(pos).not.toMatch(new RegExp(`t\\('${k}'[,)]`));
  });
  it('the till does the same for its Queue words', () => {
    expect(till).toContain('(tablesHere ? `${key}Pickup` : key)');
    for (const k of DESK_KEYS) expect(till).not.toMatch(new RegExp(`t\\('desk\\.${k}'[,)]`));
  });
  it('every Pickup word is in English and Hindi, says Pickup, and keeps the same placeholders', () => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const [book, word] of [[en, 'Pickup'], [hi, 'पिकअप']] as const) {
      const p = book.pos as Record<string, string>;
      const d = book.payFlow.desk as Record<string, string>;
      for (const k of POS_KEYS) {
        expect(p[`${k}Pickup`]?.toLowerCase()).toContain(word.toLowerCase());
        expect(ph(p[`${k}Pickup`]!)).toBe(ph(p[k]!));
      }
      for (const k of DESK_KEYS) {
        expect(d[`${k}Pickup`]?.toLowerCase()).toContain(word.toLowerCase());
        expect(ph(d[`${k}Pickup`]!)).toBe(ph(d[k]!));
      }
    }
  });
});
