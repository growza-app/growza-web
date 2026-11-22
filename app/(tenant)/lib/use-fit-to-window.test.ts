import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FIT_GAP_PX, FIT_MIN_PX, fitHeight } from './use-fit-to-window';

/**
 * Owner, 2026-11-22 — the till's bill panel on a laptop was 793px in a 768px window: Complete sale started off screen
 * and "Paid two ways" could not be reached until the whole menu had been scrolled past.
 */
const src = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('fitHeight — the room a sticky panel has below where it starts', () => {
  it('1366×768, before the page scrolls: the scroller ends at 756, the panel starts at 188', () => {
    expect(fitHeight(756, 188)).toBe(756 - 188 - FIT_GAP_PX);
  });

  it('once the page scrolls and the panel sticks near the top, it grows by as much', () => {
    expect(fitHeight(756, 36)).toBe(756 - 36 - FIT_GAP_PX);
  });

  it('never squeezed below the floor, however short the window', () => {
    expect(fitHeight(300, 250)).toBe(FIT_MIN_PX);
  });
});

describe('the till uses it', () => {
  const payFlow = src('../appointments/new/PayFlow.tsx');
  const posCss = src('../styles/99-pos.css');
  const tillCss = src('../styles/79-desk-till.css');

  it('the bill panel is measured, and capped and scrolled by the stylesheet', () => {
    expect(payFlow).toContain('useFitToWindow(wideRight, wide && productsOnly);');
    expect(payFlow).toContain('<aside ref={setWideRight} className="pf-wide-right">');
    expect(posCss).toMatch(/\.pf-wide:has\(\.prd-cat-li\) \.pf-wide-right \{[^}]*max-height: var\(--fit-max, none\);[^}]*overflow-y: auto;/);
  });

  it('how it is paid stays at the panel’s foot; elsewhere its wrapper changes nothing', () => {
    expect(payFlow).toContain('<div className="pf-wide-pay">');
    expect(posCss).toMatch(/\.pf-wide-right \.pf-wide-pay \{[^}]*position: sticky;[^}]*bottom:/);
    expect(tillCss).toMatch(/\.pf-wide-pay \{\s*display: contents;/);
  });
});
