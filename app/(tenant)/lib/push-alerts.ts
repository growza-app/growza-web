/**
 * Jira GRW-647 — the browser half of phone alerts.
 *
 * Everything here is deliberately OUT of the app's start-up path. `PwaRegister` registers the service worker on
 * every page load and always has; none of this runs until somebody opens Settings › Phone alerts and turns
 * something on. An owner who never does pays nothing for the feature existing.
 */

/** The four kinds, in the order the screen lists them. Mirrors the API's `ALERT_KINDS`. */
export const ALERT_KINDS = ['booking.new', 'booking.cancelled', 'walkin.waiting', 'day.summary'] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

/**
 * Why the switches cannot be used, when they cannot.
 *
 * Four separate answers rather than one "unsupported", because the owner's next step differs for every one of
 * them and a screen that says only "not available" leaves them nowhere to go:
 *
 * - `unsupported` — the browser has no push at all. Nothing to do.
 * - `install-first` — iOS Safari in a TAB. Web push works there only once the app is on the Home Screen
 *   (16.4+), and the permission prompt does not even appear until it is. Without this the screen would offer a
 *   switch that silently fails, which is how an owner concludes the feature is broken.
 * - `blocked` — the person has denied notifications for this site. The browser will not ask again; only they
 *   can undo it, in site settings.
 * - `not-configured` — this deployment has no VAPID keys. Nothing is wrong with their phone.
 */
export type PushBlocker = 'unsupported' | 'install-first' | 'blocked' | 'not-configured';

/**
 * A kind's name in the message files.
 *
 * next-intl reads `.` in a key as a NAMESPACE separator, so `t('kinds.booking.new.title')` looks for
 * `kinds → booking → new → title` and finds nothing — it renders the raw key on screen. Found at 344px, not by
 * a test: the test read the JSON directly and never went through next-intl. The kinds keep their dotted names,
 * because that is what the database's CHECK constraint and the outbox payload say; only the message keys differ.
 */
// `as const satisfies`, not an annotation: the values must stay LITERAL so `kinds.${ALERT_MESSAGE_KEY[kind]}.title`
// resolves to a key next-intl's types know. Widened to `string` it compiles to `kinds.${string}.title`, which they
// reject — and that rejection is the second guard against this bug, after the test.
export const ALERT_MESSAGE_KEY = {
  'booking.new': 'bookingNew',
  'booking.cancelled': 'bookingCancelled',
  'walkin.waiting': 'walkinWaiting',
  'day.summary': 'daySummary',
} as const satisfies Record<AlertKind, string>;

/** True when the page is running as an installed app rather than in a browser tab. */
export function isInstalled(win: Window = window): boolean {
  // `standalone` is Safari's own, and on iOS it is the ONLY one that answers — iOS does not match
  // `display-mode: standalone` reliably, which is why both are asked.
  const iosStandalone = (win.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || win.matchMedia?.('(display-mode: standalone)').matches === true;
}

/** iOS and iPadOS, including the iPad that reports itself as a Mac with a touchscreen. */
export function isIos(win: Window = window): boolean {
  const ua = win.navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && win.navigator.maxTouchPoints > 1);
}

/**
 * What stands between this person and a notification, or `null` if nothing does.
 *
 * Order matters: a missing API is reported before an iOS install, and an install before a denied permission,
 * because each later question is meaningless if an earlier one already answered.
 */
export function pushBlocker(hasVapidKey: boolean, win: Window = window): PushBlocker | null {
  if (!('serviceWorker' in win.navigator) || !('PushManager' in win)) {
    // On iOS in a tab the APIs are genuinely absent, so this check fires first — and "install the app" is the
    // useful thing to say there, not "your browser cannot do this", which is untrue.
    return isIos(win) && !isInstalled(win) ? 'install-first' : 'unsupported';
  }
  if (!('Notification' in win)) return 'unsupported';
  if (isIos(win) && !isInstalled(win)) return 'install-first';
  if ((win as Window & typeof globalThis).Notification.permission === 'denied') return 'blocked';
  if (!hasVapidKey) return 'not-configured';
  return null;
}

/**
 * base64url → the `Uint8Array` `pushManager.subscribe` requires.
 *
 * The VAPID public key travels as base64url (no padding, `-` and `_`), and `atob` understands neither. Written
 * out rather than pulled in: it is six lines, and a dependency on the app's start-up path for six lines is a
 * worse trade than the six lines.
 */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  // Built on a fresh ArrayBuffer rather than `Uint8Array.from`, whose result is typed over `ArrayBufferLike` —
  // which could be a SharedArrayBuffer, and `applicationServerKey` will not take one.
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** What the API's `POST /alerts/subscriptions` wants, which is what the browser's own JSON already looks like. */
export interface DeviceSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

function toDevice(subscription: PushSubscription): DeviceSubscription | null {
  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!json.endpoint || !p256dh || !auth) return null;
  return { endpoint: json.endpoint, keys: { p256dh, auth } };
}

/**
 * Ask for permission, subscribe, and describe the device — or say why not.
 *
 * Called only when somebody turns on their FIRST switch, and the order is the point: the browser's prompt
 * comes first, so refusing it leaves no subscription behind and no row in anybody's database.
 */
export async function subscribeThisDevice(vapidPublicKey: string): Promise<DeviceSubscription | PushBlocker> {
  const blocker = pushBlocker(Boolean(vapidPublicKey));
  if (blocker) return blocker;

  const permission = await Notification.requestPermission();
  // `default` means they dismissed the prompt without choosing. Not `blocked` — the browser will ask again, so
  // the screen should say nothing and simply leave the switch off.
  if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'unsupported';

  const registration = await navigator.serviceWorker.ready;
  // Reuse the subscription this browser already has rather than making a second one for the same device —
  // `subscribe` returns the existing one anyway when the key matches, and this keeps that explicit.
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      // Every push to a browser must be user-visible. Chrome refuses to subscribe without this, and silent
      // pushes are not a thing this feature wants in any case.
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    }));

  return toDevice(subscription) ?? 'unsupported';
}

/** The device this browser is already subscribed with, if any. Never prompts. */
export async function currentDevice(): Promise<DeviceSubscription | null> {
  if (!('serviceWorker' in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  return subscription ? toDevice(subscription) : null;
}

/**
 * Drop this browser's subscription.
 *
 * Returns what it dropped, so the caller can tell the API which endpoint to forget — after `unsubscribe()` the
 * object is useless and its endpoint is the only way to name the row.
 */
export async function unsubscribeThisDevice(): Promise<DeviceSubscription | null> {
  if (!('serviceWorker' in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return null;
  const device = toDevice(subscription);
  await subscription.unsubscribe().catch(() => {});
  return device;
}
