import type { Lang } from './lang';

/**
 * Jira GRW-243 — Settings › Billing, in English and Hindi. This screen joins the
 * translated surfaces (Home, header, nav): an owner reading their bill should
 * read it in their language. Plain words over billing words — "Next bill", not
 * "Upcoming invoice".
 */
export function billingCopy(lang: Lang) {
  const hi = lang === 'hi';
  const S = (en: string, h: string) => (hi ? h : en);
  return {
    title: S('Billing', 'बिल'),
    sub: S('What you pay Growza, and how.', 'आप Growza को क्या और कैसे भुगतान करते हैं।'),
    yourPlan: S('Your plan', 'आपका प्लान'),
    perMonth: S('a month', 'प्रति माह'),
    included: S('Included', 'शामिल'),
    extraBranch: S('Extra branch', 'अतिरिक्त शाखा'),
    noCharge: S('No extra charge', 'कोई अतिरिक्त शुल्क नहीं'),
    discount: S('Discount', 'छूट'),
    discountUntil: (d: string) => S(`until ${d}`, `${d} तक`),
    monthly: S('Monthly', 'मासिक'),
    nextBill: S('Next bill', 'अगला बिल'),
    on: (d: string) => S(`on ${d}`, `${d} को`),
    amount: S('Amount', 'राशि'),
    paidBy: S('How it is paid', 'भुगतान कैसे होता है'),
    paidOnline: S('Pay online when the bill arrives, with Pay now.', 'बिल आने पर "अभी भुगतान करें" से ऑनलाइन भुगतान करें।'),
    paidOffline: S('Pay Growza by bank transfer or UPI; we record it for you.', 'बैंक ट्रांसफ़र या UPI से Growza को भुगतान करें; हम उसे दर्ज करते हैं।'),
    change: (from: string, amount: string, now: string) =>
      S(`From ${from} your bill is ${amount} a month (now ${now}).`, `${from} से आपका बिल ${amount} प्रति माह होगा (अभी ${now})।`),
    due: S('You have a bill to pay.', 'आपका एक बिल भुगतान के लिए बाकी है।'),
    payNow: S('Pay now', 'अभी भुगतान करें'),
    bills: S('Your bills', 'आपके बिल'),
    seeAll: S('See all bills', 'सभी बिल देखें'),
    allBills: S('All bills', 'सभी बिल'),
    back: S('Back to Billing', 'बिल पर वापस'),
    billFor: (month: string) => S(`Bill for ${month}`, `${month} का बिल`),
    billNumber: S('Bill number', 'बिल नंबर'),
    period: S('Period', 'अवधि'),
    issued: S('Made on', 'बनाया गया'),
    plan: S('Plan', 'प्लान'),
    extraBranches: (n: number, each: string) => S(`Extra branches (${n} × ${each})`, `अतिरिक्त शाखाएँ (${n} × ${each})`),
    print: S('Print', 'प्रिंट करें'),
    notFound: S('This bill was not found.', 'यह बिल नहीं मिला।'),
    noBills: S('No bills yet. Your first bill appears here on its date.', 'अभी कोई बिल नहीं। पहला बिल अपनी तारीख़ पर यहाँ दिखेगा।'),
    noPlan: S('No plan yet. Growza support sets up your plan.', 'अभी कोई प्लान नहीं। Growza सहायता आपका प्लान सेट करती है।'),
    status: (s: string) =>
      s === 'PAID'
        ? S('Paid', 'भुगतान हो गया')
        : s === 'PARTIALLY_PAID'
          ? S('Part paid', 'आंशिक भुगतान')
          : s === 'REFUNDED' || s === 'PARTIALLY_REFUNDED'
            ? S('Refunded', 'वापस किया गया')
            : S('Not paid', 'भुगतान बाकी'),
    loadError: S('Could not load your bill. Try again in a moment.', 'आपका बिल लोड नहीं हो सका। थोड़ी देर बाद फिर कोशिश करें।'),
  };
}
export type BillingCopy = ReturnType<typeof billingCopy>;
