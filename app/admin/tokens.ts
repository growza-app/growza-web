/**
 * Admin design tokens (GRW-95). Ported from the Admin.dc.html design canvas.
 *
 * Deliberately its own token set, not a reuse of the tenant portal's
 * (`(tenant)/globals.css` --sidebar/--accent/etc). GRW-95's whole point is
 * that an admin must never be unsure which product they are in — sharing
 * tokens would make that accidental instead of guaranteed.
 */

export const oklch = {
  pageBg: 'oklch(0.97 0.005 150)',
  text: 'oklch(0.24 0.02 155)',
  textStrong: 'oklch(0.2 0.02 155)',
  textMuted: 'oklch(0.53 0.02 155)',
  // Jira GRW-478 (U-11) — 0.55 was 4.41:1 on pageBg, just under 4.5.
  textFaint: 'oklch(0.52 0.02 155)',
  border: 'oklch(0.92 0.008 150)',
  borderStrong: 'oklch(0.9 0.008 150)',
  surface: 'oklch(1 0 0)',
  surfaceSubtle: 'oklch(0.98 0.004 150)',
  divider: 'oklch(0.95 0.006 150)',
  inputBg: 'oklch(0.99 0.003 150)',
  accent: 'oklch(0.48 0.11 150)',
  accentText: 'oklch(0.36 0.09 152)',
  sidebarFrom: 'oklch(0.31 0.055 158)',
  sidebarTo: 'oklch(0.22 0.045 162)',
  sidebarActiveText: 'oklch(0.28 0.06 158)',
  sidebarActiveBg: 'oklch(0.97 0.01 150)',
  sidebarText: 'oklch(0.8 0.03 150)',
  sidebarTextFaint: 'oklch(0.75 0.03 150)',
  danger: 'oklch(0.55 0.17 25)',
  dangerBg: 'oklch(0.95 0.04 25)',
  dangerStrong: 'oklch(0.5 0.16 25)',
  warnBg: 'oklch(0.96 0.05 80)',
} as const;

/** Status vocabulary — one rendering per status word, shared everywhere it appears. */
export const STATUS_COLORS: Record<string, [fg: string, bg: string]> = {
  Active: ['oklch(0.5 0.13 150)', 'oklch(0.95 0.035 150)'],
  Trial: ['oklch(0.52 0.13 65)', 'oklch(0.96 0.05 80)'],
  // Jira GRW-478 (U-11) — 0.55 was 4.42:1 on its own background.
  'Past due': ['oklch(0.5 0.17 25)', 'oklch(0.95 0.04 25)'],
  Suspended: ['oklch(0.5 0.02 155)', 'oklch(0.95 0.006 150)'],
  'Grace period': ['oklch(0.52 0.13 65)', 'oklch(0.96 0.05 80)'],
  Success: ['oklch(0.5 0.13 150)', 'oklch(0.95 0.035 150)'],
  Failed: ['oklch(0.55 0.17 25)', 'oklch(0.95 0.04 25)'],
  Pending: ['oklch(0.52 0.13 65)', 'oklch(0.96 0.05 80)'],
  Paid: ['oklch(0.5 0.13 150)', 'oklch(0.95 0.035 150)'],
  Overdue: ['oklch(0.55 0.17 25)', 'oklch(0.95 0.04 25)'],
  Invited: ['oklch(0.52 0.13 65)', 'oklch(0.96 0.05 80)'],
  // payment.status / invoice.payment_status (GRW-119). 'Success', 'Failed',
  // 'Pending' and 'Paid' already exist above and are reused deliberately —
  // one colour per meaning, across every screen.
  Unpaid: ['oklch(0.52 0.13 65)', 'oklch(0.96 0.05 80)'],
  Refunded: ['oklch(0.5 0.02 155)', 'oklch(0.95 0.006 150)'],
  'Part refunded': ['oklch(0.5 0.02 155)', 'oklch(0.95 0.006 150)'],
  Issued: ['oklch(0.5 0.02 155)', 'oklch(0.95 0.006 150)'],
  Void: ['oklch(0.55 0.17 25)', 'oklch(0.95 0.04 25)'],
  // tenant.status (GRW-101) — 'active'/'suspended' already share Active/Suspended above.
  Provisioning: ['oklch(0.52 0.13 65)', 'oklch(0.96 0.05 80)'],
  Churned: ['oklch(0.55 0.17 25)', 'oklch(0.95 0.04 25)'],
  // plan.status (GRW-108) — shares Suspended's muted grey: retired reads as
  // "inactive", not "failed"/"in trouble" the way Churned/Overdue do.
  Retired: ['oklch(0.5 0.02 155)', 'oklch(0.95 0.006 150)'],
  // A version that went live and has since been replaced. Reads as "history",
  // not as a problem — same muted grey as Retired/Suspended.
  Superseded: ['oklch(0.5 0.02 155)', 'oklch(0.95 0.006 150)'],
  // plan_version.activated_at IS NULL (GRW-108) — a version created but not
  // yet live, same amber as Trial/Grace period/Pending's "not settled yet".
  Scheduled: ['oklch(0.52 0.13 65)', 'oklch(0.96 0.05 80)'],
  // subscription.status (GRW-111). Active/Trial/Past due/Grace period/
  // Suspended above already cover five of the nine; these are the rest.
  // Payment failed is red because it is a live problem someone must act on;
  // Paused/Cancelled/Expired are the muted grey of "not a problem, just not
  // running" — the same distinction Retired/Superseded draw for plans.
  'Payment failed': ['oklch(0.55 0.17 25)', 'oklch(0.95 0.04 25)'],
  Paused: ['oklch(0.5 0.02 155)', 'oklch(0.95 0.006 150)'],
  Cancelled: ['oklch(0.5 0.02 155)', 'oklch(0.95 0.006 150)'],
  Expired: ['oklch(0.5 0.02 155)', 'oklch(0.95 0.006 150)'],
};

