import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Accent discipline (2026-10-14) — five colours, one meaning each, every one a token in 00-base.css.
 * Before this, red alone was written as a raw hex 50 times across 25 sheets (#b91c1c, #991b1b, #c0362c,
 * four different pinks); a new sheet copied whichever it saw last. This pins the rule: a red, amber,
 * green, blue or purple is `var(--…)`, never a hex, anywhere but the token sheet.
 */
const dir = join(__dirname);
const sheets = readdirSync(dir).filter((f) => f.endsWith('.css') && f !== '00-base.css');
const base = readFileSync(join(dir, '00-base.css'), 'utf8');

/* A hex is a COLOUR when one channel dominates (greys, with channels within 24 of each other, and the
   near-white tints the Home cards sit on are not). Every raw colour still in a sheet is listed here by
   file — a ratchet, as Jira GRW-317 did for Hindi: a new one fails the test, and when one is turned into
   a token its line is deleted so the list only ever shrinks. 99 remained when the list was made:
   the sidebar's own greens, WhatsApp's brand greens, the Reports chart palette, and a few reds and ambers
   that are each one screen's own. */
const isColour = (hex: string) => {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
  return Math.max(r, g, b) - Math.min(r, g, b) >= 24 && Math.min(r, g, b) <= 0xd8;
};
const KNOWN = new Set([
  '12-misc.css: #78350f',
  '12-misc.css: #bfe9d0',
  '12-misc.css: #f5d9a8',
  '14-checkout-sheet.css: #1f5a3f',
  '15-whatsapp-chat-simulator-try-whatsapp.css: #075e54',
  '15-whatsapp-chat-simulator-try-whatsapp.css: #128c7e',
  '15-whatsapp-chat-simulator-try-whatsapp.css: #dcf8c6',
  '17-notification-bell.css: #1e7b3a',
  '17-notification-bell.css: #2952cc',
  '19-range-toggle-week-month-bar-chart.css: #14663c',
  '19-range-toggle-week-month-bar-chart.css: #17427f',
  '19-range-toggle-week-month-bar-chart.css: #5be08a',
  '19-range-toggle-week-month-bar-chart.css: #a7c4b8',
  '20-day-schedule-timeline.css: #cdeadb',
  '30-combo-builder-wizard.css: #bfe0cc',
  '32-customers.css: #6b5423',
  '32-customers.css: #b8860b',
  '32-customers.css: #cdeedb',
  '32-customers.css: #f0d9a8',
  '32-customers.css: #f3dcc0',
  '33-reference-led-home-dashboard.css: #0b3d2d',
  '33-reference-led-home-dashboard.css: #104a37',
  '33-reference-led-home-dashboard.css: #159447',
  '33-reference-led-home-dashboard.css: #20c568',
  '33-reference-led-home-dashboard.css: #6ec886',
  '33-reference-led-home-dashboard.css: #6f42d6',
  '33-reference-led-home-dashboard.css: #7bd39c',
  '33-reference-led-home-dashboard.css: #ae6e0d',
  '33-reference-led-home-dashboard.css: #e35060',
  '33-reference-led-home-dashboard.css: #f7e7cf',
  '33-reference-led-home-dashboard.css: #f97316',
  '37-roster-rows-web.css: #8a6a12',
  '45-confirmation-dialog.css: #7c4a09',
  '47-price-list-import.css: #fde68a',
  '48-add-services-chooser-ready-made-catalogu.css: #0d9488',
  '48-add-services-chooser-ready-made-catalogu.css: #3b82f6',
  '48-add-services-chooser-ready-made-catalogu.css: #e5533c',
  '48-add-services-chooser-ready-made-catalogu.css: #f59e0b',
  '49-header.css: #bfe0cc',
  '66-clients-the-segment-bands-which-are-also.css: #bfe0cc',
  '67-sortable-column-headers.css: #bfe0cc',
  '69-reports-what-is-narrowing-this-tab.css: #bfe0cc',
  '70-what-does-this-count.css: #3f8157',
  '70-what-does-this-count.css: #7f1d1d',
  '70-what-does-this-count.css: #fca5a5',
  '71-attendance-register.css: #b42318',
  '71-attendance-register.css: #bfe0cc',
  '72-walk-in-sheet.css: #7c2d12',
  '72-walk-in-sheet.css: #b45309',
  '72-walk-in-sheet.css: #d19a2a',
  '72-walk-in-sheet.css: #fef3c7',
  '73-pay-flow.css: #f7e3c4',
  '75-browser-gate.css: #0f3d2e',
  '77-staff-wizard.css: #fef3c7',
  '81-client-edit.css: #b3261e',
  '82-move-booking.css: #fef3c7',
  '83-role-home.css: #12301e',
  '83-role-home.css: #127a3e',
  '83-role-home.css: #168243',
  '83-role-home.css: #1c5535',
  '83-role-home.css: #2f7d55',
  '83-role-home.css: #4f7d63',
  '83-role-home.css: #5a3fb0',
  '83-role-home.css: #5b6b7b',
  '83-role-home.css: #8fdcae',
  '83-role-home.css: #9a6212',
  '83-role-home.css: #9f2f2f',
  '83-role-home.css: #9fd3b4',
  '83-role-home.css: #a7c4b8',
  '83-role-home.css: #a9d6bd',
  '83-role-home.css: #b93232',
  '83-role-home.css: #bfe6cf',
  '83-role-home.css: #bff0d0',
  '83-role-home.css: #c07d18',
  '83-role-home.css: #cdeedb',
  '83-role-home.css: #d0f0de',
  '83-role-home.css: #d64545',
  '83-role-home.css: #f0c6c6',
  '83-role-home.css: #f6e6cd',
  '83-role-home.css: #f9e8ca',
  '83-role-home.css: #fecaca',
  '85-settings-fit.css: #1f5136',
  '85-settings-fit.css: #cdeedb',
  '85-settings-fit.css: #f6e6cd',
  '86-money-card-phone.css: #bbf7d0',
  '86-money-card-phone.css: #c5e6d2',
  '88-check-in.css: #1f8f4e',
  '88-check-in.css: #475569',
  '88-check-in.css: #64748b',
  '88-check-in.css: #f0c2c2',
  '88-check-in.css: #f3dfc2',
  '89-book-again.css: #cdeedb',
  '93-what-to-do.css: #d97706',
  '95-branch-carousel.css: #86efac',
  '95-branch-carousel.css: #fda4af',
  '95-token-board.css: #b93232',
  '96-packages.css: #2d6a3e',
  '98-service-sheet.css: #c4b5fd',
]);
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/url\("data:[^"]*"\)/g, '');

