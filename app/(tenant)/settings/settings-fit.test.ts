import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-229 — every Settings tab on one screen, and the hub on a phone.
 *
 * The measuring is done in a browser (`npm run test:devices`, and the numbers
 * in docs/tickets/GRW-371). What a browser cannot do on CI is tell you WHY a
 * rule is the shape it is, so this file pins the four decisions that a later
 * edit would undo without noticing — each of which was worth 15–214px:
 *
 * 1. the shell has no height floor, which is what AC-02 turns on;
 * 2. the chevron is laid out as a box, not an inline span 7px taller than its
 *    own icon;
 * 3. Booking settings' "Minimum notice" is in the FIRST column;
 * 4. the phone hub's `settings-hub` hook exists and is only on the hub.
 */
const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
const css = read('../styles/85-settings-fit.css');
/** The same file with its comments taken out — a rule, not a note about one. */
const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');
/* Read as text, not imported: `e2e/` is the browser harness's own module graph and the
   dashboard may not reach into it (Jira GRW-369 · GRW-370). All this needs is the list. */
const matrixHeights: number[] = JSON.parse(
  read('../../../../e2e/matrix.ts').match(/const HEIGHT_BREAKPOINTS = (\[[^\]]*\])/)?.[1] ?? '[]',
);

describe('the Settings shell fills the window at every desktop height', () => {
  it('has no `min-height` floor on the rule that stops the page scrolling', () => {
    // GRW-228 gated this on `(min-height: 680px)`, and below that floor the
    // whole page scrolled — the settings list going off the top with it.
    expect(rules).not.toMatch(/min-height:\s*680px/);
    const structural = rules.slice(rules.indexOf('.page-body.settings-page {'));
    expect(structural.slice(0, 200)).toMatch(/overflow:\s*hidden/);
  });

  it('gives the list and the form their own scrollers, so only they move', () => {
    expect(css).toMatch(/\.settings-page \.settings-nav-pane,\s*\.settings-page \.settings-content-pane \{[^}]*overflow-y:\s*auto/);
  });

  it('keeps a band for windows under 680px tall', () => {
    expect(css).toContain('@media (min-width: 861px) and (max-height: 679px)');
  });

  it('lays the chevron out as a box — an inline span measured 7px taller than its icon', () => {
    expect(css).toMatch(/\.settings-page \.settings-nav-pane \.settings-row-chev,[\s\S]{0,120}\{\s*display:\s*flex/);
  });
});

describe('Booking settings is two balanced columns', () => {
  const form = read('booking/BookingRulesForm.tsx');
  const firstCol = form.slice(form.indexOf('<div className="rules-col">'), form.indexOf('</div>\n        <div className="rules-col">'));

  it('puts "Minimum notice" in the first column, not the second', () => {
    // 294px beside 476px: a grid row is as tall as its tallest cell, so the
    // second column alone set the card's height and Save fell off the bottom.
    expect(firstCol).toContain('rule-notice');
    expect(firstCol).toContain('rule-slot');
    expect(firstCol).not.toContain('rule-horizon');
  });

  it('still reads down-then-across, so the field order on screen is unchanged', () => {
    const order = ['rule-slot', 'slotPattern', 'rule-notice', 'rule-horizon', 'rule-cutoff', 'closed-day-new'];
    const positions = order.map((id) => form.indexOf(id));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});

describe('Report access keeps its opening sentence at every height', () => {
  /*
   * It briefly carried `settings-card-hint`, which a window ≤859px tall drops. That
   * sentence is the only place on the screen that says managers are exempt and what
   * leaving a role unticked does, and the card under it lists Receptionist and
   * Stylists and nothing else — so hiding it took a permissions screen's safety copy
   * off a 1470×760 laptop, the window the ticket is written against. The 48px comes
   * out of `.ra-role`'s own padding instead.
   */
  it('is a plain `field-hint` — never the class short screens hide', () => {
    const form = read('report-access/ReportAccessForm.tsx');
    expect(form).toMatch(/<p className="field-hint"/);
    // The class may be named in a comment explaining why it is NOT used; not on the element.
    expect(form).not.toMatch(/className="[^"]*settings-card-hint/);
  });

  it('pays for it out of the roles’ own spacing on a short screen', () => {
    const band = css.slice(css.lastIndexOf('@media (min-width: 861px) and (max-height: 859px)'));
    expect(band).toMatch(/\.settings-page \.ra-role \{[^}]*padding-top:\s*8px/);
    expect(band).toMatch(/\.settings-page \.ra-role-head \{[^}]*margin-bottom:\s*6px/);
    expect(band).toMatch(/\.settings-page \.ra-tab \{[^}]*padding-top:\s*5px/);
  });

  it('never touches a chip on a phone, where 44px is the floor', () => {
    // The band above is `min-width: 861px`; 90-accessibility.css owns `max-width: 860px`.
    expect(css).not.toMatch(/@media \(max-width: 860px\)[^@]*\.ra-tab\b/);
  });
});

describe('the phone hub', () => {
  it('is marked with `settings-hub`, and only on the hub route', () => {
    const shell = read('SettingsShell.tsx');
    expect(shell).toMatch(/isHub \? 'settings-hub' : ''/);
    expect(shell).toMatch(/const isHub = pathname === '\/settings'/);
  });

  it('pairs the "Coming soon" rows two to a line', () => {
    const phone = css.slice(css.indexOf('Jira GRW-229 AC-03'));
    expect(phone).toMatch(/\.settings-hub \.menu-list \{[^}]*grid-template-columns:\s*1fr 1fr/);
    expect(phone).toMatch(/\.settings-hub \.menu-list > \*:not\(\.settings-row-disabled\) \{\s*grid-column:\s*1 \/ -1/);
  });

  it('gives a preview with no partner the whole line, and pairs a uniform shape', () => {
    // The Account group is one preview then Log out, so half a line left white space beside it;
    // and left to itself the pill wrapped in one half of a pair and not the other.
    const phone = css.slice(css.indexOf('Jira GRW-229 AC-03'));
    expect(phone).toMatch(/:not\(:has\(\.settings-row-disabled ~ \.settings-row-disabled\)\) \.settings-row-disabled \{\s*grid-column:\s*1 \/ -1/);
    expect(phone).toMatch(/:has\(\.settings-row-disabled ~ \.settings-row-disabled\) \.settings-row-soon \{[^}]*flex-basis:\s*100%/);
  });

  it('does not render a business card it then has to hide', () => {
    // Jira GRW-229 deleted it outright rather than leaving a third written-but-never-read control.
    expect(read('SettingsNavList.tsx')).not.toMatch(/<HeaderCard|settings-header-card/);
    expect(read('../styles/28-settings.css')).not.toMatch(/^\.settings-header-/m);
    expect(read('../../../messages/en.json')).not.toMatch(/headerBranches/);
    expect(read('../../../messages/hi.json')).not.toMatch(/headerBranches/);
  });

  it('lets everything in a paired preview cell shrink, wrap or break', () => {
    /*
     * The first cut of the two-up grid had none of this and `npm run test:devices`
     * caught it: `.menu-list` clips to its rounded corner, the "Coming soon" pill
     * cannot shrink, and neither could "WhatsApp settings" beside it — 8–96px of
     * label was cut off at every width from 412px down. Clipped is worse than
     * scrolled, because it is unreachable.
     */
    const phone = css.slice(css.indexOf('Jira GRW-229 AC-03'));
    expect(phone).toMatch(/\.settings-hub \.settings-row-disabled \{[^}]*flex-wrap:\s*wrap/);
    expect(phone).toMatch(/\.settings-hub \.settings-row-disabled \.settings-row-body \{[^}]*min-width:\s*0/);
    expect(phone).toMatch(/\.settings-hub \.settings-row-disabled \.settings-row-title \{[^}]*overflow-wrap:\s*anywhere/);
  });

  it('shrinks the group headings by leading, never by type size', () => {
    // 87-mobile-type-floor.css owns the 12px floor on a phone; this may not undercut it.
    const phone = css.slice(css.indexOf('Jira GRW-229 AC-03'));
    const heading = phone.match(/\.settings-hub \.settings-group-title \{[^}]*\}/)?.[0] ?? '';
    expect(heading).toMatch(/line-height/);
    expect(heading).not.toMatch(/font-size/);
  });

  it('never shrinks a row that can be tapped — 44px is 90-accessibility.css, not this file', () => {
    const phone = css.slice(css.indexOf('Jira GRW-229 AC-03'));
    // Only the inert `.settings-row-disabled` previews may lose height here.
    const rowRules = phone.match(/\.settings-hub [^{]*\.settings-row(?!-disabled)[^{]*\{[^}]*\}/g) ?? [];
    for (const rule of rowRules) expect(rule).not.toMatch(/min-height|padding/);
  });
});

describe('the device matrix renders the tabs this ticket is about', () => {
  const matrix = read('../../../../e2e/matrix.ts');
  const routes: string[] = JSON.parse(
    (matrix.match(/export const TENANT_ROUTES = \[([\s\S]*?)\] as const;/)?.[1] ?? '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
      .replace(/'/g, '"')
      .replace(/,(\s*)$/, '')
      .replace(/^/, '[')
      .replace(/$/, ']'),
  );

  it('sweeps six of the seven Settings tabs, not just the three it used to', () => {
    // GRW-228 added profile and branches. The ones measured worst were never rendered.
    for (const r of [
      '/settings',
      '/settings/profile',
      '/settings/branches',
      '/settings/booking',
      '/settings/report-access',
      '/settings/team',
    ]) {
      expect(routes).toContain(r);
    }
  });

  /*
   * Jira GRW-414 — this used to assert the opposite.
   *
   * The seventh tab was held out of the sweep by GRW-229, behind a test that
   * checked the hold-out was commented rather than deleted. The clip it was
   * waiting on is fixed, so the route is back and the assertion inverts: no
   * Settings tab in the product is a Settings tab the sweep never opens (BR-02).
   */
  it('sweeps `/settings/working-hours` — no Settings tab is left unswept', () => {
    expect(routes).toContain('/settings/working-hours');
    const list = matrix.slice(matrix.indexOf('export const TENANT_ROUTES'));
    expect(list, 'the hold-out is gone, not merely moved').not.toMatch(/\/\/ '\/settings\/working-hours'/);
  });

  /*
   * The mechanism, not just the outcome.
   *
   * Both halves are load-bearing and neither is obvious to somebody tidying
   * this file later: the 118px floor is what forced the row wider than its
   * column, and a `@media` width is what made the row believe a 1024px window
   * meant 1024px of room when the Settings column gives it 429px. Putting
   * either back re-opens a clip the device sweep would take 36 failures to
   * tell you about.
   */
  it('sizes the week rows from their own container, with no time-input floor', () => {
    const week = read('../styles/78-collapsed-week-hours.css');

    const weekRules = week.replace(/\/\*[\s\S]*?\*\//g, '');

    expect(weekRules, 'the rows need a query container to measure').toMatch(/\.wk-week\s*{[^}]*container-type:\s*inline-size/);
    // Every shape threshold asks the container, never the window.
    expect(weekRules).toMatch(/@container \(max-width: 650px\)/);
    expect(weekRules).toMatch(/@container \(max-width: 286px\)/);
    expect(weekRules.match(/@media \(max-width: (640|400|360)px\)/g), 'the old viewport-keyed shapes are gone').toBeNull();

    expect(rules, 'GRW-228’s min-width floor clipped the row; nothing replaces it').not.toMatch(
      /\.wk-times input\[type='time'\]\s*{[^}]*min-width/,
    );
  });

  it('straddles each height edge at a width above the 1101px two-column rule as well', () => {
    // At 1024 alone every height rule was measured against the one-column layout,
    // so the two-column one a 13" laptop actually shows was never rendered short.
    const widths = JSON.parse(matrix.match(/\[1024, (\d+)\]\.flatMap/)?.[0]?.replace('.flatMap', '') ?? '[]');
    expect(widths.some((w: number) => w > 1101)).toBe(true);
  });
});

describe('the device matrix straddles the heights Settings switches on', () => {
  it('covers 680 (the floor GRW-229 removed), 740 and the sidebar’s 760', () => {
    for (const h of [680, 740, 760, 860]) expect(matrixHeights).toContain(h);
  });

  it('covers every `max-height` this stylesheet actually uses', () => {
    const used = [...css.matchAll(/max-height:\s*(\d+)px/g)].map((m) => Number(m[1]));
    // A band written as `max-height: 679px` is the far side of the 680 edge.
    const edges = new Set(used.map((h) => (matrixHeights.includes(h) ? h : h + 1)));
    for (const edge of edges) expect(matrixHeights).toContain(edge);
  });
});

/**
 * Jira GRW-416 — Save where the thumb is, on the two Settings forms that have one Save to pin.
 *
 * GRW-229's scope promised "Save pinned" on phones and only the scrolling half was built. The pinning
 * itself is a browser matter and is verified there (402×874, 390×844, 344×882, 320×568, English and
 * Hindi); what this file pins is the three decisions a later edit would undo without noticing, each of
 * which cost a round of measuring to find.
 */
describe('the phone save bar (Jira GRW-416)', () => {
  const bar = read('./SettingsSaveBar.tsx');
  const booking = read('./booking/BookingRulesForm.tsx');
  const reportAccess = read('./report-access/ReportAccessForm.tsx');

  it('is one component, not a class each form re-implements (BR-01)', () => {
    for (const [name, form] of [['booking', booking], ['report-access', reportAccess]] as const) {
      expect(form, `${name} uses the shared bar`).toMatch(/<SettingsSaveBar\b/);
      // The inline row both forms used to carry, which is how they drifted from Business profile's bar.
      expect(form, `${name} has no hand-rolled save row left`).not.toMatch(/marginTop: 16,\s*display: 'flex'/);
    }
    expect(bar).toMatch(/className="settings-savebar"/);
  });

  /*
   * The one that actually broke. `.card { overflow: hidden }` (05-cards.css) kills `position: sticky`
   * on anything inside it, so a bar rendered in the card-body sat 1231px down a 874px screen — present,
   * styled, and permanently off-screen. Business profile's bar is a sibling of its cards for the same
   * reason.
   */
  it('renders OUTSIDE the card, or sticky cannot work', () => {
    for (const [name, form] of [['booking', booking], ['report-access', reportAccess]] as const) {
      const bodyClose = form.lastIndexOf('</div>\n    </div>');
      const barAt = form.indexOf('<SettingsSaveBar');
      expect(barAt, `${name} renders the bar`).toBeGreaterThan(-1);
      expect(barAt, `${name} puts the bar after the card closes`).toBeGreaterThan(bodyClose);
    }
  });

  it('pins on phones only, and leaves the desktop row exactly as it was (AC-04)', () => {
    // The sticky half lives in a phone block; nothing outside one may position the bar.
    const phoneBlock = css.match(/@media \(max-width: 860px\) \{[\s\S]*?\n\}/g)?.join('\n') ?? '';
    expect(phoneBlock).toMatch(/\.settings-savebar\s*\{[^}]*position:\s*sticky/);
    // Anchored to the scroller's own edge: `.page-body.settings-page` is the scroller on a Settings tab,
    // so `.bp-savebar`'s negative offset would park this bar below the only box that can show it.
    expect(phoneBlock).toMatch(/\.settings-savebar\s*\{[^}]*bottom:\s*0/);
    expect(rules).not.toMatch(/\.settings-savebar\s*\{[^}]*bottom:\s*-/);
    // 44px is WCAG 2.5.5's floor; `.btn` sets exactly that, so the bar's own rule has to outrank it.
    expect(phoneBlock).toMatch(/\.settings-savebar \.settings-savebar-btn\s*\{[^}]*min-height:\s*4[6-9]px/);
  });
});
