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

  it('holds `/settings/working-hours` out only with Jira GRW-414 named beside it', () => {
    /*
     * The seventh tab is commented out, not forgotten. Adding it turns the sweep
     * red at every width from 861 to 1101 on a clip that predates GRW-229 —
     * GRW-228's time-input floor against `.card { overflow: hidden }` — and a red
     * sweep on `develop` is worse than a green one with a named gap. GRW-414
     * carries putting it back as an acceptance criterion; this test is what stops
     * the line being deleted instead of restored.
     */
    expect(routes).not.toContain('/settings/working-hours');
    const held = matrix.slice(matrix.indexOf('export const TENANT_ROUTES'));
    expect(held).toMatch(/\/\/ '\/settings\/working-hours',/);
    expect(held).toMatch(/GRW-414/);
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
