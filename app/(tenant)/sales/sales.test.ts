import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Appointment } from '../lib/api';
import {
  buildSaleRows,
  computeSalesKpis,
  filterSalesByWindow,
  filterSalesRows,
} from './SalesClient';

const here = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');

function mkAppointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: 'apt-1',
    bookingGroupId: 'grp-1',
    locationId: 'loc-1',
    serviceId: 'srv-1',
    serviceName: 'Haircut',
    providerId: 'prv-1',
    providerName: 'Priya',
    customerName: 'Receipt Test',
    customerPhone: '+919876543210',
    customerIsNew: false,
    startAt: '2026-10-16T05:25:00.000Z',
    endAt: '2026-10-16T05:55:00.000Z',
    status: 'completed',
    createdVia: 'dashboard',
    reminderSent: false,
    priceMinor: '50000',
    paidAmountMinor: '50000',
    paymentMode: 'upi',
    offerTitle: null,
    comboPriceMinor: null,
    products: [],
    payments: [],
    ...overrides,
  };
}

describe('Jira GRW-581 — Sales register (/sales)', () => {
  it('groups multi-service visits with sold products and computes combined total', () => {
    const rows = buildSaleRows(
      [
        mkAppointment({
          id: 'apt-1',
          bookingGroupId: 'grp-1',
          serviceName: 'Haircut',
          paidAmountMinor: '50000',
          products: [{ productId: 'prd-1', name: 'Argan Oil 100ml', priceMinor: '45000', qty: 2, paidMinor: '90000' }],
          payments: [
            { mode: 'upi', amountMinor: '100000' },
            { mode: 'cash', amountMinor: '40000' },
          ],
        }),
        mkAppointment({
          id: 'apt-2',
          bookingGroupId: 'grp-1',
          serviceName: 'Beard Trim',
          paidAmountMinor: '25000',
          products: [{ productId: 'prd-1', name: 'Argan Oil 100ml', priceMinor: '45000', qty: 2, paidMinor: '90000' }],
        }),
        mkAppointment({
          id: 'apt-confirmed',
          bookingGroupId: 'grp-2',
          status: 'confirmed',
          products: [],
        }),
      ],
      'Asia/Kolkata',
    );

    expect(rows).toHaveLength(1);
    const sale = rows[0]!;
    expect(sale.serviceNames).toEqual(['Haircut', 'Beard Trim']);
    expect(sale.servicesMinor).toBe(75000);
    expect(sale.productsMinor).toBe(90000);
    expect(sale.totalMinor).toBe(165000);
    expect(sale.productUnits).toBe(2);
    expect(sale.paymentModes).toEqual(['upi', 'cash']);
  });

  it('filters sales by date window and branch', () => {
    const rows = buildSaleRows(
      [
        mkAppointment({ id: 'today-b1', bookingGroupId: 'g1', startAt: '2026-10-16T06:00:00.000Z', locationId: 'loc-1' }),
        mkAppointment({ id: '3d-b2', bookingGroupId: 'g2', startAt: '2026-10-13T06:00:00.000Z', locationId: 'loc-2' }),
        mkAppointment({ id: '20d-b1', bookingGroupId: 'g3', startAt: '2026-09-25T06:00:00.000Z', locationId: 'loc-1' }),
      ],
      'Asia/Kolkata',
    );

    expect(filterSalesByWindow(rows, 'today', '2026-10-16', null).map((r) => r.key)).toEqual(['g1']);
    expect(filterSalesByWindow(rows, 'last_7_days', '2026-10-16', null).map((r) => r.key)).toEqual(['g1', 'g2']);
    expect(filterSalesByWindow(rows, 'last_30_days', '2026-10-16', 'loc-1').map((r) => r.key)).toEqual(['g1', 'g3']);
  });

  it('filters sales by Products sold vs Services only and searches client, phone, service, or product', () => {
    const rows = buildSaleRows(
      [
        mkAppointment({
          id: 'with-prd',
          bookingGroupId: 'g1',
          customerName: 'Anjali Verma',
          customerPhone: '+919988776655',
          serviceName: 'Haircut',
          products: [{ productId: 'p1', name: 'Argan Oil 100ml', priceMinor: '45000', qty: 1, paidMinor: '45000' }],
        }),
        mkAppointment({
          id: 'srv-only',
          bookingGroupId: 'g2',
          customerName: 'Rohan Mehta',
          customerPhone: '+919112233445',
          serviceName: 'Keratin Spa',
          products: [],
        }),
      ],
      'Asia/Kolkata',
    );

    expect(filterSalesRows(rows, 'products', '').map((r) => r.key)).toEqual(['g1']);
    expect(filterSalesRows(rows, 'services', '').map((r) => r.key)).toEqual(['g2']);
    expect(filterSalesRows(rows, 'all', 'Argan').map((r) => r.key)).toEqual(['g1']);
    expect(filterSalesRows(rows, 'all', '33445').map((r) => r.key)).toEqual(['g2']);
    expect(filterSalesRows(rows, 'all', 'Keratin').map((r) => r.key)).toEqual(['g2']);
  });

  it('computes KPI totals and payment split accurately', () => {
    const rows = buildSaleRows(
      [
        mkAppointment({
          id: 'a1',
          bookingGroupId: 'g1',
          paidAmountMinor: '100000',
          paymentMode: 'upi',
          products: [{ productId: 'p1', name: 'Serum', priceMinor: '45000', qty: 2, paidMinor: '90000' }],
          payments: [
            { mode: 'upi', amountMinor: '150000' },
            { mode: 'cash', amountMinor: '40000' },
          ],
        }),
      ],
      'Asia/Kolkata',
    );

    const kpis = computeSalesKpis(rows);
    expect(kpis.totalSalesMinor).toBe(190000);
    expect(kpis.billsCount).toBe(1);
    expect(kpis.servicesRevenueMinor).toBe(100000);
    expect(kpis.servicesCount).toBe(1);
    expect(kpis.productsRevenueMinor).toBe(90000);
    expect(kpis.productUnitsCount).toBe(2);
    expect(kpis.byMode.upi).toBe(150000);
    expect(kpis.byMode.cash).toBe(40000);
  });

  it('excludes no_show and cancelled legs from servicesMinor and reconciles unrecorded payment modes', () => {
    const rows = buildSaleRows(
      [
        mkAppointment({
          id: 'done-leg',
          bookingGroupId: 'g-mixed',
          status: 'completed',
          serviceName: 'Haircut',
          paidAmountMinor: '50000',
          paymentMode: null,
        }),
        mkAppointment({
          id: 'noshow-leg',
          bookingGroupId: 'g-mixed',
          status: 'no_show',
          serviceName: 'Facial',
          priceMinor: '120000',
          paidAmountMinor: null,
          paymentMode: null,
        }),
      ],
      'Asia/Kolkata',
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.serviceNames).toEqual(['Haircut']);
    expect(rows[0]!.servicesMinor).toBe(50000);
    expect(rows[0]!.totalMinor).toBe(50000);

    const kpis = computeSalesKpis(rows);
    expect(kpis.byMode.notRecorded).toBe(50000);
    expect(
      kpis.byMode.upi + kpis.byMode.cash + kpis.byMode.card + kpis.byMode.other + kpis.byMode.notRecorded,
    ).toBe(kpis.totalSalesMinor);
  });

  it('places Sales in the Sidebar below Bookings and links Home Products sold card to /sales?filter=products', () => {
    const sidebar = here('../components/Sidebar.tsx');
    const ownerHome = here('../components/home/OwnerHome.tsx');
    const summary = here('../components/BookingSummary.tsx');

    expect(sidebar.indexOf("href: '/appointments'")).toBeLessThan(sidebar.indexOf("href: '/sales'"));
    expect(sidebar.indexOf("href: '/sales'")).toBeLessThan(sidebar.indexOf("href: '/customers'"));
    expect(ownerHome).toContain('href="/sales?filter=products"');
    expect(summary).toContain("t('products')");
  });
});
