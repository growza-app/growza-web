import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { averagePct, SECTION_HUES, sectionHue } from './menu-manager';

const cats = Array.from({ length: 8 }, (_, i) => ({ id: `c${i}` }));

describe('Menu section colours (owner, 2026-11-20)', () => {
  it('a section takes its colour from its place in the menu, and the seventh starts again', () => {
    expect(sectionHue('c0', cats)).toBe(1);
    expect(sectionHue('c5', cats)).toBe(6);
    expect(sectionHue('c6', cats)).toBe(1);
    expect(SECTION_HUES).toBe(6);
  });

  it('a dish in no section, or a section not in the list, stays grey', () => {
    expect(sectionHue(null, cats)).toBeNull();
    expect(sectionHue('gone', cats)).toBeNull();
  });

  it('every hue has its token and its rule', () => {
    const base = readFileSync(new URL('../styles/00-base.css', import.meta.url), 'utf8');
    const menu = readFileSync(new URL('../styles/99-menu-manager.css', import.meta.url), 'utf8');
    for (let n = 1; n <= SECTION_HUES; n++) {
      expect(base).toContain(`--cat-${n}:`);
      expect(menu).toContain(`.mnu-group[data-hue='${n}'] { --sec: var(--cat-${n}); }`);
    }
  });
});

describe("a section's average food cost", () => {
  it('averages only the dishes that have one, to one decimal', () => {
    expect(averagePct([30, null, 40, undefined, 35.5])).toBe(35.2);
  });

  it('is null when no dish has a food cost (zero is a cost, not a gap)', () => {
    expect(averagePct([null, undefined])).toBeNull();
    expect(averagePct([])).toBeNull();
    expect(averagePct([0, 10])).toBe(5);
  });
});
