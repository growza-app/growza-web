import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Owner, 2026-10-14 — Clients on a wide desk: three panels, as Services (desk-services.test.ts). The bands on
 * the left, the list in the middle, the client's card in place on the right. Source-regex pins, as the rest.
 */
const read = (p: string) => readFileSync(join(__dirname, p), 'utf8');
const client = read('CustomersClient.tsx');
const card = read('../components/ClientProfileCard.tsx');
const css = read('../styles/79-desk-clients.css');

describe('Clients on a desk', () => {
  it('decides by the window, at the desktop tier, and draws nothing until it knows', () => {
    expect(client).toMatch(/window\.matchMedia\('\(min-width: 1101px\)'\)/);
    expect(client).toMatch(/if \(desk === null\) \{[\s\S]*?<div className="page-body" aria-busy="true" \/>/);
  });

  it('is the three panels of the till', () => {
    expect(client).toMatch(/<div className="page-body cust-desk">/);
    expect(client).toMatch(/<div className="pf-wide-grid cust-desk-grid">/);
    expect(client).toMatch(/<aside className="pf-wide-left cust-desk-left"/);
    expect(client).toMatch(/<section className="pf-wide-mid cust-desk-mid"/);
    expect(client).toMatch(/<aside className="pf-wide-right cust-desk-right"/);
  });

  it('the left panel is the four figures and every band with its count', () => {
    expect(client).toMatch(/<dl className="cust-desk-kpis">/);
    expect(client).toMatch(/const bands: CustomerStatusFilter\[\] = \['all', 'active', 'due', 'at_risk', 'inactive', 'never'\];/);
    expect(client).toMatch(/className=\{`cust-desk-band \$\{on \? 'is-on' : ''\}`\}\s*aria-pressed=\{on\}/);
    // A drifted band opens highest-spend-first, as the phone's cards do.
    expect(client).toMatch(/const pickBand = \(s: CustomerStatusFilter\) => \{\s*setStatus\(s\);[\s\S]*?setSort\(s === 'all' \|\| s === 'active' \? 'recent' : 'spent'\);/);
  });

  it('the list is the same rows as the phone table, ten a page, with the open one highlighted', () => {
    expect(client).toMatch(/<thead>\{tableHead\}<\/thead>\s*<tbody>\{tableRows\}<\/tbody>/);
    expect(client).toMatch(/head=\{tableHead\}/);
    expect(client).toMatch(/\{tableRows\}\s*<\/PaginatedTable>/);
    expect(client).toMatch(/className=\{`cust-row-click\$\{openClientId === c\.id \? ' is-selected' : ''\}`\} aria-selected=\{openClientId === c\.id \|\| undefined\}/);
    expect(client).toMatch(/<Pagination page=\{pageIndex \+ 1\} total=\{page\.total\} pageSize=\{pageSize\} noun=\{lower\}/);
  });

  it('the right panel is the client card drawn in place, or the hint and Add', () => {
    expect(client).toMatch(/<ClientProfileCard clientId=\{openClientId\} inline onClose=\{\(\) => setOpenClientId\(null\)\} \/>/);
    expect(client).toMatch(/<div className="cust-desk-nothing">\s*<p>\{t\('deskPick', \{ noun: singular \}\)\}<\/p>\s*<\/div>/);
  });

  it('the card inline has no scrim, no focus trap, and is a region not a dialog', () => {
    expect(card).toMatch(/inline\?: boolean;/);
    expect(card).toMatch(/useDialog\(panel, \{ onClose: inline \? undefined : onClose, initialFocus: 'container', active: !inline \}\);/);
    expect(card).toMatch(/\{!inline && <button type="button" className="cpc-scrim"/);
    expect(card).toMatch(/className=\{inline \? 'cpc cpc-inline' : 'cpc'\} role=\{inline \? 'region' : 'dialog'\} aria-modal=\{inline \? undefined : 'true'\}/);
  });

  it('the sheet lands in the panel: static, full width, no shadow', () => {
    expect(css).toMatch(/\.cpc-inline \{\s*position: static;\s*z-index: auto;\s*width: 100%;\s*max-width: none;[\s\S]*?box-shadow: none;/);
  });

  it('the table never pushes past its panel: fixed columns, the name truncates, two columns the card carries fold', () => {
    expect(css).toMatch(/\.cust-desk-table table \{\s*min-width: 0;\s*table-layout: fixed;/);
    expect(css).toMatch(/\.cust-desk-table td \{\s*overflow: hidden;\s*text-overflow: ellipsis;/);
    // "Last booking" always; Phone up to 1440.
    expect(css).toMatch(/@media \(min-width: 1101px\) \{[\s\S]*?\.cust-desk-table th:nth-child\(3\),\s*\.cust-desk-table td:nth-child\(3\) \{\s*display: none;/);
    expect(css).toMatch(/@media \(min-width: 1101px\) and \(max-width: 1440px\) \{\s*\.cust-desk-table th:nth-child\(2\),\s*\.cust-desk-table td:nth-child\(2\) \{\s*display: none;/);
  });

  it('is loaded after the Services desk sheet, and says it in both languages', () => {
    const globals = read('../globals.css');
    expect(globals.indexOf("79-desk-services.css")).toBeLessThan(globals.indexOf("79-desk-clients.css"));
    for (const lang of ['en', 'hi']) {
      const m = JSON.parse(readFileSync(join(__dirname, `../../../messages/${lang}.json`), 'utf8'));
      expect(m.customers.deskPick, lang).toMatch(/\{noun\}/);
    }
  });
});
