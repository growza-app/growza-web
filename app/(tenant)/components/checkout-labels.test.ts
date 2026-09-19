import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import type { Appointment, Offer, Service } from '../lib/api-types';
import { CheckoutSheet } from './CheckoutSheet';
import { LabelsProvider } from './LabelsProvider';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

/**
 * Jira GRW-321 — the Mark as done sheet says the business's own nouns.
 *
 * CLAUDE.md: every dashboard-visible noun comes from `ctx.labels`. The sheet wrote "service" and
 * "Services" into its markup, so a clinic (whose service is a "Consultation") read salon words at the
 * till. This renders the sheet, as a salon and as a clinic, and reads what it says.
 */
const appointment = {
  id: 'a1',
  serviceName: 'Haircut',
  priceMinor: '30000',
  providerId: 'p1',
  offerTitle: null,
  comboPriceMinor: null,
  customerName: 'Priya',
  customerPhone: null,
  startAt: '2026-09-19T05:00:00.000Z',
  endAt: '2026-09-19T05:30:00.000Z',
  status: 'confirmed',
} as unknown as Appointment;

const services = [{ id: 's1', name: 'Haircut', priceMinor: '30000', durationMin: 30 }] as unknown as Service[];
const offers = [{ id: 'o1', title: 'Weekly glow', comboPriceMinor: '88000', active: true, serviceIds: ['s1'] }] as unknown as Offer[];

function sheetSays(labels: Record<string, string>, locale: 'en' | 'hi' = 'en') {
  return renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale,
      messages: locale === 'en' ? en : hi,
      timeZone: 'Asia/Kolkata',
      children: createElement(LabelsProvider, {
        labels,
        children: createElement(CheckoutSheet, { appointment, services, providers: [], offers, timezone: 'Asia/Kolkata', onClose: () => {} }),
      }),
    }),
  );
}

describe('the Mark as done sheet, in a business\'s own words', () => {
  it('a clinic reads "Consultation", not "service"', () => {
    const html = sheetSays({ service: 'Consultation', services: 'Consultations' });
    expect(html).toContain('Consultations');
    expect(html).toContain('Select a consultation or combo');
    expect(html).toContain('Add a consultation or a combo');
    expect(html).not.toMatch(/Select a service/i);
    expect(html).not.toMatch(/>Services</);
  });

  it('a salon reads what it always did', () => {
    const html = sheetSays({ service: 'Service', services: 'Services' });
    expect(html).toContain('Select a service or combo');
    expect(html).toContain('Add a service or a combo');
    expect(html).toContain('>Services<');
    expect(html).toContain('label="Combos"');
  });

  it('with no labels at all (the API was down) it still reads, in neutral words', () => {
    const html = sheetSays({});
    expect(html).toContain('Select a service or combo');
  });

  it('in Hindi the sentence is Hindi and still carries the business\'s noun', () => {
    const html = sheetSays({ service: 'Consultation', services: 'Consultations' }, 'hi');
    expect(html).toContain('consultation या कॉम्बो चुनें');
    expect(html).not.toContain('Select a');
  });

  it('a vertical may name its combo too', () => {
    const html = sheetSays({ service: 'Service', services: 'Services', combo: 'Package', combos: 'Packages' });
    expect(html).toContain('Select a service or package');
    expect(html).toContain('label="Packages"');
  });
});
