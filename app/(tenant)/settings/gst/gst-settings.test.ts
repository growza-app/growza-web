import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../../messages/en.json';
import hi from '../../../../messages/hi.json';
import { SETTINGS_GROUPS } from '../nav-data';
import { wholeBusiness } from '../../lib/branch-routes';

/**
 * Jira GRW-582 — Settings › GST and invoices.
 *
 * The decisions worth pinning are the ones a later edit would undo without noticing: that the screen never claims a
 * business is registered on its behalf, that nothing is asked of a business that is not, and that the branch's state
 * is on a branch-scoped screen rather than a business-wide one.
 */
const form = readFileSync(resolve(__dirname, 'GstForm.tsx'), 'utf8');
const page = readFileSync(resolve(__dirname, 'page.tsx'), 'utf8');

describe('where it lives', () => {
  it('is a branch tab, because the state this branch supplies from is on it', () => {
    const row = SETTINGS_GROUPS.find((g) => g.key === 'branch')!.rows.find((r) => r.href === '/settings/gst');
    expect(row, 'the GST row belongs to the branch group').toBeTruthy();
    expect(wholeBusiness('/settings/gst')).toBe(false);
  });

  it('reads the settings the header is already scoped to, with no picker of its own', () => {
    expect(page).toMatch(/await api\.settings\(\)/);
    expect(page).not.toMatch(/BranchPicker|location=/);
  });
});

describe('the registration is the owner\'s own declaration', () => {
  it('offers all three answers, and asks nothing else until one of them is yes', () => {
    expect(form).toMatch(/const STATUSES = \['unregistered', 'regular', 'composition'\] as const;/);
    // `registered` gates every other field: an unregistered business is asked for nothing.
    expect(form).toMatch(/const registered = status !== 'unregistered';/);
    expect(form).toMatch(/\{!registered \? \(/);
  });

  it('never infers registration from a GSTIN being typed', () => {
    /*
     * Status moves for exactly two reasons: the owner picked an answer, or the server said what it stored. If a
     * third ever appears — "they typed a valid GSTIN, so they must be registered" — this fails, which is the
     * point: a checksum says somebody typed carefully, never that a business is registered.
     */
    const setters = [...form.matchAll(/setStatus\(([^)]*)\)/g)].map((m) => m[1]!.trim());
    expect(setters.sort()).toEqual(['e.target.value as Status', 'fresh.gst.status']);
  });

  it('shows what each answer means for the customer, not what it means to the API', () => {
    expect(en.settingsGst.statusHelp.unregistered).toContain('receipt');
    expect(en.settingsGst.statusHelp.regular).toContain('tax invoice');
    expect(en.settingsGst.statusHelp.composition).toContain('bill of supply');
  });
});

describe('what it does with the server\'s answer', () => {
  it('shows back what was stored, not what was typed', () => {
    // The API trims and upper-cases a GSTIN; the screen must show what is now on file.
    expect(form).toMatch(/setGstin\(fresh\.gst\.gstin\)/);
    expect(form).toMatch(/setStatus\(fresh\.gst\.status\)/);
    expect(form).toMatch(/setBranchStateCode\(fresh\.gst\.branchStateCode\)/);
  });

  it('puts a refusal on the field it is about', () => {
    expect(form).toMatch(/setBadField\(\(e\.body as \{ field\?: string \} \| undefined\)\?\.field \?\? null\)/);
    expect(form).toMatch(/const fieldError = \(name: string\) =>/);
    for (const field of ['gstin', 'legalName', 'invoicePrefix', 'branchStateCode', 'branchGstin']) {
      expect(form, `${field} shows its own refusal`).toContain(`fieldError('${field}')`);
    }
  });

  it('shows the invoice number the owner will actually see, rebuilt as they type', () => {
    expect(form).toMatch(/const prefixExample = invoicePrefix\.trim\(\) \? `\$\{invoicePrefix\.trim\(\)\}\/2026-27\/0001` : '2026-27\/0001';/);
  });
});

describe('Hindi ships with English', () => {
  it('words every string on the screen', () => {
    const keys = (o: Record<string, unknown>, prefix = ''): string[] =>
      Object.entries(o).flatMap(([k, v]) =>
        typeof v === 'object' && v !== null ? keys(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`],
      );
    expect(keys(hi.settingsGst)).toEqual(keys(en.settingsGst));
    for (const value of Object.values(hi.settingsGst.status)) expect(value).not.toMatch(/^[A-Za-z ]+$/);
  });

  it('names the screen in both', () => {
    expect(en.settingsHub.rows.gst.label).toBeTruthy();
    expect(hi.settingsHub.rows.gst.label).toBeTruthy();
    expect(hi.settingsHub.rows.gst.label).not.toBe(en.settingsHub.rows.gst.label);
  });
});
