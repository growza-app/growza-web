import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import { portionParts } from './KitchenClient';

/** Owner, 2026-11-17 — the Kitchen review's eight changes. Source-reading where there is no DOM here. */
const src = readFileSync(resolve(__dirname, 'KitchenClient.tsx'), 'utf8');
const css = readFileSync(resolve(__dirname, '../styles/99-dining-tables.css'), 'utf8');
const nav = readFileSync(resolve(__dirname, '../components/BottomNav.tsx'), 'utf8');

describe('#6 — the portion in bold, split only where the API names it', () => {
  it('splits "Chicken Biryani (Half - 2 pcs)" around Half - 2 pcs', () => {
    expect(portionParts('Chicken Biryani (Half - 2 pcs)', 'Half - 2 pcs')).toEqual({ before: 'Chicken Biryani', size: 'Half - 2 pcs', after: '' });
  });
  it('keeps the extras after it', () => {
    expect(portionParts('Margherita (Large) + Cheese', 'Large')).toEqual({ before: 'Margherita', size: 'Large', after: ' + Cheese' });
  });
  it('never guesses from brackets: a dish with no portion stays whole', () => {
    expect(portionParts('Chicken Drumstick (2 pcs)', null)).toEqual({ before: 'Chicken Drumstick (2 pcs)', size: null, after: '' });
    expect(portionParts('Dal (Full)', 'Half')).toEqual({ before: 'Dal (Full)', size: null, after: '' });
  });
});

describe('the rest of the review', () => {
  it('#1 — no bottom bar on /kitchen; owner and manager get a way back', () => {
    expect(nav).toContain("if (pathname.startsWith('/kitchen')) return null;");
    expect(src).toContain("const mayLeave = session?.role === 'owner' || session?.role === 'manager';");
  });
  it('#2 · #3 — plain rows, 48px, with a tick circle that fills when done', () => {
    expect(css).toMatch(/\.kd-dish-btn \{[^}]*min-height: 48px;[^}]*border: 0;/);
    expect(css).toContain('.kd-dish.is-done .kd-tick { background: var(--accent);');
    expect(src).toContain('<span className="kd-tick" aria-hidden="true">');
  });
  it('#4 — late carries a clock and words, not the amber alone', () => {
    expect(src).toMatch(/\{c\.late \? \(\s*<svg[\s\S]{0,300}M12 3a9 9/);
    expect(en.kitchen.lateFor).toContain('Late');
  });
  it('#5 — while the sound is off the screen says so, with Turn on', () => {
    expect(src).toMatch(/\{!chime \? \(\s*<div className="kd-sound-hint">/);
  });
  it('#7 — the order type is a chip with an icon; #8 — Ready is 48px with room above', () => {
    expect(src).toContain('className={`kd-card-type is-${c.orderType}`}');
    expect(css).toContain('.kd-ready { min-height: 48px; margin-top: var(--sp-2);');
  });
  it('new words in English and Hindi', () => {
    for (const k of ['back', 'soundHint', 'turnOn', 'soundOn', 'soundOff'] as const) {
      expect(en.kitchen[k]).toBeTruthy();
      expect(hi.kitchen[k]).toBeTruthy();
    }
  });
});
