import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Areas } from '../lib/areas';
import { visibleItems } from '../lib/nav-policy';

/**
 * QA 2026-11-14, F22 (owner's decision: his own attendance). Amit holds a shop's "Staff" role — Attendance: view and
 * nothing else. On a laptop the Team fold takes him to his own month; on a phone the bar was Home and Alerts, and no
 * way to it. A role holder's bar now offers Attendance when the role opens it and a slot is free.
 */
const nav = readFileSync(new URL('./BottomNav.tsx', import.meta.url), 'utf8');
const SHOP: Areas = { bookings: false, services: false, shop: true, stock: true };
const bar = ['/', '/appointments', '/orders', '/stock', '/customers', '/attendance', '/notifications'].map((href) => ({ href }));

describe('Attendance on the phone bar', () => {
  it('a role that opens only Attendance gets it between Home and the bell', () => {
    const shown = visibleItems(bar, 'staff', undefined, true, { ...SHOP, pages: { attendance: 'view' } as never }).map((i) => i.href);
    expect(shown).toEqual(['/', '/attendance', '/notifications']);
  });

  it("a role that opens everything keeps the five frequent tabs: Attendance gives way, it does not make a sixth", () => {
    expect(nav).toContain("...(areas.pages ? [{ href: '/attendance', label: t.nav.attendance, icon: <IconNavAttendance /> }] : []),");
    expect(nav).toContain("const visible = allowed.length > MAX_TABS ? allowed.filter((i) => i.href !== '/attendance') : allowed;");
    expect(nav).toContain('const MAX_TABS = 5;');
  });

  it("the owner's and the fixed roles' bars are not offered it (a salon's bar is unchanged)", () => {
    // Only a member who holds a role carries `pages`; the item is not in the list at all without it.
    expect(nav).toMatch(/\.\.\.\(areas\.pages \? \[\{ href: '\/attendance'/);
  });
});
