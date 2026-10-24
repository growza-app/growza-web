import { describe, expect, it } from 'vitest';
import { isInstalled, isIos, pushBlocker, urlBase64ToUint8Array } from './push-alerts';

/**
 * Jira GRW-647 — why a phone cannot be alerted, decided before anything is offered.
 *
 * The iOS case is the one that earns most of this file. Web push on an iPhone works only once the app is on
 * the Home Screen, and in a Safari TAB the APIs are simply absent — so the naive check reports "this browser
 * can't do notifications", which is both wrong and a dead end. Half this product's owners are on iPhones.
 */

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';
const IPAD_AS_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120';

interface FakeWin {
  userAgent: string;
  maxTouchPoints?: number;
  standalone?: boolean;
  displayMode?: boolean;
  push?: boolean;
  permission?: NotificationPermission;
}

/** A window with only the bits `pushBlocker` reads — enough to answer, and nothing a jsdom would add by accident. */
function win(o: FakeWin): Window {
  const navigator: Record<string, unknown> = { userAgent: o.userAgent, maxTouchPoints: o.maxTouchPoints ?? 0 };
  if (o.standalone !== undefined) navigator.standalone = o.standalone;
  if (o.push !== false) navigator.serviceWorker = {};

  const w: Record<string, unknown> = {
    navigator,
    matchMedia: () => ({ matches: o.displayMode ?? false }),
  };
  if (o.push !== false) {
    w.PushManager = function PushManager() {};
    w.Notification = { permission: o.permission ?? 'default' };
  }
  return w as unknown as Window;
}

describe('isIos', () => {
  it('knows an iPhone', () => expect(isIos(win({ userAgent: IPHONE }))).toBe(true));
  it('knows an Android is not one', () => expect(isIos(win({ userAgent: ANDROID }))).toBe(false));
  it('knows a real Mac is not one', () => expect(isIos(win({ userAgent: MAC }))).toBe(false));

  /** An iPad on iPadOS 13+ claims to be a Mac. The touch points are what give it away. */
  it('sees through an iPad pretending to be a Mac', () => {
    expect(isIos(win({ userAgent: IPAD_AS_MAC, maxTouchPoints: 5 }))).toBe(true);
  });
});

describe('isInstalled', () => {
  it('trusts Safari\'s own flag, which is the only one iOS answers', () => {
    expect(isInstalled(win({ userAgent: IPHONE, standalone: true }))).toBe(true);
  });

  it('takes display-mode on everything else', () => {
    expect(isInstalled(win({ userAgent: ANDROID, displayMode: true }))).toBe(true);
  });

  it('is false in a plain tab', () => {
    expect(isInstalled(win({ userAgent: ANDROID }))).toBe(false);
  });
});

describe('pushBlocker', () => {
  it('lets an installed Android through', () => {
    expect(pushBlocker(true, win({ userAgent: ANDROID, displayMode: true }))).toBeNull();
  });

  it('lets an ordinary desktop Chrome tab through — install is an iOS rule, not a universal one', () => {
    expect(pushBlocker(true, win({ userAgent: MAC }))).toBeNull();
  });

  it('tells an iPhone in a tab to install first, rather than that its browser cannot do it', () => {
    // No push APIs at all, which is exactly how iOS Safari presents in a tab.
    expect(pushBlocker(true, win({ userAgent: IPHONE, push: false }))).toBe('install-first');
  });

  it('tells an iPhone to install first even where the APIs happen to exist', () => {
    expect(pushBlocker(true, win({ userAgent: IPHONE, standalone: false }))).toBe('install-first');
  });

  it('lets an installed iPhone through', () => {
    expect(pushBlocker(true, win({ userAgent: IPHONE, standalone: true }))).toBeNull();
  });

  it('says unsupported for a browser with no push and no iOS excuse', () => {
    expect(pushBlocker(true, win({ userAgent: ANDROID, push: false }))).toBe('unsupported');
  });

  it('reports a denied permission as blocked — only the person can undo that', () => {
    expect(pushBlocker(true, win({ userAgent: ANDROID, displayMode: true, permission: 'denied' }))).toBe('blocked');
  });

  it('reports a deployment with no VAPID key, so the screen does not blame the phone', () => {
    expect(pushBlocker(false, win({ userAgent: ANDROID, displayMode: true }))).toBe('not-configured');
  });

  /** A denied permission is the person's own setting; a missing key is ours. Theirs is the more useful thing to say. */
  it('reports a denied permission ahead of a missing key', () => {
    expect(pushBlocker(false, win({ userAgent: ANDROID, displayMode: true, permission: 'denied' }))).toBe('blocked');
  });
});

describe('urlBase64ToUint8Array', () => {
  it('decodes an unpadded base64url key', () => {
    // "Hello" — base64url, no padding.
    expect(Array.from(urlBase64ToUint8Array('SGVsbG8'))).toEqual([72, 101, 108, 108, 111]);
  });

  it('decodes the - and _ that base64url uses and base64 does not', () => {
    // 0xFB 0xEF 0xBE in base64 is "++++"-ish; base64url writes it with - and _.
    const bytes = urlBase64ToUint8Array('-_8');
    expect(Array.from(bytes)).toEqual([251, 255]);
  });

  it('produces a plain ArrayBuffer, which is what applicationServerKey requires', () => {
    expect(urlBase64ToUint8Array('SGVsbG8').buffer).toBeInstanceOf(ArrayBuffer);
  });

  it('handles a real 65-byte VAPID key without throwing', () => {
    const key = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
    expect(urlBase64ToUint8Array(key)).toHaveLength(65);
  });
});
