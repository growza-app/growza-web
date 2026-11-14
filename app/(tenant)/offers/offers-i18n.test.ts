import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import type { Offer, Service } from '../lib/api';
import { OffersList } from './OffersList';
import { CreateOfferMenu, OfferModal } from './CreateOfferMenu';
import { readFileSync, readdirSync } from 'node:fs';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

/** Jira GRW-358 — the Offers screens render in both languages from the real components. */
const wrap = (locale: 'en' | 'hi', child: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(
    createElement(NextIntlClientProvider, { locale, messages: locale === 'en' ? en : hi, timeZone: 'Asia/Kolkata', children: child }),
  );

const services = [{ id: 's1', name: 'Haircut', durationMin: 30, priceMinor: '30000', currency: 'INR', categoryName: null, imageUrl: null }] as unknown as Service[];

/**
 * Jira GRW-438 — announcements only. Both rows here have no `comboPriceMinor`, because a row that has one is a
 * package and `/offers` no longer lists it; the builder's own languages are checked in `packages-i18n.test.ts`.
 */
const offers = [
  { id: 'o1', title: 'Weekend glow', description: null, active: true, serviceIds: ['s1'], comboPriceMinor: null, visibleWeekdays: [0, 6], visibleFrom: null, visibleUntil: null, bookingsCount: 2, revenueMinor: '50000' },
  { id: 'o2', title: '20% off', description: 'This week', active: false, serviceIds: [], comboPriceMinor: null, visibleWeekdays: null, visibleFrom: null, visibleUntil: null, bookingsCount: 0, revenueMinor: '0' },
] as unknown as Offer[];

describe('the offers list and menu', () => {
  const list = (l: 'en' | 'hi') => wrap(l, createElement(OffersList, { offers, services }));

  it('says the weekday rule in each language', () => {
    expect(list('en')).toContain('Only on: Sun, Sat');
    expect(list('hi')).toContain('सिर्फ़ इन दिनों:');
    expect(list('hi')).not.toMatch(/Active|Inactive|Bookings/);
  });

  /**
   * The tabs were All / Offers / Combos. With packages on their own screen there is one kind of row left here,
   * and a tab strip of one is a control that cannot be used — so it went with them.
   */
  it('offers no kind-of-row tabs any more', () => {
    const html = list('en');
    expect(html).not.toContain('Combos');
    expect(html).not.toMatch(/class="tabs"/);
  });

  it('translates the create button', () => {
    expect(wrap('en', createElement(CreateOfferMenu))).toContain('Create offer');
    expect(wrap('hi', createElement(CreateOfferMenu))).toContain('ऑफ़र बनाएँ');
  });

  /** It opens the announcement modal directly now, rather than a dropdown holding a single row. */
  it('the create control is a button, not a menu of one', () => {
    expect(wrap('en', createElement(CreateOfferMenu))).not.toContain('dropdown-panel');
  });

  /**
   * QA 2026-11-14 — Edit went to `/offers/<id>/edit`, a page GRW-438 had moved to `/packages`. It opens the
   * create box filled in now, and nothing links to the missing page.
   */
  describe('editing an offer', () => {
    const edit = (l: 'en' | 'hi') => wrap(l, createElement(OfferModal, { offer: offers[1], onClose: () => {} }));

    it('opens the same box, filled in, in each language', () => {
      const html = edit('en');
      expect(html).toContain('Edit offer');
      expect(html).toContain('value="20% off"');
      expect(html).toContain('value="This week"');
      expect(html).toContain('Save changes');
      expect(html).not.toContain('Create offer');
      expect(edit('hi')).toContain('ऑफ़र बदलें');
      expect(edit('hi')).toContain('बदलाव सेव करें');
    });

    it('does not offer to move the offer to another branch — the API refuses that', () => {
      expect(edit('en')).not.toContain('offer-branch');
    });

    it('links to no /offers/<id>/edit page, because there is none', () => {
      expect(readdirSync(new URL('.', import.meta.url))).not.toContain('[id]');
      const list = readFileSync(new URL('./OffersList.tsx', import.meta.url), 'utf8');
      expect(list).not.toMatch(/\/offers\/\$\{/);
      expect(list).toContain('setEditing(offer)');
    });
  });
});