describe('accent discipline', () => {
  it('00-base.css defines the five families', () => {
    for (const t of ['--accent', '--accent-soft', '--accent-deep', '--amber', '--amber-soft', '--amber-ink', '--danger', '--danger-deep', '--danger-soft', '--danger-line', '--blue', '--blue-soft', '--purple', '--purple-soft', '--purple-deep']) {
      expect(base, t).toMatch(new RegExp(`^\\s*${t}:\\s*#[0-9a-f]{6};`, 'm'));
    }
  });

  it('no sheet adds a raw colour, and the list of the ones left only shrinks', () => {
    const present = new Set<string>();
    for (const f of sheets) {
      const css = strip(readFileSync(join(dir, f), 'utf8'));
      for (const [, hex] of css.matchAll(/#([0-9a-f]{6})\b/gi)) if (isColour(hex!.toLowerCase())) present.add(`${f}: #${hex!.toLowerCase()}`);
    }
    const added = [...present].filter((k) => !KNOWN.has(k)).sort();
    const gone = [...KNOWN].filter((k) => !present.has(k)).sort();
    expect(added, 'a new raw colour: use a token from 00-base.css').toEqual([]);
    expect(gone, 'no longer in the sheet: delete its line from KNOWN').toEqual([]);
  });

  it('the retired values never come back', () => {
    for (const k of KNOWN) expect(k, k).not.toMatch(/#(b91c1c|991b1b|c0362c|92400e|8a5a0f|8a5a10|16a34a|2563eb|6d4fc4|6d28d9|fdeaea|fde4e4|fde3e3|fbf0dc|fdf0d5|dbe8fe|e6e0fa)$/);
  });

  it('the inline error colour in a component is the danger token, not a hex', () => {
    const comps = ['../components/BookingSummary.tsx', '../components/BookingSheet.tsx', '../components/CheckoutSheet.tsx', '../components/home/parts.tsx'];
    for (const c of comps) expect(readFileSync(join(dir, c), 'utf8'), c).not.toMatch(/#(b91c1c|c0362c|8a5a0f|6d4fc4|16794a)/i);
  });

  /* Type scale (2026-10-14) — a font-size is one of the twelve steps in 00-base.css, or the money hero's
     two, or the 16px that stops iOS zooming a field. 12.5px and 13.5px are what a sheet wrote when 12 and
     13 both looked wrong at 344px; the answer is to pick one and fix the layout, not a half step. */
  it('every font-size is on the type scale', () => {
    const scale = new Set(['0.75', '0.8125', '0.875', '0.9375', '1', '1.0625', '1.125', '1.25', '1.375', '1.5', '1.75', '2', '2.75', '3.25']);
    const off: string[] = [];
    for (const f of [...sheets, '00-base.css']) {
      const css = strip(readFileSync(join(dir, f), 'utf8'));
      for (const [, v] of css.matchAll(/font-size:\s*([0-9.]+)rem/g)) if (!scale.has(v!)) off.push(`${f}: ${v}rem`);
      for (const [, v] of css.matchAll(/font-size:\s*([0-9.]+)px/g)) if (v !== '16') off.push(`${f}: ${v}px`);
    }
    expect(off).toEqual([]);
  });
});
