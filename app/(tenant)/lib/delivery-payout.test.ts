import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import { MAX_COMMISSION_PERCENT, PAYOUT_RANGES, parsePercent, payoutRowState, percentText } from './delivery-payout';

/**
 * Jira GRW-658 — the Payout card on Orders: which sentence a row earns, how a typed percentage becomes the one the API stores, and where
 * the card is — and is not — drawn.
 */
const src = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');
const row = (over: Partial<Parameters<typeof payoutRowState>[0]>) => ({ orders: 14, shouldPayMinor: null, ordersWithoutCommission: 0, commissionMinor: null, ...over });

describe('which sentence a row earns', () => {
  it('no orders is empty, whatever else is set', () => {
    expect(payoutRowState(row({ orders: 0, shouldPayMinor: null }))).toBe('empty');
  });
  it('every order carrying a commission is ready (AC-01)', () => {
    expect(payoutRowState(row({ shouldPayMinor: '531960', commissionMinor: '150040' }))).toBe('ready');
  });
  it('orders and no commission on any is "not set" (AC-02)', () => {
    expect(payoutRowState(row({ orders: 9, ordersWithoutCommission: 9 }))).toBe('unset');
  });
  it('a commission on only some is partial, never a guessed total', () => {
    expect(payoutRowState(row({ orders: 15, ordersWithoutCommission: 1, commissionMinor: '150040' }))).toBe('partial');
  });
});

describe('the percentage the owner types', () => {
  it.each([
    ['22', 22],
    ['22.5', 22.5],
    ['22,5', 22.5],
    [' 0 ', 0],
    ['50', 50],
    ['12.345', 12.345],
  ])('%s is %s', (text, percent) => {
    expect(parsePercent(text)).toEqual({ ok: true, percent });
  });

  it('empty clears it', () => {
    expect(parsePercent('')).toEqual({ ok: true, percent: null });
    expect(parsePercent('   ')).toEqual({ ok: true, percent: null });
  });

  it.each(['51', '-1', 'abc', '2 2', '22%', '1e1', '.5', '5.'])('"%s" is refused', (text) => {
    expect(parsePercent(text)).toEqual({ ok: false });
  });

  it('the ceiling is the API’s', () => {
    expect(MAX_COMMISSION_PERCENT).toBe(50);
  });

  it('shows what is stored the way a person writes it', () => {
    expect(percentText(2200)).toBe('22');
    expect(percentText(2256)).toBe('22.56');
    expect(percentText(250)).toBe('2.5');
    expect(percentText(0)).toBe('0');
    expect(percentText(null)).toBe('');
  });
});

describe('the card’s periods', () => {
  it('offers the week an app pays by first, then the day and the month', () => {
    expect([...PAYOUT_RANGES]).toEqual(['this_week', 'last_week', 'today', 'this_month']);
  });
});

describe('where the card is drawn', () => {
  const screen = src('orders/OrdersScreen.tsx');
  it('only for the owner, only where the vertical lists delivery apps', () => {
    expect(screen).toContain("(role === undefined || role === 'owner') && (areasOf(me).deliveryApps ?? []).length > 0");
    expect(screen).toContain('{showPayout ? <PayoutCard');
  });
  it('a 403 or a 404 on the first read removes the card instead of showing an error', () => {
    const card = src('orders/PayoutCard.tsx');
    expect(card).toContain('error.status === 403 || error.status === 404');
    expect(card).toContain('if (hidden) return null;');
  });
  it('the sentence about an estimate is on the card, in both languages', () => {
    expect(src('orders/PayoutCard.tsx')).toContain("t('note')");
    expect(en.orders.payout.note).toMatch(/can differ/);
    expect(hi.orders.payout.note.length).toBeGreaterThan(20);
  });
});

describe('both languages carry every word the card uses', () => {
  const keys = (o: Record<string, unknown>, prefix = ''): string[] =>
    Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`]));
  it('English and Hindi have the same keys under orders.payout', () => {
    expect(keys(hi.orders.payout).sort()).toEqual(keys(en.orders.payout).sort());
  });
  it('every key the card asks for exists', () => {
    const card = src('orders/PayoutCard.tsx');
    const asked = [...card.matchAll(/\bt\('([a-zA-Z.]+)'/g)].map((m) => m[1]!);
    const have = new Set(keys(en.orders.payout));
    for (const k of asked) expect(have.has(k), k).toBe(true);
  });
});
