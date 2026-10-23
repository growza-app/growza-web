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

/** QA of the branch, 2026-10-24 — each defect found in the browser, pinned where it was fixed. */
const src = (p: string) => readFileSync(join(__dirname, '../..', p), 'utf8');

describe('QA fixes', () => {
  it('the Flipkart/Amazon screens send a restaurant away, by address too', () => {
    for (const [f, href] of [['orders/import/page.tsx', '/orders/import'], ['orders/held/page.tsx', '/orders/held']]) {
      expect(src(f!), f).toContain(`await guardLive('${href}');`);
    }
    expect(src('settings/channels/page.tsx')).toContain("if (!areaAllows('/settings/channels', areasOf(me))) redirect('/settings');");
    expect(src('orders/OrdersScreen.tsx')).toContain("areaAllows('/orders/import', areasOf(me))");
  });

  it('an app order is not "received", and its page says where it was paid and taken', () => {
    expect(flow).toContain("t('from.doneTitle', { amount: money(paidMinor), app: appWord(fromApp) })");
    expect(src('components/PaymentDone.tsx')).toContain("{title ?? t('doneTitle'");
    expect(flow).toContain("{fromApp ? null : <h2 className=\"pf-wide-h\">{t('howTitle')}</h2>}");
    expect(flow).toContain("{fromApp ? t('from.completeShort') : t('next')}");
    const order = src('orders/[id]/OrderClient.tsx');
    expect(order).toContain("t('detail.paidOn', { channel: channelWord(order.channel) })");
    expect(order).toContain("t('detail.takenAt', { branch: order.branchName })");
    expect(order).toContain("t('attach.action', { customer: nouns.customer })");
    for (const m of [en, hi]) {
      expect(m.payFlow.from.doneTitle).toContain('{app}');
      expect(m.orders.detail.paidOn).toContain('{channel}');
      expect(m.orders.attach.title).toContain('{customer}');
    }
  });

  it('a kitchen’s Home counts items, not sizes', () => {
    expect(src('components/home/ShopHome.tsx')).toContain('(areas.stock ? s.acrossSizes : s.acrossItems)');
  });

  it('the order-from CSS is whole: the chips wrap at 344px and the number button keeps its own rule', () => {
    const css = src('styles/73-pay-flow.css');
    expect(css).toContain('/* The order number sits under the chips, in the content column, and only once an app is chosen. */\n.pf-from-no {');
    expect(css).toMatch(/\.pf-from \.pf-chips \{\s*flex-wrap: wrap;/);
  });
});
