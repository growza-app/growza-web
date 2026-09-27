import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import en from '../../../messages/en.json';
import type { Appointment, Offer, Service } from '../lib/api-types';
import { CheckoutSheet } from './CheckoutSheet';
import { LabelsProvider } from './LabelsProvider';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

/**
 * Jira GRW-380 — the till offers the visit's own branch's menu, at its prices.
 *
 * The Booking sheet hands the till every branch's services and combos. MG Road's till listed Indiranagar's
 * Haircut at Indiranagar's price beside its own, and a combo made of Indiranagar's services.
 */
const MG = 'b-mg';
const IND = 'b-ind';
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
  locationId: MG,
} as unknown as Appointment;

const services = [
  { id: 'mg-cut', name: 'Haircut', priceMinor: '30000', durationMin: 30, locationId: MG },
  { id: 'mg-beard', name: 'Beard Trim', priceMinor: '15000', durationMin: 20, locationId: MG },
  { id: 'ind-cut', name: 'Hair Spa', priceMinor: '40000', durationMin: 30, locationId: IND },
] as unknown as Service[];
const offers = [
  { id: 'o-mg', title: 'MG combo', comboPriceMinor: '40000', active: true, serviceIds: ['mg-cut', 'mg-beard'] },
  { id: 'o-ind', title: 'IND combo', comboPriceMinor: '55000', active: true, serviceIds: ['ind-cut'] },
] as unknown as Offer[];

const render = (visit: Appointment) =>
  renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale: 'en',
      messages: en,
      timeZone: 'Asia/Kolkata',
      children: createElement(LabelsProvider, {
        labels: {},
        children: createElement(CheckoutSheet, { appointment: visit, services, providers: [], offers, timezone: 'Asia/Kolkata', onClose: () => {} }),
      }),
    }),
  );

describe('the till at MG Road', () => {
  it('lists MG Road’s services and combos only', () => {
    const html = render(appointment);
    expect(html).toContain('value="svc:mg-cut"');
    expect(html).toContain('value="svc:mg-beard"');
    expect(html).toContain('value="offer:o-mg"');
    expect(html).not.toContain('svc:ind-cut');
    expect(html).not.toContain('offer:o-ind');
  });

  it('a visit with no branch on it (one-branch business) lists everything, as before', () => {
    const html = render({ ...appointment, locationId: undefined } as unknown as Appointment);
    expect(html).toContain('svc:ind-cut');
    expect(html).toContain('offer:o-ind');
  });
});
