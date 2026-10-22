import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { UI_ACTIONS } from '@growza-app/shared';
import { canSee, gridCanSee, gridMayUse, PAGE_OF_HREF } from './nav-policy';
import type { Areas, PageGrid } from './areas';

/**
 * Review, 2026-10-22 — two holes in Jira GRW-74's grid, found reading develop before the release.
 *
 * **Home handed out what the grid had taken away.** `gridCanChange` answers for a SCREEN, from its address, and
 * Home has no address in `PAGE_OF_HREF` — Home is every page at once. So `ScreenAccess` left Home writable for
 * everyone, and `useMayUse` fell through to `mayUse(role, …)`, which knows only the fixed word a role works like.
 * A role holding Bookings at See got `/appointments` read-only, correctly, and then New booking, Record payment,
 * the token board's give and arrive, and the phone's centre "+" — each of which the API answers 403. The fix asks
 * the grid about the CONTROL, so the answer is the same wherever the control is drawn.
 *
 * **Notifications was gated on the diary.** `/notifications` sat under `bookings`, so a shop's stock keeper and
 * the Staff role whose whole job is attendance saw none — not the low-stock warning, not the approval addressed
 * to them. `GET /api/v1/notifications` answers every role on purpose (Jira GRW-301) and the page carries no role
 * check of its own, so the grid was the only thing closing it.
 */
const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const withGrid = (pages: PageGrid): Areas => ({ bookings: true, services: true, shop: false, pages });

describe('the grid reaches the controls, not just the screens', () => {
  it('asks for Change where the control writes, and See where it only reads', () => {
    expect(gridMayUse('visit.new', { bookings: 'manage' })).toBe(true);
    expect(gridMayUse('visit.new', { bookings: 'view' })).toBe(false);
    expect(gridMayUse('visit.new', {})).toBe(false);
    // A read is offered at See: the one-box search and the client list are not writes.
    expect(gridMayUse('search', { bookings: 'view' })).toBe(true);
    expect(gridMayUse('clients.list', { clients: 'view' })).toBe(true);
    expect(gridMayUse('client.edit', { clients: 'view' })).toBe(false);
    expect(gridMayUse('client.edit', { clients: 'manage' })).toBe(true);
    expect(gridMayUse('attendance.approve', { attendance: 'manage' })).toBe(true);
    expect(gridMayUse('attendance.approve', { attendance: 'view' })).toBe(false);
  });

  it('leaves alone the two the grid has no opinion on', () => {
    // Marking yourself in is your own record — the API offers it from the branch fence, not from a grant — and Pay
    // now belongs to a route that is the owner's alone whatever the grid says.
    expect(gridMayUse('attendance.self', {})).toBe(true);
    expect(gridMayUse('billing.payNow', {})).toBe(true);
  });

  it('names every control there is, so a new one fails here instead of defaulting open', () => {
    const named = new Set(Object.keys(JSON.parse(JSON.stringify(UI_ACTIONS))));
    const source = read('lib/nav-policy.ts');
    const missing = [...named].filter((a) => !source.includes(`'${a}':`) && !source.includes(`  ${a}:`));
    expect(missing, `control(s) with no page in PAGE_OF_ACTION (lib/nav-policy.ts): ${missing.join(', ')} — say which page of the grid each belongs to, or null if the grid has no opinion`).toEqual([]);
  });

  it('is asked by every screen that draws one of them', () => {
    // `useMayUse` is the one gate; the two that called `mayUse` directly were the two that bypassed the grid.
    expect(read('components/home/OwnerHome.tsx')).toMatch(/const mayBook = useMayUse\('visit\.new'\);/);
    expect(read('components/home/ReceptionHome.tsx')).toMatch(/const mayAddClient = useMayUse\('client\.edit'\);/);
    // Chrome, not a screen: it has no `useWritable`, so it asks the grid itself.
    expect(read('components/MobileChrome.tsx')).toMatch(/gridMayUse\('visit\.new', areas\.pages\)/);
    expect(read('components/MobileChrome.tsx')).toMatch(/gridMayUse\('visit\.recordPayment', areas\.pages\)/);
    // And the one gate ANDs the two, so a role can only ever narrow what the fixed role reached (migration 0063).
    expect(read('components/SessionProvider.tsx')).toMatch(/return mayUse\(session\?\.role, action, writable\) && \(!grid \|\| gridMayUse\(action, grid\)\);/);
  });
});

describe('notifications belong to no page', () => {
  it('is not in the page table at all', () => {
    expect(PAGE_OF_HREF.map(([prefix]) => prefix)).not.toContain('/notifications');
  });

  it('opens for a grid that grants nothing', () => {
    expect(gridCanSee('/notifications', {})).toBe(true);
    // The Staff role: attendance only, and still told when its own mark is approved.
    expect(canSee('/notifications', 'staff', undefined, true, withGrid({ attendance: 'manage' }))).toBe(true);
    // A shop's stock keeper: no diary at all, and still told what is running out.
    expect(canSee('/notifications', 'staff', undefined, true, { bookings: false, services: true, shop: true, pages: { services: 'manage' } })).toBe(true);
  });

  it('did not take the rest of the table with it', () => {
    expect(gridCanSee('/appointments', {})).toBe(false);
    expect(gridCanSee('/appointments', { bookings: 'view' })).toBe(true);
  });
});
