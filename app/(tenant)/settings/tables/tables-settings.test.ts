import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../../messages/en.json';
import hi from '../../../../messages/hi.json';
import { SETTINGS_GROUPS } from '../nav-data';
import { wholeBusiness } from '../../lib/branch-routes';
import { areaAllows, areasOf } from '../../lib/areas';

/**
 * Jira GRW-718 — Settings › Tables: the owner switches Table orders on per branch.
 *
 * Pinned here: who is offered it (the owner of a business that may seat guests, and nobody else), that it lists every
 * branch at once, and that a switch never shows a state the server did not accept.
 */
const form = readFileSync(resolve(__dirname, 'TablesForm.tsx'), 'utf8');
const page = readFileSync(resolve(__dirname, 'page.tsx'), 'utf8');
const restaurant = areasOf({ capabilities: { bookings: false, services: false, stockCounted: false, marketplaces: false, tables: true }, surface: 'shop' });
const salon = areasOf({ capabilities: { bookings: true, services: true } });
const olderApi = areasOf({ capabilities: { bookings: false, services: false, stockCounted: false }, surface: 'shop' });

describe('AC-04 — who is offered it', () => {
  it('a restaurant has the screen; a salon, a shop and an API that says nothing do not', () => {
    expect(areaAllows('/settings/tables', restaurant)).toBe(true);
    expect(areaAllows('/settings/tables', salon)).toBe(false);
    expect(areaAllows('/settings/tables', areasOf({ capabilities: { bookings: false, services: false }, surface: 'shop' }))).toBe(false);
    expect(areaAllows('/settings/tables', olderApi)).toBe(false);
  });

  it('only an explicit yes adds it, so every business that existed before reads as it did', () => {
    expect(salon).not.toHaveProperty('tables');
    expect(areasOf({ capabilities: { tables: false } })).not.toHaveProperty('tables');
  });

  it('AC-03 — the owner and a manager are offered it; only the owner gets the switches', () => {
    const row = SETTINGS_GROUPS.flatMap((g) => g.rows).find((r) => r.href === '/settings/tables')!;
    expect(row.ownerOrManager).toBe(true);
    // Anyone else is sent back; the API refuses them outright besides.
    expect(page).toMatch(/role !== 'owner' && role !== 'manager'\) redirect\('\/settings'\)/);
    expect(page).toMatch(/guardScreen\('\/settings\/tables'\)/);
    // A manager is shown the branches that are on, with no switch (GRW-719 BR-04; GRW-718 BR-02).
    expect(page).toMatch(/canSwitch=\{false\}/);
    expect(form).toMatch(/canSwitch \? \(/);
  });
});

describe('one screen, every branch', () => {
  it('sits with the whole business, and no branch picker narrows it', () => {
    const row = SETTINGS_GROUPS.find((g) => g.key === 'business')!.rows.find((r) => r.href === '/settings/tables');
    expect(row).toBeTruthy();
    expect(wholeBusiness('/settings/tables')).toBe(true);
  });

  it('draws the switch from what the server answered, never from what was tapped', () => {
    // The list is replaced by the PUT's answer; a refusal leaves it untouched and names the branch it came from.
    expect(form).toMatch(/setBranches\(answer\.branches\)/);
    expect(form).not.toMatch(/setBranches\(\(?current/);
    expect(form).toMatch(/error\?\.branchId === branch\.id/);
  });
});

describe('words', () => {
  it('English and Hindi carry the same keys', () => {
    expect(Object.keys(hi.settingsTables).sort()).toEqual(Object.keys(en.settingsTables).sort());
    expect(hi.settingsHub.rows.tables.label).toBeTruthy();
  });

  it('plain words: no "KOT", no "dine-in" jargon on the switch', () => {
    for (const text of Object.values(en.settingsTables)) expect(text).not.toMatch(/KOT|dine-in/i);
  });
});
