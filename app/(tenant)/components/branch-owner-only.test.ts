import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-525 — the "Which branch?" dropdown is the OWNER's (product decision 2026-09-14: "multi branch is
 * only for owner"). A receptionist books at their own branch, and a stylist cannot reach New booking at all.
 *
 * Nothing here is new behaviour: the sheet only builds a branch list for an owner, and the dropdown is drawn
 * from that list. This pins it, so a later change cannot hand the choice to anyone else.
 */
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const sheet = strip(readFileSync(resolve(__dirname, 'NewVisitSheet.tsx'), 'utf8'));
const page = strip(readFileSync(resolve(__dirname, '../appointments/new/page.tsx'), 'utf8'));

describe('the Which branch? dropdown is for the owner', () => {
  it('only an owner gets a branch list; everyone else gets none', () => {
    expect(sheet).toMatch(/const isOwner = \(session\?\.role \?\? 'owner'\) === 'owner';/);
    expect(sheet).toMatch(/const branches = isOwner \? \(session\?\.branches \?\? \[\]\) : \[\];/);
  });

  it('the dropdown is drawn only from that list, and only while the branch is open', () => {
    expect(sheet).toMatch(/\{branches\.length > 1 && !branchSettled \? \(/);
    const at = sheet.indexOf('id="wi-branch"');
    // Nothing between the guard and the select re-reads the session's own (all-roles) branch list.
    const guard = sheet.lastIndexOf('{branches.length > 1 && !branchSettled ? (', at);
    expect(sheet.slice(guard, at)).not.toMatch(/session\?\.branches|openBranches/);
  });

  it('a non-owner books at the dashboard\'s own branch, which for a pinned receptionist is theirs', () => {
    expect(sheet).toMatch(/const listBranch = tokenBranch \?\? \(branches\.length > 1 \? branchId : branchContext\.one\);/);
  });

  it('a stylist cannot reach New booking: the page sends them to Bookings', () => {
    expect(page).toMatch(/if \(!mayUse\(me\.member\?\.role, 'visit\.new', isWritable\(me\.tenant\?\.status\)\)\) \{\s*redirect\('\/appointments'\);/);
  });
});
