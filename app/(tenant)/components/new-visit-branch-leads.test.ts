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
  it('there is no default list — a client is found by typing (Jira GRW-517)', () => {
    // The 20-client read, and the effect that re-ran it when the branch changed, went with the Previous clients list.
    expect(code).not.toMatch(/\.customers\(\{ limit: 20/);
  });

  it('the search does too', () => {
    expect(code).toMatch(/\.customers\(\{ search: term\.trim\(\), limit: 8, location: listBranch \}\)/);
    // And re-run for a new branch: the deps carry it. (GRW-454 added `branches.length` for the wider look.)
    expect(code).toMatch(/\}, \[term, listBranch, branches\.length\]\)/);
  });
});

describe('what the branch step shows', () => {
  it('says the branch once it is settled, rather than asking again', () => {
    expect(code).toMatch(/const branchSettled = Boolean\(tokenBranch\) \|\| \('client' in stage && stage\.client\.kind === 'existing'\)/);
    // Owner's call (2026-10-04): a line, not a "Which branch?" heading over a single chip that answers
    // it. A question with one possible answer is not a question — `entering-data.md` asks for the
    // opposite, pre-gather what you can.
    expect(code).toMatch(/\{branchSettled && branches\.length > 1 && branchNameOf\(listBranch \?\? undefined\) \?/);
    expect(code).toMatch(/<p className="wi-at-branch">\{nv\.atBranch\(/);
    // The chip that pretended to be a choice is gone; nothing else in this file renders that markup.
    expect(code).not.toMatch(/wi-chip wi-chip-on" aria-current/);
  });

  it('a one-branch salon is told nothing — there is nothing to tell', () => {
    // The line is worth a row only when there is more than one branch it could have been.
    expect(code).toMatch(/branchSettled && branches\.length > 1/);
  });

  it('still asks while the answer is open — a new client becomes a client of whichever branch is chosen', () => {
    expect(code).toMatch(/\{branches\.length > 1 && !branchSettled \?/);
  });
});

/**
 * Jira GRW-454 — "Add them to {branch}": the way a client of another branch is taken on here.
 *
 * GRW-453 made the picker one branch's own, which left no way to say "they come to Indiranagar" without
 * retyping a name and a number already on file. This offers them — apart from the branch's own rows, and only
 * once something has been typed, because putting them in a browsable list was the bug GRW-453 fixed (the list itself went in GRW-517).
 */
describe('bringing a client over from another branch', () => {
  it('searches the other branches too, but only when there is more than one', () => {
    expect(code).toMatch(/if \(branches\.length > 1\) \{/);
    const wider = code.slice(code.indexOf('if (branches.length > 1) {'));
    expect(wider.slice(0, 500)).toMatch(/\.customers\(\{ search: term\.trim\(\), limit: 8 \}\)/);
  });

  it('drops this branch’s own rows from that second list — they are already above it', () => {
    expect(code).toMatch(/setElsewhere\(page\.rows\.filter\(\(c\) => c\.locationId && c\.locationId !== listBranch\)\)/);
  });

  it('offers them only against a typed search', () => {
    expect(code).toMatch(/\{term\.trim\(\)\.length >= SEARCH_MIN_CHARS && elsewhere\.length > 0 \?/);
    // Jira GRW-517 — there is no browsable list at all now; a client is found by typing.
    expect(code).not.toMatch(/\{term\.trim\(\)\.length < SEARCH_MIN_CHARS \?/);
  });

  it('clears them when the search is emptied', () => {
    const short = code.slice(code.indexOf('if (term.trim().length < SEARCH_MIN_CHARS)'));
    expect(short.slice(0, 220)).toMatch(/setElsewhere\(\[\]\)/);
  });

  it('does not pick them — the booking must use a client of its own branch', () => {
    // `bringHere`, not `pickClient`: a row from another branch opens the add step instead of becoming the client.
    const row = code.slice(code.indexOf('elsewhere.map('));
    expect(row.slice(0, 600)).toMatch(/onClick=\{\(\) => bringHere\(c\)\}/);
    expect(row.slice(0, 600)).not.toMatch(/pickClient/);
  });

  it('carries their name and number into the add block, the number as national digits', () => {
    const fn = code.slice(code.indexOf('const bringHere ='));
    expect(fn.slice(0, 300)).toMatch(/setNewName\(c\.name\?\.trim\(\) \?\? ''\)/);
    // `fromStoredPhone`, not the stored `+91…`: PhoneField takes the national digits only.
    expect(fn.slice(0, 300)).toMatch(/setNewPhone\(fromStoredPhone\(c\.waPhone\)\)/);
    // Jira GRW-514 — there is no add step any more: they stay on the first screen, with the block filled.
    expect(fn.slice(0, 700)).toMatch(/setStage\(\{ step: 'client' \}\)/);
    expect(fn.slice(0, 700)).not.toMatch(/newClient/);
  });

  it('names the branch they are being added to', () => {
    expect(code).toMatch(/nv\.bringToBranch\(branchNameOf\(listBranch \?\? undefined\) \?\? ''\)/);
  });
});
