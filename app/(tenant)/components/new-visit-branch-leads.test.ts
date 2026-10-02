import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-453 — the branch is chosen first, and the client comes from it.
 *
 * GRW-392 had it the other way round: a picked client's own branch replaced the chosen one, because a client
 * belongs to one branch and `appointment_client_same_branch_fk` refuses a booking that pairs them with another.
 * But the picker offered the whole business's clients, so at a branch selling one service, 19 of the 20 rows on
 * offer moved the booking somewhere else — menu, stylists, times and the write all followed, and the only sign
 * was the branch radio group turning into a chip naming a branch nobody had asked for.
 *
 * `NewVisitSheet` is a client component with no DOM in this environment — the same reason
 * `walk-in-opens-now.test.ts` and `queue-and-booking-say-what-happened.test.ts` read source — so the rules are
 * read from the file. The browser side is the qa377 pass on the story.
 */
const sheet = readFileSync(resolve(__dirname, 'NewVisitSheet.tsx'), 'utf8');
/** Without its prose: the comments explaining this change quote the code it removed. */
const code = sheet.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('nothing picked after the branch may change it', () => {
  it('the branch is the chosen one — a client never overrides it', () => {
    expect(code).toMatch(/const listBranch = tokenBranch \?\? \(branches\.length > 1 \? branchId : branchContext\.one\)/);
    expect(code).not.toMatch(/pickedClientBranch/);
    // The old rule, by its shape: a client's own branch standing in front of the chosen one.
    expect(code).not.toMatch(/stage\.client\.locationId \? stage\.client\.locationId : null/);
  });

  it('paying a token is the exception, because that visit already has a branch', () => {
    expect(code).toMatch(/const tokenBranch = paysToken\?\.locationId \?\? null/);
  });
});

describe('the client picker is the branch’s own', () => {
  it('the default list asks for this branch, and again when the branch changes', () => {
    expect(code).toMatch(/\.customers\(\{ limit: 20, location: listBranch \}\)/);
    const effect = code.slice(code.indexOf('.customers({ limit: 20'));
    expect(effect.slice(0, 400)).toMatch(/\}, \[listBranch\]\)/);
  });

  it('the search does too', () => {
    expect(code).toMatch(/\.customers\(\{ search: term\.trim\(\), limit: 8, location: listBranch \}\)/);
    const effect = code.slice(code.indexOf('.customers({ search:'));
    expect(effect.slice(0, 700)).toMatch(/\}, \[term, listBranch\]\)/);
  });

  it('a branch’s list is cleared while the next branch’s is on its way', () => {
    // `null` is "still loading" in this sheet; leaving the old branch's rows up would offer clients to book at a
    // branch they are not clients of.
    const effect = code.slice(code.indexOf('useEffect'), code.indexOf('.customers({ limit: 20'));
    expect(effect.slice(-200)).toMatch(/setRecent\(null\)/);
  });
});

describe('what the branch step shows', () => {
  it('says the branch once it is settled, rather than asking again', () => {
    expect(code).toMatch(/const branchSettled = Boolean\(tokenBranch\) \|\| \('client' in stage && stage\.client\.kind === 'existing'\)/);
    expect(code).toMatch(/\{branchSettled && branchNameOf\(listBranch \?\? undefined\) \?/);
  });

  it('still asks while the answer is open — a new client becomes a client of whichever branch is chosen', () => {
    expect(code).toMatch(/\{branches\.length > 1 && !branchSettled \?/);
  });
});
