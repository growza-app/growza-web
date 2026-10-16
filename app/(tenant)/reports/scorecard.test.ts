import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import type { Scorecard as ScorecardData } from '../lib/api';
import { Scorecard, verdict } from './Scorecard';

/**
 * Jira GRW-567 — the Overview scorecard says each line as a sentence against
 * the period before, with a dot whose colour follows BR-01/02.
 */
const wrap = (locale: 'en' | 'hi', data: ScorecardData) =>
  renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale,
      messages: locale === 'en' ? en : hi,
      timeZone: 'Asia/Kolkata',
      children: createElement(Scorecard, { data }),
    }),
  );

const month: ScorecardData = {
  vs: 'month',
  money: { value: 3850000, previous: 3440000 },
  visits: { value: 103, previous: 100 },
  newClients: { value: 9, previous: 12 },
  cameBack: { value: 41, previous: 41 },
  noShows: { value: 6, previous: 4 },
};

describe('the dot', () => {
  it('is green past +5%, red past −5%, amber in between', () => {
    expect(verdict({ value: 110, previous: 100 })).toBe('good');
    expect(verdict({ value: 94, previous: 100 })).toBe('bad');
    expect(verdict({ value: 103, previous: 100 })).toBe('steady');
    expect(verdict({ value: 5, previous: 0 })).toBe('good');
    expect(verdict({ value: 0, previous: 0 })).toBe('steady');
  });

  it('turns on any rise in no-shows, and is green when nobody missed twice running', () => {
    expect(verdict({ value: 5, previous: 4 }, true)).toBe('bad');
    expect(verdict({ value: 3, previous: 4 }, true)).toBe('good');
    expect(verdict({ value: 4, previous: 4 }, true)).toBe('steady');
    expect(verdict({ value: 0, previous: 0 }, true)).toBe('good');
  });

  it('is absent with nothing to compare with', () => {
    expect(verdict({ value: 10, previous: null })).toBeNull();
  });
});

describe('the lines', () => {
  it('read as sentences in English, in rupees and people — never a percentage', () => {
    const html = wrap('en', month);
    expect(html).toContain('₹38,500');
    expect(html).toContain('₹4,100 more than last month');
    expect(html).toContain('3 more than last month');
    expect(html).toContain('3 fewer than last month');
    expect(html).toContain('Same as last month');
    expect(html).toContain('2 more than last month');
    expect(html).toContain('sc-dot-good');
    expect(html).toContain('sc-dot-steady');
    expect(html).toContain('sc-dot-bad');
    expect(html).toContain('aria-label="Needs you"');
    expect(html).not.toContain('%');
  });

  it('read in Hindi', () => {
    const html = wrap('hi', month);
    expect(html).toContain('पिछले महीने से ₹4,100 ज़्यादा');
    expect(html).toContain('नहीं आए');
  });

  it('say so when the period before had nothing', () => {
    const html = wrap('en', {
      vs: 'week',
      money: { value: 0, previous: null },
      visits: { value: 0, previous: null },
      newClients: { value: 0, previous: null },
      cameBack: { value: 0, previous: null },
      noShows: { value: 0, previous: null },
    });
    expect(html).toContain('Nothing to compare with yet');
    expect(html).not.toContain('sc-dot ');
  });
});
