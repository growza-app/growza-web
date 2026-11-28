'use client';

import { api, type MoneyReportQuery } from '../lib/api';
import type { RestaurantCustomersPage } from '../lib/api-types';
import { MoneyShell, useMoneyReport } from './money/MoneyShell';
import { CustomersTab } from './RestaurantReports';

/** One read, kept outside the component so the report's loader is not remade on every draw. */
const readCustomers = (q: MoneyReportQuery) => api.restaurantReport<RestaurantCustomersPage>('customers', q);

/**
 * Owner, 2026-11-28 — "I want reports like we have for restaurants, especially for guests — here it will be client." A
 * retail shop's Reports › Customers: the restaurant's Guests tab (`CustomersTab`) in the shop's words, read from the same
 * `GET /api/v1/reports/restaurant/customers` (which answers any counter business), inside the money tabs' period and
 * branch, loading and failed states (`MoneyShell`), so it sits on the tab bar exactly like its neighbours.
 */
export function ShopCustomersReport() {
  const report = useMoneyReport<RestaurantCustomersPage>(readCustomers);
  return (
    <MoneyShell report={report}>
      {(data) => (
        <div className="cr rr">
          <CustomersTab data={data} words="shop" />
        </div>
      )}
    </MoneyShell>
  );
}
