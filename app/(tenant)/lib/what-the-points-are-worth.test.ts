import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatStructuredWhatsappText, receiptRows, whatsappHref, type ReceiptCopy, type ReceiptInput } from './receipt-text';

/**
 * The WhatsApp receipt, reshaped — owner, 2026-10-28, with a sample of the message they wanted.
 *
 * Two faults they named and one they did not. "7 points run out" — points EXPIRE; running out is what a shop
 * does with stock. "You now have 7 points" with no money beside it is not an offer: seven points is seven
 * rupees here and could be seventy at the salon next door. And the items heading said "Your Order (1 item)"
 * in English on a Hindi receipt, because it was written here instead of taken from the vertical's copy.
 */
const money = (minor: number) => `₹${(minor / 100).toLocaleString('en-IN')}`;
const copy: ReceiptCopy = {
  title: 'Payment receipt',
  thanks: 'Thank you for visiting us today.',
  services: 'Your order',
  token: (n) => `Token ${n}`,
  stylist: (name) => `Served by ${name}`,
  packageName: (t) => `${t} (package)`,
  separately: (was, saved) => `Separately ${was} · You save ${saved}`,
  total: (a) => `Total paid: ${a}`,
  saved: (a) => `You saved ${a}`,
  paidBy: (m) => `Paid by ${m}`,
  seeYou: 'See you again soon!',
  rewardsTitle: 'Rewards',
  rewardEarned: (p: number) => `You earned ${p} point towards your next visit.`,
  rewardBalance: (p: number, worth: string | null) =>
    worth ? `You have ${p} points. That is ${worth} off your next bill.` : `You have ${p} points.`,
  rewardExpiry: (p: number, d: string) => `${p} points expire on ${d}.`,
  reviewPrompt: 'Leave us a Google review:',
};

const bill = (over: Partial<ReceiptInput> = {}): ReceiptInput => ({
  businessName: 'County Chicken',
  branchName: null,
  when: '28 Oct 2026, 2:05 pm',
  tokenNo: null,
  stylist: null,
  singles: [{ name: 'Chicken Biryani (Half - 2 pcs)', amountMinor: 10_000 }],
  pkg: null,
  totalMinor: 10_000,
  paidBy: 'Cash',
  ...over,
});
const text = (over: Partial<ReceiptInput> = {}) => formatStructuredWhatsappText(receiptRows(bill(over), copy, money));

