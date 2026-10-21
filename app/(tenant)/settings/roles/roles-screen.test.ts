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

describe('Jira GRW-73 — the people beside the roles', () => {
  const team = read('app/(tenant)/settings/roles/RolesTeam.tsx');
  const invite = read('app/(tenant)/providers/TeamLogins.tsx');

  it('offers a person only the roles that work like what they already are, plus the one they hold', () => {
    expect(team).toContain("r.worksLike === m.role) || r.id === m.tenantRoleId");
    // A staff-like role is offered to an invitation only when someone is on the roster to be that login (a shop has no screen to add one).
    expect(team).toContain("r.worksLike === 'staff' && rosterPeople.length > 0");
  });

  it('gives only desk-like and staff-like roles to an invitation, and never an owner', () => {
    expect(team).toContain("r.worksLike === 'receptionist' || r.worksLike === 'staff'");
    expect(team).toContain("m.role !== 'owner'");
  });

  it('the invite sheet sends the role only when it was given roles, so a salon invites exactly as before', () => {
    expect(invite).toContain('...(roles ? { tenantRoleId } : {})');
    expect(invite).toContain('roles?: ShopRole[]');
  });

  it('a change of role goes through the one api call, with null to take it away', () => {
    expect(team).toContain('api.setTeamMemberRole(member.userId, tenantRoleId || null)');
    expect(read('app/(tenant)/lib/api.ts')).toContain('patch<{ ok: true }>(`/api/v1/team/members/${userId}`, { tenantRoleId })');
  });

  it('each new sentence exists in both languages', () => {
    for (const k of ['peopleTitle', 'peopleEmpty', 'noRole', 'roleFor', 'invite', 'chooseRole', 'chooseRoleFirst', 'makeRoleFirst']) {
      for (const lang of ['en', 'hi'] as const) expect(messages(lang)[k], `${lang} · ${k}`).toBeTruthy();
    }
  });
});
