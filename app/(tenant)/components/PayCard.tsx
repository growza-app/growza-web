import type { OwnerBilling } from '../lib/api-types';
import { formatMoney } from '../lib/format';
import { billingCopy } from '../lib/billing-copy';
import type { Lang } from '../lib/lang';
import { PayNowButton } from './PayNowButton';
import { PaymentConfirming } from './PaymentConfirming';

/**
 * Jira GRW-556 (follow-up) — the one place an owner is told how to pay.
 *
 * Paying was spread over ten notices and buttons that could stack, and with online payment off — the default — an owner
 * read "pay your bill" and was given nothing to pay WITH. This is one card, at the top of Billing, that always says how
 * much, for which month, and what to do:
 *
 * - Online payment on: the amount and one Pay now button. Razorpay's page takes any UPI app, a card or net banking, and
 *   tells Growza the moment it is paid — which is what marks the bill Paid and clears the warning, with nobody in between.
 * - Online payment off for this business: the amount, a plain sentence that it is not switched on yet, and a number to ring.
 *
 * Online only on purpose (product owner, 2026-10-06). A manual "send it to this UPI id" path was built and taken out: nothing
 * can tell Growza that money reached a personal UPI id, so "payment received" would have waited on a person noticing.
 *
 * When Razorpay has just sent the owner back here, `PaymentConfirming` (inside) says the payment is being confirmed — it reads
 * the return address itself, once, so it is not fooled by a stale or bookmarked one.
 *
 * A server component with the client buttons inside it. The amounts are the API's (`due.amountMinor` is what is STILL owed
 * on that bill, so a part payment already counts); nothing is added up here.
 */
export function PayCard({
  due,
  payHow,
  canPayOnline,
  lang,
}: {
  due: NonNullable<OwnerBilling['due']>;
  payHow: OwnerBilling['payHow'];
  canPayOnline: boolean;
  lang: Lang;
}) {
  const t = billingCopy(lang);
  const locale = lang === 'hi' ? 'hi-IN' : 'en-IN';
  const money = (minor: number) => formatMoney(minor, due.currency, locale);
  const [y, m, d] = due.periodStart.split('-').map(Number);
  const month = new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const phone = payHow?.supportPhone;

  return (
    <section className="card pay-card" aria-labelledby="pay-card-title" data-testid="pay-card">
      <h3 id="pay-card-title" className="pay-card-title">{t.payTitle}</h3>
      <div className="pay-card-amount">
        <span className="pay-card-figure">{money(due.amountMinor)}</span>
        <span className="pay-card-for">{t.payFor(month)}</span>
      </div>
      {due.billsOwed > 1 ? <p className="pay-card-more">{t.payMoreBills(due.billsOwed, money(due.totalOwedMinor))}</p> : null}

      <PaymentConfirming lang={lang} phone={phone} />

      {canPayOnline ? (
        <div className="pay-card-action">
          <PayNowButton restricted={false} />
          <p className="pay-card-note">{t.payOnlineNote}</p>
        </div>
      ) : (
        <div className="pay-card-offline">
          <p className="pay-card-note">{t.payNotOn}</p>
          {phone ? (
            <a className="btn pay-card-call" href={`tel:${phone.replace(/[^\d+]/g, '')}`}>
              {t.payCallUs} · {phone}
            </a>
          ) : null}
        </div>
      )}
    </section>
  );
}
