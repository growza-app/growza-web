import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { branchInAddress, oneBranchOnly, wholeBusiness } from '../lib/branch-routes';
import { SETTINGS_GROUPS } from './nav-data';
import { BOOKING_RULE_KEYS, HOURS_KEYS, REMINDER_KEYS } from './branch-keys';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';

/**
 * Jira GRW-396 — Settings per branch.
 *
 * The owner decided (2026-09-25) that Settings shows one branch at a time, the header's, with no "all branches"
 * view. What exists once for the whole business sits apart from it. Checked in a browser with a three-branch
 * owner; these pin the rules a screenshot would not catch.
 *
 * Owner, 2026-11-18 — the hub is grouped by what the owner is doing, not by whose setting it is. "Sits apart" is
 * now a "This branch" tag on each row that edits the header's branch (`perBranch`), instead of a group of its own.
 */
const src = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
const allRows = SETTINGS_GROUPS.flatMap((g) => g.rows);
const perBranchHrefs = allRows.flatMap((r) => (r.perBranch && r.href ? [r.href] : []));
const otherHrefs = allRows.flatMap((r) => (!r.perBranch && r.href ? [r.href] : []));

describe('whose settings a tab shows', () => {
  it('is the header’s branch: Settings has no picker of its own, and no "All"', () => {
    expect(existsSync(resolve(__dirname, 'SettingsBranchPicker.tsx'))).toBe(false);
    expect(src('layout.tsx')).toMatch(/<BranchUrlSync \/>/);
    expect(src('layout.tsx')).not.toMatch(/actions=/);
    expect(oneBranchOnly('/settings')).toBe(true);
    expect(oneBranchOnly('/settings/working-hours')).toBe(true);
    expect(branchInAddress('/settings/booking')).toBe(true);
  });

  it('every branch tab is one branch’s, and every whole-business tab shows no branch', () => {
    expect(perBranchHrefs.sort()).toEqual(
      ['/settings/profile', '/settings/working-hours', '/settings/booking', '/settings/notifications', '/settings/check-in'].sort(),
    );
    for (const href of perBranchHrefs) expect(wholeBusiness(href), href).toBe(false);
    /*
     * Every other row shows no branch in the header — but for GST, the one screen that is half and half: the
     * registration is the business's, the supply state on it a branch's (Jira GRW-582), so it keeps the header's
     * branch and is not tagged.
     */
    for (const href of otherHrefs) expect(wholeBusiness(href), href).toBe(href !== '/settings/gst');
    expect(wholeBusiness('/settings')).toBe(false);
    expect(wholeBusiness('/settings/billing/bills')).toBe(true);
  });

  it('every tagged row loads the header’s branch through `loadScopedSettings`', () => {
    const pageOf: Record<string, string> = {
      '/settings/profile': 'profile/page.tsx',
      '/settings/working-hours': 'working-hours/page.tsx',
      '/settings/booking': 'booking/page.tsx',
      '/settings/notifications': 'notifications/page.tsx',
      '/settings/check-in': 'check-in/page.tsx',
    };
    for (const href of perBranchHrefs) expect(src(pageOf[href]!), href).toMatch(/\bloadScopedSettings\(searchParams\)/);
    // Kitchen stations and Coupons and offers are each branch's too, but pick it on the screen: the header picks nothing there.
    for (const page of ['kitchen-stations/page.tsx', 'offers/page.tsx']) expect(src(page)).not.toMatch(/loadScopedSettings/);
  });

  it('the tag is for the branch the tabs load (the address’s, else the main one), and only with several branches', () => {
    const nav = src('SettingsNavList.tsx');
    expect(nav).toMatch(/branches\.find\(\(b\) => b\.id === branch\) \?\? branches\[0\]/);
    /*
     * Design review, 2026-10-07 — "This branch", not the branch's name. Which branch is the header's job,
     * two rows above. `shown` is null with one branch, which is what keeps the tag off a one-branch business.
     */
    expect(nav).toMatch(/const shown = multi \? /);
    expect(nav).toMatch(/\{row\.perBranch && shown \? <span className="menu-row-pill settings-row-tag">\{t\('thisBranch'\)\}<\/span> : null\}/);
    expect(nav).not.toMatch(/groups\.branchNamed|groups\.thisBranch/);
  });
});

