import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';

/**
 * QA, 2026-11-28 — the count lines under Reports › Customers read "1 ग्राहकों के पास…" and "1 नियमित ग्राहक … आ रहे हैं"
 * for one person. Each is now a plural in both languages, in the shop's Customers, the restaurant's Guests and the
 * salon's Clients. Both lines only show when the count is above 0.
 */
type Group = 'shopCustomers' | 'restaurantReports.customers' | 'salonReports.clients';
const say = (locale: 'en' | 'hi', namespace: string, key: string, values: Record<string, number | string>) =>
  createTranslator({ locale, messages: locale === 'en' ? en : hi, namespace: namespace as never })(key as never, values as never) as string;
const msg = (locale: 'en' | 'hi', path: string) =>
  path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], locale === 'en' ? en : hi) as string;

/** The text of a plural's `one {…}` branch, nested braces included. */
const oneBranch = (m: string) => {
  const start = m.indexOf('one {') + 'one {'.length;
  let depth = 1;
  for (let i = start; i < m.length; i++) {
    if (m[i] === '{') depth++;
    else if (m[i] === '}' && --depth === 0) return m.slice(start, i);
  }
  return '';
};

describe('"N customers have points to spend"', () => {
  const cases: Array<[Group, string, string, string, string]> = [
    ['shopCustomers', '1 customer has points to spend.', '3 customers have points to spend.', '1 ग्राहक के पास खर्च करने लायक पॉइंट्स हैं।', '3 ग्राहकों के पास खर्च करने लायक पॉइंट्स हैं।'],
    ['restaurantReports.customers', '1 guest has points to spend.', '3 guests have points to spend.', '1 मेहमान के पास खर्च करने लायक पॉइंट्स हैं।', '3 मेहमानों के पास खर्च करने लायक पॉइंट्स हैं।'],
  ];
  for (const [g, en1, en3, hi1, hi3] of cases) {
    it(`${g}: one and three, in English and Hindi`, () => {
      expect(say('en', `${g}.points`, 'count', { n: 1 })).toBe(en1);
      expect(say('en', `${g}.points`, 'count', { n: 3 })).toBe(en3);
      expect(say('hi', `${g}.points`, 'count', { n: 1 })).toBe(hi1);
      expect(say('hi', `${g}.points`, 'count', { n: 3 })).toBe(hi3);
    });
  }
});

describe('"N regulars are overdue"', () => {
  const cases: Array<[Group, string, string, string, string]> = [
    ['shopCustomers', '1 regular is overdue.', '3 regulars are overdue.', '1 नियमित ग्राहक देर से आ रहा है।', '3 नियमित ग्राहक देर से आ रहे हैं।'],
    ['restaurantReports.customers', '1 regular is overdue.', '3 regulars are overdue.', '1 नियमित मेहमान देर से आ रहा है।', '3 नियमित मेहमान देर से आ रहे हैं।'],
    ['salonReports.clients', '1 client is past their usual visit.', '3 clients are past their usual visit.', '1 ग्राहक अपने आम समय से देर कर चुका है।', '3 ग्राहक अपने आम समय से देर कर चुके हैं।'],
  ];
  for (const [g, en1, en3, hi1, hi3] of cases) {
    it(`${g}: one and three, in English and Hindi`, () => {
      expect(say('en', g, 'overdueCount', { n: 1 })).toBe(en1);
      expect(say('en', g, 'overdueCount', { n: 3 })).toBe(en3);
      expect(say('hi', g, 'overdueCount', { n: 1 })).toBe(hi1);
      expect(say('hi', g, 'overdueCount', { n: 3 })).toBe(hi3);
    });
  }
});

describe('the shop’s other counts', () => {
  it('"1 day away" in English, wherever a shop says how long someone has been away', () => {
    for (const [ns, key] of [['shopCustomers', 'overdueAway'], ['shopCustomers.missYou', 'away'], ['shopCustomers.fans', 'away']] as const) {
      expect(say('en', ns, key, { n: 1 })).toBe('1 day away');
      expect(say('en', ns, key, { n: 3 })).toBe('3 days away');
      expect(say('hi', ns, key, { n: 1 })).toBe('1 दिन से नहीं आए');
    }
  });

  it('points that expire read right for one point: the number arrives already formatted, so no verb to agree', () => {
    expect(say('en', 'shopCustomers.points', 'expires', { n: '1', date: '5 Dec' })).toBe('1 expiring 5 Dec');
    expect(say('en', 'shopCustomers.points', 'expires', { n: '1,200', date: '5 Dec' })).toBe('1,200 expiring 5 Dec');
  });

  it('"came back" in Hindi: नया … आया for one, नए … आए for more, and none says so', () => {
    const sr = (back: number) => say('hi', 'shopCustomers', 'returnSr', { pct: Math.round((back / 12) * 100), back, n: 12 });
    expect(sr(1)).toBe('8% — 12 में से 1 नया ग्राहक फिर आया');
    expect(sr(3)).toBe('25% — 12 में से 3 नए ग्राहक फिर आए');
    expect(sr(0)).toBe('0% — 12 में से कोई नया ग्राहक फिर नहीं आया');
  });
});

describe('no Hindi one-branch hard-codes a 1', () => {
  it('CLDR puts 0 in "one" for Hindi, so the number is always #', () => {
    for (const path of [
      'shopCustomers.points.count',
      'shopCustomers.overdueCount',
      'shopCustomers.returnSr',
      'restaurantReports.customers.points.count',
      'restaurantReports.customers.overdueCount',
      'salonReports.clients.overdueCount',
    ]) {
      const one = oneBranch(msg('hi', path));
      expect(one, path).toContain('#');
      expect(one, path).not.toMatch(/\d/);
    }
  });
});