describe('the message the customer gets', () => {
  it('leads with the business, the receipt and the date', () => {
    const t = text();
    expect(t.startsWith('*County Chicken*')).toBe(true);
    expect(t).toContain('🧾 Payment receipt');
    expect(t).toContain('📅 28 Oct 2026, 2:05 pm');
  });

  it('names the branch only when there is more than one', () => {
    expect(text({ branchName: 'MG Road' })).toContain('*County Chicken · MG Road*');
    expect(text()).not.toContain('·');
  });

  it('prices every item, and carries a variant under its own line', () => {
    const t = text({
      singles: [
        { name: 'Chicken Biryani (Half - 2 pcs)', amountMinor: 10_000 },
        { name: 'Chicken Drumstick (2 pcs)', amountMinor: 14_000 },
      ],
      totalMinor: 24_000,
    });
    expect(t).toContain('Chicken Biryani (Half - 2 pcs) — *₹100*');
    expect(t).toContain('Chicken Drumstick (2 pcs) — *₹140*');
    expect(t).toContain('💰 *Total paid: ₹240*');
  });

  it('says how it was paid, whatever the method', () => {
    for (const mode of ['Cash', 'UPI', 'Card']) {
      expect(text({ paidBy: mode }), mode).toContain(`✅ Paid by ${mode}`);
    }
  });

  it('takes the items heading from the vertical, never from a sentence written here', () => {
    const src = readFileSync(join(process.cwd(), 'app/(tenant)/lib/receipt-text.ts'), 'utf8');
    // The English sentence survives only in the comment that explains why it is gone.
    expect(src).not.toMatch(/out\.push\(`\*Your Order/);
    expect(src).toContain('${c.itemsHeading}');
  });

  it('names no trade: no emoji belongs to a restaurant, a salon or a garage', () => {
    const src = readFileSync(join(process.cwd(), 'app/(tenant)/lib/receipt-text.ts'), 'utf8');
    // The owner's sample opened with a chicken and a plate. One function writes every vertical's receipt.
    for (const mark of ['\u{1F357}', '\u{1F37D}', '\u{1F487}', '\u{1F527}', '\u{1F6D2}']) {
      expect(src, mark).not.toContain(mark);
    }
  });
});

describe('rewards', () => {
  const rewards = { earnedPoints: 1, redeemedPoints: 0, discountMinor: 0, balancePoints: 7 };

  it('shows what was earned, the balance, and what the balance is worth', () => {
    const t = text({ rewards: { ...rewards, pointValueMinor: 100 } } as Partial<ReceiptInput>);
    expect(t).toContain('🎁 *Rewards*');
    expect(t).toContain('⭐ You earned 1 point towards your next visit.');
    expect(t).toContain('🏆 *You have 7 points. That is ₹7 off your next bill.*');
  });

  it('says the points alone when the rate is unknown — an API a deploy behind', () => {
    const t = text({ rewards } as Partial<ReceiptInput>);
    expect(t).toContain('🏆 *You have 7 points.*');
    expect(t).not.toContain('That is');
  });

  it('gives the expiry its own line, and only when there is one', () => {
    const withDate = text({
      rewards: { ...rewards, expiringPoints: 7, expiringOn: '28 Oct 2027' },
    } as Partial<ReceiptInput>);
    expect(withDate).toContain('⏳ 7 points expire on 28 Oct 2027.');
    expect(text({ rewards } as Partial<ReceiptInput>)).not.toContain('⏳');
  });

  it('expires; it does not run out', () => {
    const en = JSON.parse(readFileSync(join(process.cwd(), 'messages/en.json'), 'utf8'));
    expect(en.payFlow.rewards.receiptExpiry).toContain('expire');
    expect(en.payFlow.rewards.receiptExpiry).not.toContain('run out');
    expect(en.payFlow.rewards.receiptBalance).toContain('{worth}');
  });

  /*
   * Found while printing a sample of the new format: `parseReceiptCard` recognised the rewards block by
   * testing its heading against /^(Rewards|रिवॉर्ड)/i — the English word and one translation. `rewardsTitle`
   * is tenant copy, so a business whose heading read "Your rewards" had the WHOLE block dropped from the
   * WhatsApp receipt: points earned, shown on screen, and missing from the customer's message.
   */
  it('survives a rewards heading that is not the English word', () => {
    const t = formatStructuredWhatsappText(
      receiptRows(bill({ rewards: { ...rewards, pointValueMinor: 100 } } as Partial<ReceiptInput>), { ...copy, rewardsTitle: 'Aapke rewards' }, money),
    );
    expect(t).toContain('🎁 *Aapke rewards*');
    expect(t).toContain('🏆 *You have 7 points. That is ₹7 off your next bill.*');
  });

  it('is absent entirely for a business with rewards off', () => {
    const t = text();
    expect(t).not.toContain('🎁');
    expect(t).not.toContain('🏆');
  });
});

describe('the Google review', () => {
  it('is the business’s own link, at the bottom', () => {
    const url = 'https://maps.google.com/?cid=12495543539324725466';
    const t = text({ googleReviewUrl: url } as Partial<ReceiptInput>);
    expect(t).toContain('⭐ Leave us a Google review:');
    expect(t.trimEnd().endsWith(url)).toBe(true);
  });

  it('is absent when the business has not set one', () => {
    expect(text()).not.toContain('Google review');
  });
});

describe('the wa.me link', () => {
  it('encodes the emoji, the rupee sign and every line break, and survives the round trip', () => {
    const t = text({ rewards: { earnedPoints: 1, redeemedPoints: 0, discountMinor: 0, balancePoints: 7, pointValueMinor: 100 } } as Partial<ReceiptInput>);
    const href = whatsappHref('919800079001', t);
    expect(href.startsWith('https://wa.me/919800079001?text=')).toBe(true);
    // A surrogate pair encodes as the four bytes of one code point; nothing in the query is a raw newline.
    expect(href).toContain('%F0%9F%A7%BE');
    expect(href).toContain('%0A');
    expect(href).not.toContain('\n');
    expect(decodeURIComponent(href.split('?text=')[1]!)).toBe(t);
  });
});
