import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * An inline icon with no rule naming it fills its parent.
 *
 * `base` in `icons.tsx` sets a viewBox and nothing else — no width, no height — so every icon in
 * this app is sized by CSS. That is the right default (an icon takes the weight of the text beside
 * it, which only the stylesheet knows), but it means a swap that ships without a matching rule does
 * not render small and wrong, it renders at the size of whatever contains it.
 *
 * It happened: the phone sweep replaced 📅 on the Clients list with `IconCalendar` and added a rule
 * for `.cl-card .muted svg` — an ancestor that does not exist on that screen. Ten calendars rendered
 * at 282x282 down the list, one per client.
 *
 * So each icon that sits inline in a line of text gets its OWN element with its own class, and this
 * pins that the class is still there on both sides. A selector that names a wrapper cannot silently
 * match nothing the way a descendant selector can.
 */
const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');

describe('an inline icon is sized by a class of its own', () => {
  it('icons.tsx still leaves sizing to CSS — if this changes, the rest of this file can go', () => {
    const icons = read('./icons.tsx');
    const base = icons.slice(icons.indexOf('const base = {'), icons.indexOf('};', icons.indexOf('const base = {')));
    expect(base).toMatch(/viewBox:/);
    expect(base).not.toMatch(/\bwidth\b/);
    expect(base).not.toMatch(/\bheight\b/);
  });

  const sized: Array<[string, string, string]> = [
    // [what it replaced, the wrapper in the markup, the stylesheet that sizes it]
    ['📅 on the Clients list', 'cl-last-visit-icon', '../styles/32-customers.css'],
    ['📅 · 👤 · ⏱️ · 🎁 · 🧾 in the package preview', 'preview-fact-icon', '../styles/30-combo-builder-wizard.css'],
  ];

  for (const [was, cls, sheet] of sized) {
    it(`${was} has a sized wrapper (.${cls})`, () => {
      const css = read(sheet);
      const rule = css.slice(css.indexOf(`.${cls} svg {`));
      expect(css).toContain(`.${cls} svg {`);
      expect(rule.slice(0, 120)).toMatch(/width:\s*[\d.]+rem/);
      expect(rule.slice(0, 120)).toMatch(/height:\s*[\d.]+rem/);
    });
  }

  it('the markup uses those wrappers', () => {
    expect(read('../customers/CustomersClient.tsx')).toMatch(/className="cl-last-visit-icon"/);
    const builder = read('../packages/PackageBuilder.tsx');
    expect(builder).toMatch(/className="preview-fact-icon"/);
  });

  it('no emoji is left doing an icon\'s job', () => {
    // CLAUDE.md: one icon language, inline SVG, never an emoji as a UI icon.
    const pictographic = /[\u{1F300}-\u{1FAFF}]/u;
    for (const f of [
      '../customers/CustomersClient.tsx',
      '../offers/OffersList.tsx',
      '../packages/PackageBuilder.tsx',
      '../appointments/BookingsList.tsx',
      '../attendance/AttendanceRegister.tsx',
      './BookingSummary.tsx',
    ]) {
      // Comments may still name the emoji they replaced; code may not use one.
      const code = read(f)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect({ file: f, hit: pictographic.test(code) }).toEqual({ file: f, hit: false });
    }
  });
});
