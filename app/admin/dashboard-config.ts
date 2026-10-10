import type { IconName } from './icons';
import { ACTION_TINTS, type StatIcon, type StatTint } from './components/DashboardParts';

/**
 * The admin dashboard's static configuration — card tints, which attention
 * rows earn a headline card, the quick actions and the status labels.
 *
 * Moved out of `page.tsx` by Jira GRW-280, when adding the Bookings card took
 * that file past the repo's 400-line lint limit — the same line
 * `DashboardParts.tsx` was split out for. Pure data: nothing here renders, and
 * nothing here queries, so it is the part of the page that can move without
 * any behaviour moving with it.
 */

/** GRW-275 — the reference design's four card tints, one per card. */
export const STAT_TINTS = {
  green: { bg: 'oklch(0.965 0.025 155)', fg: 'oklch(0.45 0.12 150)', border: 'oklch(0.92 0.04 155)' },
  blue: { bg: 'oklch(0.96 0.025 250)', fg: 'oklch(0.5 0.15 250)', border: 'oklch(0.92 0.035 250)' },
  amber: { bg: 'oklch(0.965 0.035 75)', fg: 'oklch(0.55 0.13 65)', border: 'oklch(0.93 0.05 75)' },
  rose: { bg: 'oklch(0.965 0.025 25)', fg: 'oklch(0.53 0.16 25)', border: 'oklch(0.93 0.035 25)' },
} satisfies Record<string, StatTint>;

export const STATUS_LABEL: Record<string, string> = { provisioning: 'Provisioning', active: 'Active', suspended: 'Suspended', churned: 'Churned' };


/**
 * GRW-275 — which attention rows earn a headline card.
 *
 * Only rows the registry already marks `available` render here (the guard is
 * in the JSX): an unbuilt row stays in the Billing attention list below,
 * where it can say so honestly, rather than becoming a card showing a zero
 * that means "not built" — the exact BR-01 confusion this dashboard exists
 * to avoid.
 */
export const ATTENTION_CARDS: Array<{
  key: string;
  label: string;
  icon: StatIcon;
  tint: StatTint;
  /** Fills the movement row these cards have no movement for — and carries the period the short label drops. */
  note: (count: number) => string;
}> = [
  {
    key: 'payments_failed',
    label: 'Payments failed',
    icon: 'alert',
    tint: STAT_TINTS.amber,
    // Jira GRW-287 — the count is this month's (GRW-276 AC-04), and the short
    // label cannot say so, so the note does — as the Cancellations card's does.
    note: (count) => (count > 0 ? 'This month · open to reconcile' : 'None this month'),
  },
  {
    key: 'cancellations',
    label: 'Cancellations',
    icon: 'money',
    tint: STAT_TINTS.rose,
    // The label is shortened to fit one line at phone width, so "this month"
    // — which is genuinely part of what this number means — moves here rather
    // than being lost.
    note: () => 'This month',
  },
];

export const QUICK_ACTIONS: Array<{
  icon: IconName;
  label: string;
  href: string;
  tint: keyof typeof ACTION_TINTS;
  /** Admin mobile dashboard only — desktop still shows all five in one row. */
  hideOnMobile?: boolean;
  /**
   * Batch D — what the action needs. Shown only to an admin who holds it: these tiles were offered to every role
   * that could open the dashboard, and each led a role without it to a 403 page. The sidebar was already filtered.
   */
  permission: string;
}> = [
  { icon: 'businesses', label: 'Add business', href: '/admin/businesses', tint: 'businesses', permission: 'admin.business.create' },
  { icon: 'users', label: 'Invite admin', href: '/admin/users', tint: 'users', permission: 'admin.user.manage' },
  { icon: 'plans', label: 'Create plan', href: '/admin/plans/new', tint: 'plans', permission: 'admin.plan.manage' },
  { icon: 'usage', label: 'View usage', href: '/admin/usage', tint: 'usage', permission: 'admin.usage.view' },
  // Least likely of the five to be reached for from a phone mid-task — kept
  // on desktop, dropped from the mobile grid so the remaining four sit in one
  // even 4-up row instead of a lone tile on its own second line.
  { icon: 'audit', label: 'Audit log', href: '/admin/audit-logs', tint: 'audit', hideOnMobile: true, permission: 'admin.audit.view' },
];
