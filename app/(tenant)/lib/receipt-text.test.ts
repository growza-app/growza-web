import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { receiptRows, receiptText, rowsToText, whatsappHref, type ReceiptCopy, type ReceiptInput } from './receipt-text';

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
});

describe('the screen after Mark done offers the bill', () => {
  const sheet = readFileSync(new URL('../components/NewVisitSheet.tsx', import.meta.url), 'utf8');
  const share = readFileSync(new URL('../components/ReceiptShare.tsx', import.meta.url), 'utf8');

  it('builds the bill once, as the payment lands, and keeps it on the stage', () => {
    // The page refreshes after every payment and a paid token leaves the route's props; a bill rebuilt per render moved.
    expect(sheet.match(/setStage\(withBill\(\{\s*step: 'paid'/g)).toHaveLength(3);
    expect(sheet).not.toMatch(/setStage\(\{\s*step: 'paid'/);
    expect(sheet).toMatch(/<ReceiptShare bill=\{stage\.bill\} phone=\{stage\.client\.phone \|\| null\} \/>/);
  });

  it('never puts the client’s name on it', () => {
    const builder = sheet.slice(sheet.indexOf('const billFor'), sheet.indexOf('const busy ='));
    expect(builder).not.toMatch(/clientName|client\.name|newName/);
  });

  it('Send is the one filled action after a payment; Done steps back', () => {
    expect(sheet).toMatch(/<ReceiptShare bill=\{stage\.bill\}[^\n]*\n\s*<button type="button" className="sheet-item wi-finish wi-finish-quiet"/);
  });

  it('prints the bill alone, with the rest of the page taken out rather than hidden', () => {
    const css = readFileSync(new URL('../styles/72-walk-in-sheet.css', import.meta.url), 'utf8');
    expect(css).toMatch(/body:has\(> \.wi-receipt-print\) > \*:not\(\.wi-receipt-print\) \{\s*display: none !important;/);
    expect(css).not.toMatch(/visibility: hidden;/);
    expect(share).toMatch(/mounted\s*\? createPortal\(/);
  });

  it('Share only on a touch screen; Change has a way back to the client’s number', () => {
    expect(share).toMatch(/window\.matchMedia\('\(pointer: coarse\)'\)\.matches/);
    expect(share).toMatch(/onClick=\{backToTheirs\}/);
  });

  it('opens WhatsApp only with a usable number, and needs no WhatsApp API', () => {
    expect(share).toMatch(/href=\{whatsappHref\(digits, text\)\}/);
    expect(share).toMatch(/const digits = problem \? '' :/);
    expect(share).not.toMatch(/api\./);
  });
});
