import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import { DIARY_AREAS, type Areas } from './areas';
import { canSee } from './nav-policy';

/**
 * QA 2026-11-14, F5 (owner's decision: open the team screen for retail). A retail owner looking for "add a staff
 * member" found Team → Attendance only; /providers and /settings/team sent them Home; Settings listed "Roles". A
 * shop's people and logins already live on Settings › Roles (add staff, invite to a login, change role, remove) — it
 * had no door from Team and a name that did not say so.
 */
const SHOP: Areas = { bookings: false, services: false, shop: true, stock: true };
const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

describe("a shop's team screen has a door", () => {
  it("is offered to a shop's owner, and to nobody at a salon or below the owner", () => {
    expect(canSee('/settings/roles', 'owner', undefined, true, SHOP)).toBe(true);
    expect(canSee('/settings/roles', 'owner', undefined, true, DIARY_AREAS)).toBe(false);
    for (const role of ['receptionist', 'staff'] as const) expect(canSee('/settings/roles', role, undefined, true, SHOP)).toBe(false);
    // A role holder (Neha) is offered what the grid gives, and the grid never opens an owner-only screen.
    expect(canSee('/settings/roles', 'receptionist', undefined, true, { ...SHOP, pages: { reports: 'manage' } as never })).toBe(false);
    // The salon's roster is unchanged, and still not a shop's.
    expect(canSee('/providers', 'owner', undefined, true, DIARY_AREAS)).toBe(true);
    expect(canSee('/providers', 'owner', undefined, true, SHOP)).toBe(false);
  });

  it('sits in the Team fold and the More menu, and says what it holds, in both languages', () => {
    // The owner alone, as Settings lists it: the allowlist treats a fixed manager as an owner, the roles API does not.
    expect(read('../components/Sidebar.tsx')).toContain("...(role === 'owner' ? [{ href: '/settings/roles', label: t.nav.staff }] : []),");
    expect(read('../more/page.tsx')).toContain("...(role === 'owner' ? [{ href: '/settings/roles', label: nav.nav.staff, icon: <IconStaff /> }] : []),");
    expect(en.settingsHub.rows.roles.label).toBe('Team and roles');
    expect(en.settingsHub.rows.roles.sub).toContain('Add staff');
    expect(hi.settingsHub.rows.roles.label).toBe('टीम और रोल');
    // The screen is a shop's alone, and said "a stylist-type login" — the option it describes is called Staff.
    expect(en.settingsRoles.worksLikeHint).not.toMatch(/stylist/i);
    expect(hi.settingsRoles.worksLikeHint).not.toContain('स्टाइलिस्ट');
  });

  it("the old Team address sends a shop to its team screen, and a salon to Staff as before", () => {
    const page = read('../settings/team/page.tsx');
    expect(page).toContain("redirect(areasOf(me).shop ? '/settings/roles' : '/providers');");
  });
});
