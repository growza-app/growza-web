import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  confirmRows,
  formatStructuredWhatsappText,
  parseReceiptCard,
  receiptRows,
  receiptText,
  rowsToText,
  whatsappHref,
  type ConfirmCopy,
  type ConfirmInput,
  type ReceiptCopy,
  type ReceiptInput,
} from './receipt-text';

const copy: ReceiptCopy = {
  title: 'Payment receipt',
  thanks: 'Thank you for visiting us today.',
  services: 'Services',
  token: (n) => `Token ${n}`,
  stylist: (name) => `Stylist: ${name}`,
  packageName: (title) => `${title} (package)`,
  separately: (was, saved) => `Separately ${was} · You save ${saved}`,
  total: (amount) => `Total paid: ${amount}`,
  saved: (amount) => `You saved ${amount} with the package`,
  paidBy: (mode) => `Paid by ${mode}`,
  seeYou: 'See you again soon!',
};
const money = (minor: number) => `₹${(minor / 100).toLocaleString('en-IN')}`;

const full: ReceiptInput = {
  businessName: 'Maya Unisex',
  branchName: 'MG Road',
  when: '7 Oct 2026, 11:42 AM',
  tokenNo: 7,
  stylist: 'Rahul',
  singles: [
    { name: 'Haircut', amountMinor: 30000 },
    { name: 'Beard Trim', amountMinor: 15000 },
    { name: 'Haircut', amountMinor: 30000 },
  ],
  pkg: { title: 'Groom Basic', services: ['Haircut', 'Beard Trim'], paidMinor: 39900, separateMinor: 45000 },
  totalMinor: 114900,
  paidBy: 'UPI',
};

describe('the WhatsApp bill (owner, 2026-10-07)', () => {
  it('reads as the format the owner approved', () => {
    expect(receiptText(full, copy, money)).toBe(
      [
        '*Maya Unisex* · MG Road',
        'Payment receipt',
        '',
        'Thank you for visiting us today.',
        '',
        '📅 7 Oct 2026, 11:42 AM',
        '🎟 Token 7 · Stylist: Rahul',
        '',
        '*Services*',
        'Haircut × 2 — ₹600',
        'Beard Trim — ₹150',
        'Groom Basic (package) — ₹399',
        '  _Haircut, Beard Trim_',
        '  _Separately ₹450 · You save ₹51_',
        '',
        '*Total paid: ₹1,149*',
        '🎉 You saved ₹51 with the package',
        'Paid by UPI',
        '',
        'See you again soon! 🙏',
      ].join('\n'),
    );
  });

  it('says only what is true: no token, no stylist, no package, no saving lines', () => {
    const text = receiptText({ ...full, branchName: null, tokenNo: null, stylist: null, pkg: null, totalMinor: 75000 }, copy, money);
    expect(text).not.toMatch(/Token|Stylist|package|save|🎟|🎉/);
    expect(text.split('\n')[0]).toBe('*Maya Unisex*');
  });

  it('a stylist with no token has no ticket mark', () => {
    expect(receiptText({ ...full, tokenNo: null }, copy, money)).toContain('\nStylist: Rahul\n');
  });

  it('a package charged at or above its services shows no saving', () => {
    const text = receiptText({ ...full, pkg: { ...full.pkg!, paidMinor: 45000 } }, copy, money);
    expect(text).not.toMatch(/save/i);
  });

  it('greets nobody by name: the thanks line is the copy, word for word', () => {
    expect(receiptText(full, copy, money).split('\n')[3]).toBe(copy.thanks);
  });

  it('a name with WhatsApp marks in it cannot turn the line bold or italic', () => {
    const text = receiptText(
      { ...full, businessName: 'Glam*Studio', singles: [{ name: 'Hair_Spa_Combo', amountMinor: 50000 }], pkg: null },
      copy,
      money,
    );
    expect(text.split('\n')[0]).toBe('*Glam Studio* · MG Road');
    expect(text).toContain('\nHair Spa Combo — ₹500\n');
  });

  it('the text is written from the same rows the preview draws', () => {
    expect(rowsToText(receiptRows(full, copy, money))).toBe(receiptText(full, copy, money));
    expect(receiptRows(full, copy, money)[0]).toEqual([{ t: 'Maya Unisex', bold: true }, { t: ' · ' }, { t: 'MG Road' }]);
  });

  it('opens WhatsApp on that number with the bill typed out', () => {
    expect(whatsappHref('919876543210', 'Hi & bye')).toBe('https://wa.me/919876543210?text=Hi%20%26%20bye');
  });

  it('a product-only sale omits the Services heading and leads with Products', () => {
    const text = receiptText(
      {
        ...full,
        tokenNo: null,
        stylist: null,
        singles: [],
        pkg: null,
        products: [{ name: 'Argan Oil 100ml', amountMinor: 45900 }],
        totalMinor: 45900,
      },
      { ...copy, products: 'Products' },
      money,
    );
    expect(text).not.toContain('*Services*');
    expect(text).toContain('*Products*\nArgan Oil 100ml — ₹459');
  });
});

