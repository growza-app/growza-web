import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { branchInAddress, oneBranchOnly, wholeBusiness } from '../lib/branch-routes';
import { SETTINGS_GROUPS } from './nav-data';
import { BOOKING_RULE_KEYS, HOURS_KEYS, REMINDER_KEYS } from './branch-keys';

/**
 * Jira GRW-396 — Settings per branch.
 *
 * The owner decided (2026-09-25) that Settings shows one branch at a time, the header's, with no "all branches"
 * view. What exists once for the whole business sits apart from it. Checked in a browser with a three-branch
 * owner; these pin the rules a screenshot would not catch.
 */
const src = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
const hrefs = (key: string) => SETTINGS_GROUPS.find((g) => g.key === key)!.rows.flatMap((r) => (r.href ? [r.href] : []));

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
    for (const href of hrefs('branch')) expect(wholeBusiness(href)).toBe(false);
    for (const href of hrefs('business')) expect(wholeBusiness(href)).toBe(true);
    expect(wholeBusiness('/settings')).toBe(false);
    expect(wholeBusiness('/settings/billing/bills')).toBe(true);
  });

  it('the branch group is titled with the branch the tabs load (the address’s, else the main one)', () => {
    const nav = src('SettingsNavList.tsx');
    expect(nav).toMatch(/branches\.find\(\(b\) => b\.id === branch\) \?\? branches\[0\]/);
    expect(nav).toMatch(/t\('groups\.branchNamed', \{ name: shown\.name \}\)/);
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
    for (const page of ['working-hours/page.tsx', 'booking/page.tsx', 'notifications/page.tsx']) {
      expect(src(page)).toMatch(/<BranchScopeNote key=\{`note:\$\{scopeKey\(settings\)\}`\} settings=\{settings\} branchName=\{branchName\} keys=\{[A-Z_]+\}/);
    }
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
    expect(src('working-hours/WorkingHoursForm.tsx')).toMatch(/setSaved\(true\);\s*closeForm\(\);/);
    expect(src('../lib/close-after-save.ts')).toMatch(/router\.push\([\s\S]*?\);\s*router\.refresh\(\);/);
    expect(src('notifications/RemindersForm.tsx')).toMatch(/setSaved\(true\);[\s\S]{0,400}if \(whatsappLive\) closeForm\(\);[\s\S]{0,160}else router\.refresh\(\);/);
  });

  it('"Use business settings" redraws the form from the start; the note is keyed by branch', () => {
    expect(src('BranchScopeNote.tsx')).toMatch(/await api\.resetBranchSettings\(branchId, own\);[\s\S]{0,160}window\.location\.reload\(\);/);
    for (const page of ['working-hours/page.tsx', 'booking/page.tsx', 'notifications/page.tsx']) {
      expect(src(page)).toMatch(/<BranchScopeNote key=\{`note:\$\{scopeKey\(settings\)\}`\}/);
    }
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
