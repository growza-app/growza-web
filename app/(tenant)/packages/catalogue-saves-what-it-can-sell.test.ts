import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ApiError, BookingConflictError } from '../lib/api';

/**
 * Jira GRW-473 — the catalogue and package screens. Source-reading where the behaviour is a component's; real
 * objects where it is plain code.
 */
const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
const builder = read('PackageBuilder.tsx');
const packagesList = read('PackagesList.tsx');
const offersList = read('../offers/OffersList.tsx');
const importer = read('../services/ImportServices.tsx');
const serviceForm = read('../services/ServiceForm.tsx');
const sheet = read('../services/service-sheet.ts');
const table = read('../services/ServicesTable.tsx');

describe('package builder', () => {
  it('will not save a package without a price — it would turn into an announcement', () => {
    expect(builder).toMatch(/comboPriceMinor == null\) errs\.price = t\('errors\.priceRequired'\)/);
  });

  it('will not save "Only on" with no day, or a window ending before it starts', () => {
    expect(builder).toMatch(/visibilityMode === 'weekdays' && visibleWeekdays\.length === 0/);
    expect(builder).toMatch(/Date\.parse\(from\) >= Date\.parse\(until\)/);
  });

  it('shows the server’s reason when a save is refused', () => {
    expect(builder).toMatch(/err instanceof ApiError && err\.status < 500 \? err\.message/);
  });
});

describe('switching a package or offer on or off', () => {
  for (const [name, src] of [
    ['packages', packagesList],
    ['offers', offersList],
  ] as const) {
    it(`${name}: a refusal is shown, not swallowed`, () => {
      const toggle = src.slice(src.indexOf('const toggleActive = async'));
      expect(toggle.slice(0, toggle.indexOf('};'))).toMatch(/catch \(err\) \{\s*failed\(err\);/);
    });
  }
});

describe('spreadsheet import', () => {
  it('reads an hours column as hours, and rounds every duration to a whole minute', () => {
    expect(importer).toMatch(/\(hrs\?\|hours\?\)/);
    expect(importer).toMatch(/Math\.round\(n \* perUnit\)/);
  });

  it('starts a repeated name skipped', () => {
    expect(importer).toMatch(/skip: repeat/);
  });
});

describe('service form', () => {
  it('opens on the stored values, unclamped, and allows the API’s 4 hours of cleanup', () => {
    expect(serviceForm).toMatch(/useState\(service\?\.bufferAfterMin \?\? 0\)/);
    expect(sheet).toMatch(/CLEANUP = \{ min: 0, max: 4 \* 60/);
  });

  it('offers to bring back a retired service that holds the name', () => {
    expect(serviceForm).toMatch(/refusal\.existingActive === false/);
    expect(serviceForm).toMatch(/api\.updateService\(id, \{ active: true \}\)/);
  });

  it('lists every category at the branch in its picker, empty ones included', () => {
    expect(table).toMatch(/categories=\{pickerCategories \?\? categories\}/);
    expect(table).toMatch(/api\s*\.categoriesAtBranch\(branchId\)/);
  });
});

describe('a 409 is an ApiError', () => {
  it('so every "show the server’s reason" check covers it, with its field and body', () => {
    const conflict = new BookingConflictError('That number is already saved for Asha', { field: 'phone', existingId: 'x' }, 'already_a_client');
    expect(conflict).toBeInstanceOf(ApiError);
    expect(conflict.status).toBe(409);
    expect(conflict.field).toBe('phone');
    expect(conflict.code).toBe('already_a_client');
    expect(conflict.details).toEqual({ field: 'phone', existingId: 'x' });
  });
});
