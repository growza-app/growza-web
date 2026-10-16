import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sortMenu } from '../../lib/menu-sort';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf8');
const flow = read('PayFlow.tsx');
const client = read('NewBookingClient.tsx');
const stock = read('../../products/StockPanel.tsx');

describe('release review, 2026-10-16 — the till', () => {
  it('a different token or booking is a different bill: PayFlow is keyed on what it is for', () => {
    expect(client).toMatch(/const billKey = token\?\.id \?\? visit\?\.appointment\.id \?\? 'walk-in';/);
    expect((client.match(/<PayFlow key=\{billKey\}/g) ?? []).length).toBe(2);
  });
  it('the large-amount question is drawn on the UPI QR screen too', () => {
    const qr = flow.slice(flow.indexOf("if (step === 'qr' && paymentQr)"), flow.indexOf('The four payment tiles'));
    expect(qr).toMatch(/\{dialog\}/);
  });
  it('Back from the QR goes to the till on a wide screen, not to the phone\'s payment screen', () => {
    expect(flow).toMatch(/onClick=\{\(\) => setStep\(wide \? 'what' : 'how'\)\}/);
  });
  it('a keypad opens on the exact amount, paise kept, and rounds float-safely', () => {
    expect(flow).toMatch(/const rupeesText = \(minor: number\): string => String\(minor \/ 100\);/);
    expect(flow).not.toMatch(/setKeypad\(String\(Math\.round/);
    expect(flow).toMatch(/Math\.round\(rupees \* 100\)/);
  });
  it('a recount sends the count, so a sale since the sheet opened is not undone', () => {
    expect(stock).toMatch(/\{ kind, count: n, note:/);
    expect(stock).not.toMatch(/n - product\.stock/);
  });
});

describe('the till keeps the menu\'s own order unless asked', () => {
  const items = [{ n: 'Zed', p: 1 }, { n: 'Alpha', p: 3 }];
  it('menu order is as given; name and price still sort', () => {
    expect(sortMenu(items, 'menu', (x) => x.n, (x) => x.p).map((x) => x.n)).toEqual(['Zed', 'Alpha']);
    expect(sortMenu(items, 'name', (x) => x.n, (x) => x.p).map((x) => x.n)).toEqual(['Alpha', 'Zed']);
    expect(sortMenu(items, 'priceDesc', (x) => x.n, (x) => x.p).map((x) => x.n)).toEqual(['Alpha', 'Zed']);
  });
});
