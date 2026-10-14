import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Owner, 2026-10-14 — Make a package on a wide desk: three columns (details and price left, the services
 * scrolling in the middle, the preview right), one screen. Source-regex pins, as the other desk screens.
 */
const read = (p: string) => readFileSync(join(__dirname, p), 'utf8');
const builder = read('PackageBuilder.tsx');
const css = read('../styles/79-desk-package.css');
const wizard = read('../styles/30-combo-builder-wizard.css');
const picker = read('ServicePickerSheet.tsx');

describe('Make a package on a desk', () => {
  it('the form is three wrappers in the phone\'s order: details, services, the rest', () => {
    const a = builder.indexOf('<div className="pe-col-details">');
    const b = builder.indexOf('<div className="pe-col-services">');
    const c = builder.indexOf('<div className="pe-col-rest">');
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    expect(builder).toMatch(/<div className="pe-col-details">\s*<div className="sheet-label sheet-label-details">/);
    expect(builder).toMatch(/<div className="pe-col-services">\s*<div className="sheet-label pe-label-services">/);
    expect(builder).toMatch(/<div className="pe-col-rest">\s*<div className="sheet-label sheet-label-price">/);
  });

  it('the page is one screen at the desktop tier, each column scrolling on its own', () => {
    expect(css).toMatch(/@media \(min-width: 1101px\) \{\s*\.page-body:has\(> \.pkg-editor\) \{\s*display: flex;\s*flex-direction: column;\s*overflow: hidden;/);
    expect(css).toMatch(/\.pkg-editor \.pe-form \{\s*display: contents;/);
    expect(css).toMatch(/\.pkg-editor \.pe-layout \{[\s\S]*?grid-template-columns: minmax\(15rem, 19rem\) minmax\(0, 1fr\) minmax\(18rem, 21rem\);[\s\S]*?grid-template-rows: auto minmax\(0, 1fr\);/);
    expect(css).toMatch(/\.pkg-editor \.pe-col-services \{\s*grid-column: 2;\s*grid-row: 1 \/ 3;/);
    expect(css).toMatch(/\.pkg-editor \.pe-aside \{\s*grid-column: 3;\s*grid-row: 1 \/ 3;/);
    // Every service row scrolls inside the group, not the page: the eight-row cap is lifted.
    expect(css).toMatch(/\.pkg-editor \.pe-service-list\.is-long \{[\s\S]*?max-height: none;\s*overflow-y: auto;/);
  });

  it('the wizard sheet\'s child selectors follow the wrappers', () => {
    expect(wizard).toMatch(/\.pe-col-details > \.sheet-label:first-child \{/);
    expect(wizard).toMatch(/\.pe-col-details > \.offer-branch-field \{/);
    expect(wizard).toMatch(/\.pe-form > div > \.sheet-label \{/);
    expect(wizard).not.toMatch(/\.pe-form > \.sheet-label/);
  });

  it('the name and the tagline stack their label over the field in the narrow column', () => {
    expect(css).toMatch(/\.pkg-editor \.pe-col-details \.sheet-row \{\s*flex-wrap: wrap;/);
    expect(css).toMatch(/\.pkg-editor \.pe-col-details \.sheet-row-label \{\s*flex: 1 1 100%;/);
  });

  it('a 344px phone stacks the detail labels too, and lets the title wrap', () => {
    expect(wizard).toMatch(/@media \(max-width: 480px\) \{[\s\S]*?\.pkg-editor \.pe-title \{\s*white-space: normal;[\s\S]*?-webkit-line-clamp: 2;[\s\S]*?\.pkg-editor \.pe-col-details \.sheet-row \{\s*flex-wrap: wrap;/);
  });

  it('Add services on a desk is the till\'s grid: a tap toggles, the − n + is not drawn', () => {
    expect(picker).toMatch(/window\.matchMedia\('\(min-width: 1101px\)'\)/);
    expect(picker).toMatch(/className="modal sheet svc-picker svc-picker-desk pf-wide"/);
    expect(picker).toMatch(/<DeskServiceGrid\s*services=\{services\}\s*countOf=\{\(id\) => \(selectedIds\.includes\(id\) \? 1 : 0\)\}\s*onMore=\{\(s\) => onToggle\(s\.id\)\}\s*onLess=\{\(id\) => onToggle\(id\)\}\s*full=\{false\}/);
    expect(css).toMatch(/\.modal\.sheet\.svc-picker-desk \{\s*width: min\(62rem, 92vw\);/);
    expect(css).toMatch(/\.svc-picker-desk \.pf-tile-qty \{\s*display: none;/);
    expect(css).toMatch(/\.svc-picker-desk \.pf-wide-tiles \{[\s\S]*?overflow-y: auto;/);
  });

  it('the narrow band keeps the services wide', () => {
    expect(css).toMatch(/@media \(min-width: 1101px\) and \(max-width: 1300px\) \{\s*\.pkg-editor \.pe-layout \{\s*grid-template-columns: 15rem minmax\(0, 1fr\) 18rem;/);
  });

  it('is loaded after the Bookings desk sheet', () => {
    const globals = read('../globals.css');
    expect(globals.indexOf('79-desk-bookings.css')).toBeLessThan(globals.indexOf('79-desk-package.css'));
  });
});
