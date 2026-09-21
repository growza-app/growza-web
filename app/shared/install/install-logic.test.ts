import { describe, expect, it } from 'vitest';
import { installBannerCopy } from './install-copy';
import {
  installModeFor,
  isInAppBrowser,
  parseDismissedAt,
  platformOf,
  SHOW_DELAY_MS,
  SNOOZE_MS,
  storageKeys,
  type InstallEnvironment,
} from './install-logic';

/** Real user agents, so the tests fail if the patterns drift from what phones send. */
const UA = {
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
  androidWebView:
    'Mozilla/5.0 (Linux; Android 14; SM-A546E; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/139.0.0.0 Mobile Safari/537.36',
  androidInstagram:
    'Mozilla/5.0 (Linux; Android 14; SM-A546E; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/139.0.0.0 Mobile Safari/537.36 Instagram 350.0.0.0',
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/139.0.0.0 Mobile/15E148 Safari/604.1',
  iphoneWebView: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  iphoneFacebook:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0.0]',
  ipadDesktopMode:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
  macChrome:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
  windowsFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:141.0) Gecko/20100101 Firefox/141.0',
};

const NOW = Date.UTC(2026, 8, 15, 10, 0, 0);

const env = (overrides: Partial<InstallEnvironment> = {}): InstallEnvironment => ({
  userAgent: UA.androidChrome,
  maxTouchPoints: 5,
  standalone: false,
  hasPrompt: false,
  installed: false,
  dismissedAt: null,
  now: NOW,
  ...overrides,
});

