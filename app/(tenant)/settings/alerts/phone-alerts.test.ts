import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../../messages/en.json';
import hi from '../../../../messages/hi.json';
import { ALERT_KINDS } from '../../lib/push-alerts';
import { SETTINGS_GROUPS } from '../nav-data';
import { wholeBusiness } from '../../lib/branch-routes';

const here = path.dirname(new URL(import.meta.url).pathname);
const read = (p: string) => readFileSync(path.join(here, p), 'utf-8');

/**
 * Jira GRW-647 — the promises this screen makes that a unit test can hold it to.
 *
 * Two of them are performance promises the ticket was written around, and both are invisible in behaviour
 * until they are broken: nothing may touch the push APIs on app start-up, and the permission prompt must come
 * before anything is saved. A regression in either would look fine on screen.
 */

describe('nothing runs until somebody asks for it', () => {
  it('the app\'s start-up path does not touch push at all', () => {
    const register = read('../../components/PwaRegister.tsx');
    // `PwaRegister` runs on every page load. It registers the worker and must do nothing else — a
    // `pushManager` call here would cost every owner on every screen, for a feature most have not enabled.
    expect(register).not.toMatch(/pushManager|requestPermission|Notification/);
  });

  it('only the alerts screen subscribes a device', () => {
    const form = read('AlertsForm.tsx');
    expect(form).toContain('subscribeThisDevice');
    // And it CALLS it inside the toggle, not on mount: the `useEffect`s above read state, they ask for nothing.
    // The import at the top names it, so the check is for the call — `subscribeThisDevice(`.
    expect(form).toMatch(/const toggle = useCallback\(/);
    expect(form.slice(0, form.indexOf('const toggle'))).not.toContain('subscribeThisDevice(');
  });

  it('asks the browser before it saves, so a refused prompt leaves nothing behind', () => {
    const form = read('AlertsForm.tsx');
    const subscribe = form.indexOf('subscribeThisDevice(');
    const save = form.indexOf('api.setAlertPref(');
    expect(subscribe).toBeGreaterThan(-1);
    expect(save).toBeGreaterThan(subscribe);
  });

  it('does not write a preference when the browser refuses', () => {
    // A blocker comes back as a string, and that branch returns before `api.setAlertPref` is reached.
    const form = read('AlertsForm.tsx');
    const branch = form.indexOf("if (typeof result === 'string')");
    expect(branch).toBeGreaterThan(-1);
    const toSave = form.slice(branch, form.indexOf('api.setAlertPref('));
    expect(toSave).toMatch(/\breturn;/);
  });
});

describe('the screen is the owner\'s', () => {
  it('the nav row is owner-only', () => {
    const row = SETTINGS_GROUPS.flatMap((g) => g.rows).find((r) => r.key === 'phoneAlerts');
    expect(row?.href).toBe('/settings/alerts');
    expect(row?.ownerOnly).toBe(true);
  });

  it('the nav list actually reads that flag', () => {
    expect(read('../SettingsNavList.tsx')).toContain("(!row.ownerOnly || role === 'owner')");
  });

  it('the page sends anybody else back, rather than drawing switches the API will refuse', () => {
    expect(read('page.tsx')).toMatch(/me\.member\.role !== 'owner'\) redirect\('\/settings'\)/);
  });
});

describe('it belongs to a person, not a branch', () => {
  it('shows no branch picker', () => {
    expect(wholeBusiness('/settings/alerts')).toBe(true);
  });

  it('is listed in the whole-business group, beside the other things that exist once', () => {
    const group = SETTINGS_GROUPS.find((g) => g.rows.some((r) => r.key === 'phoneAlerts'));
    expect(group?.key).toBe('business');
  });
});

/** The shape this screen reads out of a message file. The files themselves are typed structurally by their contents. */
interface AlertsCopy {
  kinds: Record<string, { title: string; hint: string } | undefined>;
  blockers: Record<string, string | undefined>;
}

const copyFor = (messages: unknown): AlertsCopy => (messages as { settingsAlerts: AlertsCopy }).settingsAlerts;

describe('copy', () => {
  it('names every kind in both languages', () => {
    for (const kind of ALERT_KINDS) {
      for (const [lang, messages] of [['en', en], ['hi', hi]] as const) {
        const copy = copyFor(messages);
        expect(copy.kinds[kind]?.title, `${lang} title for ${kind}`).toBeTruthy();
        expect(copy.kinds[kind]?.hint, `${lang} hint for ${kind}`).toBeTruthy();
      }
    }
  });

  it('explains every blocker in both languages — each one has a different next step', () => {
    for (const blocker of ['unsupported', 'install-first', 'blocked', 'not-configured']) {
      for (const [lang, messages] of [['en', en], ['hi', hi]] as const) {
        expect(copyFor(messages).blockers[blocker], `${lang} blocker ${blocker}`).toBeTruthy();
      }
    }
  });

  /** Two rows a tap apart must not describe themselves the same way (the old sub said "alerts and reminders"). */
  it('does not let Notifications and Phone alerts read as the same screen', () => {
    const rows: Record<string, { label: string; sub: string } | undefined> = en.settingsHub.rows;
    expect(rows.notifications?.sub).not.toMatch(/alert/i);
    expect(rows.notifications?.sub).toMatch(/WhatsApp/);
    expect(rows.phoneAlerts?.label).toBe('Phone alerts');
  });
});

describe('the service worker', () => {
  const sw = readFileSync(path.join(here, '../../../../public/sw.js'), 'utf-8');

  it('was bumped, or the listeners never reach a device that already has the old one', () => {
    expect(sw).toMatch(/const CACHE_VERSION = 'v7';/);
  });

  it('shows a notification for every push, even one it cannot read', () => {
    // userVisibleOnly is a promise to the browser. A push that showed nothing would have Chrome post its own
    // "this site was updated in the background" notice instead.
    expect(sw).toContain("self.registration.showNotification");
    expect(sw).toMatch(/catch \{\s*payload = \{\};\s*\}/);
  });

  it('only ever opens a path inside the app', () => {
    // An absolute URL in a payload must not become a window we open — the payload comes through Google's and
    // Apple's servers, and `startsWith('/')` is what keeps that from being an open redirect.
    expect(sw).toMatch(/payload\.url\.startsWith\('\/'\) \? payload\.url : '\/'/);
  });

  it('focuses the app the owner already has open rather than opening a second one', () => {
    expect(sw).toContain('includeUncontrolled: true');
  });

  it('leaves the fetch handler alone — caching behaviour does not change', () => {
    expect(sw.indexOf("addEventListener('push'")).toBeGreaterThan(sw.indexOf("addEventListener('fetch'"));
    expect(sw).not.toMatch(/caches\.(put|match)\([^)]*notification/i);
  });
});
