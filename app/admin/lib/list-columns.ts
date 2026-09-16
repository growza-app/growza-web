import type { TableColumn } from './table-layout';

/**
 * The six admin list tables' columns, in one place so a test can hold them to
 * the widths QA measured (Jira GRW-288, `list-tables-fit.test.ts`).
 *
 * Every `min` is what that column's content needs — measured against the
 * GRW-277 QA screenshots at 1440px, where "Provisioning" is a 98px pill,
 * "+919000077111" 98px, "16 Sept 2026 – 15 Oct 2026" 155px — with a margin for
 * the longer values those screenshots did not happen to show ("Part refunded",
 * "Payment failed", a five-figure price). The table's own minimum is the sum of
 * these (`tableMinWidth`), so a new column cannot be added without the fold
 * point moving with it.
 *
 * Text that CAN give way does: a business name ellipsizes, a plan name wraps.
 * A `min` is for what cannot — a pill is `nowrap`, a period is one line.
 */

export const BUSINESS_COLUMNS: TableColumn[] = [
  { label: 'Business', width: '1.8fr', min: 190 },
  { label: 'Owner', width: '1.3fr', min: 120 },
  { label: 'Branches', width: '0.8fr', min: 70 },
  { label: 'Users', width: '0.7fr', min: 48 },
  { label: 'Plan', width: '1fr', min: 96 },
  { label: 'Status', width: '1fr', min: 110 },
  // Jira GRW-267 · GRW-272 — `mobile: false`: two placeholders for figures not
  // counted yet, and a chevron on a card that already opens when tapped.
  // Jira GRW-288 — `optional` for the same reason: they are the first thing a
  // laptop too narrow for all ten columns gives up (the `compact` layout).
  { label: 'Bookings', width: '0.9fr', min: 66, mobile: false, optional: true },
  { label: 'Usage', width: '0.9fr', min: 50, mobile: false, optional: true },
  { label: 'Created', width: '1fr', min: 92 },
  { label: '', width: '36px', right: true, mobile: false },
];

export const SUBSCRIPTION_COLUMNS: TableColumn[] = [
  { label: 'Business', width: '1.7fr', min: 170 },
  { label: 'Plan', width: '1.1fr', min: 96 },
  { label: 'List', width: '0.9fr', min: 64 },
  { label: 'Discount', width: '0.9fr', min: 70 },
  { label: 'Final', width: '0.9fr', min: 64 },
  // "Payment failed" is the widest status pill, and a pill does not wrap.
  { label: 'Status', width: '1.1fr', min: 124 },
  { label: 'Next billing', width: '1fr', min: 100 },
  // GRW-148 widened this from 50px: the row now carries the re-enrol action
  // as well as the chevron, so a support call can act from the list rather
  // than opening each subscription to find out whether it needs anything.
  // GRW-288 — 130, not 150: "Reactivate" (the longest label) plus the chevron
  // is 125px, and the other 20 was a column of nothing on a table that did not
  // fit.
  { label: '', width: '130px', right: true },
];

export const INVOICE_COLUMNS: TableColumn[] = [
  { label: 'Invoice', width: '0.95fr', min: 88 },
  { label: 'Business', width: '1.3fr', min: 150 },
  // Widest column by some way: it holds two formatted dates and an en dash,
  // and at 1.1fr it ran into the Taxable figure beside it. `nowrap`, so its
  // minimum is the whole line.
  { label: 'Period', width: '1.7fr', min: 170 },
  { label: 'Taxable', width: '0.85fr', min: 70 },
  { label: 'GST', width: '0.8fr', min: 60 },
  { label: 'Total', width: '0.9fr', min: 70 },
  { label: 'Payment', width: '0.95fr', min: 116 },
  // Jira GRW-267 · GRW-272 — the card opens when tapped; no chevron on a phone.
  { label: '', width: '36px', right: true, mobile: false },
];

export const PAYMENT_COLUMNS: TableColumn[] = [
  { label: 'Business', width: '1.4fr', min: 150 },
  { label: 'Amount', width: '0.9fr', min: 76 },
  { label: 'Refunded', width: '0.8fr', min: 72 },
  { label: 'Status', width: '1fr', min: 116 },
  { label: 'Provider · payment id', width: '1.4fr', min: 150 },
  { label: 'Date', width: '0.9fr', min: 88 },
];

export const USAGE_COLUMNS: TableColumn[] = [
  { label: 'Business', width: '1.6fr', min: 150 },
  { label: 'Plan', width: '1fr', min: 96 },
  // Wraps to two lines — the one date column here that may.
  { label: 'Billing period', width: '1.2fr', min: 120 },
  { label: 'Bookings', width: '0.9fr', min: 70 },
  // The bar's own 44px minimum, its 8px gap and the 44px percentage.
  { label: 'Of limit', width: '1.3fr', min: 110 },
];

export const ADMIN_USER_COLUMNS: TableColumn[] = [
  { label: 'Administrator', width: '1.5fr', min: 170 },
  // The role select is capped at 170px.
  { label: 'Role', width: '1.2fr', min: 150 },
  { label: 'Added', width: '0.9fr', min: 90 },
  // "Deactivated" is the wider pill.
  { label: 'Status', width: '0.8fr', min: 108 },
  // Was a fixed 300px. The actions already wrap (`flexWrap`), so the column
  // needs only its widest single button ("Reset password", ~132px) and takes
  // up to 260px when the table has it to give.
  { label: '', width: '260px', min: 140, right: true },
];
