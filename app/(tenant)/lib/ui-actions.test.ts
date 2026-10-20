import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fromDashboard } from './dashboard-root';
import {
  canSee,
  mayUse,
  RECEPTIONIST_ALLOWED,
  roleMayReach,
  splitRouteKey,
  STAFF_ALLOWED,
  UI_ACTIONS,
  type MemberRole,
  type UiAction,
} from '@growza-app/shared';

/**
 * Jira GRW-409 · GRW-319 — a control is drawn for a role exactly when the API
 * serves it to that role.
 *
 * QA, 2026-09-25, as a branch receptionist: the header's Search on every
 * screen, answering 403; the Services screen's whole editor, every button
 * answering 403. The API was right both times. The dashboard decided what to
 * draw in a dozen places, and a control nobody thought to gate was drawn for
 * everyone.
 *
 * Four things are checked here, and one more against the running policy in
 * `test/integration/ui-actions-agree.integration.test.ts`:
 *
 * 1. **The matrix, typed out.** What each role may use, written by hand — so a
 *    change to an allowlist that changes what a receptionist is SHOWN fails
 *    here by name, and somebody has to decide it.
 * 2. **Every action is asked.** An action in the table that no component asks
 *    about is a control that was never gated.
 * 3. **Every write the dashboard can make is classified** — a gated control
 *    (an action) or a gated screen (`guardScreen`), and on a screen a role IS
 *    offered, the API serves every write on it to that role.
 * 4. **Every screen a limited role is not offered is guarded**, so the next
 *    owner-only screen cannot ship reachable by its address.
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const tenantDir = fromDashboard('app/(tenant)');
const read = (rel: string) => readFileSync(path.join(tenantDir, rel), 'utf8');

const ACTIONS = Object.keys(UI_ACTIONS) as UiAction[];
const LIMITED: MemberRole[] = ['receptionist', 'staff'];

/** `:userId`, `:id`, `${entryId}` — a parameter is a parameter. */
const normalise = (key: string) => {
  const [method, pattern] = splitRouteKey(key);
  return `${method} ${pattern.replace(/\/:[^/]+/g, '/:id')}`;
};

describe('1 — the matrix, typed out', () => {
  /**
   * Every row is written out. A snapshot would let a change pass by being
   * re-recorded; this makes somebody type the new answer.
   */
  const RECEPTIONIST: Record<UiAction, boolean> = {
    search: false, // owner-only (13-permission-matrix); the desk finds people on the Clients list
    'visit.new': true,
    'visit.recordPayment': true,
    'queue.give': true,
    'token.arrive': true, // the desk marks a booked client in
    'booking.checkout': true,
    'booking.setStatus': true,
    'booking.reschedule': true,
    'booking.correct': false, // the owner fixes a finished booking; the desk does not
    'clients.list': true,
    'client.profile': true,
    'client.edit': true,
    'client.delete': false, // GRW-477 — the desk may correct a client, not delete one (the owner's rule)
    'attendance.mark': true,
    'attendance.self': false, // GRW-563 — a stylist's own phone; the desk marks from the register
    'attendance.approve': true, // GRW-563 — the route is open; the API refuses unless the owner switched the branch on
    'billing.payNow': false, // the account's bill is the owner's
  };
  const STAFF: Record<UiAction, boolean> = {
    search: false,
    'visit.new': false,
    'visit.recordPayment': false,
    'queue.give': false,
    'token.arrive': false, // GRW-403 — the board names every client at the counter, so it is not a stylist's
    'booking.checkout': false, // GRW-195 — checkout completes the booking
    'booking.setStatus': false,
    'booking.reschedule': false,
    'booking.correct': false,
    'clients.list': false,
    'client.profile': false, // GRW-199 — never grantable, even with the Clients report tab
    'client.edit': false,
    'client.delete': false,
    'attendance.mark': false, // GRW-200 — their own record, read-only
    'attendance.self': true, // GRW-563 — their own day, from their own phone, against their own branch's fence
    'attendance.approve': false,
    'billing.payNow': false,
  };

  for (const action of ACTIONS) {
    it(`${action}`, () => {
      expect(mayUse('receptionist', action), 'receptionist').toBe(RECEPTIONIST[action]);
      expect(mayUse('staff', action), 'staff').toBe(STAFF[action]);
      expect(mayUse('owner', action), 'owner').toBe(true);
      // Headroom, treated as owner (BR-04).
      expect(mayUse('manager', action), 'manager').toBe(true);
    });
  }

  it('an ABSENT role is the owner — a degraded /me must not hide the product (BR-03)', () => {
    for (const action of ACTIONS) {
      expect(mayUse(null, action)).toBe(true);
      expect(mayUse(undefined, action)).toBe(true);
    }
  });

  it('a role the table does not know is offered nothing — the API would refuse it every route', () => {
    for (const action of ACTIONS) expect(mayUse('accountant', action)).toBe(false);
  });

  it('mayUse is the API’s own answer, route by route', () => {
    for (const role of ['owner', 'manager', ...LIMITED] as MemberRole[]) {
      for (const action of ACTIONS) {
        const every = UI_ACTIONS[action].every((key) => roleMayReach(role, ...splitRouteKey(key)));
        expect(mayUse(role, action), `${role} · ${action}`).toBe(every);
      }
    }
  });

  it('every action names at least one route, in the shape the allowlists use', () => {
    for (const action of ACTIONS) {
      expect(UI_ACTIONS[action].length, action).toBeGreaterThan(0);
      for (const key of UI_ACTIONS[action]) expect(key, action).toMatch(/^(GET|POST|PATCH|PUT|DELETE) \/api\/v1\/\S+$/);
    }
  });
});

