import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../../messages/en.json';
import hi from '../../../../messages/hi.json';

/**
 * Jira GRW-572 — the till in three panels on a wide desk.
 *
 * It is `PayFlow` with room, not a third form: one state, one `pay()`, the same two writes. These pin the
 * seams that make that true, and the width rule that keeps phones and narrow laptops exactly as they were.
 */
const here = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
const wrapper = here('./NewBookingClient.tsx');
const flow = here('./PayFlow.tsx');
const grid = here('./DeskServiceGrid.tsx');
const unpaid = here('./DeskUnpaid.tsx');
const css = here('../../styles/79-desk-till.css');
const globals = here('../../globals.css');

describe('the wide till', () => {
  it('is asked for only at the desktop tier, and decided in the same effect as the phone rule', () => {
    expect(wrapper).toMatch(/setWide\(window\.matchMedia\('\(min-width: 1101px\)'\)\.matches\);\s*setLayout\(window\.matchMedia\('\(max-width: 860px\)'\)/);
    expect(wrapper).toMatch(/if \(quick && layout === 'desk' && wide\) \{\s*return <PayFlow [^>]*wide \/>;/);
    // A booking settles on the wide till too, at the same width, and on the phone's flow below it.
    expect(wrapper).toMatch(/wide=\{wide && layout === 'desk'\}/);
    expect(css).toMatch(/^@media \(min-width: 1101px\) \{/m);
    expect(css).not.toMatch(/max-width: 860px/);
    expect(globals.indexOf('79-desk-till.css')).toBeGreaterThan(globals.indexOf('73-pay-flow.css'));
  });

  it('has three panels and no second save path', () => {
    for (const cls of ['pf-wide-left', 'pf-wide-mid', 'pf-wide-right']) expect(flow + grid).toContain(cls);
    expect(flow).toMatch(/<DeskUnpaid location=\{location\} timezone=\{timezone\}/);
    expect(flow).toMatch(/<DeskServiceGrid\s+services=\{ranked_all\}\s+countOf=\{countOf\}\s+onMore=\{addOne\}\s+onLess=\{oneLess\}/);
    // A package is lines with a `pkg`, sent as its legs plus the offer id; its legs never count on a tile.
    expect(flow).toMatch(/\.\.\.\(pkgOnBill \? \{ offerId: pkgOnBill\.id \} : \{\}\)/);
    expect(flow).toMatch(/const countOf = \(serviceId: string\) => lines\.filter\(\(l\) => l\.serviceId === serviceId && !l\.pkg\)\.length;/);
    expect(flow).toMatch(/const amounts = spread\(baseAmounts\.map/);
    expect(flow).toMatch(/<BillRows lines=\{lines\} listMinor=\{listMinor\} totalMinor=\{totalMinor\} onLess=\{oneLess\} \/>/);
    // The payment tiles are one element drawn in two places; neither the grid nor the list writes anything.
    expect((flow.match(/\{payTiles\}/g) ?? []).length).toBe(2);
    for (const src of [grid, unpaid]) {
      expect(src).not.toMatch(/recordCounterSale|checkout\(/);
    }
    // The list opens the same addresses the token board and Bookings use.
    expect(unpaid).toMatch(/payTokenHref\(x\)/);
    expect(unpaid).toMatch(/payVisitHref\(\{ appointmentId: a\.id, startAt: a\.startAt \}, timezone\)/);
  });

  it('searches the way every other box does: by spelling, and by price', async () => {
    // The grid must go through lib/service-match, which is what answers "300" with the ₹300 service.
    expect(grid).toMatch(/matchItems\(\s*pool\.map\(\(s\) => \(\{ item: s, text: \[s\.name, s\.categoryName \?\? ''\], priceMinor: asMinor\(s\.priceMinor\) \}\)\)/);
    expect(grid).toMatch(/priceMinor: asMinor\(o\.comboPriceMinor\)/);
    expect(grid).not.toMatch(/toLowerCase\(\)\.includes/);
    const { matchItems, asMinor } = await import('../../lib/service-match');
    const menu = [
      { id: 'a', name: 'Haircut', priceMinor: '30000' },
      { id: 'b', name: 'Beard Trim', priceMinor: '15000' },
      { id: 'c', name: 'Gold Facial', priceMinor: '120000' },
    ];
    const find = (q: string) => matchItems(menu.map((s) => ({ item: s, text: [s.name], priceMinor: asMinor(s.priceMinor) })), q).map((s) => s.name);
    expect(find('300')).toEqual(['Haircut']);
    expect(find('1200')).toEqual(['Gold Facial']);
    expect(find('haircat')).toEqual(['Haircut']);
  });

  it('has the category chips the phone sheet has, under the search, with a count each', () => {
    expect(grid).toMatch(/const pool = kind \? services\.filter\(\(s\) => s\.categoryName === kind\) : services;/);
    expect(grid).toMatch(/className="pf-chips pf-wide-kinds"/);
    expect(grid).toMatch(/\{nv\.allServices\}/);
    expect(css).toMatch(/\.pf-wide-kinds \.pf-chip \{\s*min-height: 32px;/);
  });

  it('keeps the phone keyboard rule: the search box lives in the grid file, not in PayFlow', () => {
    expect(flow).not.toMatch(/<input/);
    expect((grid.match(/<input/g) ?? []).length).toBe(1);
    expect(grid).not.toMatch(/autoFocus/);
  });

  it('says it in both languages', () => {
    const e = en.payFlow.desk as Record<string, string>;
    const h = hi.payFlow.desk as Record<string, string>;
    expect(Object.keys(h).sort()).toEqual(Object.keys(e).sort());
    expect(e.search).toMatch(/\{count\}/);
    expect(h.search).toMatch(/\{count\}/);
  });
});
