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
    'clients.list': true,
    'client.profile': true,
    'client.edit': true,
    'attendance.mark': true,
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
    'clients.list': false,
    'client.profile': false, // GRW-199 — never grantable, even with the Clients report tab
    'client.edit': false,
    'attendance.mark': false, // GRW-200 — their own record, read-only
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
    expect(read('components/HeaderSearch.tsx')).toMatch(/if \(!useMayUse\('search'\)\) return null;/);
  });

  const GATES: Array<[file: string, gate: RegExp]> = [
    ['components/home/parts.tsx', /<HeaderSearch wide \/>/],
    ['components/MobileChrome.tsx', /const mayBook = mayUse\(role, 'visit\.new'\);/],
    ['components/home/OwnerHome.tsx', /const mayBook = mayUse\(p\.role, 'visit\.new'\);[\s\S]*const mayRecordPayment = mayUse\(p\.role, 'visit\.recordPayment'\);/],
    // Jira GRW-404 moved the desk's rows onto the token board, so the give and pay buttons are gated there.
    ['components/home/TokenBoard.tsx', /const mayGive = useMayUse\('queue\.give'\);[\s\S]*\{mayGive \? \(\s*<button type="button" className="hm-give"/],
    ['components/home/BookedToday.tsx', /const mayArrive = useMayUse\('token\.arrive'\);[\s\S]*\{mayArrive \? \(/],
    ['components/ClientProfileCard.tsx', /\{profile && !editing && mayEdit && \(\s*<button type="button" className="cpc-edit-open"/],
    ['layout.tsx', /canPayOnline = \(me\.payments\?\.online \?\? false\) && mayUse\(role, 'billing\.payNow'\);/],
    ['reports/ReportsClient.tsx', /const onClient = useMayUse\('client\.profile'\) \? setOpenClientId : undefined;/],
    ['reports/ReportsClient.tsx', /onSegment=\{mayListClients \? goToSegment : undefined\}/],
    ['attendance/[providerId]/page.tsx', /const isOwnRecord = !mayUse\(me\.member\?\.role, 'attendance\.mark'\);/],
    ['appointments/new/page.tsx', /if \(!mayUse\(me\.member\?\.role, 'visit\.new'\)\) \{\s*redirect\('\/appointments'\);/],
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
  '/providers': [
    'POST /api/v1/providers',
    'PATCH /api/v1/providers/:id',
    'PATCH /api/v1/providers/:id/working-hours',
    'PATCH /api/v1/providers/:id/services',
    'PATCH /api/v1/providers/:id/availability-today',
  ],
  '/settings': [
    'POST /api/v1/billing/autopay',
    'POST /api/v1/team/invites',
    'PATCH /api/v1/team/members/:userId',
    // Jira GRW-470 — take a login away, from the Team panel.
    'DELETE /api/v1/team/members/:userId',
    'DELETE /api/v1/team/invites/:id',
    'POST /api/v1/settings/branch-reset',
    'POST /api/v1/settings/apply-to-all',
    'PATCH /api/v1/settings/profile',
    'POST /api/v1/settings/branches/:id/close',
    'POST /api/v1/settings/branches/:id/make-main',
    'PATCH /api/v1/settings/branches/:id',
    'POST /api/v1/settings/logo',
    'PATCH /api/v1/settings/booking',
    'PATCH /api/v1/settings/reminders',
    'PATCH /api/v1/settings/working-hours',
  ],
  '/try-whatsapp': ['POST /api/v1/chat/start', 'POST /api/v1/chat/tap'],
  // Free times — the slot grid's hold and confirm.
  '/availability': ['POST /api/v1/holds', 'POST /api/v1/appointments'],
  // The Clients screen's "Add client" (the desk's Home links to it with ?add=1).
  '/customers': ['POST /api/v1/customers'],
};

/** Every signed-in person's own: the session says whose, and no role can widen it. */
const EVERY_ROLE = ['POST /api/v1/auth/change-password', 'PUT /api/v1/me/language'];

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
  // The one write made outside the client (lib/lang.ts), so it is read here too.
  expect(read('lib/lang.ts')).toMatch(/fetch\('\/api\/v1\/me\/language', \{\s*method: 'PUT'/);
  found.add('PUT /api/v1/me/language');
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
    // The header's control and this page ask the same action.
    '/search': /if \(!mayUse\(role, 'search'\)\) redirect\(/,
    // Its own tab gate (GRW-197): a tab they cannot open lands on one they can, none says so plainly.
    '/reports': /const firstAllowed = ALL_REPORT_TABS\.find\(canOpen\)/,
    // The centre button and this page ask the same action.
    '/appointments/new': /if \(!mayUse\(me\.member\?\.role, 'visit\.new'\)\)/,
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
    for (const key of Object.keys(GRANTED_NOT_OFFERED)) expect(RECEPTIONIST_ALLOWED.has(key), key).toBe(true);
  });
});
