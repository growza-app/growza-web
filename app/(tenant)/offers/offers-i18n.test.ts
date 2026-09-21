import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import type { Offer, Service } from '../lib/api';
import { ComboBuilder } from './ComboBuilder';
import { OffersList } from './OffersList';
import { CreateOfferMenu } from './CreateOfferMenu';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

/** Jira GRW-358 — the Offers screens render in both languages from the real components. */
const wrap = (locale: 'en' | 'hi', child: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(
    createElement(NextIntlClientProvider, { locale, messages: locale === 'en' ? en : hi, timeZone: 'Asia/Kolkata', children: child }),
  );

const services = [{ id: 's1', name: 'Haircut', durationMin: 30, priceMinor: '30000', currency: 'INR', categoryName: null, imageUrl: null }] as unknown as Service[];
const offers = [
  { id: 'o1', title: 'Weekend glow', description: null, active: true, serviceIds: ['s1'], comboPriceMinor: '25000', visibleWeekdays: [0, 6], visibleFrom: null, visibleUntil: null, bookingsCount: 2, revenueMinor: '50000' },
  { id: 'o2', title: '20% off', description: 'This week', active: false, serviceIds: [], comboPriceMinor: null, visibleWeekdays: null, visibleFrom: null, visibleUntil: null, bookingsCount: 0, revenueMinor: '0' },
] as unknown as Offer[];

describe('the combo builder', () => {
  const build = (l: 'en' | 'hi') => wrap(l, createElement(ComboBuilder, { services }));
  it('keeps the English words', () => {
    const html = build('en');
    for (const s of ['Create a new combo', 'Save as draft', 'Next: Rules &amp; availability →', '1. Combo details', 'Combo name *', 'Search 1 services…', 'Original price', 'Flat ₹']) expect(html, s).toContain(s);
  });
  it('reads in Hindi', () => {
    const html = build('hi');
    for (const s of ['नया कॉम्बो बनाएँ', 'ड्राफ़्ट में सेव करें', 'आगे: नियम और उपलब्धता →', '1. कॉम्बो की जानकारी', 'कॉम्बो का नाम *', '1 सेवाओं में खोजें…', 'असली कीमत']) expect(html, s).toContain(s);
    for (const s of ['Save as draft', 'Combo details', 'Original price', 'Pricing']) expect(html, s).not.toContain(s);
  });
});

describe('the offers list and menu', () => {
  const list = (l: 'en' | 'hi') => wrap(l, createElement(OffersList, { offers, services }));
  it('says the weekday rule and the counts in each language', () => {
    expect(list('en')).toContain('Only on: Sun, Sat');
    expect(list('en')).toContain('All (2)');
    expect(list('hi')).toContain('सिर्फ़ इन दिनों:');
    expect(list('hi')).toContain('सभी (2)');
    expect(list('hi')).not.toMatch(/Combos|Active|Inactive|Bookings/);
  });
  it('translates the create menu', () => {
    expect(wrap('en', createElement(CreateOfferMenu))).toContain('Create offer');
    expect(wrap('hi', createElement(CreateOfferMenu))).toContain('ऑफ़र बनाएँ');
  });
});
