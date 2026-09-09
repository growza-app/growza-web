import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-63 · GRW-171 — Add staff must SAVE the hours it asked for.
 *
 * The create branch sent only the profile fields. The hours editor and the
 * "Same as the business" switch sitting directly above the button were
 * collected and silently discarded, so a new stylist landed with zero
 * `working_hours` rows and `uses_org_hours` false — not bookable by the
 * availability engine, zero capacity on Bookings, and no shift for attendance
 * to measure lateness against. A form that asks for something and throws it
 * away is worse than one that never asked.
 *
 * Asserted against the SOURCE rather than a live create, and the reason is
 * worth recording: this is a client-side sequencing fix over endpoints that
 * already have their own tests, and the dev salon sits at its plan's five-seat
 * cap, so creating a provider to watch it is refused by a guard that is
 * working correctly. Comments are stripped first — an assertion that cannot
 * tell code from prose about the code is not asserting about the code.
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const source = readFileSync(path.join(repoRoot, 'web/app/(tenant)/providers/StaffDetailPanel.tsx'), 'utf-8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');

/** Just the `if (creating) { … }` branch, so an edit-path call cannot satisfy a create-path assertion. */
const createBranch = (() => {
  const start = source.indexOf('if (creating)');
  expect(start, 'the create branch moved or was renamed').toBeGreaterThan(-1);
  const end = source.indexOf('} else if (detail)', start);
  expect(end, 'the create/edit split moved').toBeGreaterThan(start);
  return source.slice(start, end);
})();

describe('creating a staff member', () => {
  it('creates them first — the hours address a provider by id', () => {
    expect(createBranch).toMatch(/await api\.createProvider\(/);
  });

  it('then writes the hours the form collected', () => {
    expect(createBranch).toMatch(/api\.updateProviderWorkingHours\(\s*created\.id/);
  });

  it('or copies the salon’s, when they follow the business', () => {
    /**
     * Still `usesOrgHours` — but it rides on the CREATE now, not a follow-up
     * PATCH.
     *
     * This asserted `api.updateProviderProfile(created.id, …)` until GRW-183.
     * Two requests meant a stylist who existed unbookable in between, so a
     * create that succeeded and a patch that failed left exactly the state
     * GRW-171 and GRW-183 both exist to prevent. `createProvider` copies the
     * salon's hours itself now, and the second request is gone.
     */
    expect(createBranch).toMatch(/api\.createProvider\([^)]*usesOrgHours/);
    expect(createBranch, 'the follow-up PATCH should be gone').not.toMatch(/api\.updateProviderProfile\(/);
  });

  it('and the services they were given', () => {
    expect(createBranch).toMatch(/api\.updateProviderServices\(\s*created\.id/);
  });

  it('re-reads them afterwards, so the panel shows what was saved rather than what was sent', () => {
    expect(createBranch).toMatch(/api\.providerDetail\(created\.id\)/);
  });
});
