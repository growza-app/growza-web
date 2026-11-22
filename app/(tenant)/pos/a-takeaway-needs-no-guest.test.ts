import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-747 — a takeaway needs no guest, and a name without a number stays on the bill.
 *
 * Owner, 2026-11-22: "in takeaway some clients refuse to give a number, so we have to find a way to not unnecessarily
 * add their details in the guest list." The API keeps a name alone on the order (`buyer_name`) and makes no Guests
 * entry; these are the screens that let the desk do it.
 */
const src = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const payFlow = src('../appointments/new/PayFlow.tsx');
const sheet = src('../appointments/new/ClientSheet.tsx');
const pos = src('./PosClient.tsx');
const tableSheet = src('./TableBillSheet.tsx');
const order = src('../orders/[id]/OrderClient.tsx');
const addNumber = src('../orders/[id]/AddNumberSheet.tsx');
const ordersCss = src('../styles/99-orders.css');
const payCss = src('../styles/73-pay-flow.css');
const posCss = src('../styles/99-pos.css');
const en = JSON.parse(src('../../../messages/en.json'));
const hi = JSON.parse(src('../../../messages/hi.json'));

describe('Owner, 2026-11-22 — the till keeps its old flow: an order with nobody goes to Pickup', () => {
  it('the ways to pay wait for a guest, so a nameless order is kept pending in Pickup, where dishes can still be added', () => {
    // "No guest needed" was tried and taken back the same day: a table still eating was paid, and its next dishes had no bill.
    expect(payFlow).toContain('const hidePayUntilGuest = guestOptional && !hasWho && !fromApp && !payNowNoGuest;');
    expect(payFlow).toContain('data-testid="guest-to-pay"');
    expect(en.payFlow.desk.guestToPay).toBeTruthy();
    expect(hi.payFlow.desk.guestToPay).toBeTruthy();
  });

  it('Pickup asks who it is for before payment, and a name is enough', () => {
    expect(pos).toContain("if (isWalkInToken(tk) && tk.channel === 'counter' && !waiter) {");
  });
});

describe('FR-02 · BR-02 — a name without a number stays on the bill', () => {
  it('the guest sheet says so in one line, in English and Hindi, and keeps the name to 60 letters', () => {
    expect(payFlow.match(/nameStaysOnBill=\{guestOptional\}/g)).toHaveLength(3);
    expect(sheet).toContain("{nameStaysOnBill ? <p className=\"field-hint pf-client-keep\">{t('keepInList', { list: listName })}</p> : null}");
    expect(sheet).toContain('maxLength={nameStaysOnBill ? 60 : 80}');
    expect(en.payFlow.keepInList).toBe('A name alone stays on this bill. Add a number to keep them in {list}.');
    expect(hi.payFlow.keepInList).toContain('{list}');
  });

  it('a number alone is enough to save someone there (FR-03: "with or without a name")', () => {
    expect(sheet).toContain('if (!named && stored) return onPick({ id: null, name: null, waPhone: stored });');
  });
});

describe('Owner, 2026-11-22 — "Take payment now" at the till, under Keep payment pending', () => {
  it('shows only while the tiles wait for a guest, there is a dish, and it is not a table', () => {
    expect(payFlow).toContain('hidePayUntilGuest && lines.length > 0 && !atTable ? (');
    expect(payFlow).toContain("{t('desk.payNowNoGuest')}");
    expect(payFlow.match(/\{payNowButton\}/g)).toHaveLength(2);
    expect(en.payFlow.desk.payNowNoGuest).toBe('Take payment now');
    expect(hi.payFlow.desk.payNowNoGuest).toBeTruthy();
  });

  it('tapped, the ways to pay show and nobody is asked for; a new bill starts without it', () => {
    expect(payFlow).toContain('const hidePayUntilGuest = guestOptional && !hasWho && !fromApp && !payNowNoGuest;');
    expect(payFlow).toContain('!(guestOptional && (allowWithoutGuest || payNowNoGuest))');
    expect(payFlow.match(/setClient\(\{ kind: 'none' \}\);\n\s+setPayNowNoGuest\(false\);/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('is a full-width 44px target', () => {
    expect(posCss).toMatch(/\.pos-charge-paynow \{[^}]*width: 100%;[^}]*min-height: 2\.75rem;/);
  });
});

describe('Owner, 2026-11-22 — Skip in Pickup: "Who is paying?" may be skipped, and the order is paid as Walk-in', () => {
  it('the sheet offers Skip only where it is given one, and not while a new guest is being typed', () => {
    expect(sheet).toContain('{onSkip && !adding ? (');
    expect(sheet).toContain("{t('skipGuest')}");
    expect(en.payFlow.skipGuest).toBe('Skip');
    expect(hi.payFlow.skipGuest).toBeTruthy();
  });

  it('only at a kitchen, only for the order being paid in Pickup, never for a waiter', () => {
    expect(pos).toContain('guestOptional && !waiter && payingToken && clientSheetTarget.token.id === payingToken.id && isWalkInToken(payingToken)');
    expect(pos).toContain('guestSkipped={guestSkippedFor === payingToken.id}');
  });

  it('once skipped, the ways to pay, the discount and a coupon are offered', () => {
    expect(pos).toContain('const named = !anonymous || guestSkipped || (byNameOnly && nameDraft.trim() !== \'\');');
    expect(pos.match(/\{waitsForGuest \|\| byNameOnly \? null : \(/g)).toHaveLength(2);
  });

  it('Skip is a full-width 44px target', () => {
    expect(payCss).toMatch(/\.pf-client-skip \{[^}]*min-height: 2\.75rem;[^}]*width: 100%;/);
  });
});

describe('A table bill asks for the guest’s name, as before', () => {
  it('pays only once a name is typed; the name stays on that bill', () => {
    expect(tableSheet).toContain("if (!name) throw new ApiError(400, t('guestNeeded'));");
    expect(en.posTables.guestName).toBe("Guest's name (needed to take payment)");
    expect(hi.posTables.guestNeeded).toBeTruthy();
  });
});

describe('FR-04 — the number comes later, from the order', () => {
  it('a counter order kept under a name offers "Add guest’s number"; an app’s order does not', () => {
    expect(order).toContain('{isCounter ? (');
    expect(order).toContain("t('addNumber.action', { customer: nouns.customer })");
    expect(addNumber).toContain('api.assignClientToSale(orderId, { phone: stored, ...(name ? { name } : {}) })');
    for (const m of [en, hi]) {
      for (const k of ['action', 'title', 'label', 'hint', 'save', 'saving', 'failed']) expect(m.orders.addNumber[k], k).toBeTruthy();
    }
  });

  it('its Save is a full-width 44px target, styled in the orders sheet', () => {
    expect(ordersCss).toMatch(/\.ord-add-number-save \{[^}]*min-height: 44px;/);
  });
});
