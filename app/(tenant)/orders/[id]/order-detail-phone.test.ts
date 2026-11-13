import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { wholeBusiness } from '../../lib/branch-routes';

/** Owner's review 2026-11-13 — four fixes on one order's page, from the phone. */
const page = readFileSync(new URL('./OrderClient.tsx', import.meta.url), 'utf8');
const doc = readFileSync(new URL('../../components/DocumentAction.tsx', import.meta.url), 'utf8');
const en = JSON.parse(readFileSync(new URL('../../../../messages/en.json', import.meta.url), 'utf8'));
const hi = JSON.parse(readFileSync(new URL('../../../../messages/hi.json', import.meta.url), 'utf8'));

describe('one order, on a phone', () => {
  it('draws no branch picker: one order is one branch’s, and its own line names it', () => {
    expect(wholeBusiness('/orders/7d9906ba-f4fe-450a-b586-43e4b9edb3f7')).toBe(true);
    for (const p of ['/orders', '/orders/returns', '/orders/refunds', '/orders/new', '/orders/held', '/orders/import']) expect(wholeBusiness(p)).toBe(false);
  });

  it('titles a counted shelf’s counter sale "Token n" and keeps "Order #code" for the line; the restaurant is unchanged', () => {
    expect(page).toContain("order.tokenNo && counted\n            ? t('list.tokenTitle', { n: formatTokenNo(order.tokenNo).slice(1) })");
    expect(page).toContain("{order.tokenNo ? ` · ${t('list.orderCode', { code })}` : ''}");
    expect(en.orders.list.tokenTitle).toBe('Token {n}');
    expect(hi.orders.list.tokenTitle).toBe('टोकन {n}');
  });

  it('fills the receipt button and ghosts the return', () => {
    expect(page).toContain('<DocumentAction visitKey={order.id} primary />');
    expect(page).toContain('<button type="button" className="btn btn-ghost" onClick={() => setReturning(true)}>');
    expect(doc).toContain("const mainBtn = primary ? 'btn' : 'btn btn-ghost';");
    expect(doc).toContain('<button type="button" className={mainBtn} disabled={busy} onClick={() => void issue()}>');
  });

  it('opens a known customer’s card from their name; a walk-in stays text', () => {
    expect(page).toContain('<AppLink className="ord-d-name ord-d-name-link" href={`/customers?open=${encodeURIComponent(order.client.id)}`}>');
    expect(page).toContain('{!order.client ? <p className="ord-d-name">{order.buyer.name ?? t(\'list.noName\')}</p> : null}');
  });
});
