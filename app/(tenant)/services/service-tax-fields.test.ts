import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';

/**
 * Jira GRW-582 — an owner says what a service is for tax: its GST rate and its SAC.
 *
 * Pinned at the source because these are the decisions a later edit would undo without noticing: that a rate of 0 stays
 * a rate (not "not set"), that clearing a field clears it on the server, and that the code cannot be typed wrong.
 */
const form = readFileSync(resolve(__dirname, 'ServiceForm.tsx'), 'utf8');
const fields = readFileSync(resolve(__dirname, '../components/TaxFields.tsx'), 'utf8');
const sheet = readFileSync(resolve(__dirname, '../products/ProductSheet.tsx'), 'utf8');

describe('the service form', () => {
  it('holds the rate as text so 0% (a real answer) is not confused with "not set"', () => {
    expect(form).toMatch(/useState\(service\?\.gstRateBp != null \? String\(service\.gstRateBp\) : ''\)/);
    expect(form).toMatch(/gstRateBp: gstRateBp === '' \? null : Number\(gstRateBp\)/);
  });

  it('sends both on every save, blank as none, so clearing a field clears the code', () => {
    expect(form).toMatch(/gstRateBp: gstRateBp === '' \? null : Number\(gstRateBp\),\s*sac: sac\.trim\(\) \|\| null,/);
  });

  it('counts a tax change as a change, so Save is offered when it is the only edit', () => {
    expect(form).toMatch(/const taxChanged =/);
    expect(form).toMatch(/isDirty\(current, original\) \|\| description !== \(service\.description \?\? ''\) \|\| taxChanged/);
    expect(form).toMatch(/sac !== \(service\?\.sac \?\? ''\) \|\|\s*photo !== null/);
  });

  it('is collapsed until the service has something set, and sits under the price', () => {
    expect(form).toMatch(/useState\(Boolean\(service && \(service\.gstRateBp != null \|\| service\.sac\)\)\)/);
    const price = form.indexOf('<GstInPrice');
    const taxFields = form.indexOf('<TaxFields');
    expect(price).toBeGreaterThan(form.indexOf("t('priceHint')"));
    expect(taxFields).toBeGreaterThan(price);
  });
});

describe('the shared tax fields', () => {
  it('are used by both forms, so the service and the product ask the same two questions the same way', () => {
    expect(form).toMatch(/<TaxFields\s+idPrefix="svc"\s+kind="service"/);
    expect(sheet).toMatch(/<TaxFields\s+idPrefix="prd"\s+kind="product"/);
  });

  it('take digits only, up to 8, because that is all an invoice line can hold', () => {
    expect(fields).toContain("onCode(e.target.value.replace(/\\D/g, ''))");
    expect(fields).toContain('maxLength={8}');
    expect(fields).toContain('inputMode="numeric"');
  });

  it('call the code a SAC for a service and an HSN for a product', () => {
    expect(fields).toMatch(/kind === 'service' \? t\('sac'\) : t\('hsn'\)/);
  });

  it('keep a stored rate that is no standard slab, rather than silently dropping it from the list', () => {
    expect(fields).toMatch(/savedRateBp != null && !GST_SLABS_BP\.includes/);
  });
});

describe('the words', () => {
  const keys = ['title', 'notSet', 'gstRate', 'hsn', 'sac', 'hint', 'pricesInclude', 'includedIn'] as const;

  it.each([
    ['en', en.tax],
    ['hi', hi.tax],
  ] as const)('%s: every word is there', (_lang, group) => {
    for (const k of keys) expect(group[k], k).toBeTruthy();
  });

  it.each([
    ['en', en.tax],
    ['hi', hi.tax],
  ] as const)('%s: the price line names the GST, the rate and what the client pays', (_lang, group) => {
    expect(group.includedIn).toContain('{tax}');
    expect(group.includedIn).toContain('{rate}');
    expect(group.includedIn).toContain('{total}');
    expect(group.hint).toContain('{code}');
  });
});

describe('prices include GST, and that is not a switch', () => {
  const gst = readFileSync(resolve(__dirname, '../settings/gst/GstForm.tsx'), 'utf8');

  it('Settings › GST says so and offers no switch: the till charges the typed price and never adds tax on top', () => {
    expect(gst).not.toContain('setPricesIncludeTax');
    expect(gst).not.toMatch(/className="switch"[^]*gst-inclusive/);
    expect(gst).toContain("t('pricesIncludeTaxLabel')");
    // And it never sends the field, so a save cannot turn it off.
    expect(gst).not.toMatch(/pricesIncludeTax,\n/);
  });

  it('the price lines never promise a total above the price', () => {
    expect(fields).not.toContain('addedTo');
    expect(fields).not.toContain('usePricesIncludeTax');
    expect(en.tax).not.toHaveProperty('addedTo');
    expect(hi.tax).not.toHaveProperty('addedTo');
  });
});
