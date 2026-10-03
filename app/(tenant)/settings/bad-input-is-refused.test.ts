import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-471 — two settings forms that sent what the API could only refuse, or should never have accepted.
 * Source-reading, as the other client-component tests here.
 */
const profile = readFileSync(resolve(__dirname, 'profile/ProfileForm.tsx'), 'utf8');
const reportAccess = readFileSync(resolve(__dirname, 'report-access/ReportAccessForm.tsx'), 'utf8');

describe('business profile', () => {
  it('checks the phone before saving, so 9 digits are refused rather than sent as "no phone"', () => {
    const save = profile.slice(profile.indexOf('const save = async'));
    expect(save.indexOf('checkPhone(f.phone)')).toBeGreaterThan(-1);
    // The check comes before the first request.
    expect(save.indexOf('checkPhone(f.phone)')).toBeLessThan(save.indexOf('api.updateProfile'));
  });

  it('shows the server’s own reason for a refusal', () => {
    expect(profile).toMatch(/e instanceof ApiError && e\.status < 500 \? e\.message/);
  });
});

describe('report access', () => {
  it('offers only the receptionist, the one role the API accepts (GRW-215)', () => {
    expect(reportAccess).toMatch(/const ROLES = \['receptionist'\] as const;/);
  });

  it('sends only the roles it offers, so a stored stylist key cannot fail the save', () => {
    expect(reportAccess).toMatch(/Object\.fromEntries\(ROLES\.map\(/);
  });
});
