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
  textFaint: 'oklch(0.55 0.02 155)',
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
  'Past due': ['oklch(0.55 0.17 25)', 'oklch(0.95 0.04 25)'],
  Suspended: ['oklch(0.5 0.02 155)', 'oklch(0.95 0.006 150)'],
  'Grace period': ['oklch(0.52 0.13 65)', 'oklch(0.96 0.05 80)'],
  Success: ['oklch(0.5 0.13 150)', 'oklch(0.95 0.035 150)'],
  Failed: ['oklch(0.55 0.17 25)', 'oklch(0.95 0.04 25)'],
  Pending: ['oklch(0.52 0.13 65)', 'oklch(0.96 0.05 80)'],
  Paid: ['oklch(0.5 0.13 150)', 'oklch(0.95 0.035 150)'],
  Overdue: ['oklch(0.55 0.17 25)', 'oklch(0.95 0.04 25)'],
  Invited: ['oklch(0.52 0.13 65)', 'oklch(0.96 0.05 80)'],
  // tenant.status (GRW-101) — 'active'/'suspended' already share Active/Suspended above.
  Provisioning: ['oklch(0.52 0.13 65)', 'oklch(0.96 0.05 80)'],
  Churned: ['oklch(0.55 0.17 25)', 'oklch(0.95 0.04 25)'],
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
export function inr(n: number): string {
  return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

/**
 * Usage-bar colour band: green under 80%, amber 80–99%, red at/over 100%.
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
