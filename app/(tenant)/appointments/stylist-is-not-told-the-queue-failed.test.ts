import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { roleMayReach } from '@growza-app/shared';
import { describe, expect, it } from 'vitest';

const page = readFileSync(join(__dirname, 'page.tsx'), 'utf8');

describe('Bookings, for a role that may not see the walk-in queue', () => {
  it('a stylist is refused the queue route, the front desk and the owner are not', () => {
    expect(roleMayReach('staff', 'GET', '/api/v1/walk-in-queue')).toBe(false);
    expect(roleMayReach('receptionist', 'GET', '/api/v1/walk-in-queue')).toBe(true);
    expect(roleMayReach('owner', 'GET', '/api/v1/walk-in-queue')).toBe(true);
  });

  it('the page asks the grid before asking for the queue, so a refusal is never read as "could not look"', () => {
    expect(page).toMatch(/isTodayRequest && roleMayReach\(/);
    expect(page).toContain("'/api/v1/walk-in-queue'");
    expect(page).toMatch(/\? api\.walkInQueue\(\)\.catch\(\(\) => null\)\s*:\s*Promise\.resolve\(\[\]\)/);
  });
});
