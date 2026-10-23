import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../../messages/en.json';
import hi from '../../../../messages/hi.json';
import { ALERT_KINDS, ALERT_MESSAGE_KEY } from '../../lib/push-alerts';
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
        const key = ALERT_MESSAGE_KEY[kind];
        expect(copy.kinds[key]?.title, `${lang} title for ${kind}`).toBeTruthy();
        expect(copy.kinds[key]?.hint, `${lang} hint for ${kind}`).toBeTruthy();
      }
    }
  });

  /**
   * The bug this test did not catch the first time, found by looking at the screen at 344px.
   *
   * next-intl reads `.` in a key as a NAMESPACE separator, so `t('kinds.booking.new.title')` goes looking for
   * `kinds → booking → new → title` and renders the raw key when it finds nothing. The first version of this
   * file read the JSON with `copy.kinds[kind]` — a direct property lookup, which happily found the literal
   * `"booking.new"` key that next-intl never would. Four labels shipped as `settingsAlerts.kinds.booking.new.title`
   * on screen with a green test suite.
   */
  it('has no dot in any key under settingsAlerts — next-intl would read it as a namespace', () => {
    const dotted: string[] = [];
    const walk = (node: unknown, path: string) => {
      if (typeof node !== 'object' || node === null) return;
      for (const [key, value] of Object.entries(node)) {
        if (key.includes('.')) dotted.push(`${path}${key}`);
        walk(value, `${path}${key}.`);
      }
    };
    for (const [lang, messages] of [['en', en], ['hi', hi]] as const) {
      dotted.length = 0;
      walk(copyFor(messages), 'settingsAlerts.');
      expect(dotted, `${lang} keys next-intl cannot reach`).toEqual([]);
    }
  });

  it('every kind has a message key, and they are all distinct', () => {
    const keys = ALERT_KINDS.map((k) => ALERT_MESSAGE_KEY[k]);
    expect(keys.filter(Boolean)).toHaveLength(ALERT_KINDS.length);
    expect(new Set(keys).size).toBe(ALERT_KINDS.length);
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

describe('whoever is signed in owns this device', () => {
  const form = read('AlertsForm.tsx');

  /**
   * Review 2026-10-24. `getSubscription()` is per ORIGIN and knows nothing about who is signed in, so on the
   * shop tablet the second owner's browser hands back the first owner's subscription. Registering only when
   * the browser has none left the row owned by somebody who had gone home: their phone kept buzzing, and the
   * person actually standing there got nothing and no way to find out.
   */
  it('registers the device on every enable, not only the first', () => {
    expect(form).toMatch(/if \(next\) \{/);
    expect(form).not.toMatch(/if \(next && !thisDevice\)/);
  });

  it('still only registers when switching ON — turning one off asks the browser for nothing', () => {
    const guard = form.slice(form.indexOf('if (next) {'), form.indexOf('await api.setAlertPref('));
    expect(guard).toContain('subscribeThisDevice');
    expect(form.indexOf('if (next) {')).toBeLessThan(form.indexOf('await api.setAlertPref('));
  });

  it('saves the device before the preference, so a refused prompt leaves nothing behind', () => {
    expect(form.indexOf('api.saveAlertDevice(')).toBeLessThan(form.indexOf('api.setAlertPref('));
  });
});

describe('the switch is big enough to hit', () => {
  const css = readFileSync(path.join(here, '../../styles/96-phone-alerts.css'), 'utf-8');

  /**
   * `90-accessibility.css` excludes `.switch` from the 44px rule it gives every other checkbox label
   * (`label:not(.switch)`), because the shared switch is also used inline in tight rows. This screen is a list
   * of four with room to spare, so it pays the padding and keeps the target. Measured at 344px: 44x56.
   */
  it('pads the 21px track out to a 44px target without moving it', () => {
    const rule = css.slice(css.indexOf('.al-row .switch {'));
    expect(rule).toMatch(/box-sizing: content-box;/);
    expect(rule).toMatch(/padding: 10px;/);
    // The negative margin is what keeps the row's layout identical to the unpadded version.
    expect(rule).toMatch(/margin: -10px;/);
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

  /**
   * Review 2026-10-24 — the first version focused only when `navigate` REJECTED, so on the success path a
   * background window was navigated and never raised: from the owner's side the notification just vanished.
   */
  it('brings the window forward on the success path too, not only when navigate fails', () => {
    const click = sw.slice(sw.indexOf("addEventListener('notificationclick'"));
    expect(click).toMatch(/\.then\(\(navigated\) => \(navigated \?\? client\)\.focus\(\)\)/);
    expect(click).toMatch(/\.catch\(\(\) => client\.focus\(\)\)/);
  });

  it('leaves the fetch handler alone — caching behaviour does not change', () => {
    expect(sw.indexOf("addEventListener('push'")).toBeGreaterThan(sw.indexOf("addEventListener('fetch'"));
    expect(sw).not.toMatch(/caches\.(put|match)\([^)]*notification/i);
  });
});
