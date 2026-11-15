import { describe, expect, it } from 'vitest';
import { asAscii, encodeTicket, type Rasterize } from './escpos';
import { escapeHtml, pageRule, ticketHtml } from './ticket-html';
import { billTicket, charsPerLine, kotTicket, pairLines, wrap, type BillCopy, type BillData, type KotCopy, type KotData } from './ticket';

const kotCopy: KotCopy = {
  title: 'KOT',
  added: 'ADDED TO ORDER',
  cancelled: 'CANCELLED',
  reprint: 'REPRINT',
  kotNo: (n) => `KOT ${n}`,
  token: (n) => `Token #${n}`,
  items: (n) => `${n} items`,
};

const billCopy: BillCopy = {
  reprint: 'REPRINT',
  phone: (v) => `Mob No - ${v}`,
  gstin: (v) => `GSTIN - ${v}`,
  fssai: (v) => `FSSAI- ${v}`,
  name: (v) => `Name: ${v}`,
  date: (v) => `Date: ${v}`,
  cashier: (v) => `Cashier: ${v}`,
  billNo: (v) => `Bill No.: ${v}`,
  token: (n) => `Token #${n}`,
  colItem: 'Item',
  colQty: 'Qty.',
  colPrice: 'Price',
  colAmount: 'Amount',
  totalQty: (n) => `Total Qty: ${n}`,
  subTotal: 'Sub Total',
  roundOff: 'Round off',
  grandTotal: 'Grand Total',
  thanks: 'Thank you',
};

const kot = (over: Partial<KotData> = {}): KotData => ({
  number: 7,
  kind: 'new',
  tokenNo: 14,
  destination: 'Takeaway',
  when: '14 Nov, 8:40 pm',
  items: [
    { name: 'Paneer Tikka', qty: 2, options: ['Full', 'Extra cheese'] },
    { name: 'Cold coffee', qty: 1 },
  ],
  ...over,
});

/** A drawer that records what it was asked to draw and answers a 1-row bitmap, so bytes are testable in Node. */
function recordingRaster(): { fn: Rasterize; drawn: string[] } {
  const drawn: string[] = [];
  return {
    drawn,
    fn: (line, w) => {
      drawn.push(line.kind === 'text' ? line.text : line.kind === 'pair' ? `${line.left}|${line.right}` : `${line.name}|${line.amount}`);
      return { width: w, height: 1, bits: new Uint8Array(w / 8) };
    },
  };
}

const text = (bytes: Uint8Array) => String.fromCharCode(...bytes);

describe('wrap and pairs fit the roll (story AC-04)', () => {
  it('keeps every line inside the paper, cutting a word longer than the line', () => {
    const name = 'Hyderabadi Dum Biryani Special Family Pack';
    for (const l of wrap(`2 x ${name}`, 32)) expect([...l].length).toBeLessThanOrEqual(32);
    expect(wrap('x'.repeat(70), 32)).toEqual(['x'.repeat(32), 'x'.repeat(32), 'x'.repeat(6)]);
  });

  it('puts the amount on the first line, right-aligned, and wraps the name under it', () => {
    const lines = pairLines('2 x Hyderabadi Dum Biryani Special Family Pack', 'Rs.1,480.00', 32);
    expect(lines[0]).toHaveLength(32);
    expect(lines[0]!.endsWith('Rs.1,480.00')).toBe(true);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(32);
  });

  it('uses 48 characters on an 80mm roll', () => {
    expect(charsPerLine('80')).toBe(48);
    expect(charsPerLine('58')).toBe(32);
  });
});

describe('the KOT (story AC-01, AC-02, BR: no prices)', () => {
  it('names the token, the dishes, their quantities and add-ons, and carries no price', () => {
    const t = kotTicket(kot(), kotCopy);
    const all = ticketHtml(t);
    expect(all).toContain('Token #14');
    expect(all).toContain('2 x Paneer Tikka');
    expect(all).toContain('+ Extra cheese');
    expect(all).toContain('1 x Cold coffee');
    expect(all).not.toMatch(/₹|Rs\./);
    expect(all).toContain('3 items');
  });

  it('says ADDED TO ORDER on an addition and CANCELLED on a cancellation, big', () => {
    const add = kotTicket(kot({ kind: 'add', items: [{ name: 'Lassi', qty: 1 }] }), kotCopy);
    expect(add.lines[0]).toMatchObject({ text: 'ADDED TO ORDER', size: 2 });
    const cancel = kotTicket(kot({ kind: 'cancel' }), kotCopy);
    expect(cancel.lines[0]).toMatchObject({ text: 'CANCELLED', size: 2 });
  });

  it('marks a reprint across the top', () => {
    expect(kotTicket(kot({ reprint: true }), kotCopy).lines[0]).toMatchObject({ text: '** REPRINT **' });
  });
});

/** The owner's sample bill (The Brew Haven, 13 Nov 2026), as Growza would print it. */
const sample = (): BillData => ({
  businessName: 'The Brew Haven',
  address: 'SH-01, Sainik Suvidha Parisar, UB Area, Cantt',
  phone: '9286826415',
  gstin: '09ABFFB3084R1ZT',
  fssai: '12726009000135',
  docTitle: 'Tax invoice',
  customerName: null,
  when: '13/11/26 20:59',
  orderLabel: 'Dine-in',
  cashier: 'admin',
  number: '8901',
  tokenNo: null,
  items: [
    { name: 'Cappuccino (Bean 1)', options: ['Choice of coffee: Hot'], qty: 2, price: '209.00', amount: '418.00' },
    { name: 'Alfredo Sauce Pasta', options: ['Choice of pasta: Penne'], qty: 1, price: '399.00', amount: '399.00' },
    { name: 'Grilled Paneer & Rice In Brown Sauce', qty: 1, price: '379.00', amount: '379.00' },
  ],
  totalQty: 4,
  subTotal: '1,196.00',
  adjustments: [
    { label: 'CGST @2.5%', amount: '29.90' },
    { label: 'SGST @2.5%', amount: '29.90' },
  ],
  roundOff: '+0.20',
  grandTotal: '₹1,256.00',
  paidBy: null,
  footer: 'Grateful For You. Tag us @thebrewhaven.cafe',
});

