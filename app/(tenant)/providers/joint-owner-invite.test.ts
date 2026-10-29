import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A business with JOINT OWNERS — a second person who owns it, invited from this screen.
 *
 * The API takes `jointOwner: true` on the invite route and only an owner may send it. This is the screen half:
 * the picker offers Owner, the sheet asks what an owner will be able to do and takes a second press, and the
 * Staff screen lists the owners so the one just made is visible and can be taken back.
 *
 * Source-reading, like `team-remove-member.test.ts` beside it: there is no DOM in this suite, and what matters is
 * that the option exists, that the request carries what the API accepts and nothing it refuses, and that the
 * words are in both languages.
 */
const sheet = readFileSync(resolve(__dirname, 'TeamLogins.tsx'), 'utf8');
const screen = readFileSync(resolve(__dirname, 'StaffClient.tsx'), 'utf8');
const api = readFileSync(resolve(__dirname, '../lib/api.ts'), 'utf8');
const en = JSON.parse(readFileSync(resolve(__dirname, '../../../messages/en.json'), 'utf8')).settingsTeam;
const hi = JSON.parse(readFileSync(resolve(__dirname, '../../../messages/hi.json'), 'utf8')).settingsTeam;

describe('inviting a joint owner', () => {
  it('is offered in both pickers — the kind one and a business that uses roles', () => {
    // Owner is not one of a business's roles and never will be, so it is a sentinel rather than an id, and it
    // appears in the roles `<select>` too: "what will they be?" is the question, and owner is an answer.
    expect(sheet).toMatch(/const OWNER_OPTION = '__joint_owner__';/);
    expect([...sheet.matchAll(/<option value=\{OWNER_OPTION\}>\{t\('roleOwner'\)\}<\/option>/g)]).toHaveLength(2);
  });

  it('sends a phone, a name and jointOwner — never a role, a stylist or a branch', () => {
    expect(api).toMatch(/jointOwner\?: true/);
    expect(sheet).toMatch(/\{ phone: e164, name: name\.trim\(\), jointOwner: true \}/);
    // The other fields belong to the other branch of that ternary, not to an owner's invite.
    const ownerCall = sheet.slice(sheet.indexOf('jointOwner\n          ? '), sheet.indexOf('jointOwner: true }') + 20);
    for (const field of ['providerId', 'locationId', 'tenantRoleId', 'role:']) {
      expect(ownerCall, `an owner's invite must not carry ${field}`).not.toContain(field);
    }
  });

  it('says what an owner will be able to do, and takes a second press', () => {
    // `.banner` is the amber one and `.banner-info` is the calm one (styles/12-misc.css). A caution about
    // money and logins is not an announcement.
    expect(sheet).toMatch(/\{jointOwner && !busy && \(\s*\n\s*<div role="alert" className="banner">/);
    expect(sheet).toMatch(/\{jointOwner && !busy && \([\s\S]*?t\('ownerWarning'\)/);
    // And the sheet stops promising a stylist's login: `role` is still 'staff' underneath a joint owner.
    expect(sheet).toMatch(/stylistName && role === 'staff' && !jointOwner \? t\('inviteSubFor'/);
    expect(sheet).toMatch(/if \(jointOwner && !confirmOwner\) \{\s*setConfirmOwner\(true\);\s*return;\s*\}/);
    expect(sheet).toMatch(/jointOwner && confirmOwner \? t\('ownerConfirm'\)/);
    // And a way back from the second press that does not send anything.
    expect(sheet).toMatch(/setConfirmOwner\(false\);\s*setJointOwner\(false\);[\s\S]*?t\('ownerCancel'\)/);
  });

  it('asks an owner for a name, and asks them for nothing else', () => {
    expect(sheet).toMatch(/if \(jointOwner && !name\.trim\(\)\) \{/);
    expect(sheet).toMatch(/\{\(jointOwner \|\| role === 'receptionist' \|\| role === 'manager'\) && \(/);
    // No calendar, no branch, no role of this business's own.
    expect(sheet).toMatch(/\{role === 'staff' && !jointOwner && \(/);
    expect(sheet).toMatch(/\{role === 'receptionist' && !jointOwner && multiBranch && \(/);
    expect(sheet).toMatch(/if \(roles && !jointOwner && !tenantRoleId\) \{/);
  });
});

describe('the owners are on the Staff screen', () => {
  it('has its own group, so a second owner is visible', () => {
    expect(screen).toMatch(/const owners = useMemo\(\(\) => members\.filter\(\(m\) => m\.role === 'owner'\), \[members\]\);/);
    expect(screen).toMatch(/title=\{tTeam\('owners'\)\}\s*\n\s*members=\{owners\}/);
    expect(screen).toMatch(/m\.role === 'owner' \? tTeam\('owner'\)/);
  });

  it('offers Remove only while there is more than one — the last owner has no button', () => {
    expect(screen).toMatch(/removable=\{\(\) => owners\.length > 1\}/);
    expect(sheet).toMatch(/\{writable && \(removable\?\.\(m\) \?\? true\) && \(/);
  });
});

describe('the words', () => {
  it('are in both languages', () => {
    for (const key of ['roleOwner', 'ownerWarning', 'ownerConfirm', 'ownerCancel', 'owners', 'owner']) {
      expect(en[key], `en ${key}`).toBeTruthy();
      expect(hi[key], `hi ${key}`).toBeTruthy();
    }
  });

  it('name what the other person will be able to do, not that they are "an owner"', () => {
    // Owners may not be confident readers, and this is the one warning on the screen that matters: it has to be
    // about money and people, in those words, rather than about a role name.
    for (const word of ['money', 'prices', 'branch', 'logins']) {
      expect(en.ownerWarning.toLowerCase(), `the warning should mention ${word}`).toContain(word);
    }
    expect(en.ownerWarning).toContain('Only another owner can remove them.');
  });
});
