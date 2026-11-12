import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';

/**
 * Owner, 9 Nov 2026 — "an accidental touch directly opens WhatsApp; it should be under the card, only the number as
 * text". And the list should look like a list: one clean row per person.
 */
const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
const list = read('CustomersClient.tsx');
const card = read('../components/ClientProfileCard.tsx');
const css = read('../styles/32-customers.css');

describe('the Customers list', () => {
  it('has no WhatsApp link on any row, phone or table: the number is text', () => {
    expect(list).not.toContain('wa.me');
    expect(list).not.toContain('IconWhatsApp');
    expect(list).toContain('<span className="cust-phone">{formatPhone(c.waPhone)}</span>');
  });

  it('opens the person on a tap, and WhatsApp is in what opens, beside Call', () => {
    expect(list).toContain('onClick={() => setOpenClientId(c.id)}');
    expect(card).toContain('href={`https://wa.me/${waDigits(profile.phone)}`}');
    expect(card.indexOf('{c.call}')).toBeLessThan(card.indexOf('{c.whatsapp}'));
    for (const lang of [en, hi]) expect(lang.clientCard.whatsapp).toBeTruthy();
  });

  it('draws one row per person: a cartoon face, name and amount, facts in grey, a chevron', () => {
    for (const cls of ['cust-avatar', 'cust-card-top', 'cust-card-name', 'cust-card-amt', 'cust-card-sub', 'cust-card-facts']) {
      expect(list, cls).toContain(`className="${cls}"`);
      expect(css, cls).toContain(`.${cls} {`);
    }
    expect(list).toContain('<IconChevronRight />');
  });

  it('keeps every row the same height: facts clipped, never wrapped; a 44px+ row', () => {
    expect(css).toMatch(/\.cust-card-facts \{[^}]*white-space: nowrap;[^}]*\}/);
    expect(css).toMatch(/\.cust-card-name \{[^}]*text-overflow: ellipsis;[^}]*\}/);
    expect(css).toMatch(/\.cust-card \{[^}]*min-height: 4rem;/);
  });
});

