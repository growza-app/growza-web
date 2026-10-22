import { guardScreen } from '../../../lib/screen-guard';
import { screenTitle } from '../../../lib/page-title';
import { api } from '../../../lib/api';
import { serverLang } from '../../../lib/lang';
import { billingCopy } from '../../../lib/billing-copy';
import { BillsList } from './BillsList';

export const dynamic = 'force-dynamic';

/** Jira GRW-254 — every bill, newest first, 12 a page. Plan amounts only (no GST on owner screens). */
export default async function AllBillsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  // Jira GRW-74 — a role holder is never offered this screen (the API makes it the owner's alone): by its address it goes Home.
  await guardScreen('/settings/billing');
  const lang = await serverLang();
  const { page } = await searchParams;
  const bills = await api.bills(Number(page ?? 1) || 1).catch(() => null);
  if (!bills) return <div className="banner">{billingCopy(lang).loadError}</div>;
  return <BillsList data={bills} lang={lang} />;
}

export const metadata = screenTitle('All bills');
