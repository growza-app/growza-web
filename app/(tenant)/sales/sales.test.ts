import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Appointment } from '../lib/api';
import {
  buildSaleRows,
  buildSalesChart,
  buildSalesCsv,
  clampSalesDateRange,
  computeSalesKpis,
  filterSalesByWindow,
  filterSalesRows,
  MAX_ROW_PRODUCTS,
  MAX_SALES_DATE_YEARS,
  MAX_SALES_EXPORT_ROWS,
} from './SalesClient';
import { PAGE_SIZE } from '../components/Pagination';

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
    expect(filterSalesByWindow(rows, 'last_30_days', '2026-10-16', ['loc-1', 'loc-2']).map((r) => r.key)).toEqual([
      'g1',
      'g2',
      'g3',
    ]);
    expect(filterSalesByWindow(rows, 'last_30_days', '2026-10-16', ['loc-2']).map((r) => r.key)).toEqual(['g2']);
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
        mkAppointment({
          id: 'karan-row',
          bookingGroupId: 'g3',
          customerName: 'Karan Kapoor',
          customerPhone: '+919811122233',
          serviceName: 'Beard Trim',
          products: [{ productId: 'p1', name: 'Argan Oil 100ml', priceMinor: '45000', qty: 1, paidMinor: '45000' }],
        }),
      ],
      'Asia/Kolkata',
    );

    expect(filterSalesRows(rows, 'products', '').map((r) => r.key)).toEqual(['g1', 'g3']);
    expect(filterSalesRows(rows, 'services', '').map((r) => r.key)).toEqual(['g1', 'g2', 'g3']);
    expect(filterSalesRows(rows, 'all', 'Argan').map((r) => r.key)).toEqual(['g1', 'g3']);
    expect(filterSalesRows(rows, 'all', 'karan').map((r) => r.key)).toEqual(['g3']);
    expect(filterSalesRows(rows, 'products', 'karan').map((r) => r.key)).toEqual(['g3']);
    expect(filterSalesRows(rows, 'all', '33445').map((r) => r.key)).toEqual(['g2']);
    expect(filterSalesRows(rows, 'all', 'Keratin').map((r) => r.key)).toEqual(['g2']);
    expect(
      filterSalesRows(rows, 'all', '', { selectedClients: ['Karan Kapoor|+919811122233'] }).map((r) => r.key),
    ).toEqual(['g3']);
    expect(filterSalesRows(rows, 'all', '', { clientQuery: '11222' }).map((r) => r.key)).toEqual(['g3']);
    expect(filterSalesRows(rows, 'all', '', { selectedItems: ['srv:Keratin Spa'] }).map((r) => r.key)).toEqual(['g2']);
    expect(filterSalesRows(rows, 'products', '', { selectedItems: ['prd:Argan Oil 100ml'] }).map((r) => r.key)).toEqual(
      ['g1', 'g3'],
    );
    expect(filterSalesRows(rows, 'all', '', { selectedServices: ['Keratin Spa'] }).map((r) => r.key)).toEqual(['g2']);
    expect(filterSalesRows(rows, 'all', '', { selectedProducts: ['Argan Oil 100ml'] }).map((r) => r.key)).toEqual([
      'g1',
      'g3',
    ]);
    expect(
      filterSalesRows(rows, 'all', '', {
        selectedServices: ['Haircut'],
        selectedProducts: ['Argan Oil 100ml'],
      }).map((r) => r.key),
    ).toEqual(['g1']);
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

  it('Jira GRW-576 — includes product-only sales on /sales and renders them with zero servicesMinor', () => {
    const salesPage = here('./page.tsx');
    const summary = here('../components/BookingSummary.tsx');
    expect(salesPage).toContain('{ includeSales: true }');
    expect(summary).toContain('serviceLegs.length > 0');

    const rows = buildSaleRows(
      [
        mkAppointment({
          id: 'sale-1',
          bookingGroupId: null,
          serviceId: null,
          serviceName: '',
          priceMinor: null,
          paidAmountMinor: null,
          providerId: null,
          providerName: null,
          customerName: 'Asha',
          paymentMode: 'upi',
          products: [{ productId: 'p1', name: 'Argan Oil 100ml', priceMinor: '45000', qty: 2, paidMinor: '90000' }],
        }),
      ],
      'Asia/Kolkata',
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!).toMatchObject({
      key: 'single:sale-1',
      clientName: 'Asha',
      serviceNames: [],
      staffNames: [],
      servicesMinor: 0,
      productsMinor: 90000,
      totalMinor: 90000,
      productUnits: 2,
      paymentModes: ['upi'],
    });
    expect(filterSalesRows(rows, 'products', '').map((r) => r.key)).toEqual(['single:sale-1']);
    expect(filterSalesRows(rows, 'services', '')).toEqual([]);
  });

  it('clamps date selection to a maximum 5-year window and leap-day safe minISO', () => {
    expect(MAX_SALES_DATE_YEARS).toBe(5);
    const bounds = clampSalesDateRange('2015-01-01', '2027-01-01', '2026-10-16');
    expect(bounds).toEqual({
      fromISO: '2021-10-16',
      toISO: '2026-10-16',
      minISO: '2021-10-16',
      maxISO: '2026-10-16',
    });

    // Leap day Feb 29 clamps safely to Feb 28 in non-leap year 5 years prior
    const leapBounds = clampSalesDateRange('2018-01-01', '2024-02-29', '2024-02-29');
    expect(leapBounds.minISO).toBe('2019-02-28');
    expect(leapBounds.fromISO).toBe('2019-02-28');
  });

  it('builds CSV in a single pass with formula-injection safety and enforces MAX_SALES_EXPORT_ROWS cap', () => {
    expect(MAX_SALES_EXPORT_ROWS).toBe(5000);
    const rows = buildSaleRows(
      [
        mkAppointment({
          id: 'csv-1',
          bookingGroupId: 'g-csv-1',
          locationId: 'loc-1',
          customerName: '=HYPERLINK("http://evil")',
          customerPhone: '+919876543210',
          serviceName: 'Haircut',
          providerName: 'Priya',
          paidAmountMinor: '50000',
          paymentMode: 'upi',
          products: [{ productId: 'p1', name: 'Serum', priceMinor: '45000', qty: 2, paidMinor: '90000' }],
        }),
        mkAppointment({
          id: 'csv-2',
          bookingGroupId: 'g-csv-2',
          locationId: 'loc-2',
          customerName: 'Rohan',
          startAt: '2026-10-16T04:00:00.000Z',
          paidAmountMinor: '30000',
          paymentMode: 'cash',
        }),
      ],
      'Asia/Kolkata',
    );

    const branchMap = new Map([
      ['loc-1', 'MG Road'],
      ['loc-2', 'Indiranagar'],
    ]);
    const res = buildSalesCsv(
      rows,
      'Asia/Kolkata',
      {
        when: 'When',
        client: 'Client',
        phone: 'Phone',
        branch: 'Branch',
        services: 'Services',
        products: 'Products',
        staff: 'Staff',
        payment: 'Payment',
        total: 'Total',
      },
      (modes) => modes.join(' + '),
      branchMap,
      1, // Test explicit row limit cap = 1
    );

    expect(res.exportedCount).toBe(1);
    expect(res.capped).toBe(true);
    const lines = res.csv.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('When,Client,Phone,Branch,Services,Products,Staff,Payment,Total');
    // Formula injection defused with leading apostrophe + quotes, total in major units (1400.00)
    expect(lines[1]).toContain('"\'=HYPERLINK(""http://evil"")"');
    expect(lines[1]).toContain('MG Road,Haircut,Serum x2,Priya,upi,1400.00');

    const prdOnlyRes = buildSalesCsv(
      rows,
      'Asia/Kolkata',
      {
        when: 'When',
        client: 'Client',
        phone: 'Phone',
        services: 'Services',
        products: 'Products',
        staff: 'Staff',
        payment: 'Payment',
        total: 'Total',
      },
      (modes) => modes.join(' + '),
      undefined,
      10,
      'products',
    );
    expect(prdOnlyRes.csv.split('\n')[1]).toContain(',900.00');
  });

  it('paginates auto-compact table after PAGE_SIZE (10) rows, places Export CSV on top-right of table, and shows branch picker on Record payment at all widths', () => {
    const client = here('./SalesClient.tsx');
    const page = here('./page.tsx');
    const css = here('../styles/99-sales.css');
    const hbpCss = here('../styles/94-header-branch-picker.css');

    expect(PAGE_SIZE).toBe(10);
    expect(MAX_ROW_PRODUCTS).toBe(2);
    expect(client).toContain('products: windowRows.reduce((sum, r) => sum + r.productUnits, 0)');
    expect(client).toContain('services: windowRows.reduce((sum, r) => sum + r.serviceNames.length, 0)');
    expect(client).toContain("const showServicesCol = filter !== 'products'");
    expect(client).toContain("const showProductsCol = filter !== 'services'");
    expect(client).toContain("const showStaffCol = filter === 'services'");
    expect(client).toContain('row.products.slice(0, MAX_ROW_PRODUCTS)');
    expect(client).toContain("t('moreProducts', { n: hiddenProducts })");
    expect(client).toContain('summarizeServices(row.serviceNames, locale)');
    expect(client).toContain('filterSalesByDateRange(allSaleRows, fromDate, toDate, effectiveBranches)');
    expect(client).toContain('clampSalesDateRange(nextFrom, nextTo, todayISO)');
    expect(page).toContain('clampSalesDateRange(rawFrom, rawTo, todayISO)');
    expect(client).toContain('min={minDateISO}');
    expect(client).toContain('max={todayISO}');
    expect(client).toContain('className="sls-table-head-bar"');
    expect(client).toContain('className="btn btn-ghost btn-sm sls-export-btn"');
    expect(client).toContain("phone: t('cols.phone')");
    expect(client).toContain('pageSize={PAGE_SIZE}');
    expect(client).toContain("t('branchFilter')");
    expect(client).toContain("e.target.closest('.sls-dd')");
    expect(client).toContain("document.addEventListener('pointerdown', onOutside, true)");
    expect(client).not.toContain('if (row.dayISO === todayISO) return time;');
    expect(css).toContain('border: 1px solid var(--border)');
    expect(css).toContain('overflow-y: auto;');
    expect(css).toContain('position: sticky;');
    expect(css).toContain('flex: 0 1 auto;');
    expect(css).not.toContain('var(--line)');
    expect(css).not.toContain('var(--card)');
    expect(hbpCss).toMatch(/\.pf-head-stack \.hbp-line \{\s*display: inline-flex;/);
  });

  it('builds stacked Sales trend buckets by hour on a single day, by day up to 31 days, and by month beyond 31 days', () => {
    const rows = buildSaleRows(
      [
        mkAppointment({
          id: 'ch-1',
          bookingGroupId: 'g-ch-1',
          startAt: '2026-10-16T05:25:00.000Z', // 10:55 AM IST (hour 10)
          paidAmountMinor: '60000',
          products: [{ productId: 'p1', name: 'Serum', priceMinor: '40000', qty: 1, paidMinor: '40000' }],
        }),
        mkAppointment({
          id: 'ch-2',
          bookingGroupId: 'g-ch-2',
          startAt: '2026-10-17T08:00:00.000Z', // 1:30 PM IST (hour 13)
          paidAmountMinor: '120000',
          products: [],
        }),
      ],
      'Asia/Kolkata',
    );

    // 1. Single day -> hourly mode
    const singleDayRows = rows.filter((r) => r.dayISO === '2026-10-16');
    const hourly = buildSalesChart(singleDayRows, '2026-10-16', '2026-10-16', 'Asia/Kolkata', 'all', 'en');
    expect(hourly.mode).toBe('hourly');
    expect(hourly.buckets).toHaveLength(13); // 9a..9p
    expect(hourly.maxTotalMinor).toBe(100000);
    const h10 = hourly.buckets.find((b) => b.key === 'h-10');
    expect(h10).toMatchObject({
      label: '10a',
      servicesMinor: 60000,
      productsMinor: 40000,
      totalMinor: 100000,
      billsCount: 1,
    });

    // Filter = products only counts product revenue
    const hourlyProducts = buildSalesChart(singleDayRows, '2026-10-16', '2026-10-16', 'Asia/Kolkata', 'products', 'en');
    expect(hourlyProducts.maxTotalMinor).toBe(40000);
    expect(hourlyProducts.buckets.find((b) => b.key === 'h-10')?.servicesMinor).toBe(0);

    // 2. Multi-day (<= 31 days) -> daily mode
    const daily = buildSalesChart(rows, '2026-10-15', '2026-10-17', 'Asia/Kolkata', 'all', 'en');
    expect(daily.mode).toBe('daily');
    expect(daily.buckets).toHaveLength(3);
    expect(daily.buckets.map((b) => b.totalMinor)).toEqual([0, 100000, 120000]);
    expect(daily.peakIndex).toBe(2);

    // 3. Long range (> 31 days) -> monthly mode
    const monthly = buildSalesChart(rows, '2026-08-01', '2026-10-17', 'Asia/Kolkata', 'all', 'en');
    expect(monthly.mode).toBe('monthly');
    expect(monthly.buckets.map((b) => b.key)).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(monthly.buckets[2]?.totalMinor).toBe(220000);

    // Source pins for collapsible chart card
    const client = here('./SalesClient.tsx');
    expect(client).toContain('className="sls-chart-card"');
    expect(client).toContain('aria-expanded={chartOpen}');
    expect(client).toContain('buildSalesChart(filteredRows, fromDate, toDate, timezone, filter, locale)');
  });
});
