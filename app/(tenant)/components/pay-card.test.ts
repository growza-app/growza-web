import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import { PayCard } from './PayCard';
import { cameBackPaid } from './PaymentConfirming';
import { PaymentReceived, PaymentReceivedNotice } from './PaymentReceived';
import { BillingBanner } from './BillingBanner';
import { billingCopy } from '../lib/billing-copy';
import type { OwnerBilling } from '../lib/api-types';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }), usePathname: () => '/', useSearchParams: () => new URLSearchParams() }));

/**
 * Jira GRW-556 (follow-up) — one Pay card: how much, for which month, and either Pay now or exactly where to send it.
 * And a banner that only offers to pay when something is owed, and always points somewhere.
 */
const wrap = (node: ReactNode, lang: 'en' | 'hi' = 'en') =>
  renderToStaticMarkup(createElement(NextIntlClientProvider, { locale: lang, messages: lang === 'hi' ? hi : en, children: node }));

const due: NonNullable<OwnerBilling['due']> = {
  invoiceNumber: 'INV-1',
  amountMinor: 79900,
  currency: 'INR',
  periodStart: '2026-10-14',
  billsOwed: 1,
  totalOwedMinor: 79900,
};
const draw = (over: Partial<Parameters<typeof PayCard>[0]> = {}, lang: 'en' | 'hi' = 'en') =>
  wrap(createElement(PayCard, { due, payHow: { supportPhone: '+919599420210' }, canPayOnline: false, lang, ...over }), lang);

describe('the Pay card', () => {
  it('says how much and for which month', () => {
    const html = draw();
    expect(html).toContain('₹799');
    expect(html).toContain('Bill for October 2026');
  });

  it('online payment on: the amount, one Pay now button, and what the payment page offers', () => {
    const html = draw({ canPayOnline: true });
    expect(html).toContain('Pay now');
    expect(html).toContain('Google Pay, PhonePe, Paytm, any UPI app, a card or net banking');
    expect(html).not.toContain('Call us');
  });

  it('online payment off: says so plainly, and gives a number to ring — never a dead end', () => {
    const html = draw();
    expect(html).toContain('Online payment is not switched on for your account yet. Call us to pay.');
    expect(html).toContain('href="tel:+919599420210"');
    expect(html).not.toContain('Pay now');
  });

  it('offers no manual way to pay — no UPI id, no bank details, no UPI-app links', () => {
    const html = draw();
    for (const word of ['upi://', 'tez://', 'phonepe://', '@ybl', 'Account number', 'IFSC', 'bank transfer']) expect(html, word).not.toContain(word);
  });

  it('several unpaid bills: the headline is the oldest, and the total is said once', () => {
    const html = draw({ due: { ...due, billsOwed: 2, totalOwedMinor: 159800 } });
    expect(html).toContain('₹799');
    expect(html).toContain('2 unpaid bills — ₹1,598 in all');
  });

  it('back from the payment page: says it is being confirmed only for a return that says PAID', () => {
    expect(cameBackPaid(new URLSearchParams('paid=1'))).toBe(true);
    expect(cameBackPaid(new URLSearchParams('paid=1&razorpay_payment_link_status=paid&razorpay_payment_id=pay_1'))).toBe(true);
    expect(cameBackPaid(new URLSearchParams('paid=1&razorpay_payment_link_status=cancelled')), 'a cancelled return').toBe(false);
    expect(cameBackPaid(new URLSearchParams('')), 'an ordinary visit').toBe(false);
    expect(draw({ canPayOnline: true })).not.toContain('We are confirming your payment');
  });

  it('in Hindi, throughout', () => {
    const html = draw({ canPayOnline: true }, 'hi');
    expect(html).toContain('अपना बिल भरें');
    expect(html).toContain('Google Pay, PhonePe, Paytm, कोई भी UPI ऐप');
    expect(draw({}, 'hi')).toContain('हमें कॉल करें');
  });
});

