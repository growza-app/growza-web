/**
 * Jira GRW-319 · GRW-325 — the message groups handed to the browser.
 *
 * The client provider (in the tenant layout) receives ONLY these groups, not the
 * whole catalogue: every screen's text in every page's HTML would be a heavy price
 * for a language nobody is reading. The cost is that a client component reading a
 * group that is not listed here renders blank text.
 *
 * `i18n.test.ts` fails when a component calls `useTranslations('x')` and `x` is
 * missing from this list, so the mistake is caught in the pull request, not on an
 * owner's phone.
 */
export const CLIENT_MESSAGES = ['bookings', 'checkout', 'customers', 'errors', 'freeTimes', 'notifications', 'search', 'settingsHub', 'status'] as const;
