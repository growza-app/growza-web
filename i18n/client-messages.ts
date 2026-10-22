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
export const CLIENT_MESSAGES = ['attendance', 'autopayRenewal', 'bookings', 'branchScope', 'bookingSheet', 'checkout', 'chrome', 'clientCard', 'common', 'customers', 'documents', 'errors', 'freeTimes', 'moveBooking', 'newVisit', 'notifications', 'nouns', 'offers', 'orders', 'packages', 'products', 'payFlow', 'phone', 'reports', 'sales', 'search', 'services', 'settingsBooking', 'settingsChannels', 'settingsBranches', 'settingsCheckIn', 'settingsGst', 'settingsHours', 'settingsHub', 'settingsPayments', 'settingsProfile', 'settingsReminders', 'settingsReports', 'settingsTeam', 'staff', 'personPhoto', 'staffEdit', 'staffWizard', 'status', 'tax', 'tokens', 'tryWhatsApp', 'weekdayHours'] as const;

/**
 * The sign-in pages `(auth)` have their own provider with only these groups:
 * they are a separate root layout (no `api.me()`), and a visitor who has not
 * signed in yet should download the sign-in words, not the dashboard's.
 */
export const AUTH_MESSAGES = ['auth', 'common', 'phone'] as const;
