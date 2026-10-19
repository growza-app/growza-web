import { describe, expect, it } from 'vitest';
import { canSee } from './nav-policy';

/**
 * QA, 2026-10-17 — a receptionist could open the Sales register and read every bill's total. It is the business's
 * takings, so the owner opens it per salon (Settings › Report access, the `sales` entry) and it is shut until then.
 * `me.reportTabs` carries the grant; `sales` is not a Reports tab, so it must open the register and nothing else.
 */
describe('the Sales register in the navigation', () => {
  it('is hidden from a receptionist until the salon grants it', () => {
    expect(canSee('/sales', 'receptionist', [])).toBe(false);
    expect(canSee('/sales', 'receptionist', undefined)).toBe(false);
    expect(canSee('/sales', 'receptionist', ['customers'])).toBe(false);
  });

  it('shows to a receptionist who is granted `sales`, and to an owner and manager always', () => {
    expect(canSee('/sales', 'receptionist', ['sales'])).toBe(true);
    expect(canSee('/sales', 'owner', [])).toBe(true);
    expect(canSee('/sales', 'manager', [])).toBe(true);
  });

  it('keeps a stylist out', () => {
    expect(canSee('/sales', 'staff', ['sales'])).toBe(false);
  });

  it('opens no Reports: `sales` alone does not light up the Reports entry', () => {
    expect(canSee('/reports', 'receptionist', ['sales'])).toBe(false);
    expect(canSee('/reports', 'receptionist', ['sales', 'customers'])).toBe(true);
  });
});
