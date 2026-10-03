import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Jira GRW-474 — the reminders, hours, staff and profile screens. Source-reading, as the other component tests. */
const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
const reminders = read('notifications/RemindersForm.tsx');
const hours = read('working-hours/WorkingHoursForm.tsx');
const profile = read('profile/ProfileForm.tsx');
const wizard = read('../providers/StaffWizard.tsx');
const staffPage = read('../providers/page.tsx');
const editPage = read('../providers/[id]/page.tsx');

describe('reminders', () => {
  it('keeps every saved rule as a row, so Save cannot delete one this screen did not create', () => {
    expect(reminders).toMatch(/\.filter\(\(r\) => !REMINDER_DEFS\.some\(\(def\) => def\.key === r\.ruleKey\)\)/);
  });

  it('refuses an emptied hours box instead of sending 0', () => {
    expect(reminders).toMatch(/r\.hours < 1 \|\| r\.hours > 168/);
  });

  it('shows the server’s reason, such as the plan’s limit', () => {
    expect(reminders).toMatch(/err instanceof ApiError && err\.status < 500 \? err\.message/);
  });
});

describe('late grace', () => {
  it('an emptied box is refused, not saved as no grace', () => {
    expect(hours).toMatch(/grace\.trim\(\) === ''/);
  });
});

describe('a new stylist’s "same hours as the salon"', () => {
  it('is the chosen branch’s week, which is what the server copies', () => {
    expect(staffPage).toMatch(/api\.settings\(b\.id\)/);
    expect(wizard).toMatch(/hoursByBranch\[branchId\]/);
    expect(editPage).toMatch(/api\.settings\(detail\.locationId \?\? null\)/);
  });
});

describe('a multi-branch business’s own number', () => {
  it('can be edited and is sent with the business’s name and timezone', () => {
    expect(profile).toMatch(/\{ name: f\.name, timezone: f\.timezone, phone: toStoredPhone\(f\.phone\) \?\? '' \}/);
  });
});
