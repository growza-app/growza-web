/**
 * Jira GRW-265 · GRW-270 — whether to offer "Install app", and what to offer.
 *
 * Kept free of `window` so every decision here is a plain function of what the
 * browser reported. The banner component reads the browser; this decides.
 */

/** The two installable apps on this origin: the salon dashboard and the admin portal. */
export type InstallApp = 'salon' | 'admin';

export type InstallMode =
  /** The browser handed us an install prompt: Install opens the real install dialog. */
  | 'prompt'
  /** iPhone/iPad: no prompt exists — steps through Share → Add to Home Screen. */
  | 'ios'
  /** Android without a prompt (yet): steps through the ⋮ menu. */
  | 'android-menu'
  /** Inside WhatsApp/Instagram/etc. on Android: nothing can install here — open in Chrome. */
  | 'in-app-android'
  /** Inside an app's browser on iPhone: open in Safari first. */
  | 'in-app-ios';

export type Platform = 'ios' | 'android' | 'desktop';

/** "2–3 seconds after the page is loaded" — the owner's words. */
export const SHOW_DELAY_MS = 2_500;

/** Cancel hides the banner on that device for a week, then it may offer again. */
export const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

/** Remembered per app, so the salon app and the admin portal are offered independently. */
export function storageKeys(app: InstallApp): { dismissedAt: string; installed: string } {
  return {
    dismissedAt: `growza.install.${app}.dismissedAt`,
    installed: `growza.install.${app}.installed`,
  };
}

export function platformOf(userAgent: string, maxTouchPoints: number): Platform {
  if (/iPhone|iPad|iPod/.test(userAgent)) return 'ios';
  // iPadOS asks for the desktop site and reports itself as a Mac; the touch
  // screen is what gives it away.
  if (/Macintosh/.test(userAgent) && maxTouchPoints > 1) return 'ios';
  if (/Android/.test(userAgent)) return 'android';
  return 'desktop';
}

/**
 * A browser embedded in another app. Links to Growza mostly arrive over
 * WhatsApp, and nothing opened inside it can be installed — the only useful
 * instruction is to open the page in the phone's real browser.
 */
export function isInAppBrowser(userAgent: string): boolean {
  if (/FBAN|FBAV|FB_IAB|Instagram|Line\/|WhatsApp|Snapchat|MicroMessenger/.test(userAgent)) return true;
  // Android WebView marks itself `; wv)`.
  if (/Android/.test(userAgent) && /; wv\)/.test(userAgent)) return true;
  // An iOS web view is WebKit without the `Safari/` token every real iOS
  // browser (Safari, Chrome, Edge, Firefox) still carries.
  if (/iPhone|iPad|iPod/.test(userAgent) && !/Safari\//.test(userAgent)) return true;
  return false;
}

export interface InstallEnvironment {
  userAgent: string;
  maxTouchPoints: number;
  /** Running as the installed app (`display-mode: standalone` / `navigator.standalone`). */
  standalone: boolean;
  /** A `beforeinstallprompt` event has been captured for this page. */
  hasPrompt: boolean;
  /** This device has already installed this app (remembered, or `appinstalled` fired). */
  installed: boolean;
  /** When Cancel was last pressed, or null. */
  dismissedAt: number | null;
  now: number;
}

/**
 * Jira GRW-679 (UX-03) — where the offer may appear.
 *
 * It used to appear on every dashboard page, 2.5 s after load: over New booking with a client half picked, over
 * Services mid-edit. An offer to install is never urgent, so on the dashboard it waits for Home — the screen people
 * land on with nothing in their hands. The sign-in and join pages keep it (nothing is in progress there either), and
 * the admin portal is unchanged.
 */
export function mayOfferOn(app: InstallApp, pathname: string): boolean {
  if (app !== 'salon') return true;
  return pathname === '/' || pathname === '/login' || pathname === '/join' || pathname.startsWith('/join/');
}

/**
 * Anything that is already asking for the person's attention: a sheet, a dialog, a menu over the page. The offer does
 * not open on top of one; it waits for the next visit to Home. The banner is itself a dialog, so it is left out.
 */
export const SOMETHING_OPEN_SELECTOR =
  '[role="dialog"]:not(.install-banner), dialog[open], .sheet-backdrop, .modal-backdrop, .admin-dialog-backdrop, .fab-menu';

export function isSnoozed(dismissedAt: number | null, now: number): boolean {
  return dismissedAt !== null && Number.isFinite(dismissedAt) && now - dismissedAt < SNOOZE_MS;
}

/** What the banner should offer, or null for no banner at all. */
export function installModeFor(env: InstallEnvironment): InstallMode | null {
  if (env.standalone || env.installed) return null;
  if (isSnoozed(env.dismissedAt, env.now)) return null;

  const platform = platformOf(env.userAgent, env.maxTouchPoints);

  if (isInAppBrowser(env.userAgent)) {
    if (platform === 'ios') return 'in-app-ios';
    if (platform === 'android') return 'in-app-android';
    return null;
  }
  if (env.hasPrompt) return 'prompt';
  if (platform === 'ios') return 'ios';
  if (platform === 'android') return 'android-menu';
  // Desktop without a prompt: Firefox cannot install at all, and a Chromium
  // browser that has not offered one has usually already installed the app.
  // A banner that could only show wrong steps is worse than none.
  return null;
}

/** Reads a stored timestamp back, treating anything unreadable as "never". */
export function parseDismissedAt(raw: string | null): number | null {
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * 2026-11-07 — "Growza has a new icon", for the iPhone.
 *
 * iOS copies an installed web app's icon once, when it is added to the home screen, and never again: a new icon reaches
 * an iPhone only if the person removes the app and adds it back. Android's Chrome updates it by itself, so only an
 * iPhone or iPad running the installed app is told — once per icon, keyed on the icon's own content hash, so the next
 * icon change asks again and nothing else ever does.
 *
 * A phone that added the app after the change has the new icon already; we cannot tell it from one that did not, so the
 * note's words hold for both ("if your home screen still shows the old one").
 */
export function iconNoteKey(appleTouchUrl: string): string {
  const hash = /\.([0-9a-f]{8})\.png$/.exec(appleTouchUrl)?.[1] ?? appleTouchUrl;
  return `growza.icon-note.${hash}`;
}

export function iconNoteDue(env: { userAgent: string; maxTouchPoints: number; standalone: boolean; seen: boolean }): boolean {
  return env.standalone && !env.seen && platformOf(env.userAgent, env.maxTouchPoints) === 'ios';
}
