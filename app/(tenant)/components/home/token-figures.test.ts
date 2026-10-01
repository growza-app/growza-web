import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import en from '../../../../messages/en.json';
import hi from '../../../../messages/hi.json';
import { TokenFigures } from './TokenFigures';

/**
 * Jira GRW-406 (epic GRW-283) — the six token figures, as the Day summary and Reports draw them.
 */
const say = (lang: 'en' | 'hi') =>
  renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale: lang,
      messages: lang === 'en' ? en : hi,
      timeZone: 'Asia/Kolkata',
      children: createElement(TokenFigures, { figures: { issued: 7, waiting: 2, served: 3, paid: 2, left: 1, cancelled: 1 } }),
    }),
  );
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('the token figures', () => {
  it('say given, waiting, served, paid, left and cancelled, in that order, with their numbers', () => {
    expect(text(say('en'))).toBe('7 Tokens given 2 Waiting 3 Served 2 Paid 1 Left without service 1 Cancelled');
  });

  it('in Hindi', () => {
    expect(text(say('hi'))).toBe('7 टोकन दिए 2 इंतज़ार में 3 सेवा दी 2 भुगतान हुआ 1 बिना सेवा चले गए 1 रद्द हुए');
  });

  it('add up: given = waiting + served + left + cancelled, and paid is part of served (review round 2)', () => {
    const n = Array.from(say('en').matchAll(/<strong>(\d+)<\/strong>/g)).map((m) => Number(m[1]));
    const [given, waiting, served, paid, left, cancelled] = n;
    expect(n).toHaveLength(6);
    expect(waiting! + served! + left! + cancelled!).toBe(given);
    expect(paid!).toBeLessThanOrEqual(served!);
  });

  it('an older API without "waiting" reads 0, never blank', () => {
    const html = renderToStaticMarkup(
      createElement(NextIntlClientProvider, {
        locale: 'en',
        messages: en,
        timeZone: 'Asia/Kolkata',
        children: createElement(TokenFigures, { figures: { issued: 1, served: 1, paid: 1, left: 0, cancelled: 0 } }),
      }),
    );
    expect(text(html)).toContain('0 Waiting');
  });

  it('are on the Day summary and the Bookings report, and the Day summary does not count "left" twice', () => {
    const summary = readFileSync(new URL('./DaySummarySheet.tsx', import.meta.url), 'utf8');
    const bookings = readFileSync(new URL('../../reports/BookingsTab.tsx', import.meta.url), 'utf8');
    expect(summary).toContain('<TokenFigures figures={data.tokens} />');
    expect(bookings).toContain('<TokenFigures figures={data.tokens} />');
    expect(summary).toMatch(/\.\.\.\(data\.tokens \? \[\] : \[\{ k: 'left'/);
  });
});
