import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import type { Offer, Service } from '../lib/api';
import { PackageBuilder } from './PackageBuilder';
import { PackagesList } from './PackagesList';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

/** Jira GRW-358 · GRW-438 — the Packages screens render in both languages from the real components. */
const wrap = (locale: 'en' | 'hi', child: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(
    createElement(NextIntlClientProvider, { locale, messages: locale === 'en' ? en : hi, timeZone: 'Asia/Kolkata', children: child }),
  );

const services = [
  { id: 's1', name: 'Haircut', durationMin: 30, priceMinor: '30000', currency: 'INR', categoryName: null, imageUrl: null },
  { id: 's2', name: 'Facial', durationMin: 45, priceMinor: '80000', currency: 'INR', categoryName: null, imageUrl: null },
] as unknown as Service[];

const packages = [
  { id: 'p1', title: 'Glow Up', description: null, active: true, serviceIds: ['s1', 's2'], comboPriceMinor: '90000', visibleWeekdays: null, visibleFrom: null, visibleUntil: null, bookingsCount: 3, revenueMinor: '270000' },
] as unknown as Offer[];

describe('the package builder', () => {
  const build = (l: 'en' | 'hi') => wrap(l, createElement(PackageBuilder, { services }));

  /**
   * The words the owner reads. This is the test that would have caught shipping a screen called Packages whose
   * builder still said "Combo name *" — which is what moving it out of Offers was for.
   */
  it('says package, never combo', () => {
    const html = build('en');
    for (const s of ['Create a new package', '1. Package details', 'Package name *', 'Original price', 'Flat ₹'])
      expect(html, s).toContain(s);
    expect(html).not.toMatch(/combo/i);
  });

  it('reads in Hindi, and says पैकेज', () => {
    const html = build('hi');
    for (const s of ['नया पैकेज बनाएँ', '1. पैकेज की जानकारी', 'पैकेज का नाम *']) expect(html, s).toContain(s);
    for (const s of ['Save as draft', 'Package details', 'Original price', 'Pricing']) expect(html, s).not.toContain(s);
    expect(html).not.toContain('कॉम्बो');
  });

  /** Jira GRW-438 — the third mode is offered in both languages, beside the two that already existed. */
  it('offers all three ways to price it', () => {
    expect(build('en')).toContain('Sum of parts');
    expect(build('hi')).toContain('जोड़ की कीमत');
  });
});

describe('the packages list', () => {
  const list = (l: 'en' | 'hi') => wrap(l, createElement(PackagesList, { packages, services }));

  it('shows what is inside a package, its time and what it saves', () => {
    const html = list('en');
    expect(html).toContain('Glow Up');
    expect(html).toContain('Haircut + Facial');
    // 30 + 45, and ₹1,100 of parts sold for ₹900. Jira GRW-446 — said in hours once it passes one, because
    // "75 min" is not how anybody reads an hour and a quarter.
    expect(html).toContain('1 hr 15 min');
    expect(html).toContain('Save ');
  });

  it('reads in Hindi', () => {
    const html = list('hi');
    expect(html).toContain('मिनट');
    expect(html).not.toMatch(/Package|Price|Time/);
  });
});
