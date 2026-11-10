import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildDailyTokens } from './pos-helpers';
import type { Appointment } from '../lib/api-types';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';

/**
 * Owner, 9 Nov 2026 — an order waiting in the Queue for payment can be cancelled, or have more added to it, from its
 * own card; the card fits a 344px phone in two rows (Take payment, then Add items · Cancel order).
 */
const src = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');
const client = src('PosClient.tsx');
const payFlow = src('../appointments/new/PayFlow.tsx');
const css = src('../styles/99-pos.css');
const NOW = Date.parse('2026-11-09T09:30:00.000Z');

describe('the unpaid order card', () => {
  it('offers Add items and Cancel order only on a counter order still waiting for payment', () => {
    const card = client.slice(client.indexOf('<div className="pos-qcard-actions">'), client.indexOf('pos-qcard-recall-btn'));
    expect(card).toContain("tk.paymentPending && tk.channel === 'counter' ? (");
    expect(card).toContain('onClick={() => startAddingTo(tk)}');
    expect(card).toContain('setCancelTarget(tk)');
    expect(card).toContain("t('takePayment', { token: tk.tokenLabel })");
  });

  it('asks before cancelling, says what is not collected, and keeps the order on Keep', () => {
    expect(client).toContain('<ConfirmDialog\n          tone="danger"');
    expect(client).toContain("t('cancelOrderBody', { amount: formatMoney(String(cancelTarget.totalMinor)) })");
    expect(client).toContain('api.cancelPendingCounterSale(tk.id)');
  });

  it('never lets the card grow wider than the phone', () => {
    expect(css).toMatch(/\.pos-queue-cols \{[^}]*grid-template-columns: minmax\(0, 1fr\);/);
    expect(css).toMatch(/\.pos-queue-col \{[^}]*min-width: 0;/);
    expect(css).toMatch(/\.pos-qcard-more \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
    expect(css).toMatch(/\.pos-qcard-more \.btn > span \{[^}]*white-space: normal;/);
  });
});

describe('Add items', () => {
  it('opens the Sell tab on a fresh cart that adds to the order, with no guest or payment step', () => {
    expect(client).toContain('key={`add-${addingToToken.id}`}');
    expect(client).toContain('api.addToPendingCounterSale(addingToToken.id, products)');
    expect(payFlow).toMatch(/const onNext = \(\) => \{\s*if \(addingTo\) \{\s*void addToOrder\(\);/);
    expect(payFlow).toMatch(/const completePosSale = \(\) => \{\s*if \(addingTo\) \{\s*void addToOrder\(\);/);
    expect(payFlow).toContain('if (addingTo || saving !== null || lines.length === 0 || fromApp) return;');
  });

  it('shows the same dish added twice as one line on the card', () => {
    const order = {
      id: 'farah',
      startAt: '2026-11-09T09:20:00.000Z',
      status: 'completed',
      locationId: 'loc-1',
      customerName: 'Farah Khan',
      channel: 'counter',
      paymentMode: null,
      paymentPending: true,
      products: [
        { productId: 'biryani', name: 'Mutton Biryani', qty: 1, returnedQty: 0, paidMinor: '26000', returnedMinor: '0' },
        { productId: 'raita', name: 'Boondi Raita', qty: 1, returnedQty: 0, paidMinor: '4000', returnedMinor: '0' },
        { productId: 'biryani', name: 'Mutton Biryani', qty: 1, returnedQty: 0, paidMinor: '26000', returnedMinor: '0' },
      ],
    } as unknown as Appointment;
    const [tk] = buildDailyTokens([order], 'loc-1', {}, NOW);
    expect(tk!.items).toEqual([
      { name: 'Mutton Biryani', qty: 2, paidMinor: 52000 },
      { name: 'Boondi Raita', qty: 1, paidMinor: 4000 },
    ]);
    expect(tk!.totalMinor).toBe(56000);
  });
});

describe('Add items never costs the desk the bill it was ringing up (owner, 9 Nov 2026)', () => {
  const sell = client.slice(client.indexOf('<div className="pos-body" hidden={mode === \'queue\' || addingToToken !== null}>'), client.indexOf('{addingToToken ? (\n        <div className="pos-body"'));
  const adding = client.slice(client.indexOf('{addingToToken ? (\n        <div className="pos-body"'));

  it('keeps the Sell till mounted, never re-keyed, and only hidden while adding', () => {
    expect(sell).toContain('<SellProductClient');
    expect(sell, 'a key that changes would remount the till and drop its bill').not.toMatch(/\bkey=/);
    expect(sell).not.toContain('addingTo=');
    expect(sell).toContain("inactive={mode === 'queue' || addingToToken !== null}");
  });

  it('adds through a till of its own, which owns Back while it is up', () => {
    expect(adding).toContain('addingTo={{');
    expect(adding).toContain('leaveRef={leaveRef}');
    expect(sell).toContain('leaveRef={addingToToken ? undefined : leaveRef}');
  });

  it('a hidden till answers no shortcut and no scanner', () => {
    expect(payFlow).toContain("useBarcodeScan(!inactive && productsOnly && step === 'what'");
    expect(payFlow).toContain("useBarcodeScan(!inactive && productsOnly && (step === 'how' || step === 'qr')");
    expect(payFlow).toContain("if (inactive || !productsOnly || !wide || step !== 'what') return;");
  });
});

describe('the words', () => {
  it('are there in English and Hindi', () => {
    for (const lang of [en, hi]) {
      for (const k of ['takePayment', 'addItems', 'cancelOrder', 'cancelOrderTitle', 'cancelOrderBody', 'cancelOrderConfirm', 'keepOrder', 'cancelFailed', 'addedToOrder']) {
        expect((lang.pos as Record<string, string>)[k], k).toBeTruthy();
      }
      for (const k of ['addingToOrder', 'stopAdding', 'addToOrder', 'addToOrderShort', 'addingBusy', 'addToOrderFailed']) {
        expect((lang.payFlow.desk as Record<string, string>)[k], k).toBeTruthy();
      }
    }
  });
});