/** Business-type color, keyed by hue — matches typeCol()/TYPE_HUE in the design. */
export const TYPE_HUE: Record<string, number> = {
  Salon: 330,
  Garage: 40,
  Dental: 210,
  Spa: 160,
  Clinic: 25,
  Fitness: 285,
};

export function typeColor(type: string): { bg: string; fg: string } {
  const hue = TYPE_HUE[type] ?? 150;
  return { bg: `oklch(0.95 0.045 ${hue})`, fg: `oklch(0.45 0.12 ${hue})` };
}

/** ₹ formatter — every money figure in the admin portal goes through this one function. */
/**
 * `maximumFractionDigits: 2` alone drops TRAILING zeros mid-precision, not
 * just whole numbers — ₹79.90 rendered as ₹79.9, ₹719.10 as ₹719.1 (QA pass
 * 7). Money with one decimal digit reads as a typo, not as ninety paise.
 * Forcing minimumFractionDigits to 2 whenever there IS a fractional paise
 * value (and leaving it at 0 for a whole-rupee amount, so ₹200 stays ₹200
 * rather than becoming ₹200.00 everywhere) keeps both cases honest.
 */
export function inr(n: number): string {
  const hasFraction = Math.round(n * 100) % 100 !== 0;
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: hasFraction ? 2 : 0, maximumFractionDigits: 2 });
}

/**
 * Usage-bar colour band: green under 80%, amber 80–89%, red at/over 90%.
 *
 * The comment used to say "red at/over 100%" while the code turned red at 90 —
 * a bar reads as at-limit ten points early, which for a usage warning is the
 * difference between "act soon" and "you are cut off".
 * The one place this decision is made — every bar and every usage table cell
 * reads its colour from here.
 */
export function usageState(used: number, limit: number): { pct: number; color: string } {
  const pct = limit > 0 ? Math.round((used / limit) * 100) : 0;
  let color = 'oklch(0.5 0.13 150)';
  if (pct >= 80) color = 'oklch(0.6 0.14 65)';
  if (pct >= 90) color = 'oklch(0.55 0.17 25)';
  return { pct, color };
}