describe('the owner’s timing and Cancel (Jira GRW-265)', () => {
  it('appears 2–3 seconds after load', () => {
    expect(SHOW_DELAY_MS).toBeGreaterThanOrEqual(2_000);
    expect(SHOW_DELAY_MS).toBeLessThanOrEqual(3_000);
  });

  it('Cancel snoozes for exactly 7 days', () => {
    expect(SNOOZE_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe('the card reads like the browser’s "Install app" dialog', () => {
  it('title, app name, Cancel — the same on every phone', () => {
    for (const mode of ['prompt', 'ios', 'android-menu', 'in-app-android', 'in-app-ios'] as const) {
      const copy = installBannerCopy('salon', mode);
      expect(copy.title).toBe('Install app');
      expect(copy.appName).toBe('Growza');
      expect(copy.cancel).toBe('Cancel');
    }
  });
});

describe('AC-01 — where the browser can install: an Install button, and what happens next', () => {
  it('Android Chrome with a prompt', () => {
    expect(installModeFor(env({ hasPrompt: true }))).toBe('prompt');
    const copy = installBannerCopy('salon', 'prompt');
    expect(copy.install).toBe('Install');
    expect(copy.steps.join(' ')).toContain('Tap Install');
    expect(copy.steps.join(' ')).toContain('home screen');
  });

  it('desktop Chrome/Edge with a prompt', () => {
    expect(installModeFor(env({ userAgent: UA.macChrome, maxTouchPoints: 0, hasPrompt: true }))).toBe('prompt');
  });
});

describe('AC-02 — iPhone: steps instead of a button that could do nothing', () => {
  it('Safari and Chrome on iPhone', () => {
    expect(installModeFor(env({ userAgent: UA.iphoneSafari }))).toBe('ios');
    expect(installModeFor(env({ userAgent: UA.iphoneChrome }))).toBe('ios');
  });

  it('an iPad asking for the desktop site is still an iPad', () => {
    expect(platformOf(UA.ipadDesktopMode, 5)).toBe('ios');
    expect(platformOf(UA.ipadDesktopMode, 0)).toBe('desktop'); // a real Mac
  });

  it('the steps name the iPhone’s own labels, and there is no Install button', () => {
    const copy = installBannerCopy('salon', 'ios');
    expect(copy.steps.join(' ')).toContain('Share');
    expect(copy.steps.join(' ')).toContain('Add to Home Screen');
    expect(copy.install).toBeNull();
  });
});

describe('AC-03 — never inside the installed app, or once installed', () => {
  it('standalone shows nothing, even with a prompt', () => {
    expect(installModeFor(env({ standalone: true, hasPrompt: true }))).toBeNull();
  });

  it('a device that has installed shows nothing in the browser either', () => {
    expect(installModeFor(env({ installed: true, hasPrompt: true }))).toBeNull();
    expect(installModeFor(env({ userAgent: UA.iphoneSafari, installed: true }))).toBeNull();
  });
});

describe('AC-04 — Cancel snoozes a week', () => {
  it('hidden one minute after Cancel', () => {
    expect(installModeFor(env({ hasPrompt: true, dismissedAt: NOW - 60_000 }))).toBeNull();
  });

  it('boundary: still hidden one second before the week is up', () => {
    expect(installModeFor(env({ hasPrompt: true, dismissedAt: NOW - SNOOZE_MS + 1_000 }))).toBeNull();
  });

  it('boundary: offered again once the week has passed', () => {
    expect(installModeFor(env({ hasPrompt: true, dismissedAt: NOW - SNOOZE_MS }))).toBe('prompt');
    expect(installModeFor(env({ hasPrompt: true, dismissedAt: NOW - 8 * 24 * 60 * 60 * 1000 }))).toBe('prompt');
  });

  it('an unreadable stored value counts as never cancelled, not cancelled forever', () => {
    expect(parseDismissedAt(null)).toBeNull();
    expect(parseDismissedAt('garbage')).toBeNull();
    expect(parseDismissedAt('0')).toBeNull();
    expect(parseDismissedAt(String(NOW))).toBe(NOW);
  });
});

describe('AC-05 — the admin portal is its own app', () => {
  it('salon and admin remember install and Cancel separately', () => {
    expect(storageKeys('salon').installed).not.toBe(storageKeys('admin').installed);
    expect(storageKeys('salon').dismissedAt).not.toBe(storageKeys('admin').dismissedAt);
  });

  it('the card names Growza Admin', () => {
    expect(installBannerCopy('admin', 'prompt').appName).toBe('Growza Admin');
  });
});

describe('AC-06 — inside WhatsApp, Instagram, Facebook: open in the real browser first', () => {
  it('recognises in-app browsers', () => {
    expect(isInAppBrowser(UA.androidWebView)).toBe(true);
    expect(isInAppBrowser(UA.androidInstagram)).toBe(true);
    expect(isInAppBrowser(UA.iphoneWebView)).toBe(true);
    expect(isInAppBrowser(UA.iphoneFacebook)).toBe(true);
  });

  it('does not mistake real browsers for in-app ones', () => {
    for (const ua of [UA.androidChrome, UA.iphoneSafari, UA.iphoneChrome, UA.macChrome, UA.windowsFirefox]) {
      expect(isInAppBrowser(ua), ua).toBe(false);
    }
  });

  it('Android in-app says Chrome, iPhone in-app says Safari — never an Install button', () => {
    expect(installModeFor(env({ userAgent: UA.androidWebView, hasPrompt: true }))).toBe('in-app-android');
    expect(installModeFor(env({ userAgent: UA.iphoneFacebook }))).toBe('in-app-ios');
    expect(installBannerCopy('salon', 'in-app-android').steps.join(' ')).toContain('Open in Chrome');
    expect(installBannerCopy('salon', 'in-app-ios').steps.join(' ')).toContain('Open in Safari');
    expect(installBannerCopy('salon', 'in-app-android').install).toBeNull();
  });
});

describe('boundaries — nothing where it could only be wrong', () => {
  it('Android Chrome before any prompt: the ⋮ menu steps', () => {
    expect(installModeFor(env())).toBe('android-menu');
    expect(installBannerCopy('salon', 'android-menu').steps.join(' ')).toContain('Install app');
  });

  it('desktop without a prompt shows nothing — Firefox cannot install, Chrome usually already has', () => {
    expect(installModeFor(env({ userAgent: UA.windowsFirefox, maxTouchPoints: 0 }))).toBeNull();
    expect(installModeFor(env({ userAgent: UA.macChrome, maxTouchPoints: 0 }))).toBeNull();
  });
});

describe('the install banner in Hindi (Jira GRW-364)', () => {
  it('speaks Hindi for the salon app in every mode, and keeps the install button only where it can install', () => {
    for (const mode of ['prompt', 'ios', 'android-menu', 'in-app-android', 'in-app-ios'] as const) {
      const c = installBannerCopy('salon', mode, 'hi');
      expect(c.title).toBe('ऐप इंस्टॉल करें');
      expect(c.cancel).toBe('रद्द करें');
      expect(c.steps.length).toBeGreaterThan(1);
      expect(c.install === null).toBe(installBannerCopy('salon', mode).install === null);
    }
  });
  it('leaves the admin app in English', () => {
    expect(installBannerCopy('admin', 'prompt', 'hi').title).toBe('Install app');
  });
});
