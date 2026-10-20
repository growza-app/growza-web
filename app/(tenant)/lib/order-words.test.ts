import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-612 — an order's states and channels, in both languages, before any screen draws them.
 *
 * The states themselves are declared once, in `@growza-app/shared`'s `order-states.ts`, which the API refuses a
 * move with. What lives here is the WORDS: English for a reader of this app, and Hindi, which the vertical JSON
 * deliberately does not carry (Jira GRW-315 — the dashboard speaks Hindi through its own messages).
 *
 * The pinned list below is not a second declaration to drift from: this repo's `@growza-app/shared` is still the
 * published 1.0.15, which predates `ORDER_STATES`, so there is nothing to import yet. The API's own
 * test/platform/an-order-has-a-state.test.ts holds the machine; when the pin moves to 1.0.17 this test should import
 * ORDER_STATES and drop the literal.
 */
const STATES = ['done', 'new', 'packed', 'sent', 'delivered', 'cancelled', 'returned'] as const;
const CHANNELS = ['counter', 'flipkart', 'amazon'] as const;

const messages = (lang: 'en' | 'hi') =>
  JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../../../messages', `${lang}.json`), 'utf8')) as {
    orders?: { states?: Record<string, string>; channels?: Record<string, string> };
  };

describe('UX-07 — every state and channel has a word in both languages', () => {
  for (const lang of ['en', 'hi'] as const) {
    it(`${lang}: one word per state, one per channel, and nothing left over`, () => {
      const orders = messages(lang).orders;
      expect(Object.keys(orders?.states ?? {}).sort()).toEqual([...STATES].sort());
      expect(Object.keys(orders?.channels ?? {}).sort()).toEqual([...CHANNELS].sort());
      for (const [key, word] of Object.entries(orders!.states!)) expect(word, `${lang} ${key}`).toBeTruthy();
    });
  }

  it('the Hindi is Hindi, not the English word left in place', () => {
    const hi = messages('hi').orders!;
    for (const state of STATES) expect(hi.states![state], state).toMatch(/[ऀ-ॿ]/);
    // A brand name stays its own name; the one word that is ours ("Counter") is translated.
    expect(hi.channels!.counter).toMatch(/[ऀ-ॿ]/);
  });

  it('UX-03 — the words an owner reads are plain, and read as words', () => {
    const en = messages('en').orders!;
    for (const state of STATES) {
      const word = en.states![state]!;
      // Never a code, an underscore or a trade word.
      expect(word, state).not.toMatch(/_|variant|sku|rto|status|enum/i);
      expect(word[0], `${state} is capitalised`).toBe(word[0]!.toUpperCase());
    }
    // "Came back" rather than "Returned": what a shop says when a parcel comes back to it.
    expect(en.states!.returned).toBe('Came back');
  });

  it('the refusal a move can be sent has its Hindi too', () => {
    const dict = readFileSync(path.resolve(import.meta.dirname, 'api-messages.ts'), 'utf8');
    for (const sentence of ['There is no such order.', 'This order belongs to another branch.']) {
      expect(dict, sentence).toContain(`'${sentence}':`);
    }
  });
});
