import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { areaAllows, DIARY_AREAS } from '../../lib/areas';

/**
 * Jira GRW-72 — Settings › Roles. This repo has no component-rendering setup, so these pin the source: the grid has every page the API
 * knows, each in both languages, the row is offered to a shop's owner and to nobody else, and a diary business is closed out by address.
 */
const root = join(__dirname, '../../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const messages = (lang: 'en' | 'hi') => JSON.parse(read(`messages/${lang}.json`)).settingsRoles as Record<string, any>;
const PAGES = ['bookings', 'clients', 'services', 'offers', 'staff', 'attendance', 'reports', 'settings'];

describe('the grid', () => {
  it('has a row for each of the eight pages, named in English and Hindi', () => {
    const screen = read('app/(tenant)/settings/roles/RolesScreen.tsx');
    for (const page of PAGES) {
      expect(screen).toContain(`'${page}'`);
      for (const lang of ['en', 'hi'] as const) expect(messages(lang).pages[page], `${lang} · ${page}`).toBeTruthy();
    }
    expect(Object.keys(messages('en').pages).sort()).toEqual([...PAGES].sort());
  });

  it('says Orders and Stock, not Bookings and Services — the shop’s own words', () => {
    expect(messages('en').pages.bookings).toBe('Orders');
    expect(messages('en').pages.services).toBe('Stock');
  });

  it('offers three plain choices per page, one at a time', () => {
    expect(Object.keys(messages('en').levels)).toEqual(['none', 'view', 'manage']);
    expect(Object.values(messages('en').levels)).toEqual(['None', 'See', 'Change']);
    expect(read('app/(tenant)/settings/roles/RolesScreen.tsx')).toContain("type=\"radio\"");
  });
});

describe('who is offered it', () => {
  it('the nav row is for a shop’s owner only', () => {
    expect(read('app/(tenant)/settings/nav-data.tsx')).toMatch(/key: 'roles'[^}]*shopOwnerOnly: true/);
    expect(read('app/(tenant)/settings/SettingsNavList.tsx')).toContain("(!row.shopOwnerOnly || (areas.shop && role === 'owner'))");
  });

  it('a diary business is closed out of the address; a shop is let in', () => {
    expect(areaAllows('/settings/roles', DIARY_AREAS)).toBe(false);
    expect(areaAllows('/settings/roles', { bookings: false, services: false, shop: true })).toBe(true);
  });

  it('the page answers a refusal with not-found, as the API does', () => {
    expect(read('app/(tenant)/settings/roles/page.tsx')).toMatch(/status === 404 \|\| error\.status === 403[\s\S]*notFound\(\)/);
  });
});

describe('the sentences', () => {
  it('every key exists in both languages', () => {
    const keys = (o: Record<string, any>, p = ''): string[] => Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
    expect(keys(messages('hi')).sort()).toEqual(keys(messages('en')).sort());
  });

  it('removing a held role names who holds it, from the server’s list, not from a sentence', () => {
    const screen = read('app/(tenant)/settings/roles/RolesScreen.tsx');
    expect(screen).toContain('body.holders.join');
    expect(messages('en').removeBlocked).toContain('{names}');
  });
});