describe('what exists once', () => {
  it('the name, logo and time zone have their own tab at a business with several branches', () => {
    const row = SETTINGS_GROUPS.flatMap((g) => g.rows).find((r) => r.key === 'business')!;
    expect(row.href).toBe('/settings/business');
    expect(row.multiBranchOnly).toBe(true);
    // …and send only those, plus the business's own number. A branch's phone and "about" are the branch's; the
    // business's number is the one booking links open WhatsApp at (GRW-385), and since Jira GRW-474 it can be
    // changed here — it was frozen the moment a second branch existed.
    expect(src('profile/ProfileForm.tsx')).toMatch(/\{ name: f\.name, timezone: f\.timezone, phone: toStoredPhone\(f\.phone\) \?\? '' \}/);
  });

  it('who sees client numbers moved from Booking rules (now a branch’s) to Who sees what', () => {
    expect(src('booking/BookingRulesForm.tsx')).not.toMatch(/staffSeesClientContact/);
    expect(src('report-access/page.tsx')).toMatch(/<ClientContactForm initial=\{settings\} \/>/);
  });

  it('every-branch closed days are added and removed from any branch, a day at a time (Jira GRW-397)', () => {
    const form = src('booking/BookingRulesForm.tsx');
    // Only the days this form changed: the whole list it had loaded overwrote a day another tab added.
    expect(form).toMatch(/api\.updateBookingRules\(changeOf\(business\)\)/);
    expect(form).not.toMatch(/closedDates: businessClosed/);
    // Jira GRW-398 — and the branch's own days (or a one-branch business's), never the whole list it loaded.
    expect(form.match(/\.\.\.changeOf\(own\)/g)).toHaveLength(2);
    expect(form).not.toMatch(/\{ closedDates \}/);
    expect(form).toMatch(/removeAllAria/);
  });
});

describe('the note on a branch tab', () => {
  it('offers "Apply to all branches", rendered by the page so a remounted form does not take it with it', () => {
    const note = src('BranchScopeNote.tsx');
    expect(note).toMatch(/api\.applyBranchSettingsToAll\(branchId, keys\)/);
    for (const page of ['working-hours/page.tsx', 'notifications/page.tsx']) {
      expect(src(page)).toMatch(/<BranchScopeNote key=\{`note:\$\{scopeKey\(settings\)\}`\} settings=\{settings\} branchName=\{branchName\} keys=\{[A-Z_]+\}/);
    }
    // Booking's note picks its keys by WhatsApp, from the session the form reads (2026-10-10) — still drawn by the page.
    expect(src('booking/page.tsx')).toMatch(/<BookingScopeNote key=\{`note:\$\{scopeKey\(settings\)\}`\} settings=\{settings\} branchName=\{branchName\} \/>/);
    expect(src('booking/BookingScopeNote.tsx')).toMatch(/<BranchScopeNote settings=\{settings\} branchName=\{branchName\} keys=\{bookingRuleKeys\(whatsappLive\)\}/);
    for (const form of ['working-hours/WorkingHoursForm.tsx', 'booking/BookingRulesForm.tsx', 'notifications/RemindersForm.tsx', 'profile/ProfileForm.tsx']) {
      expect(src(form)).not.toMatch(/BranchScopeNote/);
    }
  });

  it('never resets or applies closed days: they add to the business’s, they do not replace them', () => {
    expect([...HOURS_KEYS, ...BOOKING_RULE_KEYS, ...REMINDER_KEYS]).not.toContain('closed_dates');
  });
});

