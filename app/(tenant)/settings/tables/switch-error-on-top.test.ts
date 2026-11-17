import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Owner, 2026-11-17 — "this error should be on top": Table orders' error sits under its own hint, above the rest. */
const form = readFileSync(resolve(__dirname, 'TablesForm.tsx'), 'utf8');

describe('Table orders: why it did not switch', () => {
  it('is said right under the switch, before Set up tables, Service charge and Kitchen late', () => {
    const at = (s: string) => form.indexOf(s);
    const err = at('{error.message}');
    expect(err).toBeGreaterThan(at("{branch.on ? t('onHint') : t('offHint')}"));
    for (const later of ['className="dt-setup-link"', '<ServiceChargeOffer branch', '<KitchenLate branch']) expect(err).toBeLessThan(at(later));
  });
});
