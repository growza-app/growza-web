'use client';

import { useRouter } from 'next/navigation';
import { Pagination } from '../../../components/Pagination';
import type { OwnerBillPage } from '../../../lib/api-types';
import { billingCopy } from '../../../lib/billing-copy';
import type { Lang } from '../../../lib/lang';

/** Jira GRW-254 — the list behind "See all bills": each row opens the bill. */
export function BillsList({ data, lang }: { data: OwnerBillPage; lang: Lang }) {
  const router = useRouter();
  const t = billingCopy(lang);
  const money = (minor: number, currency: string) =>
    new Intl.NumberFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { style: 'currency', currency, maximumFractionDigits: minor % 100 === 0 ? 0 : 2 }).format(minor / 100);
  const month = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  };
  return (
    <div className="bill-page">
      <a className="bill-link bill-back" href="/settings/billing">‹ {t.back}</a>
      <h2 className="bp-title">{t.allBills}</h2>
      <section className="card bill-card">
        {data.bills.length === 0 ? (
          <p className="field-hint">{t.noBills}</p>
        ) : (
          <ul className="bill-invoices">
            {data.bills.map((b) => (
              <li key={b.id}>
                <a className="bill-invoice" href={`/settings/billing/bills/${b.id}`}>
                  <span className="bill-invoice-when">
                    {month(b.periodStart)}
                    <small className="bill-muted">{b.invoiceNumber}</small>
                  </span>
                  <span className="bill-invoice-amount">{money(b.amountMinor, b.currency)}</span>
                  <span className={`bill-status ${b.unpaid ? 'is-due' : 'is-paid'}`}>{t.status(b.paymentStatus)}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
        <Pagination page={data.page} total={data.total} pageSize={data.pageSize} noun={t.bills.toLowerCase()} onChange={(p) => router.push(`/settings/billing/bills?page=${p}`)} />
      </section>
    </div>
  );
}
