// Service worker for the admin dashboard PWA.
//
// Jira GRW-324 — this worker stores NO logged-in page.
//
// This app is a live operational tool (bookings, availability, offers): stale
// data is the risk, not slowness. And every page it serves is personal — it
// changes with the signed-in person and with their language — so a copy saved
// by URL is wrong by construction: after sign-out it is the previous user's
// client names and phone numbers, after a language switch it is the old
// language. The first version cached every page it served and served the copy
// when the network failed; nothing ever purged it.
//
// So it caches only what is the same for everyone and safe to keep:
//   - hashed build assets (/_next/static/) — cache-first, they never change
//   - the install icons and manifests    — stale-while-revalidate
// and everything else — pages, Next's RSC payloads, /api/*, /uploads/* — goes
// straight to the network, untouched. If a PAGE load fails because the device
// is offline, a small honest offline notice replaces the browser's error page.
//
// Only an OK, non-redirected response is ever stored, and every write is held
// open with event.waitUntil so the worker cannot be stopped mid-write.

// v7 — bumping this is what deletes the logged-in pages the earlier versions
// left on people's devices: `activate` removes every cache but the current one.
// v7 also replaces the worker itself, which is how Jira GRW-647's `push` and
// `notificationclick` listeners below reach a device that already has v6.
const CACHE_VERSION = 'v7';
const CACHE_NAME = `booking-dashboard-${CACHE_VERSION}`;
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll([OFFLINE_URL])).then(() => self.skipWaiting()),
  );
});

// skipWaiting + claim on purpose: a worker that waits for every tab to close
// would leave the old caches on an installed app that is never closed.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

/** Hashed build output: the same for everyone, and a URL never changes its content. */
const isBuildAsset = (pathname) => pathname.startsWith('/_next/static/');

/** What installing the app needs: the same for everyone, and small. */
const isInstallAsset = (pathname) =>
  pathname.startsWith('/icons/') || pathname === '/manifest.json' || pathname === '/admin-manifest.json';

/**
 * Keeps a copy of `response` and hands it back. A 502 from the proxy during a
 * deploy, a 404, or a redirect is returned to the page but never stored — one
 * bad response must not stick to a URL until somebody bumps the version.
 */
function store(event, request, response) {
  if (!response.ok || response.redirected) return response;
  const copy = response.clone();
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.put(request, copy))
      .catch(() => {}),
  );
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // A page load: always the network. Only a failed load — the device is offline —
  // gets the offline notice; nothing about the page was ever kept.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => (await caches.match(OFFLINE_URL)) ?? Response.error()));
    return;
  }

  if (isBuildAsset(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => cached ?? fetch(request).then((response) => store(event, request, response))),
    );
    return;
  }

  if (isInstallAsset(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => store(event, request, response))
          .catch(() => cached ?? Response.error());
        if (cached) event.waitUntil(network); // the refresh must not be cut short
        return cached ?? network;
      }),
    );
  }

  // Anything else — RSC payloads, /api/*, /uploads/* — is not handled here, so
  // the browser goes to the network as if there were no worker.
});

/*
 * Jira GRW-647 — phone alerts.
 *
 * Both listeners are event-driven: they cost nothing when nothing is being pushed, and they touch neither the
 * `fetch` handler above nor the caches. A device whose owner has never turned an alert on will never fire them.
 *
 * The payload is written by `modules/alerts/deliver.ts` and holds no customer name and no phone number — it
 * crosses Google's and Apple's servers to get here. `url` opens the app, which then fetches the real detail
 * over the session's own auth.
 */
/** Kept beside the manifest's own entry — if one is renamed, the other must be. */
const ICON_URL = '/icons/icon-192.efb083ff.png';

self.addEventListener('push', (event) => {
  // A push with no data, or with something that is not our JSON, is not a reason to show nothing: the browser
  // REQUIRES a visible notification for every push (userVisibleOnly), and some browsers post their own
  // "this site has been updated in the background" if we do not. So there is always a fallback.
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = typeof payload.title === 'string' ? payload.title : 'Growza';
  const body = typeof payload.body === 'string' ? payload.body : 'Something happened at your business.';
  const url = typeof payload.url === 'string' && payload.url.startsWith('/') ? payload.url : '/';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      // The same file the manifest names. Content-hashed, so it changes when the icon does — and it is already
      // in this worker's cache, because `isInstallAsset` keeps /icons/.
      icon: ICON_URL,
      badge: ICON_URL,
      // Same tag replaces rather than stacks: a Saturday rush leaves one line in the shade saying the latest,
      // not forty the owner has to clear one at a time.
      tag: typeof payload.tag === 'string' ? payload.tag : undefined,
      data: { url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url ?? '/';

  /*
   * Focus the app if it is already open, rather than opening a second copy of it.
   *
   * `includeUncontrolled` matters: a tab opened before this worker took control is still the owner's app, and
   * leaving it out would open a new window beside the one they are looking at.
   */
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          /*
           * Navigate the tab they already have, THEN bring it forward — both paths, which the first version
           * did not do (review 2026-10-24): it focused only when `navigate` rejected, so on the success path a
           * background window was navigated and never raised, and from the owner's side the notification
           * simply vanished.
           *
           * `navigate` can reject on an older browser or a cross-origin tab; focusing is still better than
           * nothing, so that failure falls through to the same focus.
           */
          if (!client.navigate) return client.focus();
          return client
            .navigate(target)
            .then((navigated) => (navigated ?? client).focus())
            .catch(() => client.focus());
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
