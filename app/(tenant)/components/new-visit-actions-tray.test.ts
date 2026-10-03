import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';

/**
 * Jira GRW-458 — the New visit tray holds outcomes, and the one the branch can honour leads.
 *
 * GRW-222, GRW-451 and GRW-457 each arranged the same three buttons and none of them fixed it, because the
 * fault was the contents: three buttons for two outcomes. `Back` is navigation; `Start now` and `Add to
 * waiting queue` both create a visit. Whatever that row was aligned to, one button was the odd one out.
 *
 * Back went to the header. What is left is the two outcomes, with the leading one LAST — bottom of the stack
 * on a phone, right of the row on a desktop, filled in either — and when no chair is free the queue takes
 * that place, because `Start now` there offers what the branch cannot do.
 *
 * `NewVisitSheet` is a client component with no DOM in this environment, so the rules are read from source,
 * as `queue-and-booking-say-what-happened.test.ts` and `new-visit-branch-leads.test.ts` do. Measured in the
 * browser at 1440 and 430: the pair right-aligned with `Start now` ending at the content edge, and at QA
 * Empty 6675 (no staff) `Add to waiting queue` filled and last with `Start now anyway` outlined before it.
 */
const sheet = readFileSync(resolve(__dirname, 'NewVisitSheet.tsx'), 'utf8');
/** Without its prose: the comments explaining this change quote the state they replaced. */
const code = sheet.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const css = readFileSync(resolve(__dirname, '../styles/72-walk-in-sheet.css'), 'utf8');

