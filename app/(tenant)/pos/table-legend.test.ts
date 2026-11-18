import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import { stateOf, TABLE_STATES } from './TableMap';
import type { DiningTable } from '../lib/api';

/** Jira GRW-731 — the table map's legend, and Food cooking / Eating. */
const map = readFileSync(join(__dirname, 'TableMap.tsx'), 'utf8');
const sheet = readFileSync(join(__dirname, 'TableBillSheet.tsx'), 'utf8');
const css = readFileSync(join(__dirname, '../styles/99-dining-tables.css'), 'utf8');

type Bill = NonNullable<DiningTable['openBill']>;
const t5 = (b: Partial<Bill> | null): DiningTable => ({
  id: 't',
  name: 'T5',
  seats: 4,
  openBill: b === null ? null : { saleId: 's', tokenNo: null, seatedAt: '2026-11-18T10:00:00Z', totalMinor: 56_000, guests: 4, billPrinted: false, ...b },
});

describe('AC-01 · AC-02 — Food cooking, then Eating, then cooking again', () => {
  it('a round sent and not Ready: Food cooking; the kitchen marks it Ready: Eating', () => {
    expect(stateOf(t5({ foodCooking: true }))).toBe('cooking');
    expect(stateOf(t5({ foodCooking: false }))).toBe('eating');
  });

  it('BR-01 — a second round (or Ready undone): the server says cooking again, and so does the tile', () => {
    const ready = t5({ foodCooking: false });
    expect(stateOf({ ...ready, openBill: { ...ready.openBill!, foodCooking: true } })).toBe('cooking');
  });

  it('BR-02 — Bill printed wins over both cooking states', () => {
    expect(stateOf(t5({ billPrinted: true, foodCooking: true }))).toBe('bill');
    expect(stateOf(t5({ billPrinted: true, foodCooking: false }))).toBe('bill');
  });

  it('a free table is Free; an older API that does not say is read as still cooking, never as eating', () => {
    expect(stateOf(t5(null))).toBe('free');
    expect(stateOf(t5({}))).toBe('cooking');
  });
});

describe('BR-03 — colour is never the only signal', () => {
  it('the tile writes its state word, and the legend names every colour, in both languages', () => {
    expect(map).toContain('<span className="tm-state">{t(`state.${state}`)}</span>');
    // Jira GRW-732 — Seated comes between Free and Food cooking: the way a table's evening goes.
    expect(TABLE_STATES).toEqual(['free', 'seated', 'cooking', 'eating', 'bill']);
    expect(map).toContain('<ul className="tm-legend" aria-label={t(\'legendAria\')}>');
    expect(map).toContain('<span className="tm-swatch" aria-hidden="true" />');
    expect(en.posTables.state).toMatchObject({ free: 'Free', seated: 'Seated', cooking: 'Food cooking', eating: 'Eating', bill: 'Bill printed' });
    for (const s of TABLE_STATES) {
      expect(hi.posTables.state[s]).toBeTruthy();
      expect(hi.posTables.state[s]).not.toBe(en.posTables.state[s]);
    }
    expect(hi.posTables.legendAria).toBeTruthy();
    expect(JSON.stringify(en.posTables.state)).not.toMatch(/KOT|Ordering/);
  });

  it('the legend shows only where there is a room to explain', () => {
    expect(map).toContain('{tables > 0 ? (');
  });

  it('the move sheet colours a table the way the map does', () => {
    expect(sheet).toContain('className={`tm-tile is-${stateOf(x)}`}');
    expect(css).not.toContain('is-ordering');
  });
});

describe('QA — each colour’s border is 3:1 or more, and the swatch matches its tile', () => {
  const hex = (name: string): string => {
    const base = readFileSync(join(__dirname, '../styles/00-base.css'), 'utf8');
    return new RegExp(`--${name}: (#[0-9a-f]{6})`).exec(base)![1]!;
  };
  const lum = (h: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const contrast = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x! + 0.05) / (y! + 0.05);
  };
  const borderOf = (state: string) => new RegExp(`\\.tm-tile\\.is-${state}, \\.tm-key\\.is-${state} \\.tm-swatch \\{ background: var\\(--[a-z-]+\\); border-color: var\\(--([a-z-]+)\\); \\}`).exec(css)?.[1];

  it.each(['free', 'seated', 'cooking', 'eating', 'bill'])('%s', (state) => {
    const token = borderOf(state);
    expect(token, `no shared tile + swatch rule for ${state}`).toBeTruthy();
    expect(contrast(hex(token!), hex('surface'))).toBeGreaterThanOrEqual(3);
    expect(contrast(hex(token!), hex('page-bg'))).toBeGreaterThanOrEqual(3);
  });

  it('AC-03 — the legend wraps rather than scrolls, each key whole; type in rem', () => {
    const rule = css.slice(css.indexOf('.tm-legend {'), css.indexOf('}', css.indexOf('.tm-legend {')));
    expect(rule).toContain('flex-wrap: wrap');
    expect(rule).toContain('font-size: 0.75rem');
    expect(css).toContain('.tm-key { display: inline-flex; align-items: center; gap: var(--sp-1); white-space: nowrap; }');
    expect(css).toMatch(/\.tm-swatch \{[^}]*width: 0\.75rem;/);
  });
});
