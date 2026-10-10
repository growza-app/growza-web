import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { savedHref } from './close-after-save';

/**
 * Jira GRW-556 (follow-up) — a full-page form closes when it saves, back to its list, which says "Saved".
 */
const tenant = path.resolve(__dirname, '..');
const code = (p: string) => readFileSync(path.resolve(tenant, p), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('savedHref', () => {
  it('goes to the list, carrying the branch, with the marker the list reads', () => {
    expect(savedHref('/settings', null)).toBe('/settings?saved=1');
    expect(savedHref('/settings', 'b-1')).toBe('/settings?branch=b-1&saved=1');
    expect(savedHref('/providers', null)).toBe('/providers?saved=1');
  });
});

describe('every full-page form closes on Save', () => {
  const FORMS: Array<[file: string, parent: string]> = [
    ['settings/profile/ProfileForm.tsx', '/settings'],
    ['settings/booking/BookingRulesForm.tsx', '/settings'],
    ['settings/working-hours/WorkingHoursForm.tsx', '/settings'],
    ['settings/notifications/RemindersForm.tsx', '/settings'],
    ['settings/report-access/ReportAccessForm.tsx', '/settings'],
    // Not Branches: it has no Save any more — each branch is a row that opens its Branch profile (owner, 2026-10-10).
    ['providers/[id]/StaffEditClient.tsx', '/providers'],
  ];
  for (const [file, parent] of FORMS) {
    it(`${file} → ${parent}`, () => {
      const src = code(file);
      expect(src).toContain(`useCloseAfterSave('${parent}')`);
      expect(src).toMatch(/setSaved\(true\);\s*(closeForm\(\);|if \()/);
    });
  }

  it('working hours closes on either of its two Saves', () => {
    expect(code('settings/working-hours/WorkingHoursForm.tsx').match(/closeForm\(\);/g)).toHaveLength(2);
  });

  it('stays open only where the save has more to say: WhatsApp not live, skills left to set after a branch move', () => {
    // No exception for a business without WhatsApp: the page is not shown to one (owner, 2026-10-10).
    expect(code('settings/notifications/RemindersForm.tsx')).toMatch(/setSaved\(true\);\s*closeForm\(\);/);
    expect(code('providers/[id]/StaffEditClient.tsx')).toMatch(/if \(moved\?\.unmatchedSkills\?\.length\) router\.refresh\(\);\s*else closeForm\(\);/);
  });

  it('the lists they close to say "Saved"', () => {
    expect(code('settings/SettingsShell.tsx')).toContain('<SavedToast />');
    expect(code('providers/StaffClient.tsx')).toContain('<SavedToast />');
  });

  it('the Team panel is not closed: its invite link is shown once and must stay', () => {
    expect(code('settings/team/TeamAccessPanel.tsx')).not.toContain('useCloseAfterSave');
  });
});
