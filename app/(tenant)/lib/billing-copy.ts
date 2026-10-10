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
    paidOffline: S('Pay Growza by UPI. We mark it as paid.', 'UPI से Growza को भुगतान करें। हम इसे भुगतान हुआ मार्क कर देंगे।'),
    /*
     * Jira GRW-241 — UPI AutoPay, in the plainest words available.
     *
     * "Mandate" is the banking word and it is not used anywhere an owner can
     * see it: the screen says automatic payment, and the amount, and the fact
     * that it is approved in their own UPI app. Same rule as "Minutes" over
     * "Takes" — take the plainer word even when the design says otherwise.
     */
    paidAutopay: S('Paid automatically from your UPI each month.', 'हर महीने आपके UPI से अपने आप भुगतान हो जाता है।'),
    /**
     * Jira GRW-413 — AutoPay exists and has stopped collecting.
     *
     * Not `paidOnline`: a salon whose AutoPay halted used to read "pay online
     * when the bill arrives, with Pay now" on the very screen that should have
     * been asking them to re-approve it. What to DO is the card below; this line
     * only has to stop claiming the bill is being collected.
     */
    paidAutopayHalted: S('Automatic payment has stopped — see below.', 'अपने आप भुगतान बंद हो गया है — नीचे देखें।'),
    autopay: S('Automatic payment', 'अपने आप भुगतान'),
    autopayOffExplain: S(
      'Approve once in your UPI app and every month’s bill is paid on its own. You can stop it any time from your UPI app.',
      'अपने UPI ऐप में एक बार मंज़ूरी दें और हर महीने का बिल अपने आप भर जाएगा। आप इसे कभी भी अपने UPI ऐप से बंद कर सकते हैं।',
    ),
    autopaySetUp: S('Set up automatic payment', 'अपने आप भुगतान चालू करें'),
    autopayAgain: S('Turn automatic payment back on', 'अपने आप भुगतान फिर चालू करें'),
    // `cancelled` is not "never set up": the owner stopped it, usually in their
    // own UPI app, and being told "set it up" as though nothing happened reads
    // as the product not noticing.
    autopayStopped: S('Automatic payment is off. You stopped it, so bills come to you to pay.', 'अपने आप भुगतान बंद है। आपने इसे बंद किया था, इसलिए बिल आपको भरना होगा।'),
    autopayPaused: S('Automatic payment is paused.', 'अपने आप भुगतान रुका हुआ है।'),
    /*
     * Jira GRW-413 — a halted AutoPay's sentence is `autopayRenewal.halted` in
     * `web/messages`, beside the rest of the AutoPay asks, because it comes with
     * two buttons rather than being a line of card text. What used to be here
     * ("the last automatic payment did not go through — pay this bill, then turn
     * it back on") told the owner to pay a bill and offered no way to pay it.
     */
    autopayWaiting: S('Waiting for you to approve it in your UPI app.', 'आपके UPI ऐप में मंज़ूरी का इंतज़ार है।'),
    autopayFinish: S('Finish approving', 'मंज़ूरी पूरी करें'),
    autopayOn: (amount: string) => S(`On — ${amount} a month`, `चालू — ${amount} प्रति माह`),
    autopayOnSince: (d: string) => S(`Approved ${d}`, `${d} को मंज़ूर`),
    autopayOpening: S('Opening…', 'खुल रहा है…'),
    autopayError: S('We could not start automatic payment just now. Please try again shortly.', 'अभी अपने आप भुगतान चालू नहीं हो सका। कृपया थोड़ी देर बाद कोशिश करें।'),
    change: (from: string, amount: string, now: string) =>
      S(`From ${from} your bill is ${amount} a month (now ${now}).`, `${from} से आपका बिल ${amount} प्रति माह होगा (अभी ${now})।`),
    /*
     * Jira GRW-556 (follow-up) — the Pay card. One card, one set of words, whether or not there is a Pay now button: it says
     * how much, for which month, and either the button or exactly where to send the money. "Bill" throughout; "invoice",
     * "link" and "mandate" are not words an owner reads.
     */
    payTitle: S('Pay your bill', 'अपना बिल भरें'),
    payFor: (month: string) => S(`Bill for ${month}`, `${month} का बिल`),
    payMoreBills: (n: number, total: string) =>
      S(`You have ${n} unpaid bills — ${total} in all. The oldest is paid first.`, `आपके ${n} बिल बाकी हैं — कुल ${total}। सबसे पुराना पहले भरा जाएगा।`),
    howToPay: S('How to pay', 'भुगतान कैसे करें'),
    askOwnerToPay: S('Ask the owner to pay this bill.', 'कृपया मालिक से यह बिल भरने को कहें।'),
    payOnlineNote: S(
      'You pay on a secure page. Choose Google Pay, PhonePe, Paytm, any UPI app, a card or net banking.',
      'आप एक सुरक्षित पेज पर भुगतान करते हैं। Google Pay, PhonePe, Paytm, कोई भी UPI ऐप, कार्ड या नेट बैंकिंग चुनें।',
    ),
    payNotOn: S('Online payment is not switched on for your account yet. Call us to pay.', 'आपके अकाउंट पर ऑनलाइन भुगतान अभी चालू नहीं है। भुगतान के लिए हमें कॉल करें।'),
    payCallUs: S('Call us', 'हमें कॉल करें'),
    payConfirming: S('Thank you. We are confirming your payment — this usually takes a few seconds.', 'धन्यवाद। हम आपका भुगतान पक्का कर रहे हैं — इसमें आमतौर पर कुछ सेकंड लगते हैं।'),
    payStillConfirming: S('Still waiting to hear from the bank. If you have paid, it will show here shortly. You can also call us.', 'बैंक से अभी जवाब नहीं आया। अगर आपने भुगतान कर दिया है तो यह जल्द यहाँ दिखेगा। आप हमें कॉल भी कर सकते हैं।'),
    paymentReceived: S('Payment received', 'भुगतान मिल गया'),
    closeNotice: S('Close', 'बंद करें'),
    paymentReceivedLine: (amount: string, date: string) =>
      S(`${amount} received on ${date}. Thank you.`, `${amount} ${date} को मिला। धन्यवाद।`),
    payOnBilling: S('Pay it on the Billing page', 'इसे बिल पेज पर भरें'),
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
