// Service worker for the admin dashboard PWA.
//
// This app is a live operational tool (bookings, availability, offers) —
// caching API responses would risk a stylist acting on a stale "free slot"
// and double-booking a customer, so /api/* requests always go straight to
// the network, untouched. What IS worth caching: the app shell (so the
// dashboard opens instantly and looks right even on a flaky connection) and
// pages already visited (so a repeat visit works offline). A page that has
// never been opened before still can't work offline — there's no data for
// it to show — so that case falls back to a small honest offline notice
// instead of the browser's default dinosaur/error page.

const CACHE_VERSION = 'v4';
const CACHE_NAME = `booking-dashboard-${CACHE_VERSION}`;
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll([OFFLINE_URL])).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // The API is served from its own origin (a different port in dev, its own
  // subdomain in production) — cross-origin requests are never intercepted,
  // which already covers it. The explicit /api/ check catches the case
  // where a future deploy reverse-proxies the API under this same origin.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // live data — always network, never cached
  // Jira GRW-319 — Next's client-side navigation and router.refresh() fetch the
  // page's RSC payload in the CURRENT language. The stale-while-revalidate branch
  // below would hand back the cached copy first, so after a language switch the
  // owner would see the previous language. Always the network.
  if (request.headers.get('RSC') || url.searchParams.has('_rsc')) return;

  // Page navigations: try the network first (freshest content), fall back
  // to a cached copy of that exact page, then to the offline notice.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => (await caches.match(request)) ?? (await caches.match(OFFLINE_URL))),
    );
    return;
  }

  // Static, content-hashed build assets (Next's /_next/static/*): cache-first
  // is safe because the filename itself changes whenever the content does.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
    return;
  }

  // Everything else same-origin (icons, manifest, etc.): stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => cached);
      return cached ?? network;
    }),
  );
});
