import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Owner, 2026-10-28 — "we can give it as small filter icon ... instead of full menu order".
 *
 * "Menu order" spelled out took 120px of a 344px row, and the search box beside it was left so narrow that its
 * own placeholder read "Search 24 c…". A control most owners never touch was crowding out the one they all use.
 *
 * The point of these is that it stayed a REAL `<select>`. The cheap way to draw a control as an icon is to build
 * a menu out of buttons, and that costs the phone's own picker, the keyboard, and every option's name.
 */
const component = readFileSync(join(process.cwd(), 'app/(tenant)/components/ServiceSheet.tsx'), 'utf8');
const css = readFileSync(join(process.cwd(), 'app/(tenant)/styles/73-pay-flow.css'), 'utf8');

describe('the dish sheet’s sort is a mark, not a sentence', () => {
  it('is still a native select, with its options still named', () => {
    expect(component).toMatch(/<select value=\{sort\} onChange=\{\(e\) => setSort\(e\.target\.value as MenuSort\)\}/);
    expect(component).toContain('{MENU_SORTS.map((k) => (');
    expect(component).toContain('{t(`sort.${k}`)}');
  });

  it('lays the select over the whole mark, so the tap target IS the control', () => {
    expect(css).toMatch(/\.pf-sort-mark select \{[^}]*position: absolute;/);
    expect(css).toMatch(/\.pf-sort-mark select \{[^}]*inset: 0;/);
    expect(css).toMatch(/\.pf-sort-mark select \{[^}]*opacity: 0;/);
  });

  it('keeps the word a screen reader says, even though the picture is a funnel', () => {
    // The owner chose the filter mark for a control that sorts. The picture is theirs; the name is not.
    expect(component).toMatch(/aria-label=\{t\('sort\.label'\)\}/);
    expect(component).toContain('<IconFilter />');
    expect(component).toContain('aria-hidden="true"');
  });

  it('says when it has been changed, because an icon cannot say so by itself', () => {
    expect(component).toMatch(/sort === 'menu' \? '' : 'pf-sort-set'/);
    expect(css).toContain('.pf-sort-mark.pf-sort-set');
  });

  it('is still reachable by keyboard, with a ring that is visible though the select is not', () => {
    expect(css).toMatch(/\.pf-sort-mark:focus-within \{[^}]*outline:/);
  });

  it('is 2.5rem — the sheet’s own control height, not a smaller tap target', () => {
    expect(css).toMatch(/\.pf-sort-mark \{[^}]*width: 2\.5rem;/);
    expect(css).toMatch(/\.pf-sort-mark \{[^}]*height: 2\.5rem;/);
  });

  it('leaves the wide till’s sort spelled out — it has the room', () => {
    // `.pf-sort-mark` is added in this sheet only; `.pf-wide-tools .pf-sort` is untouched.
    expect(css).not.toMatch(/\.pf-wide-tools[^{]*\.pf-sort-mark/);
  });
});
