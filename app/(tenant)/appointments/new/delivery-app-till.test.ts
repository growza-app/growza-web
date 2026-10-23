import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../../messages/en.json';
import hi from '../../../../messages/hi.json';

/**
 * Owner, 2026-10-24 — a restaurant's Swiggy and Zomato orders are tapped in at the till.
 */
const flow = readFileSync(join(__dirname, 'PayFlow.tsx'), 'utf8');
const sheet = readFileSync(join(__dirname, 'AppOrderNoSheet.tsx'), 'utf8');

describe('Order from: Counter or a delivery app', () => {
  it('is offered only where the business has an app, and only on the till that sells things', () => {
    expect(flow).toContain('const apps = productsOnly ? (areas.deliveryApps ?? []) : [];');
    expect(flow).toContain('apps.length > 0 && !token ? (');
    expect(flow).toContain("{['counter', ...apps].map((key) => (");
  });

  it('an app order needs no guest and asks no way of paying', () => {
    expect(flow).toContain("const canGoOn = hasService && (token !== undefined || client.kind !== 'none' || fromApp !== null);");
    expect(flow).toContain('const payTiles = fromApp ? null : (');
    expect(flow).toContain("if (ok) void pay('other');");
  });

  it('sends where it came from and the app’s number, and nothing for a counter sale', () => {
    expect(flow).toContain('const appOrder = fromApp ? { channel: fromApp, ...(appOrderNo.trim() ? { externalRef: appOrderNo.trim() } : {}) } : null;');
    expect(flow).toContain('...(appOrder ?? {}),');
  });

  it('starts the next order back at the counter, and a held bill keeps where it came from', () => {
    expect(flow).toMatch(/const nextCustomer = \(\) => \{[\s\S]*?setOrderFrom\('counter'\);/);
    expect(flow).toContain('setOrderFrom(found.from ?? \'counter\');');
  });

  it('the order number is typed in a sheet of its own, never on the till', () => {
    expect(flow).not.toMatch(/<input/);
    expect(sheet).toContain('<input id="pf-app-order-no"');
  });

  it('every word is there in English and Hindi', () => {
    for (const m of [en, hi]) {
      const f = m.payFlow.from;
      expect(f.apps.swiggy && f.apps.zomato && f.counter && f.label).toBeTruthy();
      expect(f.orderNo).toContain('{app}');
      expect(f.nothingToCollect).toContain('{app}');
      expect(f.complete).toContain('{amount}');
    }
  });
});
