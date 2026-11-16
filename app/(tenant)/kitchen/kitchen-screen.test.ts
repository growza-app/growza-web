import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import { KITCHEN_REFRESH_MS, ageKey, minutesSince } from './KitchenClient';
import { canSee } from '../lib/nav-policy';
import { cooksOnly, type Areas } from '../lib/areas';

/** Jira GRW-714 — the kitchen's tablet. */
const screen = readFileSync(join(__dirname, 'KitchenClient.tsx'), 'utf8');
const home = readFileSync(join(__dirname, '../page.tsx'), 'utf8');
const restaurant = (pages: Areas['pages']): Areas => ({ bookings: false, services: false, shop: true, stock: false, tables: true, pages });

describe('AC-01 — new orders arrive on their own', () => {
  it('within 5 s: the screen asks every 4', () => {
    expect(KITCHEN_REFRESH_MS).toBeLessThanOrEqual(5_000);
  });
  it('a new order says "Just now", not "0 min"; a late one always says late', () => {
    expect(ageKey(false, 0)).toBe('justNow');
    expect(ageKey(false, 1)).toBe('minutes');
    expect(ageKey(true, 0)).toBe('lateFor');
  });

  it('age in minutes since the order came in', () => {
    expect(minutesSince('2026-11-16T10:00:00Z', Date.parse('2026-11-16T10:17:30Z'))).toBe(17);
  });
});

describe('BR-01 — no money anywhere on the screen', () => {
  it('the card reads no price, total, payment or phone', () => {
    expect(screen).not.toMatch(/Minor|price|paid|phone|formatMoney/);
  });
});

describe('AC-02 · BR-02 — Ready, and Undo for 10 s', () => {
  it('Ready is one tap; Undo is shown for the full 10 s', () => {
    expect(screen).toContain('onClick={() => void ready(c)}');
    expect(screen).toContain('const UNDO_MS = 10_000;');
  });
  it('late says so in words, not colour alone', () => {
    expect(screen).toContain('t(ageKey(c.late, mins), { min: mins })');
    expect(ageKey(true, 20)).toBe('lateFor');
  });
});

describe('AC-03 — a Kitchen login sees only the kitchen', () => {
  const cook = restaurant({ kitchen: 'manage' });
  it('/kitchen, the bell and Help — nothing else; Home sends them to the kitchen', () => {
    expect(cooksOnly({ kitchen: 'manage' })).toBe(true);
    expect(cooksOnly({ kitchen: 'manage', bookings: 'manage' })).toBe(false);
    expect(canSee('/kitchen', 'receptionist', [], true, cook)).toBe(true);
    for (const href of ['/orders', '/reports', '/pos', '/settings', '/']) expect(canSee(href, 'receptionist', [], true, cook), href).toBe(false);
    expect(home).toContain("if (cooksOnly(areasOf(me).pages)) redirect('/kitchen');");
  });
});

describe('plain words, both languages', () => {
  it('no KOT or KDS; every word in Hindi too', () => {
    expect(JSON.stringify(en.kitchen)).not.toMatch(/KOT|KDS/);
    for (const k of ['empty', 'offline', 'ready', 'undo', 'new', 'lateFor'] as const) {
      expect(en.kitchen[k]).toBeTruthy();
      expect(hi.kitchen[k]).toBeTruthy();
    }
  });
});
