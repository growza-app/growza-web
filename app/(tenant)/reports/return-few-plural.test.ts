import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';

/**
 * "Came back within 30 days" says a month with under 10 new people is too few to read. With one new person it said
 * "only 1 new customers". The three report groups that carry the line (the restaurant's Guests, a shop's Customers, the
 * salon's Clients) now count it in both languages. A month with nobody new says `returnNone`, so 0 never reaches it.
 */
const GROUPS = ['restaurantReports.customers', 'shopCustomers', 'salonReports.clients'] as const;
const say = (locale: 'en' | 'hi', namespace: (typeof GROUPS)[number], n: number) =>
  createTranslator({ locale, messages: locale === 'en' ? en : hi, namespace: namespace as never })('returnFew' as never, { n } as never) as string;

describe('"only N new …, too few to say" counts', () => {
  it('in English: one person is singular, two or more plural', () => {
    expect(say('en', 'restaurantReports.customers', 1)).toBe('only 1 new guest, too few to say');
    expect(say('en', 'restaurantReports.customers', 9)).toBe('only 9 new guests, too few to say');
    expect(say('en', 'shopCustomers', 1)).toBe('only 1 new customer, too few to say');
    expect(say('en', 'shopCustomers', 2)).toBe('only 2 new customers, too few to say');
    expect(say('en', 'salonReports.clients', 1)).toBe('only 1 new client, too few to say');
    expect(say('en', 'salonReports.clients', 5)).toBe('only 5 new clients, too few to say');
  });

  it('in Hindi: नया for one, नए for more', () => {
    expect(say('hi', 'restaurantReports.customers', 1)).toBe('सिर्फ़ 1 नया मेहमान, कहने के लिए कम');
    expect(say('hi', 'restaurantReports.customers', 3)).toBe('सिर्फ़ 3 नए मेहमान, कहने के लिए कम');
    expect(say('hi', 'shopCustomers', 1)).toBe('सिर्फ़ 1 नया ग्राहक, कहने के लिए कम');
    expect(say('hi', 'salonReports.clients', 9)).toBe('सिर्फ़ 9 नए ग्राहक, कहने के लिए कम');
  });

  it('no Hindi one-branch hard-codes a 1: CLDR puts 0 in "one" for Hindi, so the number is always #', () => {
    for (const g of GROUPS) {
      const msg = g.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], hi) as Record<string, string>;
      expect(msg.returnFew).toMatch(/one \{[^}]*#/);
      expect(msg.returnFew).not.toMatch(/one \{[^}#]*1/);
    }
  });
});
