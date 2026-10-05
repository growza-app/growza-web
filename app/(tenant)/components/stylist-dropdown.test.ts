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
    expect(block).toMatch(/aria-labelledby="wi-stylist-label"/);
    expect(block).toMatch(/disabled=\{busy \|\| linesLocked\}/);
    expect(sheet).toMatch(/<h2 className="wi-section-label" id="wi-stylist-label">/);
  });

  it('offers Whoever is free (not for a token, a branch with nobody, or a service nobody does) and the able stylists', () => {
    expect(block).toMatch(/\{!paysToken && !noStaffHere && !noOneCanDoIt && \(\s*<option value=\{WI_WHOEVER\}>/);
    expect(block).toMatch(/\{ableProviders\.map\(\(p\) => \{/);
    expect(block).toMatch(/\{forPayment && <option value=\{WI_NO_STYLIST\}>\{noProviderWord\}<\/option>\}/);
  });

  it('says who is free in each option, and how many are free for a walk-in', () => {
    expect(block).toMatch(/\$\{nv\.whoeverIsFree\} · \$\{nv\.freeCount\(freeCount\)\}/);
    expect(block).toMatch(/nv\.chairFree/);
    expect(block).toMatch(/nv\.chairBusy\(/);
  });

  it('a choice clears the reclaimed chair, and Whoever is free and No stylist stay two different things', () => {
    expect(block).toMatch(/setReclaim\(null\);/);
    expect(block).toMatch(/v === WI_NO_STYLIST\) \{\s*setSchedulableId\(null\);\s*setNoStylist\(true\);/);
    expect(block).toMatch(/v === WI_WHOEVER\) \{\s*setSchedulableId\(null\);\s*setNoStylist\(false\);/);
    expect(block).toMatch(/setSchedulableId\(v\);\s*setNoStylist\(false\);/);
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
