import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { byStatus, sortDesk } from './services-desk-sort';
import type { ServiceAdmin } from '../lib/api-types';

const svc = (name: string, priceMinor: string | null, durationMin: number, active = true): ServiceAdmin =>
  ({ id: name, name, categoryName: 'Hair', durationMin, bufferBeforeMin: 0, bufferAfterMin: 0, priceMinor, currency: 'INR', imageUrl: null, locationId: 'b', categoryId: null, active }) as ServiceAdmin;
const rows = [svc('Haircut', '30000', 30), svc('Beard Trim', '15000', 15), svc('Hair Spa', null, 40), svc('Root Touch-up', '90000', 45, false)];

describe('Services v2 (owner, 2026-10-15) — the wide table\'s sort and status filter', () => {
  it('sorts by name, by price either way (no price last), and by duration', () => {
    expect(sortDesk(rows, 'name').map((s) => s.name)).toEqual(['Beard Trim', 'Hair Spa', 'Haircut', 'Root Touch-up']);
    expect(sortDesk(rows, 'priceAsc').map((s) => s.name)).toEqual(['Beard Trim', 'Haircut', 'Root Touch-up', 'Hair Spa']);
    expect(sortDesk(rows, 'priceDesc').map((s) => s.name)).toEqual(['Root Touch-up', 'Haircut', 'Beard Trim', 'Hair Spa']);
    expect(sortDesk(rows, 'duration').map((s) => s.name)).toEqual(['Beard Trim', 'Haircut', 'Hair Spa', 'Root Touch-up']);
  });
  it('the status filter is Active, Inactive, or everything', () => {
    expect(byStatus(rows, 'all')).toHaveLength(4);
    expect(byStatus(rows, 'active')).toHaveLength(3);
    expect(byStatus(rows, 'inactive').map((s) => s.name)).toEqual(['Root Touch-up']);
  });
});

describe('Services v2 — the form', () => {
  const form = readFileSync(join(__dirname, 'ServiceForm.tsx'), 'utf8');
  it('an existing service has an identity header and three parts; a new one stays one page', () => {
    expect(form).toMatch(/const PARTS: readonly Part\[\] = \['details', 'pricing', 'staff'\];/);
    expect(form).toMatch(/\{part === 'details' \|\| !service \? \(/);
    expect(form).toMatch(/\{part === 'pricing' \|\| !service \? \(/);
    expect(form).toMatch(/\{service && part === 'staff' \? \(/);
  });
  it('the description is sent trimmed, null when empty, capped at 200', () => {
    expect(form).toMatch(/description: description\.trim\(\) \|\| null,/);
    expect(form).toMatch(/const DESCRIPTION_MAX = 200;/);
  });
});