describe('the screen after Mark done offers the bill', () => {
  const sheet = readFileSync(new URL('../components/NewVisitSheet.tsx', import.meta.url), 'utf8');
  const share = readFileSync(new URL('../components/ReceiptShare.tsx', import.meta.url), 'utf8');

  it('builds the bill once, as the payment lands, and keeps it on the stage', () => {
    // The page refreshes after every payment and a paid token leaves the route's props; a bill rebuilt per render moved.
    expect(sheet.match(/setStage\(withBill\(\{\s*step: 'paid'/g)).toHaveLength(3);
    expect(sheet).not.toMatch(/setStage\(\{\s*step: 'paid'/);
    // Owner, 2026-10-10 — shown by the shared done screen (`PaymentDone`), which the three-tap flow ends on too.
    expect(sheet).toMatch(/bill=\{stage\.bill\}\s*phone=\{stage\.client\.phone \|\| null\}/);
  });

  it('never puts the client’s name on it', () => {
    const builder = sheet.slice(sheet.indexOf('const billFor'), sheet.indexOf('const busy ='));
    expect(builder).not.toMatch(/clientName|client\.name|newName/);
  });

  it('after a payment, the shared done screen: Next customer, then Done and Fix a mistake', () => {
    // Owner, 2026-10-10 — the one-page form ends on the three-tap flow's screen, not a lone quiet Done.
    const done = readFileSync(new URL('../components/PaymentDone.tsx', import.meta.url), 'utf8');
    expect(sheet).toMatch(/<PaymentDone/);
    expect(done).toMatch(/className="btn pf-go" onClick=\{onNextCustomer\}/);
    expect(done).toMatch(/className="btn btn-ghost pf-go-alt" onClick=\{onDone\}/);
  });

  it('prints the bill alone, with the rest of the page taken out rather than hidden', () => {
    const css = readFileSync(new URL('../styles/72-walk-in-sheet.css', import.meta.url), 'utf8');
    expect(css).toMatch(/body:has\(> \.wi-receipt-print\) > \*:not\(\.wi-receipt-print\) \{\s*display: none !important;/);
    expect(css).not.toMatch(/visibility: hidden;/);
    expect(share).toMatch(/mounted && canPrint\s*\? createPortal\(/);
    // Owner, 2026-10-07 — and only a bill prints: nobody hands a client a printed sheet of their queue number.
    expect(share).toMatch(/const canPrint = kind === 'bill';/);
  });

  it('Share only on a touch screen; Change has a way back to the client’s number', () => {
    expect(share).toMatch(/window\.matchMedia\('\(pointer: coarse\)'\)\.matches/);
    expect(share).toMatch(/onClick=\{backToTheirs\}/);
  });

  it('opens WhatsApp only with a usable number, disables the button when there is no number, and needs no WhatsApp API', () => {
    expect(share).toMatch(/href=\{whatsappHref\(digits, text\)\}/);
    expect(share).toMatch(/const digits = problem \? '' :/);
    expect(share).toMatch(/className="btn wi-receipt-send"\s+disabled/);
    expect(share).not.toMatch(/api\./);
  });
});


/** Owner, 2026-10-07 — the other message: what was booked, or what they are waiting for. It never says "paid". */
describe('the WhatsApp confirmation', () => {
  const copy: ConfirmCopy = {
    title: 'Booking confirmed',
    token: (n) => `Token ${n}`,
    stylist: (name) => `Stylist: ${name}`,
    seeYou: 'See you then!',
  };
  const booked: ConfirmInput = {
    businessName: 'Maya Unisex',
    branchName: 'MG Road',
    when: 'Sat, 11 Oct · 11:30 AM',
    tokenNo: null,
    stylist: 'Rahul',
  };
  const text = (i: ConfirmInput, c: ConfirmCopy = copy) => rowsToText(confirmRows(i, c));

  it('is the day and the person, and nothing else', () => {
    expect(text(booked)).toBe(
      ['*Maya Unisex* · MG Road', 'Booking confirmed', '', '📅 Sat, 11 Oct · 11:30 AM', 'Stylist: Rahul', '', 'See you then! 🙏'].join('\n'),
    );
  });

  /**
   * Owner, 2026-10-07 — a visit grows. Somebody booked for a haircut leaves having had a beard trim too, and a
   * message quoting ₹300 against a bill of ₹800 is an argument at the counter that the message started.
   */
  it('quotes no service and no amount: there is no money in it at all', () => {
    expect(text(booked)).not.toMatch(/₹|\d+\.\d{2}|Total|Services/);
    expect(text({ ...booked, when: null, tokenNo: 7, stylist: null })).not.toMatch(/₹|Total|Services/);
  });

  it('never says a word about having been paid', () => {
    expect(text(booked)).not.toMatch(/paid|receipt|thank you for visiting/i);
  });

  it('a queued visit leads on its token and has no day', () => {
    const queued = text(
      { ...booked, when: null, tokenNo: 7, stylist: null },
      { ...copy, title: 'You are in the queue', seeYou: 'See you soon!' },
    );
    expect(queued.split('\n')[1]).toBe('You are in the queue');
    expect(queued).toContain('🎟 Token 7');
    expect(queued).not.toMatch(/📅/);
  });

  it('promises no call: the queue is called out by its number, and nothing here rings anybody', () => {
    expect(text({ ...booked, when: null, tokenNo: 7 }, { ...copy, seeYou: 'See you soon!' })).not.toMatch(/call|ring|phone/i);
  });

  it('a salon called Glam*Studio cannot turn its own message bold', () => {
    expect(text({ ...booked, businessName: 'Glam*Studio' }).split('\n')[0]).toBe('*Glam Studio* · MG Road');
  });
});

describe('Graphic Receipt Card model, structured WhatsApp text, and optional Rewards support', () => {
  it('parses POS order rows into a structured graphic card model and safe BMP WhatsApp text', () => {
    const rows = receiptRows(
      {
        businessName: 'County Chicken',
        branchName: 'Main Outlet',
        when: '24 Oct 2026, 11:21 pm',
        tokenNo: 15,
        stylist: null,
        singles: [],
        pkg: null,
        products: [
          { name: 'Chicken Drumstick (2 pcs)', amountMinor: 14000 },
          { name: 'Chicken Gharwala (Full - 6 pcs)', amountMinor: 30000 },
        ],
        totalMinor: 34000,
        paidBy: 'Cash',
        rewards: {
          redeemedPoints: 100,
          redeemedMinor: 10000,
          earnedPoints: 34,
          balancePoints: 420,
        },
      },
      { ...copy, products: 'Menu' },
      money,
    );

    const card = parseReceiptCard(rows);
    expect(card.businessName).toBe('County Chicken');
    expect(card.branchName).toBe('Main Outlet');
    expect(card.tokenLabel).toBe('#15');
    expect(card.totalItemsCount).toBe(2);
    expect(card.items[0]).toEqual({
      qty: 1,
      name: 'Chicken Drumstick (2 pcs)',
      amount: '₹140',
      details: [],
      section: 'Menu',
    });
    expect(card.rewardsEarned).toBe('+34 Reward Points earned');
    expect(card.rewardsBalance).toBe('420 pts');

    const waText = formatStructuredWhatsappText(rows);
    expect(waText).toContain('*County Chicken · Main Outlet*');
    expect(waText).toContain('Payment receipt · *Token #15*');
    expect(waText).toContain('*Your Order (2 items)*');
    expect(waText).toContain('• 1 × Chicken Drumstick (2 pcs) — *₹140*');
    expect(waText).toContain('*Total paid: ₹340*');
    expect(waText).toContain('✓ Paid by Cash');
    expect(waText).toContain('*Rewards*');
    expect(waText).toContain('★ +34 Reward Points earned');
    // The whole line, as the receipt wrote it: the text no longer labels it in English of its own.
    expect(waText).toContain('*Available balance: 420 pts*');
    expect(waText).not.toMatch(/📅|🎟|🙏|🎉/);
  });

  /**
   * Owner, 2026-10-27 — "we just show current trans reward, we should show both".
   *
   * The balance line is the tenant's own sentence now, so it reaches WhatsApp in the owner's language and
   * the card still has a figure to put under BALANCE.
   */
  it('says what the bill earned AND what the customer now has, in the words the tenant chose', () => {
    const rows = receiptRows(
      {
        businessName: 'Glow Salon',
        branchName: null,
        when: '27 Oct 2026, 6:40 pm',
        tokenNo: null,
        stylist: null,
        singles: [{ name: 'Haircut', amountMinor: 30000 }],
        pkg: null,
        totalMinor: 30000,
        paidBy: 'Cash',
        rewards: { redeemedPoints: 0, earnedPoints: 38, balancePoints: 420 },
      },
      {
        ...copy,
        rewardsTitle: 'Rewards',
        rewardEarned: (points) => `You earned ${points} points towards your next visit.`,
        rewardBalance: (points) => `You now have ${points} points.`,
      },
      money,
    );

    const card = parseReceiptCard(rows);
    expect(card.rewardsEarned).toBe('You earned 38 points towards your next visit.');
    // The sentence for the message...
    expect(card.rewardsBalanceLine).toBe('You now have 420 points.');
    // ...and the figure alone for the card and the image, which show it under a BALANCE label.
    expect(card.rewardsBalance).toBe('420 points');

    const waText = formatStructuredWhatsappText(rows);
    expect(waText).toContain('★ You earned 38 points towards your next visit.');
    expect(waText).toContain('*You now have 420 points.*');
    expect(waText).not.toContain('Available balance');
  });

  /**
   * QA 2026-10-27 (loophole L4) — and the date on that promise.
   *
   * "You now have 420 points" with nothing after it is a number the business has not promised: points die
   * at 365 days, and the day the client finds out is the day they try to spend them. The line sits under
   * the balance, and a business whose points never die prints nothing extra.
   */
  it('puts a date under the balance, and reads it back as its own line rather than as a second balance', () => {
    const withDate = (rewards: object) =>
      receiptRows(
        {
          businessName: 'Glow Salon',
          branchName: null,
          when: '27 Oct 2026, 6:40 pm',
          tokenNo: null,
          stylist: null,
          singles: [{ name: 'Haircut', amountMinor: 30000 }],
          pkg: null,
          totalMinor: 30000,
          paidBy: 'Cash',
          rewards,
        },
        {
          ...copy,
          rewardsTitle: 'Rewards',
          rewardEarned: (points) => `You earned ${points} points towards your next visit.`,
          rewardBalance: (points) => `You now have ${points} points.`,
          rewardExpiry: (points, date) => `${points} points run out on ${date}.`,
        },
        money,
      );

    const rows = withDate({ redeemedPoints: 0, earnedPoints: 38, balancePoints: 420, expiringPoints: 38, expiringOn: '27 Oct 2027' });
    const card = parseReceiptCard(rows);
    // The balance is still read as the balance: the date must not be mistaken for a second one.
    expect(card.rewardsBalance).toBe('420 points');
    expect(card.rewardsBalanceLine).toBe('You now have 420 points.');
    expect(card.rewardsExpiryLine).toBe('38 points run out on 27 Oct 2027.');

    const waText = formatStructuredWhatsappText(rows);
    expect(waText).toContain('*You now have 420 points.*');
    expect(waText).toContain('38 points run out on 27 Oct 2027.');

    // ...and a business whose points never die says nothing about dates at all.
    const forever = parseReceiptCard(withDate({ redeemedPoints: 0, earnedPoints: 38, balancePoints: 420 }));
    expect(forever.rewardsExpiryLine).toBeNull();
    expect(formatStructuredWhatsappText(withDate({ redeemedPoints: 0, earnedPoints: 38, balancePoints: 420 }))).not.toMatch(/run out/);
  });

  /**
   * Found at the till, 2026-10-27: the card read "★ Leave us a Google review:" as the earning and the
   * twenty digits of the review link's id as the balance. The Rewards block ends at its blank line.
   */
  it('does not read the Google review link as a reward', () => {
    const rows = receiptRows(
      {
        businessName: 'Glow Salon',
        branchName: null,
        when: '27 Oct 2026, 8:10 pm',
        tokenNo: 6,
        stylist: null,
        singles: [],
        products: [{ name: 'Aloe Vera Gel', amountMinor: 15000 }],
        pkg: null,
        totalMinor: 15000,
        paidBy: 'Cash',
        rewards: { redeemedPoints: 0, earnedPoints: 3, balancePoints: 3 },
        googleReviewUrl: 'https://maps.google.com/?cid=12495543539324725466',
      },
      { ...copy, rewardsTitle: 'Rewards', rewardEarned: (points) => `You earned ${points} points towards your next visit.`, rewardBalance: (points) => `You now have ${points} points.` },
      money,
    );
    const card = parseReceiptCard(rows);
    expect(card.rewardsEarned).toBe('You earned 3 points towards your next visit.');
    expect(card.rewardsBalance).toBe('3 points');
    expect(card.googleReviewUrl).toBe('https://maps.google.com/?cid=12495543539324725466');
    expect(card.rewardsBalance).not.toContain('12495543539324725466');
  });

  it('reads the figure out of a Hindi balance line too', () => {
    const rows = receiptRows(
      {
        businessName: 'Glow Salon',
        branchName: null,
        when: '27 Oct 2026',
        tokenNo: null,
        stylist: null,
        singles: [{ name: 'Haircut', amountMinor: 30000 }],
        pkg: null,
        totalMinor: 30000,
        paidBy: 'नकद',
        rewards: { redeemedPoints: 0, earnedPoints: 38, balancePoints: 420 },
      },
      { ...copy, rewardsTitle: 'रिवॉर्ड', rewardBalance: (points) => `अब आपके पास ${points} पॉइंट हैं।` },
      money,
    );
    const card = parseReceiptCard(rows);
    expect(card.rewardsBalanceLine).toBe('अब आपके पास 420 पॉइंट हैं।');
    expect(card.rewardsBalance).toBe('420 पॉइंट');
  });

  it('uses Services and Products headings (not Your Order) and drops 1 × for single salon services', () => {
    const rows = receiptRows(
      {
        ...full,
        products: [{ name: 'Argan Oil 100ml', amountMinor: 45900 }],
        totalMinor: 160800,
      },
      { ...copy, products: 'Products' },
      money,
    );
    const card = parseReceiptCard(rows);
    expect(card.isOrder).toBe(false);
    expect(card.itemsHeading).toBe('Services');
    expect(card.items).toHaveLength(4);

    const waText = formatStructuredWhatsappText(rows);
    expect(waText).toContain('Payment receipt · *Token #07*\nStylist: Rahul · 7 Oct 2026, 11:42 AM');
    expect(waText).not.toContain('Your Order');
    expect(waText).toContain('*Services*\n───────────────\n• Haircut × 2 — *₹600*\n• Beard Trim — *₹150*');
    expect(waText).toContain('*Products*\n───────────────\n• Argan Oil 100ml — *₹459*');
    expect(waText).not.toContain('1 × Beard Trim');
    expect(waText).not.toContain('Leave us a Google review');
  });

  it('includes the Google review link at the bottom of the WhatsApp receipt when configured', () => {
    const rows = receiptRows(
      {
        ...full,
        googleReviewUrl: 'https://g.page/r/CdX8-example/review',
      },
      { ...copy, reviewPrompt: 'Leave us a Google review:' },
      money,
    );
    const card = parseReceiptCard(rows);
    expect(card.googleReviewUrl).toBe('https://g.page/r/CdX8-example/review');
    expect(card.reviewPrompt).toBe('Leave us a Google review:');

    const waText = formatStructuredWhatsappText(rows);
    expect(waText).toContain('Thank you for visiting us today. See you again soon!\n\n★ Leave us a Google review:\nhttps://g.page/r/CdX8-example/review');
  });

  it('shortens long Google Search review URLs (#lrd feature IDs and #sv state blobs) inside WhatsApp receipts', () => {
    const lrdRows = receiptRows(
      {
        ...full,
        googleReviewUrl:
          'https://www.google.com/search?sca_esv=084b9684899c43cd&rlz=1C5XQIR_enIN1229IN1229&cs=1&output=search&kgmid=/g/11zyj0cvl9&q=County+chicken.&shem=dlvs1,epsd1,esd2e,ltae,rimspwouoe,sdpie&shndl=30&source=sh/x/loc/uni/m1/1&kgs=465d63ef4678514d#lrd=0x3999570027d7e0df:0xad6916a510e0a8da,3,,,,',
      },
      { ...copy, reviewPrompt: 'Leave us a Google review:' },
      money,
    );
    expect(formatStructuredWhatsappText(lrdRows)).toContain(
      '★ Leave us a Google review:\nhttps://maps.google.com/?cid=12495543539324725466',
    );

    const svRows = receiptRows(
      {
        ...full,
        googleReviewUrl:
          'https://www.google.com/search?q=county+chicken.+lucknow&sxsrf=APpeQnvlfxd3GgdwFpquVUTcLRXjoSkNRA%3A1793028820507#sv=CAESzQEKuQEStgEKd0FKaVQ0dEpxbzVKR3A5dmhUSDVlTEFzNTk4Tk0wZUtyd3Vhc2lJbVV1M0s4NWlDWWo4QnBjc005RHBTT05ELVZqTS1EaGZkYmE5Xy04RF94Y24xTkpXM3ozZEtFWnNja2MwWmNucDgtV3VlbFhOaDlzR09yRnZjEhc3bkxmYW9tNEw3NlpodmNQc08yQnFBMBoiQURzcjlmUVdzSU9HWjBrbWs0Tl',
      },
      { ...copy, reviewPrompt: 'Leave us a Google review:' },
      money,
    );
    expect(formatStructuredWhatsappText(svRows)).toContain(
      '★ Leave us a Google review:\nhttps://www.google.com/search?q=county+chicken.+lucknow',
    );
  });
});
