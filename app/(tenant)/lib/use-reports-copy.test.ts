import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import { copy } from './copy';
import { useReportsCopy } from './use-reports-copy';

/** Jira GRW-363 — the Reports sentences with numbers in them, through the hook the tabs use. */
const said = (locale: 'en' | 'hi', pick: () => string[]) => {
  const Probe = () => createElement('p', null, pick().join('|'));
  return renderToStaticMarkup(
    createElement(NextIntlClientProvider, { locale, messages: locale === 'en' ? en : hi, children: createElement(Probe) }),
  ).replace(/<\/?p>/g, '').replace(/&#x27;/g, "'").split('|');
};
const useSentences = () => {
  const c = useReportsCopy();
  return [
    c.filtersOnOtherTabs(1), c.filtersOnOtherTabs(3), c.filterDrawer.applyCount(2), c.droppedFilters(1), c.overdueBy(1), c.overdueBy(4),
    c.dueIn(1), c.usuallyEvery(30), c.noDataHint('Last 7 days'), c.bookingsTab.trendDetail(5, 9, 'week'), c.bookingsTab.trendSteady(4, 'day'),
    c.customersTab.daysAgo(9), c.remove('Hair'), c.perVisit('₹500'),
  ];
};

describe('the Reports sentences', () => {
  it('match the English source that the CSV export and the old screens used', () => {
    const got = said('en', useSentences);
    const r = copy.reports;
    expect(got).toEqual([
      r.filtersOnOtherTabs(1), r.filtersOnOtherTabs(3), r.filterDrawer.applyCount(2), r.droppedFilters(1), '1 days late'.replace('1 days', '1 day'), r.overdueBy(4),
      'Due in 1 day', r.usuallyEvery(30), r.noDataHint('Last 7 days'), r.bookingsTab.trendDetail(5, 9, 'week'), r.bookingsTab.trendSteady(4, 'day'),
      r.customersTab.daysAgo(9), r.remove('Hair'), r.perVisit('₹500'),
    ]);
  });

  it('reads in Hindi, including the unit word inside a sentence', () => {
    const got = said('hi', useSentences);
    expect(got[8]).toBe('last 7 days में कोई बुकिंग नहीं। लंबी अवधि आज़माएँ।');
    expect(got[9]).toBe('लगभग 5 प्रति हफ़्ता से लगभग 9 तक');
    expect(got[10]).toBe('हर समय लगभग 4 प्रति दिन');
    expect(got.join(' ')).not.toMatch(/filter is|days late|Due in|Usually every/);
  });
});
