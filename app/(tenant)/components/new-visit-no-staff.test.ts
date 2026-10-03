import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';

/**
 * Jira GRW-456 — Record payment at a branch with nobody on its team.
 *
 * "Whoever is free" was offered there, and chosen by default, with nobody to be free: the save came back
 * 400 "No staff member can perform that service" and the refusal did not say what to do instead. On a branch
 * whose staff have not been added yet — exactly where a desk is most likely to be taking its first payment —
 * that was the whole screen's answer.
 *
 * `NewVisitSheet` is a client component with no DOM in this environment, so the rules are read from the file,
 * as `queue-and-booking-say-what-happened.test.ts` and `new-visit-branch-leads.test.ts` do.
 */
const sheet = readFileSync(resolve(__dirname, 'NewVisitSheet.tsx'), 'utf8');
/** Without its prose: the comments explaining this change quote the state it describes. */
const code = sheet.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('a branch with nobody on its team', () => {
  it('is only decided once the roster has actually arrived', () => {
    // `providers` is null while loading, which is not an empty branch — saying so before the answer is in
    // would flash the sentence on every open.
    expect(code).toMatch(/const noStaffHere = providers !== null && branchProviders\.length === 0/);
  });

  it('does not offer "Whoever is free", because nobody can be free', () => {
    // GRW-461 added a second reason there can be nobody to be free: staff here, none who do this service.
    expect(code).toMatch(/\{!paysToken && !noStaffHere && !noOneCanDoIt && \(/);
  });

  it('settles Record payment with no stylist instead', () => {
    const effect = code.slice(code.indexOf('if (forPayment && noStaffHere) setNoStylist(true)'));
    expect(effect.slice(0, 120)).toMatch(/setNoStylist\(true\);\s*\}, \[forPayment, noStaffHere\]\)/);
  });

  it('says so where the stylist is chosen, not after the save is refused', () => {
    expect(code).toMatch(/\{noStaffHere \? \(/);
    expect(code).toMatch(/nv\.noStaffAtBranch\(branchNameOf\(listBranch \?\? undefined\)!, providerNoun\.toLowerCase\(\)\)/);
    // A one-branch business has no branch name to give, and still has the problem.
    expect(code).toMatch(/nv\.noStaffYet\(providerNoun\.toLowerCase\(\)\)/);
  });

  it('tells Record payment it can go ahead, and offers the Staff screen to whoever may see it', () => {
    expect(code).toMatch(/\{forPayment \? nv\.stillTakePayment\(noProviderWord\.toLowerCase\(\)\) : null\}/);
    expect(code).toMatch(/canSee\('\/providers', session\?\.role as MemberRole \| null \| undefined\)/);
  });

  it('turns off "Start now", which has no answer, and leaves the queue alone', () => {
    // A token needs no chair, so "Add to waiting queue" stays live — it is the right answer at a branch
    // whose staff are not set up yet.
        // GRW-458 moved this button into the tray's role helper and wrapped the expression; the clause this
    // story added is the last one, unchanged.
    // GRW-461 widened this story's clause to cover a branch whose staff cannot do the picked service.
    expect(code).toMatch(/busy \|\|\s*picked\.length === 0 \|\|\s*\(forPayment && !amountsValid\) \|\|\s*\(!later && !forPayment && \(noStaffHere \|\| noOneCanDoIt\)\)/);
    const queueBtn = code.slice(code.indexOf('nv.addToQueue'));
    expect(queueBtn.slice(0, 400)).not.toMatch(/noStaffHere/);
  });
});

describe('the words for it', () => {
  for (const [lang, m] of [['en', en], ['hi', hi]] as const) {
    it(`${lang} has all four`, () => {
      const nv = (m as { newVisit: Record<string, string> }).newVisit;
      for (const key of ['noStaffAtBranch', 'noStaffYet', 'stillTakePayment', 'addStaff']) {
        expect(nv[key], `${lang}.newVisit.${key}`).toBeTruthy();
      }
      expect(nv.noStaffAtBranch).toContain('{branch}');
      expect(nv.noStaffAtBranch).toContain('{provider}');
      expect(nv.stillTakePayment).toContain('{nobody}');
    });
  }
});
