import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sheet = readFileSync(resolve(__dirname, 'ProductSheet.tsx'), 'utf8');
const list = readFileSync(resolve(__dirname, 'ProductsList.tsx'), 'utf8');

/** Develop QA 2026-11-21, finding 6 — one state, one name: a kitchen's dish is "Taken off", on the Menu and in its own sheet. */
describe('a dish off the menu is "Taken off" everywhere a kitchen sees it', () => {
  it('the sheet: its pill, its line and its button use the Menu words for a kitchen; a shop keeps Retired', () => {
    expect(sheet).toContain("{product.active ? tp('strip.onMenu') : tp('strip.offMenu')}</span>");
    expect(sheet).toContain("counted ? tp('retired') : tp('strip.offMenu')");
    expect(sheet).toContain("product.active ? (counted ? tp('retire') : tm('takeOff')) : counted ? tp('bringBack') : tm('putBack')");
  });

  it("the Menu's own pills say Taken off, never Retired", () => {
    expect(list).toContain("{p.active ? t('strip.onMenu') : t('strip.offMenu')}");
    expect(list).not.toContain("t('strip.onMenu') : t('retired')");
  });
});
