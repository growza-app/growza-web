import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canSee, gridCanSee } from '../lib/nav-policy';
import { homeCopy } from '../lib/home-copy';
import { mayTakeReturns, posModeOf, returnLookbackFrom } from './pos-helpers';

const src = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');

describe('who is offered the POS tab', () => {
  it('gives it to whoever may open the till, and to nobody else', () => {
    expect(canSee('/pos', 'owner')).toBe(true);
    expect(canSee('/pos', 'manager')).toBe(true);
    expect(canSee('/pos', 'receptionist')).toBe(true);
    expect(canSee('/pos', 'staff')).toBe(false);
  });

  it('is exactly the answer the old till address gave, for every role', () => {
    for (const role of ['owner', 'manager', 'receptionist', 'staff'] as const) {
      expect(canSee('/pos', role)).toBe(canSee('/products/sell', role));
    }
  });

  it('opens only once the business is live', () => {
    expect(canSee('/pos', 'owner', undefined, false)).toBe(false);
    expect(canSee('/pos', 'owner', undefined, true)).toBe(true);
  });
});

describe('the role grid treats POS as the till', () => {
  const grid = { bookings: 'manage', clients: 'none', services: 'manage', offers: 'none', staff: 'none', attendance: 'none', reports: 'none', settings: 'none' } as const;
  it('opens for a role holding Bookings and Stock at Change, and for no one without both', () => {
    expect(gridCanSee('/pos', grid)).toBe(true);
    expect(gridCanSee('/pos', { ...grid, services: 'none' })).toBe(false);
    expect(gridCanSee('/pos', { ...grid, bookings: 'none' })).toBe(false);
  });
  it('needs Change, not See: there is no read-only till', () => {
    expect(gridCanSee('/pos', { ...grid, bookings: 'view' })).toBe(false);
  });
});

describe('Return mode follows the refund rule the API enforces', () => {
  it('owner, manager and a session with no role may take returns', () => {
    expect(mayTakeReturns('owner')).toBe(true);
    expect(mayTakeReturns('manager')).toBe(true);
    expect(mayTakeReturns(null)).toBe(true);
  });

  it('a front desk may only when the owner has opened Sales to them', () => {
    expect(mayTakeReturns('receptionist')).toBe(false);
    expect(mayTakeReturns('receptionist', ['todo', 'overview'])).toBe(false);
    expect(mayTakeReturns('receptionist', ['sales'])).toBe(true);
  });

  it('a member who holds a role never may: the grid gives no refund, whatever they work like', () => {
    expect(mayTakeReturns('manager', undefined, true)).toBe(false);
    expect(mayTakeReturns('receptionist', ['sales'], true)).toBe(false);
  });

  it('a stylist never may', () => {
    expect(mayTakeReturns('staff', ['sales'])).toBe(false);
  });

  it('?mode=return opens Return only for someone who may use it', () => {
    expect(posModeOf('return', true)).toBe('return');
    expect(posModeOf('return', false)).toBe('sell');
    expect(posModeOf(undefined, true)).toBe('sell');
    expect(posModeOf('anything', true)).toBe('sell');
  });
});

describe('how far back Return looks', () => {
  it('is 60 days when the window is shorter, the whole window when it is longer', () => {
    expect(returnLookbackFrom('2026-10-22', 7)).toBe('2026-08-24');
    expect(returnLookbackFrom('2026-10-22', 59)).toBe('2026-08-24');
    expect(returnLookbackFrom('2026-10-22', 90)).toBe('2026-07-24');
  });

  it('survives a nonsense window', () => {
    expect(returnLookbackFrom('2026-10-22', Number.NaN)).toBe('2026-08-24');
  });
});

describe('the POS tab is wired into every menu', () => {
  it('names itself in English and Hindi', () => {
    expect(homeCopy('en', {}).nav.pos).toBe('POS');
    expect(homeCopy('hi', {}).nav.pos).not.toBe('');
  });

  it('is in the sidebar right under Home, and absent when the business has no products', () => {
    const sidebar = src('../components/Sidebar.tsx');
    expect(sidebar).toContain("...(products === false ? [] : [{ href: '/pos', label: t.nav.pos, icon: <IconPos /> }])");
    expect(sidebar.indexOf("href: '/pos'")).toBeGreaterThan(sidebar.indexOf("href: '/', label: t.nav.home"));
    expect(sidebar.indexOf("href: '/pos'")).toBeLessThan(sidebar.indexOf("href: '/orders'"));
  });

  it('is the first row of the phone menu, with the same products rule', () => {
    const more = src('../more/page.tsx');
    expect(more).toContain("...(products ? [{ href: '/pos', label: nav.nav.pos, icon: <IconPos /> }] : [])");
  });
});

describe('the POS screen', () => {
  const page = src('./page.tsx');
  const client = src('./PosClient.tsx');

  it('asks what the till always asked: the screen guard, the go-live gate and the payment permission', () => {
    expect(page).toContain("await guardScreen('/pos')");
    expect(page).toContain("await guardLive('/pos')");
    expect(page).toContain("mayUse(me.member?.role, 'visit.recordPayment'");
  });

  it('names the till as a shop does, from the same heading /orders/new uses', () => {
    expect(page).toContain('homeCopy(await serverLang(), me.labels).shop.takeOrder');
    expect(client).toContain('heading={heading}');
  });

  it('draws the Sell | Return tabs only for someone who may take a return', () => {
    expect(client).toContain('{canReturn ? (');
    expect(page).toContain('mayTakeReturns(me.member?.role, me.reportTabs, Boolean(areas.pages))');
  });

  it('keeps the till mounted under the return sheet so a sale in progress is never lost', () => {
    expect(client).toContain('<SellProductClient');
    expect(client.indexOf('<SellProductClient')).toBeLessThan(client.indexOf('<ReturnProductSheet'));
  });

  it('reads the bills when Return opens, and only the latest open may answer', () => {
    expect(client).toContain('includeSales: true');
    expect(client).toContain('opened.current');
    expect(client).toContain('setBills(null)');
  });

  it('supports toggleable full-screen POS terminal mode with keyboard shortcuts and rich bill drawer', () => {
    const payFlow = src('../appointments/new/PayFlow.tsx');
    const deskGrid = src('../appointments/new/DeskServiceGrid.tsx');
    const posBill = src('../appointments/new/PosBillRows.tsx');
    const css = src('../styles/99-pos.css');
    expect(client).toContain('pos-shell is-fullscreen');
    expect(client).toContain('pos-fs-bar');
    expect(client).toContain('enterFullScreen');
    expect(client).toContain('exitFullScreen');
    expect(client).toContain('requestFullscreen');
    expect(client).toContain("document.addEventListener('fullscreenchange', onFsChange)");
    expect(deskGrid).toContain("e.key === 'F2'");
    expect(deskGrid).toContain('pf-tile-inbill');
    expect(payFlow).toContain("e.key === 'F4'");
    expect(payFlow).toContain("e.key === 'F8'");
    expect(payFlow).toContain("e.key === 'F9'");
    expect(payFlow).toContain('<PosBillRows');
    expect(payFlow).toContain('pos-charge-cta');
    expect(payFlow).toContain('completePosSale');
    expect(payFlow).toContain("t('desk.needPaymentMode')");
    expect(payFlow).toContain('if (productsOnly) {\n      nextCustomer();\n      return;\n    }');
    expect(posBill).toContain('pos-bill-stepper');
    expect(css).toContain('.pos-shell.is-fullscreen');
    expect(css).toContain('.pos-cat-pills-wrap');
  });
});