/** Every .ts/.tsx file under (tenant), tests excluded. */
function sources(dir = tenantDir): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

describe('2 — every action is asked by a control', () => {
  it('each one appears in a mayUse(…) or useMayUse(…) call', () => {
    const asked = new Set<string>();
    for (const file of sources()) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/(?:\bmayUse\([^,()]*(?:\([^()]*\))?[^,()]*,\s*|\buseMayUse\()'([a-zA-Z.]+)'/g)) asked.add(m[1]!);
    }
    expect(ACTIONS.filter((a) => !asked.has(a)), 'actions no component asks about').toEqual([]);
    expect([...asked].filter((a) => !(a in UI_ACTIONS)), 'asked about, but not in UI_ACTIONS').toEqual([]);
  });
});

describe('2b — the controls, each behind its own action', () => {
  /**
   * Section 2 proves each action is asked somewhere; this pins WHERE, for the
   * controls a limited role meets. The search is the case QA found: two links
   * to /search, one in the shared header and one in Home's, drawn for everyone.
   */
  it('there is ONE link to /search, and it asks the search action first', () => {
    const linking = sources().filter((f) => /href="\/search"/.test(readFileSync(f, 'utf8')));
    expect(linking.map((f) => path.relative(tenantDir, f))).toEqual([path.join('components', 'HeaderSearch.tsx')]);
    // Jira GRW-556 — and the business being live: it finds clients and bookings, which a business being set up has none of.
    expect(read('components/HeaderSearch.tsx')).toMatch(/const mayUseSearch = useMayUse\('search'\);[\s\S]*if \(!mayUseSearch \|\| !live\) return null;/);
  });

  const GATES: Array<[file: string, gate: RegExp]> = [
    ['components/home/parts.tsx', /<HeaderSearch wide \/>/],
    ['components/MobileChrome.tsx', /const mayBook = mayUse\(role, 'visit\.new', writable\);/],
    ['components/home/OwnerHome.tsx', /const mayBook = mayUse\(p\.role, 'visit\.new', writable\);[\s\S]*const mayRecordPayment = mayUse\(p\.role, 'visit\.recordPayment', writable\);/],
    // Jira GRW-404 moved the desk's rows onto the token board, so the give and pay buttons are gated there.
    ['components/home/TokenBoard.tsx', /const mayGive = useMayUse\('queue\.give'\);[\s\S]*\{mayGive \? \(\s*<button type="button" className="hm-give"/],
    ['components/home/BookedToday.tsx', /const mayArrive = useMayUse\('token\.arrive'\);[\s\S]*\{mayArrive \? \(/],
    ['components/ClientProfileCard.tsx', /\{profile && !editing && mayEdit && \(\s*<button type="button" className="cpc-edit-open"/],
    ['layout.tsx', /canPayOnline = \(me\.payments\?\.online \?\? false\) && mayUse\(role, 'billing\.payNow'\);/],
    ['reports/ReportsClient.tsx', /const onClient = useMayUse\('client\.profile'\) \? setOpenClientId : undefined;/],
    ['reports/ReportsClient.tsx', /onSegment=\{mayListClients \? goToSegment : undefined\}/],
    ['attendance/[providerId]/page.tsx', /const isOwnRecord = !mayUse\(me\.member\?\.role, 'attendance\.mark'\);/],
    ['appointments/new/page.tsx', /if \(!mayUse\(me\.member\?\.role, 'visit\.new', isWritable\(me\.tenant\?\.status\)\)\) \{\s*redirect\('\/appointments'\);/],
  ];
  for (const [file, gate] of GATES) {
    it(`${file} — ${gate.source.slice(0, 60)}…`, () => {
      expect(read(file)).toMatch(gate);
    });
  }
});

/**
 * Writes that live only on a screen the nav hides from a limited role. The
 * screen is closed whole by `guardScreen` (section 4), so its buttons are not
 * gated one by one; on a screen a role IS offered, every write must be theirs.
 */
const SCREEN_WRITES: Record<string, readonly string[]> = {
  // Jira GRW-615 — an order's own screen moves it along: the one next move, and the rarer ones behind More. Same screen,
  // same gate: a role the nav does not offer /orders is bounced Home by the page, so it never reaches the button.
  // Jira GRW-617 — and swaps a size. The desk is offered this screen but takes no returns, so it takes no swaps: the control is
  // drawn from `order.canSwap`, which the API computes with the very function that would refuse the swap.
  '/orders': ['PATCH /api/v1/orders/:id/status', 'POST /api/v1/orders/:id/exchange', 'POST /api/v1/orders/:id/exchange/quote', 'POST /api/v1/marketplace-imports', 'POST /api/v1/marketplace-imports/held/release', 'POST /api/v1/marketplace-imports/held/dismiss'],
  // Jira GRW-563 (shared 1.0.5) — `assign-client` moved into `visit.recordPayment`, where it belonged.
  '/services': [
    'POST /api/v1/services',
    'PATCH /api/v1/services/:id',
    'POST /api/v1/services/:id/photo',
    'DELETE /api/v1/services/:id/photo',
    'POST /api/v1/services/copy-from-branch',
    'POST /api/v1/services/import/parse',
    'POST /api/v1/services/import',
    'POST /api/v1/services/retire',
    // Jira GRW-431 — delete, beside retire. Same screen, same gate.
    'DELETE /api/v1/services/:id',
    'POST /api/v1/services/delete',
    // Jira GRW-428 — the category sheet. Same screen, same gate: a role the nav does not offer /services
    // never reaches these, and a role that is offered it manages the menu it is responsible for.
    'POST /api/v1/service-categories',
    'PATCH /api/v1/service-categories/:id',
    'DELETE /api/v1/service-categories/:id',
    'POST /api/v1/service-categories/reorder',
  ],
  '/offers': ['POST /api/v1/offers', 'PATCH /api/v1/offers/:id', 'DELETE /api/v1/offers/:id'],
  /*
   * Jira GRW-438 — the same three writes, now reachable from two owner-only screens. Both are closed whole by
   * `guardScreen`, so listing them twice is the honest answer rather than a sign one of them is ungated.
   */
  '/packages': ['POST /api/v1/offers', 'PATCH /api/v1/offers/:id', 'DELETE /api/v1/offers/:id'],
  // Owner, 2026-10-14 — the shelf: owner-only, closed whole by `guardScreen`.
  '/products': [
    'POST /api/v1/products',
    'POST /api/v1/products/import',
    'POST /api/v1/products/import/parse',
    'PATCH /api/v1/products/:id',
    'DELETE /api/v1/products/:id',
    'POST /api/v1/products/:id/photo',
    'DELETE /api/v1/products/:id/photo',
    'POST /api/v1/products/:id/movements',
    'POST /api/v1/products/:id/transfer',
    'POST /api/v1/products/stock-take',
    // Jira GRW-602 — the numbers typed into a stock take are kept as the owner walks the shelf.
    'PUT /api/v1/products/stock-take/draft',
    'DELETE /api/v1/products/stock-take/draft',
    // Jira GRW-598 — the sizes grid, one save, from a page of its own under Products.
    'PUT /api/v1/products/:id/variants',
    // Jira GRW-618 — the marketplace codes that point at those sizes, on a page of their own under Products.
    'PUT /api/v1/marketplace-codes',
    'DELETE /api/v1/marketplace-codes/:id',
    'POST /api/v1/product-categories',
    'PATCH /api/v1/product-categories/:id',
    'DELETE /api/v1/product-categories/:id',
  ],
  '/providers': [
    'POST /api/v1/providers',
    'PATCH /api/v1/providers/:id',
    'PATCH /api/v1/providers/:id/working-hours',
    'PATCH /api/v1/providers/:id/services',
    'PATCH /api/v1/providers/:id/availability-today',
    // Jira GRW-559 — a stylist's photo, from the staff edit screen. Same screen, same gate as
    // the rest of their record; the API narrows it further to owner/manager or the person themself.
    'POST /api/v1/providers/:id/photo',
    'DELETE /api/v1/providers/:id/photo',
  ],
  '/settings': [
    // Jira GRW-641 — which branch a marketplace sells from, on Settings › Online selling (a shop's, owner and manager's).
    'PUT /api/v1/channels/:id/branch',
    'POST /api/v1/billing/autopay',
    'POST /api/v1/team/invites',
    'PATCH /api/v1/team/members/:userId',
    // Jira GRW-470 — take a login away, from the Team panel.
    'DELETE /api/v1/team/members/:userId',
    'DELETE /api/v1/team/invites/:id',
    'POST /api/v1/settings/branch-reset',
    'POST /api/v1/settings/apply-to-all',
    'PATCH /api/v1/settings/profile',
    // Jira GRW-582 — Settings › GST and invoices. Owner-only like the rest of Settings, which is the gate.
    'PATCH /api/v1/settings/gst',
    'POST /api/v1/settings/branches/:id/close',
    'POST /api/v1/settings/branches/:id/make-main',
    'PATCH /api/v1/settings/branches/:id',
    'POST /api/v1/settings/logo',
    /*
     * Settings › Payments — the QR the till shows. Owner-only like the rest of
     * this screen: `canSee('/settings', role)` is false for both limited roles,
     * so the four of them are gated by the screen rather than by a control.
     */
    'POST /api/v1/settings/payment-qr',
    'DELETE /api/v1/settings/payment-qr',
    'POST /api/v1/settings/branches/:id/payment-qr',
    'DELETE /api/v1/settings/branches/:id/payment-qr',
    'PATCH /api/v1/settings/booking',
    'PATCH /api/v1/settings/reminders',
    'PATCH /api/v1/settings/working-hours',
  ],
  '/try-whatsapp': ['POST /api/v1/chat/start', 'POST /api/v1/chat/tap'],
  // Free times — the slot grid's hold and confirm.
  '/availability': ['POST /api/v1/holds', 'POST /api/v1/appointments'],
  // The Clients screen's "Add client" (the desk's Home links to it with ?add=1).
  '/customers': ['POST /api/v1/customers'],
  /*
   * Jira GRW-582 — the customer's receipt or GST invoice, offered on the Done screen at the end of taking a
   * payment. Classified by its SCREEN rather than as a control of its own: whoever may settle the bill may hand
   * over the document for it, which is the same gate `visit.recordPayment` already applies to the screen it sits
   * on. (It belongs in that action in shared too; the pin here is what this repo can check today, since the
   * installed @growza-app/shared is behind the API's source.)
   */
  '/appointments/new': ['POST /api/v1/bills/:visitKey/document', 'POST /api/v1/documents/:id/share'],
  // 0127 — returning a product against a settled bill on the Sales register (/sales is gated by guardScreen('/sales')).
  '/sales': ['POST /api/v1/sales/:visitKey/returns'],
};

/** Every signed-in person's own: the session says whose, and no role can widen it. */
const EVERY_ROLE = [
  'POST /api/v1/auth/change-password',
  'PUT /api/v1/me/language',
  // The account menu's "Add your name", offered to every role — a person's name is theirs (shared 1.0.6).
  'PUT /api/v1/me/name',
];

/** The writes the dashboard's API client can make, read from the client itself. */
function clientWrites(): Set<string> {
  const src = read('lib/api.ts');
  const verb: Record<string, string> = { post: 'POST', patch: 'PATCH', put: 'PUT', del: 'DELETE', uploadFile: 'POST' };
  const found = new Set<string>();
  // `[^()]` in the generic: a match cannot run from `function post<T>(path…` on into some later call's URL.
  for (const m of src.matchAll(/\b(post|patch|put|del|uploadFile)(?:<[^()]*?>)?\(\s*[`'](\/api\/v1\/[^`'?]*)/g)) {
    const pattern = m[2]!
      .split('/')
      // `${id}` is a parameter; `profile${atBranch(location)}` is a path with a query appended.
      .map((seg) => (seg.startsWith('${') ? ':id' : seg.replace(/\$\{.*$/, '')))
      .join('/');
    found.add(`${verb[m[1]!]} ${pattern}`);
  }
  // The two writes made outside the client (lib/lang.ts), so they are read here too.
  expect(read('lib/lang.ts')).toMatch(/fetch\('\/api\/v1\/me\/language', \{\s*method: 'PUT'/);
  found.add('PUT /api/v1/me/language');
  expect(read('lib/lang.ts')).toMatch(/fetch\('\/api\/v1\/me\/name', \{\s*method: 'PUT'/);
  found.add('PUT /api/v1/me/name');
  return found;
}

describe('3 — every write the dashboard can make is classified', () => {
  const writes = clientWrites();
  const byAction = new Set(ACTIONS.flatMap((a) => UI_ACTIONS[a].filter((k) => !k.startsWith('GET ')).map(normalise)));
  const byScreen = new Set(Object.values(SCREEN_WRITES).flat().map(normalise));
  const everyRole = new Set(EVERY_ROLE.map(normalise));

  it('the client was actually read', () => {
    expect(writes.size, 'no writes parsed out of lib/api.ts').toBeGreaterThan(30);
  });

  it('each is a gated control or on a gated screen — none is neither', () => {
    const loose = [...writes].filter((w) => !byAction.has(w) && !byScreen.has(w) && !everyRole.has(w));
    expect(loose, 'writes with no gate: add the control to UI_ACTIONS, or its screen to SCREEN_WRITES').toEqual([]);
  });

  it('and the tables name nothing the client no longer calls', () => {
    const stale = [...byScreen, ...everyRole].filter((w) => !writes.has(w));
    expect(stale, 'rows for writes the dashboard no longer makes').toEqual([]);
  });

  it('on a screen a limited role IS offered, the API serves every write on it to them', () => {
    for (const role of LIMITED) {
      for (const [screen, keys] of Object.entries(SCREEN_WRITES)) {
        if (!canSee(screen, role)) continue;
        for (const key of keys) expect(roleMayReach(role, ...splitRouteKey(key)), `${role} is offered ${screen}, which calls ${key}`).toBe(true);
      }
    }
  });

  it('what belongs to everybody is served to everybody', () => {
    for (const key of EVERY_ROLE) {
      for (const role of LIMITED) expect(roleMayReach(role, ...splitRouteKey(key)), `${role} · ${key}`).toBe(true);
    }
  });
});

describe('4 — a screen a limited role is not offered is closed at the page', () => {
  /**
   * Screens gated by something other than the nav, each for a stated reason.
   * Anything else a limited role is not offered must call `guardScreen` with
   * its own address, in its page or its segment's layout.
   */
  const OWN_GATE: Record<string, RegExp> = {
    /*
     * Jira GRW-582 — a customer's document is the same thing the Sales register is: a record of what a bill took.
     * It is gated as `/sales` rather than inventing a second answer to the same question, so a business that has
     * opened the register to its receptionist has opened the documents behind it too.
     */
    '/documents': /await guardScreen\('\/sales'\);/,
    // The header's control and this page ask the same action.
    '/search': /if \(!mayUse\(role, 'search'\)\) redirect\(/,
    // Its own tab gate (GRW-197): a tab they cannot open lands on one they can, none says so plainly.
    '/reports': /const firstAllowed = ALL_REPORT_TABS\.find\(canOpen\)/,
    // The centre button and this page ask the same action.
    '/appointments/new': /if \(!mayUse\(me\.member\?\.role, 'visit\.new', isWritable\(me\.tenant\?\.status\)\)\)/,
    // Jira GRW-556 — where a closed screen's address lands until the business is live: open to every role, and it
    // sends a live business Home, since the address means nothing then.
    '/not-live-yet': /isLive\(\(await api\.me\(\)\)\.tenant\?\.status\)\) redirect\('\/'\)/,
    /*
     * Jira GRW-564 — open to every role, like `/not-live-yet` above, and the
     * only screen in the product that reaches a human.
     *
     * It is NOT in `@growza-app/shared`'s role lists, deliberately. Those exist
     * so the API's own tests can check this nav against the API's allowlist,
     * and `/help` is not an API route: the page reads `/me` — which every role
     * may already call — and nothing else. Declaring it there would also put
     * the way out behind the problem, since a role list is the thing that
     * closes when a business is suspended.
     *
     * The regex pins the two things that make it safe to leave out of that
     * list: it asks `/me` and it renders contacts. A future edit that turns
     * this into a screen reading anything role-scoped fails here, which is
     * the moment it would owe shared a proper entry.
     */
    /*
     * QA, 2026-10-17 — the retail till is open to the FRONT DESK; the catalogue it sits under is not (cost prices,
     * delete, moving stock between branches are the owner's). So it guards its own address rather than its segment's,
     * and `canSee('/products/sell', …)` is what answers for it.
     */
    // Jira GRW-616 — the till has two addresses over one screen, as the shelf does: the page names the address it is guarded
    // under, and `SellProductScreen` calls `guardScreen(guard)` (pinned below).
    '/products/sell': /<SellProductScreen[^>]*guard="\/products\/sell"/,
    '/orders/new': /<SellProductScreen[^>]*guard="\/orders\/new"/,
    // Jira GRW-608 — the shelf and the register each have two addresses over one implementation: the page names the
    // address it is guarded under, and the screen (`*Screen.tsx`) is what calls `guardScreen(guard)` (pinned in areas.test.ts).
    // …and a page UNDER it that is not the shelf (the sizes grid, Jira GRW-598) guards itself under the same address.
    '/products': /<ProductsScreen[^>]*guard="\/products"|await guardScreen\('\/products'\);/,
    // Jira GRW-631 — the stock report is its own page under the shelf's address; it guards itself under the same one.
    '/stock/report': /await guardScreen\('\/stock'\);/,
    '/stock/sellers': /await guardScreen\('\/stock'\);/,
    '/stock': /<ProductsScreen[^>]*guard="\/stock"/,
    '/sales': /<SalesScreen[^>]*guard="\/sales"/,
    // Jira GRW-614 — Orders is its own screen, guarded at the page like the rest.
    '/orders': /await guardScreen\('\/orders'\);/,
    // `me.support` as a whole since the page lists options (each its own number): it reads the contacts
    // off /me, which every role may call, and nothing role-scoped.
    '/help': /const me = await api\.me\(\);[\s\S]*support = me\.support;/,
  };
  const offeredToBoth = (href: string) => LIMITED.every((role) => canSee(href, role));

  const pages = sources().filter((f) => f.endsWith(`${path.sep}page.tsx`));
  for (const file of pages) {
    const rel = path.relative(tenantDir, path.dirname(file)).split(path.sep).join('/');
    const href = rel === '' ? '/' : `/${rel}`;
    it(href, () => {
      const own = Object.keys(OWN_GATE).find((k) => href === k || href.startsWith(`${k}/`));
      if (own) {
        expect(readFileSync(file, 'utf8'), `${href} lost its own gate`).toMatch(OWN_GATE[own]!);
        return;
      }
      const segment = `/${rel.split('/')[0]}`;
      if (href === '/' || offeredToBoth(segment)) return;
      const layout = path.join(tenantDir, rel.split('/')[0]!, 'layout.tsx');
      const guarded = [file, layout].some((f) => {
        try {
          return readFileSync(f, 'utf8').includes(`await guardScreen('${segment}');`);
        } catch {
          return false;
        }
      });
      expect(guarded, `${href} is not offered to every limited role and does not call guardScreen('${segment}')`).toBe(true);
    });
  }
});

describe('the reverse — nothing a limited role may do is left without a control on purpose', () => {
  /**
   * A write the API serves a role, reachable from nothing that role is offered,
   * is dead permission: either the screen is missing or the grant should go.
   * Listed here so each one is a decision, not an accident. Found by this
   * story's audit and left open for the owner (Jira GRW-409):
   */
  const GRANTED_NOT_OFFERED: Record<string, string> = {
    // GRW-169 opened the diary's writes to the desk; Free times (/availability) is the only screen that makes
    // these two calls, and the desk is not offered it — they book through New booking (/bookings, /walk-ins).
    'POST /api/v1/holds': 'Free times is not in the receptionist’s nav',
    'POST /api/v1/appointments': 'Free times is not in the receptionist’s nav',
    // GRW-197 gave the desk the roster and the "not available today" toggle; the Staff screen is the owner's.
    'PATCH /api/v1/providers/:id/availability-today': 'the Staff screen is not in the receptionist’s nav',
    // GRW-293 — assigning a stylist to a counter sale afterwards; no screen calls it yet.
    'POST /api/v1/counter-sales/:id/assign-stylist': 'no dashboard control calls it yet',
  };

  for (const [role, allowed] of [['receptionist', RECEPTIONIST_ALLOWED], ['staff', STAFF_ALLOWED]] as const) {
    it(`${role}: every write they are granted has a control they are offered, or is listed`, () => {
      const offeredScreens = Object.keys(SCREEN_WRITES).filter((s) => canSee(s, role));
      const covered = new Set([
        ...ACTIONS.filter((a) => mayUse(role, a)).flatMap((a) => UI_ACTIONS[a]),
        ...offeredScreens.flatMap((s) => SCREEN_WRITES[s]!),
        ...EVERY_ROLE,
      ]);
      const uncovered = [...allowed].filter((k) => !k.startsWith('GET ') && !covered.has(k) && !(k in GRANTED_NOT_OFFERED));
      expect(uncovered, `${role} may make these writes and nothing offers them`).toEqual([]);
    });
  }

  it('and every listed gap is still a real grant', () => {
    for (const key of Object.keys(GRANTED_NOT_OFFERED)) expect(RECEPTIONIST_ALLOWED.has(key) || STAFF_ALLOWED.has(key), key).toBe(true);
  });
});