/** Jira GRW-396 — what the QA pass found. */
describe('Settings per branch, as the QA pass left it', () => {
  it('a save redraws: forms are keyed by branch only, and saving closes back to Settings (which refreshes) or refreshes in place', () => {
    expect(src('scope.ts')).toMatch(/return settings\.scope\.locationId \?\? 'all';/);
    // Jira GRW-556 (follow-up) — Save closes the form; `useCloseAfterSave` pushes the list and refreshes.
    expect(src('working-hours/WorkingHoursForm.tsx')).toMatch(/closeForm\(\);/);
    expect(src('../lib/close-after-save.ts')).toMatch(/router\.push\([\s\S]*?\);\s*router\.refresh\(\);/);
    // Drawn only while WhatsApp booking is on (owner, 2026-10-10), so it always closes on Save like the others.
    expect(src('notifications/RemindersForm.tsx')).toMatch(/closeForm\(\);/);
  });

  it('"Use business settings" redraws the form from the start; the note is keyed by branch', () => {
    expect(src('BranchScopeNote.tsx')).toMatch(/await api\.resetBranchSettings\(branchId, own\);[\s\S]{0,160}window\.location\.reload\(\);/);
    for (const page of ['working-hours/page.tsx', 'notifications/page.tsx']) {
      expect(src(page)).toMatch(/<BranchScopeNote key=\{`note:\$\{scopeKey\(settings\)\}`\}/);
    }
    expect(src('booking/page.tsx')).toMatch(/<BookingScopeNote key=\{`note:\$\{scopeKey\(settings\)\}`\}/);
  });

  it('focus goes to the question when it opens, and back to "Apply to all branches" when it closes', () => {
    const note = src('BranchScopeNote.tsx');
    expect(note).toMatch(/setConfirming\(true\);\s*setFocusTo\('confirm'\);/);
    expect(note).toMatch(/setConfirming\(false\);\s*setFocusTo\('applyAll'\);/);
  });

  it('the note’s buttons wrap under the sentence instead of running off a narrow pane', () => {
    const css = src('../styles/85-settings-fit.css');
    const actions = css.slice(css.indexOf('.bsn-actions {'), css.indexOf('}', css.indexOf('.bsn-actions {')));
    expect(actions).not.toMatch(/flex-shrink: 0/);
    expect(css).toMatch(/\.bsn \{\s*flex-wrap: wrap;/);
  });

  it('no branch-only chip for a day every branch is already closed', () => {
    expect(src('booking/BookingRulesForm.tsx')).toMatch(/!closedDates\.includes\(newClosed\) && !\(branchId && businessClosed\.includes\(newClosed\)\)/);
  });

  it('a bad branch id in a link is put back to the chosen branch, not remembered as "all"', () => {
    expect(src('../components/BranchUrlSync.tsx')).toMatch(/!branch\.branches\.some\(\(b\) => b\.id === action\.branch\)\) \{\s*\/\/[\s\S]{0,300}query\.set\(param, branch\.choice \?\? ALL_BRANCHES_PARAM\);/);
  });
});

/** Owner, 2026-11-18 — the groups follow what the owner is doing. */
describe('the hub is grouped by task', () => {
  it('in the order the owner agreed, each row in exactly one group', () => {
    const shape = SETTINGS_GROUPS.map((g) => [g.key, g.rows.map((r) => r.key)]);
    expect(shape).toEqual([
      ['shop', ['profile', 'business', 'branches', 'workingHours', 'bookingSettings', 'notifications', 'checkIn', 'channels']],
      ['dining', ['tables', 'kitchenStations']],
      ['money', ['payments', 'gst', 'billOffers', 'rewards']],
      ['team', ['roles', 'reportAccess', 'phoneAlerts']],
      ['plan', ['billing']],
      ['account', ['logOut']],
    ]);
  });

  it('names every group in English and Hindi, and keeps no group name nothing reads', () => {
    const keys = SETTINGS_GROUPS.map((g) => g.key).sort();
    for (const m of [en, hi]) {
      const groups = (m as unknown as { settingsHub: { groups: Record<string, string> } }).settingsHub.groups;
      expect(Object.keys(groups).sort()).toEqual(keys);
      for (const k of keys) expect(groups[k]).toBeTruthy();
    }
  });

  it('draws no heading over a group whose rows are all filtered out', () => {
    const nav = src('SettingsNavList.tsx');
    // The filter runs before the heading is drawn, and an emptied group is dropped, heading and all.
    expect(nav).toMatch(/rows: group\.rows\.filter\(listed\) \}\)\)\.filter\(\(group\) => group\.rows\.length > 0\)/);
    expect(nav).toMatch(/\{groups\.map\(\(group\) => \(/);
    expect(nav).not.toMatch(/\{SETTINGS_GROUPS\.map\(/);
    // A group's title no longer changes with the number of branches.
    expect(nav).toMatch(/const groupTitle = \(key: SettingsGroupKey\): string => t\(`groups\.\$\{key\}`\);/);
  });

  it('reuses the existing pill for the tag, rather than a new one', () => {
    const css = src('../styles/28-settings.css');
    expect(css).toMatch(/\.menu-row-pill \{/);
    const tag = css.match(/\.settings-row-tag \{[^}]*\}/)?.[0] ?? '';
    expect(tag).toMatch(/white-space: nowrap/);
    expect(tag).not.toMatch(/background|border|font-size/);
  });
});
