import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-637 — what was refunded, pinned at the source.
 *
 * What was checked in a browser at 344px is in the PR. These keep the rules that must not drift: the screen only RECORDS (it refunds nothing and is not
 * called a settlement), the file is the server's own, the owner's screen is not the desk's, a refund is shown on the order beside its line, and the
 * words are in both languages.
 */
const here = (f: string) => readFileSync(path.resolve(import.meta.dirname, f), 'utf8');
const client = here('./RefundsClient.tsx');
const page = here('./page.tsx');
const order = readFileSync(path.resolve(import.meta.dirname, '../[id]/OrderClient.tsx'), 'utf8');
const messages = (lang: 'en' | 'hi') => JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../../../../messages', `${lang}.json`), 'utf8')).orders as Record<string, Record<string, unknown>>;

describe('a record, never an instruction (BR-01)', () => {
  it('has nothing on it that refunds, and says what it is: records to match the statement against', () => {
    expect(client).not.toMatch(/api\.(recordRefund|refundOrder|postRefund)|method: 'POST'/);
    expect(client).toContain("t('recordNote')");
    for (const lang of ['en', 'hi'] as const) {
      const words = JSON.stringify(messages(lang).refunds);
      expect(words).not.toMatch(/settlement/i);
    }
  });

  it('reads one page of refunds from the server, with the totals the server worked out, and the file from the server', () => {
    expect(client).toContain('api.refundsReport({ range, channel: channel || undefined, location: branch || undefined, page: livePage, pageSize: PAGE_SIZE })');
    expect(client).toContain('api.refundsCsv({ range, channel: channel || undefined, location: branch || undefined })');
    expect(client).toContain('<Pagination page={livePage} total={data.totals.count}');
    expect(client).toContain('if (exportBusy.current) return;');
    expect(client).not.toMatch(/\.reduce\(/);
  });

  it('the channel chips come from the last read that was not narrowed, so tapping one never removes the others or itself, and every row links to its order', () => {
    expect(client).toContain("if (channel === '') setChannelList(");
    expect(client).toContain('channelList.includes(channel)');
    expect(client).toContain("t('openOrder')");
    expect(client).toContain("t('nothingOnChannel'");
  });

  it('a change of branch, period or channel starts the page over in the same render — one read', () => {
    expect(client).toContain('const stale = scope !== scopeNow;');
    expect(client).toContain('const livePage = stale ? 1 : page;');
  });
});

describe('on the order, the refund sits with the line it is for', () => {
  it('says who refunded, how much and when, names the line and the marketplace reference, and tolerates an older API', () => {
    expect(order).toContain("t('detail.marketplaceRefunded'");
    expect(order).toContain("t('detail.shopRefunded'");
    expect(order).toContain("t('detail.refundRef'");
    expect(order).toContain('(order.refunds ?? [])');
  });
});

describe('who sees it, and the words', () => {
  it('the front desk is sent back to Orders, and so is a viewer the lookup could not vouch for', () => {
    expect(page).toContain('let allowed = false;');
    expect(page).toContain("role === undefined || role === 'owner' || role === 'manager'");
    expect(page).toContain("redirect('/orders')");
  });

  it('every word the screen uses exists in English and Hindi', () => {
    const used = new Set([...client.matchAll(/\bt\('([A-Za-z]+)'/g)].map((m) => m[1]!));
    for (const lang of ['en', 'hi'] as const) {
      const have = messages(lang).refunds as Record<string, unknown>;
      for (const key of used) expect(have[key], `${lang}.${key}`).toBeTruthy();
      for (const r of ['last_7_days', 'this_month', 'last_month', 'last_3_months', 'this_year']) expect((have.range as Record<string, string>)[r], `${lang}.range.${r}`).toBeTruthy();
    }
    expect(Object.keys(messages('hi').refunds ?? {}).sort()).toEqual(Object.keys(messages('en').refunds ?? {}).sort());
    for (const k of ['refundsTitle', 'marketplaceRefunded', 'shopRefunded', 'refundRef'])
      for (const lang of ['en', 'hi'] as const) expect((messages(lang).detail as Record<string, unknown>)[k], `${lang}.detail.${k}`).toBeTruthy();
  });
});
