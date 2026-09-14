import type { ReactNode } from 'react';
import type { Me } from '../lib/api-types';

/**
 * Jira GRW-240 FR-04 — "your bill changes on this date", told to the owner as
 * soon as a branch is added or closed, until the new bill is raised.
 *
 * The API decides whether there is anything to say (it compares this month's
 * invoice with the next bill, worked out by the invoice generator's own
 * pricing). This only words it — plainly, because an owner reading it may not
 * be a confident reader — and says the amount is before GST, as the invoice will
 * add GST on top.
 */
export function BillChangeBanner({ change }: { change: Me['billingChange'] }): ReactNode {
  if (!change) return null;
  const money = (minor: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: change.currency, maximumFractionDigits: minor % 100 === 0 ? 0 : 2 }).format(minor / 100);
  const [y, m, d] = change.effectiveFrom.split('-').map(Number);
  const day = new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const up = change.nextMonthlyMinor > change.currentMonthlyMinor;
  return (
    <div
      role="status"
      style={{
        margin: '0 0 14px',
        padding: '12px 14px',
        borderRadius: 12,
        lineHeight: 1.5,
        fontSize: 13.5,
        fontWeight: 600,
        border: '1px solid oklch(0.86 0.05 250)',
        background: 'oklch(0.97 0.02 250)',
        color: 'oklch(0.38 0.08 255)',
      }}
    >
      Your bill {up ? 'goes up' : 'goes down'} from {day}: {money(change.nextMonthlyMinor)} a month + GST (now {money(change.currentMonthlyMinor)}), for{' '}
      {change.openBranches} {change.openBranches === 1 ? 'branch' : 'branches'}.
    </div>
  );
}
