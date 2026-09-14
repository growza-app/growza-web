import { screenTitle } from '../../lib/page-title';
import { api } from '../../lib/api';
import { serverLang } from '../../lib/lang';
import { billingCopy } from '../../lib/billing-copy';
import { BillingSummary } from './BillingSummary';

export const dynamic = 'force-dynamic';

/**
 * Jira GRW-243 — Settings › Billing: the owner's plan, what each branch adds,
 * the next bill, how it is paid, and the last six bills (no GST details). Business-wide:
 * a bill belongs to the business, whichever branch is picked in Settings.
 */
export default async function BillingSettingsPage() {
  const lang = await serverLang();
  const [billing, me] = await Promise.all([api.billing().catch(() => null), api.me().catch(() => null)]);
  if (!billing) return <div className="banner">{billingCopy(lang).loadError}</div>;
  return <BillingSummary billing={billing} lang={lang} canPayOnline={me?.payments?.online ?? false} />;
}

// Jira GRW-192 — the tab says which screen this is.
export const metadata = screenTitle('Billing');
