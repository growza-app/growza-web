import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import { useClientCardCopy, useMoveCopy, useNewVisitCopy } from './use-copy';

/** Jira GRW-362 — the New booking flow's words, read through the same hooks the screens use. */
function said(locale: 'en' | 'hi', pick: () => string[]) {
  const Probe = () => createElement('p', null, pick().join('|'));
  return renderToStaticMarkup(
    createElement(NextIntlClientProvider, { locale, messages: locale === 'en' ? en : hi, children: createElement(Probe) }),
  ).replace(/<\/?p>/g, '').replace(/&#x27;/g, "'");
}
const flow = () => {
  const nv = useNewVisitCopy();
  const mv = useMoveCopy();
  const cc = useClientCardCopy();
  return [
    nv.title, nv.visits(1), nv.visits(3), nv.freeCount(0), nv.freeCount(4), nv.searchServices(0), nv.searchServices(52),
    nv.startsNow(45), nv.token(7), nv.reclaimOffer('Priya', 12), nv.whoIsThis('client'), nv.withWhom('stylist'),
    mv.moved('Mon 10:00'), mv.withWhom('stylist'), cc.rows.lastVisit, cc.daysAgo(0), cc.daysAgo(1), cc.daysAgo(5), cc.dueIn(1), cc.dueIn(9), cc.overdue(2),
  ];
};

describe('the New booking flow words', () => {
  it('keeps the English exactly', () => {
    expect(said('en', flow).split('|')).toEqual([
      'Walk-in', '1 visit', '3 visits', 'nobody free', '4 free', 'Search services…', 'Search 52 services or combos…',
      'Starts now · 45 min in total', 'Token 7', "Priya hasn't turned up (12 min) — use this chair", 'Search for the client, or add them.', 'Which stylist?',
      'Moved to Mon 10:00', 'Same stylist?', 'Last in', 'today', 'yesterday', '5 days ago', 'tomorrow', 'in about 9 days', '2 days late',
    ]);
  });

  it('reads in Hindi, and swaps the vertical noun for a generic one', () => {
    const out = said('hi', flow).split('|');
    expect(out[0]).toBe('वॉक-इन');
    expect(out[3]).toBe('कोई खाली नहीं');
    expect(out[6]).toBe('52 सेवाओं या कॉम्बो में खोजें…');
    expect(out[7]).toBe('अभी शुरू · कुल 45 मिनट');
    // "client" / "stylist" are English vertical words; other languages use the generic Hindi noun
    expect(out[10]).toBe('ग्राहक को खोजें, या नया जोड़ें।');
    expect(out[11]).toBe('कौन सा स्टाफ़?');
    expect(out.join('')).not.toMatch(/client|stylist|min in total/i);
  });
});
