import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Appointment } from '../lib/api';
import {
  buildSaleRows,
  buildSalesChart,
  buildSalesCsv,
  clampSalesDateRange,
  computeDeltaPct,
  computeReturnWindow,
  computeSalesKpis,
  computeSalesQuickStats,
  DEFAULT_PRODUCT_RETURN_WINDOW_DAYS,
  filterSalesByWindow,
  filterSalesRows,
  findProductLineByCode,
  formatAxisRupees,
  lineNetPaidMinor,
  lineRefundMinorForQty,
  lineRemainingQty,
  MAX_ROW_PRODUCTS,
  MAX_SALES_DATE_YEARS,
  MAX_SALES_EXPORT_ROWS,
  visitKeyFromGroupKey,
} from './SalesClient';
import { PAGE_SIZE } from '../components/Pagination';
import {
  buildSelectAllQtyMap,
  computeReturnSelection,
  defaultRefundMode,
  formatBillRef,
  newRequestId,
  requestIdFor,
} from './sales-helpers';

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
    expect(ownerHome).toContain('/sales?filter=products&${salesQuerySuffix}');
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
    expect(client).toContain("const showStaffCol = filter !== 'products'");
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
    expect(css).toContain('flex-shrink: 0;');
    expect(css).not.toContain('flex: 0 1 auto;');
    expect(css).not.toContain('var(--line)');
    expect(css).not.toContain('var(--card)');
    expect(client).toContain('sls-clear-filters-btn');
    expect(client).toContain('onClick={clearAllFilters}');
    expect(client).toContain("t('clearAllFilters')");
    expect(client).toContain('is-tick-hidden');
    expect(css).toContain('.sls-clear-filters-btn');
    expect(css).toContain('border: 1px solid #c9d0cb;');
    expect(css).toContain('width: 340px;');
    expect(css).toContain('.sls-chart-bars.is-dense');
    expect(css).toContain('.sls-chart-lbl.is-tick-hidden');
    expect(hbpCss).toMatch(/\.pf-head-stack \.hbp-line \{\s*display: inline-flex;/);
  });

  it('builds stacked Sales trend buckets synced with [fromISO, toISO] by day up to 31 days and by month beyond 31 days', () => {
    const rows = buildSaleRows(
      [
        mkAppointment({
          id: 'ch-1',
          bookingGroupId: 'g-ch-1',
          startAt: '2026-10-16T05:25:00.000Z',
          paidAmountMinor: '60000',
          products: [{ productId: 'p1', name: 'Serum', priceMinor: '40000', qty: 1, paidMinor: '40000' }],
        }),
        mkAppointment({
          id: 'ch-2',
          bookingGroupId: 'g-ch-2',
          startAt: '2026-10-17T08:00:00.000Z',
          paidAmountMinor: '120000',
          products: [],
        }),
      ],
      'Asia/Kolkata',
    );

    // 1. Single day (From === To) -> daily mode for that date with matching rangeLabel
    const singleDay = buildSalesChart(rows, '2026-10-16', '2026-10-16', 'Asia/Kolkata', 'all', 'en');
    expect(singleDay.mode).toBe('daily');
    expect(singleDay.rangeLabel).toBe('16 Oct');
    expect(singleDay.buckets).toHaveLength(1);
    expect(singleDay.buckets[0]).toMatchObject({
      key: '2026-10-16',
      label: '16 Oct',
      servicesMinor: 60000,
      productsMinor: 40000,
      totalMinor: 100000,
      billsCount: 1,
    });

    // Filter = products only counts product revenue and product bills
    const singleDayProducts = buildSalesChart(rows, '2026-10-16', '2026-10-16', 'Asia/Kolkata', 'products', 'en');
    expect(singleDayProducts.maxTotalMinor).toBe(40000);
    expect(singleDayProducts.buckets[0]?.servicesMinor).toBe(0);
    expect(singleDayProducts.buckets.reduce((s, b) => s + b.billsCount, 0)).toBe(1);

    // 2. Multi-day (<= 31 days) -> daily mode, bucket sum === KPI total
    const kpis = computeSalesKpis(rows);
    const daily = buildSalesChart(rows, '2026-10-15', '2026-10-17', 'Asia/Kolkata', 'all', 'en');
    expect(daily.mode).toBe('daily');
    expect(daily.rangeLabel).toBe('15 Oct – 17 Oct');
    expect(daily.buckets.map((b) => b.label)).toEqual(['15 Oct', '16 Oct', '17 Oct']);
    expect(daily.buckets.map((b) => b.totalMinor)).toEqual([0, 100000, 120000]);
    expect(daily.buckets.reduce((s, b) => s + b.totalMinor, 0)).toBe(kpis.totalSalesMinor);
    expect(daily.buckets.reduce((s, b) => s + b.servicesMinor, 0)).toBe(kpis.servicesRevenueMinor);
    expect(daily.buckets.reduce((s, b) => s + b.productsMinor, 0)).toBe(kpis.productsRevenueMinor);
    expect(daily.peakIndex).toBe(2);
    expect(daily.yTicks).toHaveLength(5);
    expect(daily.yMaxMinor).toBeGreaterThanOrEqual(daily.maxTotalMinor);
    expect(formatAxisRupees(2000000)).toBe('₹20K');
    expect(formatAxisRupees(0)).toBe('₹0');

    // Quick stats computation
    const qs = computeSalesQuickStats(rows, rows.slice(1));
    expect(qs.avgBillMinor).toBe(110000);
    expect(qs.avgBillDeltaPct).toBe(10);
    expect(qs.clientsCount).toBe(1);
    expect(qs.topService).toEqual({ name: 'Haircut', count: 2 });
    expect(qs.topProduct).toEqual({ name: 'Serum', units: 1 });
    expect(computeDeltaPct(110, 100)).toBe(10);
    expect(computeDeltaPct(100, 0)).toBeNull();

    // 3. 32..92 days (up to 3 months) -> weekly mode (7-day chunks bounded to [From, To])
    const weekly = buildSalesChart(rows, '2026-08-01', '2026-10-17', 'Asia/Kolkata', 'all', 'en');
    expect(weekly.mode).toBe('weekly');
    expect(weekly.rangeLabel).toBe('1 Aug – 17 Oct');
    expect(weekly.buckets).toHaveLength(12);
    expect(weekly.buckets[0]?.key).toBe('2026-08-01..2026-08-07');
    expect(weekly.buckets[11]?.key).toBe('2026-10-17..2026-10-17');
    expect(weekly.buckets.reduce((s, b) => s + b.totalMinor, 0)).toBe(220000);

    // 4. 93..730 days (> 3 months up to 2 years, e.g. 1 year) -> monthly mode
    const monthly = buildSalesChart(rows, '2025-11-01', '2026-10-17', 'Asia/Kolkata', 'all', 'en');
    expect(monthly.mode).toBe('monthly');
    expect(monthly.rangeLabel).toBe("1 Nov '25 – 17 Oct '26");
    expect(monthly.buckets).toHaveLength(12);
    expect(monthly.buckets[0]?.key).toBe('2025-11');
    expect(monthly.buckets[11]?.key).toBe('2026-10');
    expect(monthly.buckets[11]?.totalMinor).toBe(220000);

    // 5. > 730 days (> 2 years) -> yearly mode
    const yearly = buildSalesChart(rows, '2023-01-01', '2026-10-17', 'Asia/Kolkata', 'all', 'en');
    expect(yearly.mode).toBe('yearly');
    expect(yearly.buckets.map((b) => b.key)).toEqual(['2023', '2024', '2025', '2026']);
    expect(yearly.buckets[3]?.totalMinor).toBe(220000);

    // Source pins for collapsible full-width chart card, From/To fetch sync, and toolbarRows KPI sync
    const client = here('./SalesClient.tsx');
    expect(client).toContain('className="sls-chart-card"');
    expect(client).not.toContain('className="sls-quick-card"');
    expect(client).toContain('aria-expanded={chartOpen}');
    expect(client).toContain('computeSalesKpis(toolbarRows)');
    expect(client).toContain('.appointments(safeFrom, safeTo, undefined, undefined, { includeSales: true })');
    expect(client).toContain('buildSalesChart(filteredRows, fromDate, toDate, timezone, filter, locale)');
  });

  it('computes product return window eligibility, proportional + remainder refund math, barcode matching, and netted KPIs', () => {
    expect(DEFAULT_PRODUCT_RETURN_WINDOW_DAYS).toBe(7);
    expect(visitKeyFromGroupKey('single:abc-123')).toBe('abc-123');
    expect(visitKeyFromGroupKey('grp-456')).toBe('grp-456');

    // Return window check: within 7 days, on day 7 boundary, and expired on day 8
    expect(computeReturnWindow('2026-10-16', '2026-10-19', 7)).toEqual({
      eligible: true,
      daysElapsed: 3,
      daysLeft: 4,
      windowDays: 7,
    });
    expect(computeReturnWindow('2026-10-12', '2026-10-19', 7)).toEqual({
      eligible: true,
      daysElapsed: 7,
      daysLeft: 0,
      windowDays: 7,
    });
    expect(computeReturnWindow('2026-10-11', '2026-10-19', 7)).toEqual({
      eligible: false,
      daysElapsed: 8,
      daysLeft: 0,
      windowDays: 7,
    });
    // Same-day-only window (0 days)
    expect(computeReturnWindow('2026-10-19', '2026-10-19', 0).eligible).toBe(true);
    expect(computeReturnWindow('2026-10-18', '2026-10-19', 0).eligible).toBe(false);

    // Proportional + remainder refund math without rounding drift (3 units sold for 10000 paise)
    const oddLine = {
      id: 'vp-1',
      productId: 'prd-odd',
      name: 'Vitamin C Serum',
      sku: 'VIT-C-30',
      barcode: '8901234560012',
      priceMinor: '3333',
      qty: 3,
      paidMinor: '10000',
      returnedQty: 0,
      returnedMinor: '0',
    };
    expect(lineRemainingQty(oddLine)).toBe(3);
    expect(lineNetPaidMinor(oddLine)).toBe(10000);
    expect(lineRefundMinorForQty(oddLine, 1)).toBe(3333);
    expect(lineRefundMinorForQty(oddLine, 2)).toBe(6667);
    expect(lineRefundMinorForQty(oddLine, 3)).toBe(10000);

    const afterOneReturned = { ...oddLine, returnedQty: 1, returnedMinor: '3333' };
    expect(lineRemainingQty(afterOneReturned)).toBe(2);
    expect(lineNetPaidMinor(afterOneReturned)).toBe(6667);
    expect(lineRefundMinorForQty(afterOneReturned, 1)).toBe(3334);
    expect(lineRefundMinorForQty(afterOneReturned, 2)).toBe(6667);

    // Barcode / SKU lookup
    expect(findProductLineByCode([oddLine], '8901234560012')?.productId).toBe('prd-odd');
    expect(findProductLineByCode([oddLine], 'vit-c-30')?.productId).toBe('prd-odd');
    expect(findProductLineByCode([oddLine], '99999999')).toBeNull();

    // Netted SaleRow, KPIs, and QuickStats after partial return
    const rows = buildSaleRows(
      [
        mkAppointment({
          id: 'ret-1',
          bookingGroupId: 'g-ret-1',
          paidAmountMinor: '50000',
          paymentMode: 'upi',
          products: [
            {
              id: 'vp-10',
              productId: 'prd-1',
              name: 'Argan Oil 100ml',
              sku: 'ARG-100',
              barcode: '8901112223334',
              priceMinor: '45000',
              qty: 2,
              paidMinor: '90000',
              returnedQty: 1,
              returnedMinor: '45000',
            },
          ],
          payments: [{ mode: 'upi', amountMinor: '140000' }],
        }),
      ],
      'Asia/Kolkata',
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!).toMatchObject({
      servicesMinor: 50000,
      productsMinor: 45000,
      returnedMinor: 45000,
      totalMinor: 95000,
      productUnits: 1,
      returnedUnits: 1,
    });

    const kpis = computeSalesKpis(rows);
    expect(kpis.totalSalesMinor).toBe(95000);
    expect(kpis.productsRevenueMinor).toBe(45000);
    expect(kpis.productUnitsCount).toBe(1);
    expect(kpis.byMode.upi).toBe(95000);

    const qs = computeSalesQuickStats(rows);
    expect(qs.topProduct).toEqual({ name: 'Argan Oil 100ml', units: 1 });
    expect(filterSalesRows(rows, 'all', '8901112223334').map((r) => r.key)).toEqual(['g-ret-1']);
    expect(filterSalesRows(rows, 'all', 'ARG-100').map((r) => r.key)).toEqual(['g-ret-1']);

    // Source pins for top Return button, per-row Return button, barcode gun listener, and ReturnProductSheet
    const client = here('./SalesClient.tsx');
    const sheet = here('./ReturnProductSheet.tsx');
    const summary = here('../components/BookingSummary.tsx');
    expect(client).toContain('sls-top-return-btn');
    expect(client).toContain('sls-return-btn');
    expect(client).toContain('<ReturnProductSheet');
    expect(sheet).toContain('api.returnSaleProducts(visitKeyFromGroupKey(selectedBill.key)');
    expect(sheet).toContain("t('returnAll')");
    expect(sheet).toContain("t('restockShelf')");
    expect(sheet).toContain("t('damagedOpened')");
    expect(sheet).toContain('sls-ret-mode-grid');
    expect(sheet).toContain("t('windowDaysShort'");
    expect(sheet).toContain("t('windowPolicy'");
    expect(summary).toContain('onReturnProducts');
  });
});

