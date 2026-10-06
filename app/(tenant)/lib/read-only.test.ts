import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { isWritable } from './read-only';
import { mayUse, type UiAction } from './nav-policy';
import { SessionProvider, useMayUse, useWritable } from '../components/SessionProvider';

/**
 * Jira GRW-556 (follow-up) — a business suspended for non-payment signs in READ-ONLY: it sees everything, and the
 * dashboard draws no control that writes except the bill. The API refuses the writes (its guard asks
 * `operability.writes`); this is the half that stops the dashboard offering them.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const tenant = path.resolve(here, '..');
const read = (p: string) => readFileSync(path.resolve(tenant, p), 'utf-8');

describe('is the business allowed to change anything', () => {
  it('only a suspended one is not', () => {
    expect(isWritable('suspended')).toBe(false);
    for (const s of ['active', 'provisioning', 'churned', undefined, null, '']) expect(isWritable(s), String(s)).toBe(true);
  });
});

describe('mayUse with the business not writable', () => {
  const WRITES: UiAction[] = ['visit.new', 'visit.recordPayment', 'queue.give', 'booking.checkout', 'booking.setStatus', 'token.arrive', 'booking.reschedule', 'client.edit', 'client.delete', 'attendance.mark'];

  it('closes every control that writes — for the owner too', () => {
    for (const action of WRITES) {
      expect(mayUse('owner', action, true), `${action} while writable`).toBe(true);
      expect(mayUse('owner', action, false), `${action} while suspended`).toBe(false);
    }
  });

  it('leaves the bill payable', () => {
    expect(mayUse('owner', 'billing.payNow', false)).toBe(true);
  });

  it('leaves every control that only reads — they can still see their own data', () => {
    for (const action of ['search', 'clients.list', 'client.profile'] as UiAction[]) expect(mayUse('owner', action, false), action).toBe(true);
  });

  it('closes for an absent role as well: a degraded session is the owner, and the owner is suspended too', () => {
    expect(mayUse(null, 'visit.new', false)).toBe(false);
    expect(mayUse(null, 'visit.new')).toBe(true);
  });

  it('defaults to writable, so every existing call is unchanged', () => {
    expect(mayUse('owner', 'visit.new')).toBe(true);
    expect(mayUse('staff', 'visit.new')).toBe(false);
  });
});

describe('what a component reads from the session', () => {
  const Probe = ({ action }: { action: UiAction }) =>
    createElement('p', null, `${useWritable() ? 'writable' : 'read-only'}:${useMayUse(action) ? 'drawn' : 'hidden'}`);
  const draw = (writable: boolean | undefined, action: UiAction) =>
    renderToStaticMarkup(
      createElement(SessionProvider, {
        session: { initial: 'S', role: 'owner', phone: null, businessName: 'Salon', ...(writable === undefined ? {} : { writable }) },
        children: createElement(Probe, { action }),
      }),
    );

  it('a suspended session hides a write and keeps the bill', () => {
    expect(draw(false, 'visit.new')).toContain('read-only:hidden');
    expect(draw(false, 'booking.checkout')).toContain('read-only:hidden');
    expect(draw(false, 'billing.payNow')).toContain('read-only:drawn');
  });

  it('a session that cannot say reads as writable — never shut out of its own product', () => {
    expect(draw(undefined, 'visit.new')).toContain('writable:drawn');
  });
});

describe('a business whose plan or subscription closes walk-ins', () => {
  const Probe = ({ action }: { action: UiAction }) => createElement('p', null, useMayUse(action) ? 'drawn' : 'hidden');
  const draw = (walkIn: boolean | undefined, action: UiAction) =>
    renderToStaticMarkup(
      createElement(SessionProvider, {
        session: { initial: 'S', role: 'owner', phone: null, businessName: 'Salon', ...(walkIn === undefined ? {} : { walkIn }) },
        children: createElement(Probe, { action }),
      }),
    );

  it('hides the queue’s Give and the token board’s Arrived — the API refuses both', () => {
    expect(draw(false, 'queue.give')).toContain('hidden');
    expect(draw(false, 'token.arrive')).toContain('hidden');
  });

  it('leaves what is not only a walk-in: a booking for later and settling a booked visit', () => {
    expect(draw(false, 'visit.new')).toContain('drawn');
    expect(draw(false, 'booking.checkout')).toContain('drawn');
  });

  it('a session that cannot say draws them — only an explicit false hides', () => {
    expect(draw(undefined, 'queue.give')).toContain('drawn');
    expect(draw(true, 'token.arrive')).toContain('drawn');
  });
});

describe('the layout wires it from /me', () => {
  const layout = read('layout.tsx').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  it('derives it from the tenant status and hands it to the session', () => {
    expect(layout).toMatch(/writable = isWritable\(me\.tenant\?\.status\);/);
    expect(layout).toMatch(/live,\s*writable,\s*walkIn,/);
    expect(layout).toMatch(/walkIn = me\.capabilities\?\.walkIn !== false;/);
  });

  it('a suspended business is no longer turned away by the account-status screen — that is a closed business’s', () => {
    // `accountStatusRefusal` still renders for any `account_*` refusal; it is the API that stopped sending one for a
    // suspended business's reads. Pinned here so a change to either half is a decision.
    expect(read('lib/session-policy.ts')).toMatch(/startsWith\('account_'\)/);
  });
});

describe('every screen that writes asks whether it may (the list that cannot quietly decay)', () => {
  /**
   * Source patterns, in the style of `go-live.test.ts`: a screen that gains a new write control and forgets this
   * rule fails the typecheck of nothing, so what keeps it honest is naming the controls here. Each entry is a file
   * and the line that closes the control for a business suspended for non-payment. Billing, sign-out, language and
   * change-password are not here on purpose: they are the writes a suspended owner still has.
   */
  const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const GATES: Array<[file: string, gate: RegExp]> = [
    // Services
    ['services/ServicesTable.tsx', /actions=\{\s*writable \? \(\s*<button type="button" className="btn" onClick=\{\(\) => setChoosing\(true\)\}/],
    ['services/ServicesTable.tsx', /\{writable && \(\s*<button\s+type="button"\s+className="btn btn-ghost"\s+disabled=\{loadingCategories\}/],
    ['services/ServicesTable.tsx', /\{writable && canCopy && \(/],
    ['services/ServiceRows.tsx', /if \(!writable\) return null;/],
    ['services/ServiceRows.tsx', /if \(busy \|\| !writable\) return;/],
    // Offers
    ['offers/CreateOfferMenu.tsx', /if \(!useWritable\(\)\) return null;/],
    ['offers/OffersList.tsx', /disabled=\{busyId === offer\.id \|\| !writable\}/],
    ['offers/OffersList.tsx', /\{writable && \(\s*<div\s+className="dropdown-anchor"/],
    // Packages
    ['packages/page.tsx', /<WriteOnly>\s*<Link className="btn" href="\/packages\/new">/],
    ['packages/PackagesList.tsx', /\{writable && \(\s*<div\s+className="dropdown-anchor pkg-actions"/],
    ['packages/new/page.tsx', /await guardWritable\('\/packages'\);/],
    ['packages/[id]/edit/page.tsx', /await guardWritable\('\/packages'\);/],
    // Staff
    ['providers/StaffClient.tsx', /actions=\{\s*writable \? \(\s*<button type="button" className="btn" onClick=\{\(\) => setCreating\(true\)\}/],
    ['providers/StaffRoster.tsx', /disabled=\{disabled \|\| !writable\}/],
    ['providers/StaffRoster.tsx', /if \(!writable\) return null;/],
    ['providers/[id]/StaffEditClient.tsx', /<ReadOnlyFields>\s*<div className="edit-layout">/],
    ['providers/[id]/StaffEditClient.tsx', /\{writable && \(\s*<div className="edit-savebar">/],
    // Settings (one chokepoint for every sub-page but billing)
    ['settings/SettingsShell.tsx', /const onBilling = pathname\.startsWith\('\/settings\/billing'\);/],
    ['settings/SettingsShell.tsx', /<ReadOnlyFields exempt=\{onBilling\}>\{children\}<\/ReadOnlyFields>/],
    ['components/ReadOnlyFields.tsx', /disabled=\{!writable && !exempt\}/],
    // Clients, Free times, Try WhatsApp, Attendance, the desk's Home
    ['customers/CustomersClient.tsx', /actions=\{\s*writable \? \(/],
    ['customers/CustomersClient.tsx', /useState\(\(\) => writable && searchParams\.get\('add'\) === '1'\)/],
    ['availability/SlotGrid.tsx', /\{writable && \(\s*<button type="button" className="btn btn-ghost" onClick=\{\(\) => openBooking/],
    ['try-whatsapp/page.tsx', /await guardWritable\('\/'\);/],
    ['attendance/AttendanceRegister.tsx', /disabled=\{busy \|\| !canMarkAll \|\| !writable\}/],
    ['components/home/ReceptionHome.tsx', /\.\.\.\(writable \? \[\{ href: '\/customers\?add=1'/],
  ];
  for (const [file, gate] of GATES) {
    it(`${file} — ${gate.source.slice(0, 56)}…`, () => {
      expect(code(file)).toMatch(gate);
    });
  }

  it('billing is never inside the read-only fieldset', () => {
    // The shell exempts it by path, and the billing controls themselves ask nothing of `useWritable`.
    for (const f of ['settings/billing/AutoPayCard.tsx', 'components/PayNowButton.tsx', 'components/BillingBanner.tsx']) {
      expect(code(f), f).not.toMatch(/useWritable|isWritable/);
    }
  });
});

describe('save bars on a phone dock above the tab bar, on every Settings tab', () => {
  const sheet = read('styles/85-settings-fit.css');
  const block = sheet.slice(sheet.indexOf('Save bars on a phone, docked rather than floating'));
  it('Settings keeps one bar\'s gap of padding, not the 84px the floating "+" needs', () => {
    expect(block).toMatch(/\.page-body\.settings-page \{\s*padding-bottom: var\(--sp-3\);/);
  });
  it('both bars sit at that edge, on a strip of page background, so nothing shows through under them', () => {
    expect(block).toMatch(/\.settings-page \.bp-savebar,\s*\.settings-page \.settings-savebar \{\s*bottom: 0;\s*box-shadow: 0 0 0 var\(--sp-3\) var\(--page-bg\)/);
  });
});

