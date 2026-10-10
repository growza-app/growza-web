import { screenTitle } from '../../../../lib/page-title';
import { formatMoney } from '../../../../lib/format';
import { api, ApiError } from '../../../../lib/api';
import { serverLang } from '../../../../lib/lang';
import { billingCopy } from '../../../../lib/billing-copy';
import { PrintButton } from './PrintButton';
import { getTranslations } from 'next-intl/server';

export const dynamic = 'force-dynamic';

/**
 * Jira GRW-254 — one bill, opened: plan, extra branches, discount, the amount and
 * whether it is paid. No GST (owner decision, 2026-09-14): the figures are the
 * stored invoice's plan figures. Prints on one page.
 */
export default async function BillPage({ params }: { params: Promise<{ id: string }> }) {
  const lang = await serverLang();
  const t = billingCopy(lang);
  const { id } = await params;
  const bill = await api.bill(id).catch((e) => (e instanceof ApiError && e.status === 404 ? 'missing' : null));
  if (bill === 'missing') return <div className="banner">{t.notFound}</div>;
  if (!bill) return <div className="banner">{t.loadError}</div>;

  const locale = lang === 'hi' ? 'hi-IN' : 'en-IN';
  const money = (minor: number) => formatMoney(minor, bill.currency, locale);
  const date = (iso: string, opts: Intl.DateTimeFormatOptions) => {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString(locale, { ...opts, timeZone: 'UTC' });
  };
  const full = { day: 'numeric', month: 'short', year: 'numeric' } as const;
  // Jira GRW-407 — what paid this bill, in the owner's words.
  const tm = await getTranslations('billingMoney');
  const how = (p: NonNullable<typeof bill.payments>[number]) =>
    `${p.via === 'autopay' ? tm('viaAutopay') : p.via === 'pay_now' ? tm('viaPayNow') : tm('viaRecorded')}${p.fromAccount ? ` (${tm('fromAccount')})` : ''}`;

  return (
    <div className="bill-page bill-print">
      <a className="bill-link bill-back no-print" href="/settings/billing/bills">‹ {t.allBills}</a>
      <section className="card bill-card bill-doc">
        <div className="bill-doc-head">
          <div>
            <h2 className="bp-title">{t.billFor(date(bill.periodStart, { month: 'long', year: 'numeric' }))}</h2>
            <p className="bill-muted bill-doc-meta">
              {t.billNumber}: {bill.invoiceNumber} · {t.period}: {date(bill.periodStart, full)} – {date(bill.periodEnd, full)} · {t.issued}: {date(bill.issuedAt, full)}
            </p>
          </div>
          <span className={`bill-status ${bill.unpaid ? 'is-due' : 'is-paid'}`}>{t.status(bill.paymentStatus)}</span>
        </div>
        <div className="bill-line">
          <span>
            {t.plan}: {bill.planName ?? bill.planCode}
          </span>
          <span>{money(bill.planPriceMinor)}</span>
        </div>
        {bill.branchAmountMinor > 0 ? (
          <div className="bill-line">
            <span>{t.extraBranches(bill.extraBranches, money(bill.branchAddonMinor))}</span>
            <span>{money(bill.branchAmountMinor)}</span>
          </div>
        ) : null}
        {bill.discountAmountMinor > 0 ? (
          <div className="bill-line bill-discount">
            <span>{t.discount}</span>
            <span>− {money(bill.discountAmountMinor)}</span>
          </div>
        ) : null}
        <div className="bill-line bill-line-total">
          <span>{t.amount}</span>
          <span>{money(bill.amountMinor)}</span>
        </div>
        <div className="bill-paid" data-testid="bill-payments">
          <h3 className="bill-card-title">{tm('paidHeading')}</h3>
          {(bill.payments ?? []).length === 0 ? (
            <p className="field-hint">{tm('nothingPaid')}</p>
          ) : (
            <ul className="bill-invoices">
              {(bill.payments ?? []).map((p, i) => (
                <li key={i} className="bill-line">
                  <span>
                    {p.amountMinor === 0
                      ? tm('refundedLine', { amount: money(p.refundedMinor), how: how(p), date: p.paidOn ? date(p.paidOn, full) : '—' })
                      : tm('paidLine', { amount: money(p.amountMinor), how: how(p), date: p.paidOn ? date(p.paidOn, full) : '—' })}
                    {p.amountMinor > 0 && p.refundedMinor > 0 ? ` (${tm('refundedPart', { amount: money(p.refundedMinor) })})` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="bill-doc-actions no-print">
          {/* Jira GRW-556 (follow-up) — paying lives in one place. Pay now here paid the OLDEST bill, not this one, and said nothing at all when online payment was off. */}
          {bill.unpaid ? (
            <a className="btn" href="/settings/billing">
              {t.payOnBilling}
            </a>
          ) : null}
          <PrintButton label={t.print} />
        </div>
      </section>
    </div>
  );
}

export const metadata = screenTitle('Bill');