describe('going back left the tray', () => {
  it('is one control in the header, for every step that has somewhere to go', () => {
    expect(code).toMatch(/const goBack = \(\(\) => \{/);
    expect(code).toMatch(/<button type="button" className="wi-back" aria-label=\{nv\.back\} onClick=\{goBack\}>/);
  });

  it('is not offered mid-save, nor once the lines are written, nor when paying a token', () => {
    const fn = code.slice(code.indexOf('const goBack ='), code.indexOf('const goBack =') + 700);
    // GRW-290's `linesLocked` and GRW-403's "a token's client is the token's" used to be decided at the
    // button; they are decided here now, in one place, with the rest of the going-back.
    expect(fn).toMatch(/if \(busy \|\| linesLocked\) return null/);
    expect(fn).toMatch(/&& !paysToken\) \{/);
  });

  it('leaves no Back in any of the three trays it used to sit in', () => {
    // Three `className="btn btn-ghost"` buttons reading `nv.back`, one per step. The header has them now.
    expect(code).not.toMatch(/className="btn btn-ghost"[\s\S]{0,200}\{nv\.back\}/);
  });
});

describe('the two outcomes', () => {
  const block = code.slice(code.indexOf('const queueOffered ='));

  it('put the leading one last, which is what makes it the filled button', () => {
    expect(block.slice(0, 1800)).toMatch(/return queueLeads \? \[go, queue\] : \[queue, go\]/);
  });

  it('decide which leads by whether a chair can take them', () => {
    expect(block.slice(0, 400)).toMatch(/const queueLeads = queueOffered && noChairFree/);
  });

  it('swap in the DOM, never with `order` — one sequence for the eye and for Tab', () => {
    // GRW-451's rule. `order: -1` is what it was written against.
    expect(css).not.toMatch(/\.wi-(?:act[a-z-]*|queue-btn)\s*\{[^}]*\border:\s*-?\d/);
    expect(block.slice(0, 1800)).not.toMatch(/order:/);
  });

  it('dress by role, not by identity: whichever is not leading is the outlined one', () => {
    expect(block.slice(0, 1800)).toMatch(/className=\{queueLeads \? 'btn btn-ghost wi-act-alt' : 'btn'\}/);
    expect(block.slice(0, 1800)).toMatch(/className=\{queueLeads \? 'btn wi-queue-btn' : 'btn btn-ghost wi-act-alt wi-queue-btn'\}/);
  });

  it('say "Start now anyway" once the queue has taken the lead', () => {
    expect(block.slice(0, 1800)).toMatch(/queueLeads\s*\?\s*nv\.startAnyway/);
  });

  it('are the only thing in the tray where there is just one of them', () => {
    // For later, a reclaim and Record payment each have a single outcome; they get it alone, full width.
    expect(block.slice(0, 1800)).toMatch(/if \(!queueOffered\) return go/);
  });
});

describe('“no chair is free” is an answer, not a blank', () => {
  it('is not concluded from a list that has not arrived', () => {
    // `freeCount` is null while the chairs load, which is not zero; an empty roster counts only once
    // `providers` is in. Either mistake would flip the tray on every open and flip it back.
    // GRW-456 landed `noStaffHere` with the same care about `providers`, so this reads it rather than
    // saying it twice.
    expect(code).toMatch(/const noChairFree = freeCount === 0 \|\| noStaffHere/);
    expect(code).toMatch(/const noStaffHere = providers !== null && branchProviders\.length === 0/);
  });
});

describe('the tray’s shape', () => {
  it('is one full-width column on a phone', () => {
    const rule = css.slice(css.indexOf('.wi-acts {'));
    expect(rule.slice(0, 200)).toMatch(/flex-direction:\s*column/);
    expect(css.slice(css.indexOf('.wi-acts .btn {'), css.indexOf('.wi-acts .btn {') + 160)).toMatch(/width:\s*100%/);
  });

  it('is one right-aligned row from 861px up, where the leading button ends the row', () => {
    const wide = css.slice(css.indexOf('@media (min-width: 861px)', css.indexOf('.wi-acts {')));
    expect(wide.slice(0, 400)).toMatch(/\.wi-acts\s*\{[^}]*flex-direction:\s*row/);
    expect(wide.slice(0, 400)).toMatch(/justify-content:\s*flex-end/);
  });

  it('ends where the card ends', () => {
    // `.modal-actions` bleeds -26px for the checkout sheet's gutter; every `.wi-actions` sits in a
    // `.wi-body`, whose gutter is 18px, so the white band ran 8px past the card on each side.
    const rule = css.slice(css.indexOf('.wi-actions {'));
    expect(rule.slice(0, 700)).toMatch(/margin-inline:\s*-18px/);
    expect(rule.slice(0, 700)).toMatch(/padding-inline:\s*18px/);
    expect(css).toMatch(/^\.wi-body\s*\{[^}]*padding:\s*0 18px/m);
  });

  it('gives the back control a real target', () => {
    const rule = css.slice(css.indexOf('.wi-back {'));
    expect(rule.slice(0, 220)).toMatch(/width:\s*44px/);
    expect(rule.slice(0, 220)).toMatch(/height:\s*44px/);
  });

  it('holds the header symmetrical whether or not there is a back arrow', () => {
    /*
     * `.sheet-head` is `1fr auto 1fr` (98-service-sheet.css). This sheet gave it two children, so the title
     * took the first cell, the ✕ took the MIDDLE and the last 1fr sat empty — measured at 430px before the
     * fix: the card 16→414 and the ✕ ending at 366, floating 47px short of the edge. Now, at both stages:
     * back starts 17px in, the ✕ ends 17px in.
     */
    expect(code).toMatch(/<span className="wi-back-gap" aria-hidden="true" \/>/);
    expect(css.slice(css.indexOf('.wi-back-gap {'), css.indexOf('.wi-back-gap {') + 90)).toMatch(/width:\s*44px/);
    expect(css).toMatch(/\.sheet-head:has\(\.wi-back, \.wi-back-gap\) \.wi-close \{[^}]*justify-self:\s*end/);
  });
});

describe('the words for it', () => {
  for (const [lang, m] of [['en', en], ['hi', hi]] as const) {
    it(`${lang} has the stepped-back primary`, () => {
      const nv = (m as { newVisit: Record<string, string> }).newVisit;
      expect(nv.startAnyway, `${lang}.newVisit.startAnyway`).toBeTruthy();
      expect(nv.startAnyway).not.toBe(nv.start);
    });
  }
});