describe('the payment-received notice', () => {
  const payment = { amountMinor: 79900, currency: 'INR', paidOn: '2026-10-06' };
  it('says what arrived and when, and thanks them', () => {
    const html = wrap(createElement(PaymentReceivedNotice, { payment, lang: 'en', onClose: () => {} }));
    expect(html).toContain('Payment received');
    expect(html).toContain('₹799 received on 6 Oct 2026. Thank you.');
    expect(html).toContain('role="status"');
  });

  it('has a close button, labelled, with a 44px target', () => {
    const html = wrap(createElement(PaymentReceivedNotice, { payment, lang: 'en', onClose: () => {} }));
    expect(html).toContain('class="payment-received-close"');
    expect(html).toContain('aria-label="Close"');
    expect(readFileSync(path.resolve(__dirname, '../styles/85-settings-fit.css'), 'utf-8')).toMatch(/\.payment-received-close \{[^}]*width: 44px; height: 44px/);
  });

  it('closing is remembered per payment on this device, so the next payment is announced again', () => {
    const src = readFileSync(path.resolve(__dirname, './PaymentReceived.tsx'), 'utf-8');
    expect(src).toMatch(/const id = `\$\{payment\.paidOn\}:\$\{payment\.amountMinor\}`/);
    expect(src).toMatch(/localStorage\.setItem\(KEY, id\)/);
    expect(src).toMatch(/getItem\(KEY\) === id/);
  });

  it('is not drawn until this device has been asked, so a closed notice never flashes', () => {
    expect(wrap(createElement(PaymentReceived, { payment, lang: 'en' }))).toBe('');
    expect(readFileSync(path.resolve(__dirname, './PaymentReceived.tsx'), 'utf-8')).toMatch(/if \(closed !== false\) return null;/);
  });

  it('in Hindi', () => {
    const html = wrap(createElement(PaymentReceivedNotice, { payment, lang: 'hi', onClose: () => {} }), 'hi');
    expect(html).toContain('भुगतान मिल गया');
    expect(html).toContain('धन्यवाद');
  });
});

describe('the banner', () => {
  const draws = (status: string, over: { canPayOnline?: boolean; canOpenBilling?: boolean } = {}) =>
    wrap(createElement(BillingBanner, { billing: { status, message: 'A sentence from the API.' }, lang: 'en', ...over }));

  it('a bill is owed and online payment is on: Pay now', () => {
    expect(draws('SUSPENDED', { canPayOnline: true, canOpenBilling: true })).toContain('Pay now');
  });

  it('a bill is owed and online payment is off: a link to the Pay card, so the banner is never a dead end', () => {
    const html = draws('SUSPENDED', { canOpenBilling: true });
    expect(html).toContain('How to pay');
    expect(html).toContain('href="/settings/billing"');
    expect(html).not.toContain('Pay now');
  });

  it('somebody who cannot open Billing is told to ask the owner', () => {
    expect(draws('PAST_DUE')).toContain('Ask the owner to pay this bill.');
  });

  it.each(['PAUSED', 'CANCELLED', 'EXPIRED'])('%s offers no way to pay — nothing is owed, and Pay now answered "nothing to pay"', (status) => {
    const html = draws(status, { canPayOnline: true, canOpenBilling: true });
    expect(html).not.toContain('Pay now');
    expect(html).not.toContain('How to pay');
    expect(html).toContain('A sentence from the API.');
  });
});

describe('words', () => {
  it('the same sentences exist in Hindi for everything the card and banner say', () => {
    const e = billingCopy('en');
    const h = billingCopy('hi');
    for (const key of ['payTitle', 'payOnlineNote', 'payNotOn', 'payCallUs', 'payConfirming', 'payStillConfirming', 'paymentReceived', 'closeNotice', 'payOnBilling', 'howToPay', 'askOwnerToPay'] as const) {
      expect(h[key], key).not.toBe(e[key]);
      expect(h[key], key).toMatch(/[ऀ-ॿ]/);
    }
  });
});

describe('where the billing banner shows', () => {
  const layout = readFileSync(path.resolve(__dirname, '../layout.tsx'), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  it('on Home only — not above every other screen', () => {
    expect(layout).toMatch(/<HomeOnly>\s*<BillingBanner /);
  });

  it('HomeOnly draws its children at "/" and nothing anywhere else', () => {
    const src = readFileSync(path.resolve(__dirname, './HomeOnly.tsx'), 'utf-8');
    expect(src).toMatch(/usePathname\(\) === '\/' \? <>\{children\}<\/> : null/);
  });
});

describe('how it all fits together', () => {
  const read = (p: string) => readFileSync(path.resolve(__dirname, p), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('the confirming message reads the return address once, then takes the marker out of it — no stale "confirming"', () => {
    const src = read('./PaymentConfirming.tsx');
    expect(src).toMatch(/useState\(\(\) => cameBackPaid\(/);
    expect(src).toMatch(/window\.history\.replaceState\(/);
    expect(read('./PayCard.tsx')).toMatch(/<PaymentConfirming lang=\{lang\} phone=\{phone\} \/>/);
  });

  it('Billing shows the acknowledgement once nothing is due', () => {
    expect(read('../settings/billing/BillingSummary.tsx')).toMatch(/!billing\.due && billing\.lastPayment \? <PaymentReceived/);
  });

  it('Home says it arrived, on Home only, and only while no billing warning is showing', () => {
    expect(read('../layout.tsx')).toMatch(/paymentReceived && !billing \? <PaymentReceived/);
  });

  it('the confirming message re-reads the screen, so the card swaps itself without a tap', () => {
    const src = read('./PaymentConfirming.tsx');
    expect(src).toMatch(/router\.refresh\(\)/);
    expect(src).toMatch(/GIVE_UP_AFTER = 20/);
  });
});

