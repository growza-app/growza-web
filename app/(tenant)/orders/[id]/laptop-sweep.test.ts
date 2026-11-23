import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
 * Laptop sweep, 2026-11-22 — five screens at 1366×768 that were cut or half empty. Source pins, like the rest of
 * this folder: the layouts themselves were checked in a browser at 344, 1366×768 and 1440×900.
 */
const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const order = read('./OrderClient.tsx');
const ordersCss = read('../../styles/99-orders.css');
const settingsCss = read('../../styles/85-settings-fit.css');
const emeraldCss = read('../../styles/99-z-emerald-v2.css');
const kitchen = read('../../kitchen/KitchenClient.tsx');
const tablesCss = read('../../styles/99-dining-tables.css');
const clientsCss = read('../../styles/79-desk-clients.css');

describe('laptop sweep 2026-11-22', () => {
  it('an order is two columns from 1100px: who and what on the left, the money and the next step on the right', () => {
    expect(order).toContain('<div className="ord-d-main">');
    expect(order).toContain('<div className="ord-d-side">');
    expect(order).toContain('const hasSide = hasMoney || hasBar;');
    expect(order).toContain('ord-d-block ord-d-history-block');
    expect(ordersCss).toMatch(/\.ord-d-main,\s*\.ord-d-side\s*\{\s*display: contents;/);
    expect(ordersCss).toMatch(/\.ord-detail \.ord-d-bar\s*\{\s*order: 1;/);
    expect(ordersCss).toMatch(/@media \(min-width: 1100px\)\s*\{\s*\.ord-detail\.has-side\s*\{\s*display: grid;/);
  });

  it('Settings drops the Account heading with the Log out row it held, on a short laptop', () => {
    expect(settingsCss).toContain('.settings-group:not(:has(.settings-row:not(.settings-row-action)))');
  });

  it('the side menu fits a 768px window with Team open, and says when it scrolls', () => {
    expect(emeraldCss).toMatch(/@media \(min-width: 861px\) and \(max-height: 859px\)\s*\{\s*\.sidebar\s*\{\s*padding-block: 0\.75rem;/);
    expect(emeraldCss).toContain('linear-gradient(var(--canvas) 30%, transparent) top / 100% 2rem no-repeat local');
  });

  it('a kitchen ticket keeps its table whole: who and how long wrap together onto their own line', () => {
    expect(kitchen).toContain('<span className="kd-card-when">');
    expect(tablesCss).toContain('.kd-card-head { flex-wrap: wrap; }');
  });

  it('Guests gives the name room on a 1366 desk: Phone goes to the card, Total spent fits its header', () => {
    expect(clientsCss).toMatch(/@media \(min-width: 1101px\) and \(max-width: 1439px\)\s*\{\s*\.cust-desk-table th:nth-child\(2\),/);
    expect(clientsCss).toMatch(/:not\(:has\(th:nth-child\(6\)\)\) th:nth-child\(3\)\s*\{\s*width: 7rem;/);
  });
});