/**
 * Owner review, 2026-10-19 — a refund says how it was paid out (the drawer has to balance), is sent under one id per
 * return (so a retry returns nothing more), and an invoice already given is flagged before the desk goes ahead.
 */
describe('a refund is paid out one way, sent once, and warns about an issued invoice', () => {
  const line = { id: 'vp-1', productId: 'prd-1', name: 'Argan Oil', priceMinor: '45000', qty: 2, paidMinor: '90000', returnedQty: 1, returnedMinor: '45000' };
  const bill = (extra: Partial<Appointment>) =>
    buildSaleRows([mkAppointment({ id: 'r-1', bookingGroupId: 'g-r', paidAmountMinor: '50000', products: [line], ...extra })], 'Asia/Kolkata');

  it('a UPI sale refunded in cash is UPI in and cash out, and the ways still add up to the net total', () => {
    const rows = bill({ paymentMode: 'upi', payments: [{ mode: 'upi', amountMinor: '140000' }], refunds: [{ mode: 'cash', amountMinor: '45000' }] });
    const kpis = computeSalesKpis(rows);
    expect(kpis.byMode.upi).toBe(140000);
    expect(kpis.byMode.cash).toBe(-45000);
    expect(kpis.byMode.upi + kpis.byMode.cash).toBe(kpis.totalSalesMinor);
  });

  it('a bill paid one way (no payment lines) does the same from its net total', () => {
    const rows = bill({ paymentMode: 'upi', refunds: [{ mode: 'cash', amountMinor: '45000' }] });
    const kpis = computeSalesKpis(rows);
    expect(kpis.byMode.upi).toBe(95000 + 45000);
    expect(kpis.byMode.cash).toBe(-45000);
    expect(kpis.byMode.upi + kpis.byMode.cash).toBe(kpis.totalSalesMinor);
  });

  it('a refund paid out the way it came in leaves that way net of it', () => {
    const rows = bill({ paymentMode: 'upi', payments: [{ mode: 'upi', amountMinor: '140000' }], refunds: [{ mode: 'upi', amountMinor: '45000' }] });
    expect(computeSalesKpis(rows).byMode.upi).toBe(95000);
  });

  it('an API that sends no refunds keeps the old behaviour: the refund comes off the ways in order', () => {
    const rows = bill({ paymentMode: 'upi', payments: [{ mode: 'upi', amountMinor: '140000' }] });
    expect(computeSalesKpis(rows).byMode.upi).toBe(95000);
  });

  it('the refund defaults to the way the bill was paid, and to cash when that is unknown', () => {
    expect(defaultRefundMode(['upi'])).toBe('upi');
    expect(defaultRefundMode(['card', 'cash'])).toBe('card');
    expect(defaultRefundMode(['wallet'])).toBe('other');
    expect(defaultRefundMode([])).toBe('cash');
    expect(defaultRefundMode(undefined)).toBe('cash');
  });

  it('the same return keeps its request id across presses, and a changed one gets a new id', () => {
    const first = requestIdFor(null, 'a');
    expect(requestIdFor(first, 'a')).toBe(first);
    const changed = requestIdFor(first, 'b');
    expect(changed.id).not.toBe(first.id);
    expect(newRequestId()).not.toBe(newRequestId());
    expect(first.id.length).toBeGreaterThanOrEqual(8);
  });

  it('the sheet sends the way, the id, and the acknowledgement; and asks before going past an issued invoice', () => {
    const sheet = here('./ReturnProductSheet.tsx');
    expect(sheet).toContain('refundMode,');
    expect(sheet).toContain('idempotencyKey: requestRef.current.id,');
    expect(sheet).toContain('acknowledgeIssuedDocument: true');
    expect(sheet).toContain("err.code === 'document_issued'");
    expect(sheet).toContain('requestRef.current = null;');
    // The id is dropped only after the server answered: a failure keeps it, so the retry is the same request.
    expect(sheet.indexOf('requestRef.current = null;')).toBeGreaterThan(sheet.indexOf('await api.returnSaleProducts'));
  });

  it('computes 2-step return selections accurately for single item, multi-item, partial qty, select all, clear, and already-returned lines', () => {
    // Customer purchased: Face Wash (2 @ ₹180 = ₹360), Hair Oil (1 @ ₹250), Comb Pro (1 @ ₹100, already returned)
    const billProducts = [
      {
        id: 'vp-fw',
        productId: 'prd-fw',
        name: 'Face Wash',
        sku: 'FW-001',
        priceMinor: '18000',
        qty: 2,
        paidMinor: '36000',
        returnedQty: 0,
        returnedMinor: '0',
      },
      {
        id: 'vp-ho',
        productId: 'prd-ho',
        name: 'Hair Oil',
        sku: 'HO-001',
        priceMinor: '25000',
        qty: 1,
        paidMinor: '25000',
        returnedQty: 0,
        returnedMinor: '0',
      },
      {
        id: 'vp-cp',
        productId: 'prd-cp',
        name: 'Comb Pro',
        sku: 'CP-001',
        priceMinor: '10000',
        qty: 1,
        paidMinor: '10000',
        returnedQty: 0,
        returnedMinor: '0',
      },
    ];

    // Scenario A: Return 1 Face Wash -> ₹180 (18000 paise), zero-quantity items excluded
    const scenarioA = computeReturnSelection(billProducts, { 'prd-fw': 1, 'prd-ho': 0, 'prd-cp': 0 });
    expect(scenarioA.selectedItemsCount).toBe(1);
    expect(scenarioA.totalSelectedUnits).toBe(1);
    expect(scenarioA.totalRefundMinor).toBe(18000);
    expect(scenarioA.selectedLines.map((l) => ({ id: l.id, qty: l.qty, refundMinor: l.refundMinor }))).toEqual([
      { id: 'prd-fw', qty: 1, refundMinor: 18000 },
    ]);

    // Scenario B: Return 1 Face Wash and 1 Hair Oil -> ₹430 (43000 paise)
    const scenarioB = computeReturnSelection(billProducts, { 'prd-fw': 1, 'prd-ho': 1 });
    expect(scenarioB.selectedItemsCount).toBe(2);
    expect(scenarioB.totalSelectedUnits).toBe(2);
    expect(scenarioB.totalRefundMinor).toBe(43000);

    // Scenario C: Select all eligible items -> 2 Face Wash + 1 Hair Oil + 1 Comb Pro = ₹710 (71000 paise)
    const allMap = buildSelectAllQtyMap(billProducts);
    expect(allMap).toEqual({ 'prd-fw': 2, 'prd-ho': 1, 'prd-cp': 1 });
    const scenarioC = computeReturnSelection(billProducts, allMap);
    expect(scenarioC.selectedItemsCount).toBe(3);
    expect(scenarioC.totalSelectedUnits).toBe(4);
    expect(scenarioC.totalRefundMinor).toBe(71000);

    // Clamping above available quantity and excluding already-returned items
    const withReturnedComb = [
      billProducts[0]!,
      billProducts[1]!,
      { ...billProducts[2]!, returnedQty: 1, returnedMinor: '10000' },
    ];
    expect(buildSelectAllQtyMap(withReturnedComb)).toEqual({ 'prd-fw': 2, 'prd-ho': 1 });
    const clamped = computeReturnSelection(withReturnedComb, { 'prd-fw': 99, 'prd-cp': 5 });
    expect(clamped.selectedItemsCount).toBe(1);
    expect(clamped.totalSelectedUnits).toBe(2);
    expect(clamped.totalRefundMinor).toBe(36000);

    // Clear selection -> 0 items, 0 units, ₹0 refund
    const cleared = computeReturnSelection(withReturnedComb, {});
    expect(cleared.selectedItemsCount).toBe(0);
    expect(cleared.totalSelectedUnits).toBe(0);
    expect(cleared.totalRefundMinor).toBe(0);
    expect(cleared.selectedLines).toEqual([]);

    expect(formatBillRef('single:89099900-0028-4000-8000-000000000000')).toBe('89099900');

    // Verify 2-step UI structure in ReturnProductSheet.tsx
    const sheet = here('./ReturnProductSheet.tsx');
    expect(sheet).toContain("t('stepSelect')");
    expect(sheet).toContain("t('stepReview')");
    expect(sheet).toContain('className="sls-ret-table"');
    expect(sheet).toContain("t('continueBtn')");
    expect(sheet).toContain("t('itemsBeingReturned'");
    expect(sheet).toContain("t('doneTitle')");
    expect(sheet).toContain("t('printReceipt')");
    expect(sheet).toContain('className="sls-ret-checkbox"');
    expect(sheet).toContain('className="sls-ret-th-check"');
  });
});