describe('the bill (owner’s sample, 15 Nov 2026)', () => {
  it('reads like the sample: business, GSTIN, date, cashier, bill no., the item table, taxes, round off, grand total', () => {
    const all = ticketHtml(billTicket(sample(), billCopy));
    for (const s of [
      'The Brew Haven',
      'GSTIN - 09ABFFB3084R1ZT',
      'FSSAI- 12726009000135',
      'Date: 13/11/26 20:59',
      'Dine-in',
      'Cashier: admin',
      'Bill No.: 8901',
      'Choice of coffee: Hot',
      'Total Qty: 4',
      'Sub Total 1,196.00',
      'CGST @2.5%',
      'Round off',
      'Grand Total ₹1,256.00',
      'Grateful For You.',
    ]) {
      expect(all).toContain(s);
    }
  });

  it('prints Item · Qty. · Price · Amount on 80mm, lined up, and drops Price on 58mm', () => {
    const r = recordingRaster();
    const wide = text(encodeTicket(billTicket(sample(), billCopy), '80', r.fn)).split('\n');
    const row = wide.find((l) => l.includes('Cappuccino'))!;
    expect(row.replace(/[^\x20-\x7e]/g, '')).toMatch(/Cappuccino \(Bean 1\)\s+2\s+209\.00\s+418\.00$/);
    const narrow = text(encodeTicket(billTicket(sample(), billCopy), '58', r.fn)).split('\n');
    const nrow = narrow.find((l) => l.includes('Cappuccino'))!;
    expect(nrow).not.toContain('209.00');
    expect(nrow).toMatch(/2\s+418\.00$/);
    // The long dish name wraps inside its own column on both rolls.
    for (const l of [...wide, ...narrow]) expect(l.replace(/[\x1b\x1d][\s\S]{2}/g, '').replace(/[^\x20-\x7e]/g, '').length).toBeLessThanOrEqual(48);
    expect(r.drawn).toEqual([]);
  });

  it('leaves "Name:" for the pen when the guest is a walk-in, and names them when known', () => {
    expect(ticketHtml(billTicket(sample(), billCopy))).toContain('Name: </div>');
    expect(ticketHtml(billTicket({ ...sample(), customerName: 'Priya Nair' }, billCopy))).toContain('Name: Priya Nair');
  });
});

describe('ESC/POS bytes', () => {
  it('spells the rupee sign in ASCII and refuses Devanagari', () => {
    expect(asAscii('Total ₹504.00')).toBe('Total Rs.504.00');
    expect(asAscii('2 x पनीर टिक्का')).toBeNull();
  });

  it('prints an English KOT as text, starting with ESC @ and ending with a cut', () => {
    const r = recordingRaster();
    const bytes = encodeTicket(kotTicket(kot(), kotCopy), '58', r.fn);
    expect([bytes[0], bytes[1]]).toEqual([0x1b, 0x40]);
    expect(Array.from(bytes.slice(-4))).toEqual([0x1d, 0x56, 0x42, 0x00]);
    expect(text(bytes)).toContain('2 x Paneer Tikka');
    expect(r.drawn).toEqual([]);
  });

  it('draws only the Hindi line as a picture, and sends it as GS v 0 (story BR-02)', () => {
    const r = recordingRaster();
    const bytes = encodeTicket(kotTicket(kot({ items: [{ name: 'पनीर टिक्का', qty: 2 }] }), kotCopy), '58', r.fn);
    expect(r.drawn).toEqual(['2 x पनीर टिक्का']);
    const s = text(bytes);
    expect(s).toContain('\x1dv0\x00');
    expect(s).toContain('Token #14');
  });

  it('never prints a line wider than the roll', () => {
    const r = recordingRaster();
    const long = kot({ items: [{ name: 'Hyderabadi Dum Biryani Special Family Pack Extra Large', qty: 1, options: ['Raita', 'Salan', 'Gulab jamun'] }] });
    const s = text(encodeTicket(kotTicket(long, kotCopy), '58', r.fn));
    // Strip the control sequences and look at what reaches the paper.
    const printed = s.replace(/[\x1b\x1d][\s\S]{2}/g, '').split('\n');
    for (const l of printed) expect(l.replace(/[^\x20-\x7e]/g, '').length).toBeLessThanOrEqual(32);
  });
});

describe('the print-dialog page', () => {
  it('escapes what the business typed', () => {
    expect(escapeHtml('<b>"Tikka" & co</b>')).toBe('&lt;b&gt;&quot;Tikka&quot; &amp; co&lt;/b&gt;');
    const html = ticketHtml(kotTicket(kot({ items: [{ name: '<img src=x onerror=alert(1)>', qty: 1 }] }), kotCopy));
    expect(html).not.toContain('<img');
  });

  it('sizes the sheet to the roll', () => {
    expect(pageRule('58')).toBe('@page { size: 58mm auto; margin: 0; }');
    expect(pageRule('80')).toBe('@page { size: 80mm auto; margin: 0; }');
  });
});
