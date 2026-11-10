import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NOTE_MAX } from './SupportNotes';

/** Jira GRW-703 — support notes on the business page. */
const src = readFileSync(join(__dirname, 'SupportNotes.tsx'), 'utf8');
const page = readFileSync(join(__dirname, '../businesses/[id]/page.tsx'), 'utf8');

describe('support notes', () => {
  it('sit on the Overview tab, written only by an admin who can manage the business', () => {
    expect(page).toMatch(/activeTab === 'overview' && can\('admin\.business\.view'\) \? <SupportNotes businessId=\{business\.tenantId\} canWrite=\{canManage\} \/>/);
  });

  it('AC-03 — over 1,000 characters is refused before it is sent, and says why', () => {
    expect(NOTE_MAX).toBe(1000);
    expect(src).toContain("'Keep notes under 1,000 characters.'");
    expect(src).toMatch(/disabled=\{saving \|\| !draft\.trim\(\) \|\| tooLong\}/);
  });

  it('the field says who sees it and what never to write', () => {
    expect(src).toContain("Only admins see this. Never write a customer's details here.");
  });
});
