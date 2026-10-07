import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-524 — "Which stylist?" in New booking is a dropdown. What each chair is doing (GRW-198) is in the
 * option's text, and every rule about who may be offered or chosen is as it was.
 */
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const sheet = strip(readFileSync(resolve(__dirname, 'NewVisitSheet.tsx'), 'utf8'));
const css = strip(readFileSync(resolve(__dirname, '../styles/72-walk-in-sheet.css'), 'utf8'));
const block = sheet.slice(sheet.indexOf('<select\n              id="wi-stylist"'), sheet.indexOf('{noStaffHere ? ('));

describe('Which stylist?', () => {
  it('is a select named by its heading, locked while saving', () => {
    // The till has no heading above the row (owner, 2026-10-07), so there the select names itself.
    expect(block).toMatch(/aria-labelledby=\{payPage \? undefined : 'wi-stylist-label'\}/);
    expect(block).toMatch(/aria-label=\{payPage \? nv\.withWhom\(providerNoun\.toLowerCase\(\)\) : undefined\}/);
    expect(block).toMatch(/disabled=\{busy \|\| linesLocked\}/);
    expect(sheet).toMatch(/<h2 className="wi-section-label" id="wi-stylist-label">/);
  });

  it('offers Whoever is free (not for a token, a branch with nobody, or a service nobody does) and the able stylists', () => {
    expect(sheet).toMatch(/const offersWhoever = !paysToken && !noStaffHere && !noOneCanDoIt;/);
    expect(block).toMatch(/\{offersWhoever && \(\s*<option value=\{WI_WHOEVER\}>/);
    expect(block).toMatch(/\{ableProviders\.map\(\(p\) => \{/);
    // On the till that option carries the noun too, for the same reason.
    expect(block).toMatch(/\{forPayment && <option value=\{WI_NO_STYLIST\}>\{payPage \? `\$\{providerNoun\} · \$\{noProviderWord\}` : noProviderWord\}<\/option>\}/);
  });

  it('says who is free in each option, and how many are free for a walk-in', () => {
    expect(block).toMatch(/\$\{nv\.whoeverIsFree\} · \$\{nv\.freeCount\(freeCount\)\}/);
    expect(block).toMatch(/nv\.chairFree/);
    expect(block).toMatch(/nv\.chairBusy\(/);
  });

  it('a choice clears the reclaimed chair, and Whoever is free and No stylist stay two different things', () => {
    // One function for both controls — the dropdown and Record payment's row of names.
    const pick = sheet.slice(sheet.indexOf('const pickStylist = '), sheet.indexOf('const stylistValue = '));
    expect(block).toMatch(/onChange=\{\(e\) => pickStylist\(e\.target\.value\)\}/);
    expect(pick).toMatch(/setReclaim\(null\);/);
    expect(pick).toMatch(/v === WI_NO_STYLIST\) \{\s*setSchedulableId\(null\);\s*setNoStylist\(true\);/);
    expect(pick).toMatch(/v === WI_WHOEVER\) \{\s*setSchedulableId\(null\);\s*setNoStylist\(false\);/);
    expect(pick).toMatch(/setSchedulableId\(v\);\s*setNoStylist\(false\);/);
  });

  it('on Record payment, is a row of names for a team of up to six — one tap, the same three kinds of choice', () => {
    expect(sheet).toMatch(/const STYLIST_CHIPS_MAX = 6;/);
    expect(sheet).toMatch(/const stylistChips = payPage && ableProviders\.length <= STYLIST_CHIPS_MAX;/);
    const chips = sheet.slice(sheet.indexOf('{stylistChips ? ('), sheet.indexOf('<select\n              id="wi-stylist"'));
    expect(chips).toMatch(/role="radiogroup" aria-label=\{nv\.withWhom\(providerNoun\.toLowerCase\(\)\)\}/);
    expect(chips).toMatch(/\.\.\.\(offersWhoever \? \[\{ value: WI_WHOEVER/);
    expect(chips).toMatch(/\.\.\.\(forPayment \? \[\{ value: WI_NO_STYLIST/);
    expect(chips).toMatch(/role="radio"\s+aria-checked=\{stylistValue === o\.value\}/);
    expect(chips).toMatch(/onClick=\{\(\) => pickStylist\(o\.value\)\}/);
    // It wraps; only the kinds of service under it scroll sideways.
    expect(css).not.toMatch(/\.wi-stylist-chips \{[^}]*overflow-x/);
    expect(css).toMatch(/\.wi-stylist-chips \.wi-chip \{[^}]*min-height: 2\.75rem;/);
  });

  it('keeps the offer to take a no-show chair, under the dropdown for the stylist chosen in it', () => {
    expect(sheet).toMatch(/occ\?\.couldBeANoShow/);
    expect(sheet).toMatch(/nv\.reclaimOffer\(occ\.customerName \?\? nv\.someone, occ\.startedMinAgo\)/);
  });

  it('is no longer a stack of cards', () => {
    expect(block).not.toMatch(/wi-chair/);
    expect(css).toMatch(/\.wi-stylist-select \{\s*width: 100%;\s*min-width: 0;\s*min-height: 44px;\s*box-sizing: border-box;\s*text-overflow: ellipsis;/);
  });
});
