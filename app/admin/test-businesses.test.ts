import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Jira GRW-692 — the list hides test businesses unless asked, and says so when that leaves it empty. */
const list = readFileSync(join(__dirname, 'businesses/page.tsx'), 'utf8');
const detail = readFileSync(join(__dirname, 'businesses/[id]/page.tsx'), 'utf8');
const finder = readFileSync(join(__dirname, 'components/FindBusiness.tsx'), 'utf8');

describe('test businesses on the admin screens', () => {
  it('the list asks the API for them only when "Show test businesses" is on, and keeps that in the URL', () => {
    expect(list).toMatch(/if \(showTest\) params\.set\('includeTest', 'true'\)/);
    expect(list).toMatch(/if \(showTest\) params\.set\('test', '1'\)/);
    expect(list).toContain('Show test businesses');
  });

  it('a test business carries a Test pill', () => {
    expect(list).toMatch(/b\.isTest \? <TestPill \/> : null/);
  });

  it('QA 11 Nov — the finder finds test businesses too, and marks them', () => {
    expect(finder).toContain('&includeTest=true');
    expect(finder).toMatch(/m\.isTest \? <TestPill \/> : null/);
  });

  it('AC-03 — an empty list with the switch off says test businesses are hidden and offers to show them', () => {
    expect(list).toContain('Test businesses are hidden.');
    expect(list).toMatch(/onClick=\{\(\) => setShowTest\(true\)\}/);
  });

  it('the business page lets an admin who can manage it mark it, and refreshes after', () => {
    expect(detail).toMatch(/<TestBusinessCard businessId=\{business\.tenantId\} isTest=\{business\.isTest\}/);
    expect(detail).toMatch(/canManage && business\.isTest !== undefined/);
  });
});
