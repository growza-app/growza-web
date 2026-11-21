import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { barTabShown } from './pos-type-bar';

const client = readFileSync(resolve(__dirname, 'PosClient.tsx'), 'utf8');
const flow = readFileSync(resolve(__dirname, '../appointments/new/PayFlow.tsx'), 'utf8');
const pos = readFileSync(resolve(__dirname, '../styles/99-pos.css'), 'utf8');
const tables = readFileSync(resolve(__dirname, '../styles/99-dining-tables.css'), 'utf8');
const en = JSON.parse(readFileSync(resolve(__dirname, '../../../messages/en.json'), 'utf8'));
const hi = JSON.parse(readFileSync(resolve(__dirname, '../../../messages/hi.json'), 'utf8'));

/**
 * Owner, 2026-11-22 ("go D", "keep the name as pickup", "keep Kitchen as its own icon") — a branch that seats its guests
 * has ONE row on top of the POS: Dine-in · Takeaway · Delivery, the Kitchen, and a ⋮ for Return. Pickup is under Takeaway.
 */
describe('the one-row POS bar', () => {
  it('marks Takeaway in Pickup, none in Return, and the till’s own type otherwise', () => {
    expect(barTabShown('queue', 'dine_in')).toBe('takeaway');
    expect(barTabShown('return', 'delivery')).toBeNull();
    expect(barTabShown('sell', 'delivery')).toBe('delivery');
  });

  it('is only for a branch that seats its guests, never a waiter’s bar or full screen', () => {
    expect(client).toContain('const tablesBar = tablesOn && !waiter && !fullScreen;');
    // The waiter's bar is checked first, then this one, then full screen's own header.
    const w = client.indexOf('{waiter ? (');
    const b = client.indexOf(') : tablesBar ? (');
    const f = client.indexOf(') : fullScreen ? (');
    expect(w).toBeGreaterThan(-1);
    expect(w).toBeLessThan(b);
    expect(b).toBeLessThan(f);
  });

  it('holds the switch, the Kitchen as its own icon and a ⋮ with Return — no Sell / Pickup / Return tabs', () => {
    const bar = client.slice(client.indexOf(') : tablesBar ? ('), client.indexOf(') : fullScreen ? ('));
    expect(bar).toContain('<div className="pos-bar-typeslot" ref={setTypeSlot} />');
    expect(bar).toContain('className="btn btn-ghost pos-bar-kitchen"');
    expect(bar).toContain("items={canReturn ? [{ label: t('returnBill'), onSelect: () => void openReturn() }] : []}");
    expect(bar).not.toContain('pos-tabs');
    expect(bar).not.toContain('pos-bar-back');
  });

  it('the till draws its switch into that bar, and any tab there leads back from Pickup or Return', () => {
    expect(flow).toContain('const typeInBar = Boolean(typeBar?.slot) && tablesHere && !token && !waiter && !addingTo;');
    expect(flow).toContain('{createPortal(');
    expect(flow).toContain("if (typeInBar && typeBar && typeBar.mode !== 'sell') {");
    // The Add items till never reports a type: it has no switch.
    expect(flow).toContain('if (!reportType || addingTo || token) return;');
  });

  it('Pickup keeps its name: its count on Takeaway, and New order / Pickup under it', () => {
    expect(flow).toContain("t('type.pickupCount', { count: pickupCount })");
    expect(client).toContain("(mode === 'queue' || (mode === 'sell' && tillType === 'takeaway'))");
    expect(client).toContain("t('pickupTab', { count: preparingTokens.length })");
    for (const m of [en, hi]) {
      expect(m.payFlow.type.pickupCount).toContain('{count}');
      for (const k of ['more', 'returnBill', 'newOrderTab', 'pickupTab', 'takeawayViews']) expect(m.pos[k], k).toBeTruthy();
    }
    expect(en.payFlow.type.pickupCount).toBe('Pickup {count}');
    expect(en.pos.pickupTab).toBe('Pickup · {count}');
    expect(hi.pos.pickupTab).toContain('पिकअप');
  });

  it('at 344px: no card around the row, three words with no icons, every control 44px', () => {
    expect(pos).toMatch(/\.pos-shell\.has-type-bar > \.pos-bar-types \{[^}]*border: 0;/);
    expect(tables).toMatch(/\.pf-type-inbar \.pf-type-icon \{\s*display: none;/);
    expect(pos).toMatch(/\.pos-bar-more \.mnu-kebab-btn\.kebab-btn \{\s*width: 2\.75rem;\s*height: 2\.75rem;/);
    expect(pos).toMatch(/\.pos-pickup-switch \.page-tab \{[^}]*min-height: 2\.75rem;/);
    expect(pos).toMatch(/\.pos-bar-types \.pos-fs-toggle \{\s*min-height: 2\.75rem;/);
  });

  it('Pickup has no second New order button when the switch above already is one', () => {
    expect(client).toMatch(/\{tablesBar \? null : \(\s*<button type="button" className="btn btn-primary pos-queue-new-btn"/);
  });
});