describe("the owner's round theme on a phone (10 Nov 2026)", () => {
  /** Owner, 12 Nov 2026 — "I want this to go into a filter, in line with the Export button." */
  it('keeps the groups in the Filter menu, each with its colour and its count', () => {
    expect(list).not.toContain('cust-pill');
    expect(css).not.toContain('cust-pill');
    expect(list).toContain('className="dropdown-item dropdown-item-plain cust-filter-item"');
    expect(list).toContain('aria-checked={status === group.key}');
    expect(list).toContain('<b>{group.count}</b>');
    expect(list.indexOf('cust-filter-item')).toBeLessThan(list.lastIndexOf("{t('export')}"));
    expect(css).toMatch(/\.cust-filter-item \{[^}]*border-left: 3px solid var\(--seg, transparent\);/);
  });

  /** Owner, 12 Nov 2026 — "can we filter by customer has spent the most". */
  it('offers the order in the same menu: came last, spent the most, name', () => {
    expect(list).toContain("{ key: 'recent', direction: 'desc', label: t('orderRecent') }");
    expect(list).toContain("{ key: 'spent', direction: 'desc', label: t('orderSpent') }");
    expect(list).toContain("{ key: 'name', direction: 'asc', label: t('orderName') }");
    expect(list).toContain('aria-checked={sort === order.key && direction === order.direction}');
    // Under the groups, inside the one menu — not a third button on a 344px row.
    expect(list.indexOf('<b>{group.count}</b>')).toBeLessThan(list.indexOf("t('showFirst')"));
    expect(list.indexOf("t('showFirst')")).toBeLessThan(list.lastIndexOf("{t('export')}"));
    expect(css).toMatch(/\.cust-order-item\[aria-checked='true'\]::after \{/);
  });

  /** Owner, 12 Nov 2026 — "on top card I want total reward points people have accumulated". */
  it('shows the reward points only where the business runs rewards, in place of "Came back" on a phone', () => {
    expect(list).toContain("typeof stats.rewardPoints === 'number'");
    expect(list).toContain("{points && <Kpi icon={<IconCoins />} label={t('kpiPoints')}");
    expect(list).toContain("className={points ? 'cust-kpis cust-kpis-points' : 'cust-kpis'}");
    expect(css).toMatch(/@media \(max-width: 860px\) \{[^@]*\.cust-kpis-points \.cust-kpi-returning,\s*\.cust-kpi-full \{\s*display: none;/);
    expect(css).toMatch(/\.cust-kpi-short \{\s*display: none;/);
  });

  it('writes a big points figure short on a phone, in digits a reader of either language knows', () => {
    const short = (n: number) => new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
    expect(short(12450)).toBe('12.5K');
    expect(short(124500)).toBe('1.2L');
    expect(list).toContain("new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 })");
    // Under ten thousand it is the whole number: 1,494 points is not "1.5K" to the business that owes them.
    expect(list).toContain('Math.abs(stats.rewardPoints) < 10_000');
  });

  /** Owner, 13 Nov 2026 — "we can remove some options and make top cards clickable so they will filter the data". */
  it('lists the people a card counted when the card is tapped: Total, New, Came back — not the points', () => {
    expect(list).toContain("const pickCard = (s: 'all' | 'new' | 'returning') => {");
    expect(list).toContain("setStatus(status === s ? 'all' : s);");
    expect(list).toMatch(/label=\{t\('kpiTotal', \{ noun: lower \}\)\}[^\n]*onClick=\{\(\) => pickCard\('all'\)\} \/>/);
    expect(list).toMatch(/label=\{t\('kpiNew'\)\}[^\n]*onClick=\{\(\) => pickCard\('new'\)\} pressed=\{status === 'new'\}/);
    expect(list).toMatch(/className="cust-kpi-returning"[^\n]*onClick=\{\(\) => pickCard\('returning'\)\} pressed=\{status === 'returning'\}/);
    // With rewards on, a phone hides "Came back": "% came back" opens the same list, so the list is never out of reach.
    expect(list).toMatch(/label=\{t\('kpiRepeat'\)\}[^\n]*onClick=\{\(\) => pickCard\('returning'\)\} pressed=\{status === 'returning'\}/);
    expect(list).not.toMatch(/label=\{t\('kpiPoints'\)\}[^\n]*onClick/);
  });

  it('makes a tappable card a real button that says when it is on, and not by colour alone', () => {
    expect(list).toContain('<button type="button" className={classes} title={sub} aria-pressed={pressed} onClick={onClick}>');
    expect(css).toMatch(/\.cust-kpi-tap:focus-visible \{\s*outline: 2px solid var\(--accent\);/);
    // The accent ring is the first shadow layer; the raised look (owner, 13 Nov 2026) adds layers after it.
    expect(css).toMatch(/\.cust-kpi\.cust-kpi-tap\[aria-pressed='true'\] \{[^}]*border-color: var\(--accent\);[^}]*box-shadow:\s*inset 0 0 0 1px var\(--accent\)[,;]/);
    // 78px on a phone, so the whole card is well over a 44px target.
    expect(css).toMatch(/@media \(max-width: 860px\) \{[^@]*\.cust-kpi \{[^}]*min-height: 78px;/);
  });

  // Owner, 13 Nov 2026 — "change the existing card shape and look like 3d".
  it('raises each card off the page, and presses a tappable one down without needing motion', () => {
    expect(css).toMatch(/\.cust-kpi \{[^}]*border-radius: var\(--radius-lg\);[^}]*box-shadow:[^;]*0 3px 0 var\(--kpi-lip\)/);
    expect(css).toMatch(/\.cust-kpi-tap:active \{\s*transform: translateY\(2px\);/);
    expect(css).toMatch(/\.cust-kpi\.cust-kpi-tap\[aria-pressed='true'\] \{[^}]*transform: translateY\(2px\);/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.cust-kpi-tap \{\s*transition: none;/);
    // Under a pointer the card turns green and lifts; the picked card (a heavier selector) stays down.
    expect(css).toMatch(/@media \(hover: hover\) \{\s*\.cust-kpi-tap:hover \{[^}]*--kpi-bottom: var\(--accent-soft\);[^}]*transform: translateY\(-1px\);/);
  });

  it('drops "All" and "Never came" from the Filter menu, and a group that is on comes off when tapped again', () => {
    expect(list).toContain('{stats.segments.map((group) => (');
    expect(list).not.toContain("{ key: 'all' as const, label: t('allNoun'");
    expect(list).not.toContain("{ key: 'never' as const");
    expect(list).toContain("pickBand(status === group.key ? 'all' : group.key);");
  });

  it('names a card’s list in words and takes it from a link', () => {
    expect(list).toMatch(/s === 'new'\s*\? t\('kpiNew'\)\s*: s === 'returning'\s*\? t\('kpiReturning', \{ noun: lower \}\)/);
    expect(read('page.tsx')).toContain("'never', 'new', 'returning']);");
    expect(read('../lib/api-types.ts')).toContain("| 'never' | 'new' | 'returning';");
  });

  it('shows that menu on a phone, with a 44px line to tap', () => {
    expect(css).not.toMatch(/\.cust-toolbar \.dropdown-anchor \{\s*display: none;/);
    expect(css).not.toMatch(/\.cust-toolbar \.dropdown-anchor\s*\{\s*display: none;/);
    expect(css).not.toMatch(/#cust-segments,\s*\.cust-toolbar \.dropdown-anchor/);
    expect(css).toMatch(/@media \(max-width: 860px\) \{\s*\.cust-filter-item \{[^}]*min-height: 2\.75rem;/);
  });

  it('draws each row as a capsule whose left arc is its group colour', () => {
    expect(list).toContain("style={SEGMENT_TONE[c.segment] ? { ['--seg' as string]: SEGMENT_TONE[c.segment] } : undefined}");
    expect(css).toMatch(/\.cust-card,\s*\.cust-card:last-child \{[^}]*border-left: 3px solid var\(--seg, var\(--border\)\);[^}]*border-radius: 2\.25rem;/);
  });

  it('keeps the group in words beside its colour on the All view, and drops it where the Filter already says it', () => {
    expect(list).toContain("{status === 'all' ? chipOf(c.segment) : null}");
  });

  it('still folds the "how they are doing" panel away on a phone: the menu already says it', () => {
    expect(css).toMatch(/\.cust-segments-toggle,\s*#cust-segments \{\s*display: none;\s*\}/);
  });
});

describe('the Guests page, tidied (owner, 13 Nov 2026)', () => {
  /** Owner, 13 Nov 2026 — Export wrote the ten rows on screen: 97 guests, a file of 10. */
  it('exports every person the list holds, not the page on screen', () => {
    // A hundred at a time (the API's own limit), until the total is reached; the same list the screen last drew.
    expect(list).toContain("import { MAX_PAGE_SIZE } from '@growza-app/shared';");
    expect(list).toMatch(/const part = await api\.customers\(\{ \.\.\.shown\.current, limit: MAX_PAGE_SIZE, offset \}\);/);
    expect(list).toMatch(/offset \+= part\.rows\.length;\s*if \(part\.rows\.length === 0 \|\| offset >= part\.total\) break;/);
    expect(list).toMatch(/for \(const c of part\.rows\) everyone\.set\(c\.id, c\);/);
    expect(list).toMatch(/writeCsv\(\[\.\.\.everyone\.values\(\)\]\);/);
    expect(list).not.toMatch(/const rows = page\.rows\.map/);
    // `shown` is what the list was asked for, set only when that answer is drawn.
    expect(list).toMatch(/if \(cancelled\) return;\s*shown\.current = asked;\s*setPage\(r\);/);
    // One at a time, and it says so while it waits and when it fails.
    expect(list).toMatch(/if \(exportBusy\.current\) return;/);
    expect(list).toMatch(/\{exporting && <p className="cust-export-wait" role="status">\{t\('exporting'\)\}<\/p>\}/);
    expect(list.match(/<p className="field-error cust-export-failed" role="alert">\{t\('exportFailed'\)\}<\/p>/g)).toHaveLength(2);
    for (const m of [en, hi]) {
      expect(m.customers.exporting).toBeTruthy();
      expect(m.customers.exportFailed).toBeTruthy();
    }
  });

  it('puts search and Filter on one row of a phone, with Export as the last line of the Filter menu', () => {
    expect(css).toMatch(/@media \(max-width: 860px\) \{[\s\S]*?\.cust-toolbar \{\s*flex-wrap: nowrap;\s*\}\s*\.cust-toolbar \.search-wrap \{\s*flex: 1 1 0;\s*min-width: 0;\s*\}\s*\.cust-toolbar \.dropdown-anchor \{\s*flex: none;\s*\}\s*\.cust-toolbar > \.btn-ghost \{\s*display: none;/);
    expect(list).toContain('className="dropdown-item dropdown-item-plain cust-filter-item cust-filter-export"');
    expect(list).toMatch(/cust-filter-export"\s*disabled=\{page\.rows\.length === 0 \|\| exporting\}\s*onClick=\{\(\) => \{\s*void exportCsv\(\);\s*setFilterOpen\(false\);/);
    // From a tablet up Export keeps its own button, so the menu line is not drawn twice.
    expect(css).toMatch(/@media \(min-width: 861px\) \{\s*\.cust-filter-export,\s*\.cust-filter-export-sep \{\s*display: none;/);
  });

  it('keeps the Filter button one word, and marks it when a list is on', () => {
    expect(list).toContain("className={`btn btn-ghost${status === 'all' ? '' : ' is-on'}`}");
    expect(list).toContain("{t('filter')} ⌄");
    expect(css).toMatch(/\.cust-toolbar \.btn\.is-on \{\s*border-color: var\(--accent\);/);
  });

  it('says how many and of which list under the toolbar, with a 44px way back to everyone', () => {
    expect(list).toContain("{(status !== 'all' || search.trim() !== '') && (");
    expect(list).toContain('<p className="cust-list-count" aria-live="polite">');
    expect(list).toContain("{t('listCount', { count: page.total, one: singular, many: lower })}");
    expect(list).toContain(`<button type="button" className="cust-list-clear" aria-label={t('clearFilter')} onClick={() => pickBand('all')}>`);
    expect(css).toMatch(/\.cust-list-clear \{[^}]*width: 2\.75rem;\s*height: 2\.75rem;/);
    expect(css).toMatch(/\.cust-list-count > span \{[^}]*text-overflow: ellipsis;/);
    for (const lang of [en, hi]) expect(lang.customers.listCount).toContain('{count, plural,');
  });

  it('writes when a person came in words, not as a date', () => {
    expect(list).toContain("c.lastBookingAt ? t('cameWhen', { when: lowerFirst(formatRecency(c.lastBookingAt, undefined, locale)) }) : null");
    expect(list).not.toContain('formatDateShort');
    for (const lang of [en, hi]) expect(lang.customers.cameWhen).toContain('{when}');
  });

  it('lays the reward points card flat: raised is kept for what can be tapped', () => {
    expect(list).toMatch(/label=\{t\('kpiPoints'\)\}[^\n]*className="cust-kpi-flat" \/>/);
    expect(css).toMatch(/\.cust-kpi\.cust-kpi-flat \{\s*background: var\(--kpi-top\);\s*box-shadow: none;/);
  });

  it('makes the never-came words on a tablet the way to their list, and back', () => {
    expect(list.split(`className="cust-never-link" aria-pressed={status === 'never'} onClick={() => pickBand(status === 'never' ? 'all' : 'never')}`)).toHaveLength(3);
    expect(css).toMatch(/\.cust-never-link \{[^}]*padding: 0\.8125rem 0;[^}]*text-decoration: underline;/);
    expect(css).toMatch(/\.cust-never-link:focus-visible \{\s*outline: 2px solid var\(--accent\);/);
  });

  it('fills both rows of cards on a tablet: three over two with points, two over two without', () => {
    expect(css).toMatch(/@media \(min-width: 861px\) and \(max-width: 1100px\) \{\s*\.cust-kpis \{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);\s*\}\s*\.cust-kpis-points \{\s*grid-template-columns: repeat\(6, minmax\(0, 1fr\)\);\s*\}\s*\.cust-kpis-points > \.cust-kpi \{\s*grid-column: span 2;\s*\}\s*\.cust-kpis-points > \.cust-kpi:nth-child\(n \+ 4\) \{\s*grid-column: span 3;/);
  });

  it('calls the phone tab "Alerts": "Notifications" was the longest word on a five-tab bar', () => {
    const nav = read('../components/BottomNav.tsx');
    expect(nav.split("{ href: '/notifications', label: t.nav.notificationsShort,")).toHaveLength(3);
    expect(read('../lib/home-copy.ts')).toContain("notificationsShort: S('Alerts', 'सूचनाएं'),");
  });
});
