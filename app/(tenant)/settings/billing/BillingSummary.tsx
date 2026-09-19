import type { OwnerBilling } from '../../lib/api-types';
import { billingCopy } from '../../lib/billing-copy';
import type { Lang } from '../../lib/lang';
import { PayNowButton } from '../../components/PayNowButton';
import { AutoPayCard } from './AutoPayCard';

/**
 * Jira GRW-243 — the bill, laid out: plan and branches on the left, the next bill
 * and past bills on the right on a laptop, one column on a phone. Nothing is
 * added up here: every figure is the API's plan amount, from the invoice
 * generator's own pricing (GRW-161). No GST on the owner's screens (owner
 * decision, 2026-09-14) — it stays on the invoice and in the admin portal.
 */
export function BillingSummary({ billing, lang, canPayOnline }: { billing: OwnerBilling; lang: Lang; canPayOnline: boolean }) {
  const t = billingCopy(lang);
  const sub = billing.subscription;
  const currency = sub?.currency ?? 'INR';
  const money = (minor: number) =>
    new Intl.NumberFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { style: 'currency', currency, maximumFractionDigits: minor % 100 === 0 ? 0 : 2 }).format(minor / 100);
  const day = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  };

  return (
    <div className="bill-page">
      <div className="bill-head">
        <h2 className="bp-title">{t.title}</h2>
        <p className="bp-sub">{t.sub}</p>
      </div>

      {billing.due ? (
        <div className="bill-due" role="status">
          <span>{t.due}</span>
          {canPayOnline ? <PayNowButton restricted={false} /> : null}
        </div>
      ) : null}

      <div className="bill-grid">
        <section className="card bill-card" aria-labelledby="bill-plan">
          <h3 id="bill-plan" className="bill-card-title">{t.yourPlan}</h3>
          {!sub ? (
            <p className="field-hint">{t.noPlan}</p>
          ) : (
            <>
              <div className="bill-line bill-line-strong">
                <span>{sub.planName}</span>
                <span>
                  {money(sub.planPriceMinor)} <small>{t.perMonth}</small>
                </span>
              </div>
              {sub.branches.map((b) => (
                <div key={b.id} className="bill-line">
                  <span>{b.name}</span>
                  <span className={b.included || b.amountMinor === 0 ? 'bill-muted' : undefined}>
                    {b.included ? t.included : b.amountMinor === 0 ? t.noCharge : `${money(b.amountMinor)} · ${t.extraBranch}`}
                  </span>
                </div>
              ))}
              {sub.discount ? (
                <div className="bill-line bill-discount">
                  <span>
                    {/* Jira GRW-254 — why they have it, and until when. */}
                    {sub.discount.reason ? `${t.discount}: ${sub.discount.reason}` : t.discount}
                    {sub.discount.endsAt ? ` · ${t.discountUntil(day(sub.discount.endsAt))}` : ''}
                  </span>
                  <span>− {money(sub.discount.amountMinor)}</span>
                </div>
              ) : null}
              <div className="bill-line bill-line-total">
                <span>{t.monthly}</span>
                <span>{money(sub.nextBill.amountMinor)}</span>
              </div>
              <p className="bill-paid-by">
                <strong>{t.paidBy}:</strong>{' '}
                {sub.paidBy === 'autopay' ? t.paidAutopay : sub.paidBy === 'online_link' ? t.paidOnline : t.paidOffline}
              </p>
            </>
          )}
        </section>

        <div className="bill-col">
          {sub ? (
            <section className="card bill-card" aria-labelledby="bill-next">
              <h3 id="bill-next" className="bill-card-title">
                {t.nextBill} <small className="bill-muted">{t.on(day(sub.nextBill.date))}</small>
              </h3>
              {sub.pendingChange ? (
                <p className="bill-change" role="note">
                  {t.change(day(sub.pendingChange.effectiveFrom), money(sub.pendingChange.nextMonthlyMinor), money(sub.pendingChange.currentMonthlyMinor))}
                </p>
              ) : null}
              <div className="bill-line bill-line-total">
                <span>{t.amount}</span>
                <span>{money(sub.nextBill.amountMinor)}</span>
              </div>
            </section>
          ) : null}

          {/* Jira GRW-241 — under the next bill, because that is the number it collects. */}
          {sub ? <AutoPayCard autopay={sub.autopay} paidBy={sub.paidBy} currency={currency} lang={lang} /> : null}

          <section className="card bill-card" aria-labelledby="bill-history">
            <h3 id="bill-history" className="bill-card-title bill-card-title-row">
              {t.bills}
              {billing.invoices.length > 0 ? (
                <a className="bill-link" href="/settings/billing/bills">
                  {t.seeAll} ›
                </a>
              ) : null}
            </h3>
            {billing.invoices.length === 0 ? (
              <p className="field-hint">{t.noBills}</p>
            ) : (
              <ul className="bill-invoices">
                {billing.invoices.map((i) => (
                  <li key={i.id}>
                    <a className="bill-invoice" href={`/settings/billing/bills/${i.id}`}>
                    <span className="bill-invoice-when">
                      {day(i.periodStart)}
                      <small className="bill-muted">{i.invoiceNumber}</small>
                    </span>
                    <span className="bill-invoice-amount">{money(i.amountMinor)}</span>
                    <span className={`bill-status ${i.unpaid ? 'is-due' : 'is-paid'}`}>{t.status(i.paymentStatus)}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
