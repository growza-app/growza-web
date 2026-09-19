import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Jira GRW-324 — the service worker stores no logged-in page.
 *
 * These run the real `public/sw.js` against an in-memory `caches` and a stub
 * `fetch`, the way `browser-support.test.ts` runs its probe. The earlier check
 * only searched the file's text for two strings, so it stayed green if the
 * strings sat in a comment or behind the branch they were meant to guard — and
 * the worker cached every page for a shared phone's next user.
 */

const SOURCE = readFileSync('web/public/sw.js', 'utf8');
const ORIGIN = 'https://app.test';

type Listener = (event: never) => void;

function makeWorker(network: (url: string) => Response | Promise<Response>) {
  const listeners: Record<string, Listener> = {};
  const stores = new Map<string, Map<string, Response>>();
  const fetches: string[] = [];
  const keyOf = (r: { url: string } | string) => new URL(typeof r === 'string' ? r : r.url, ORIGIN).href;

  const cacheApi = (name: string) => {
    const entries = stores.get(name) ?? new Map<string, Response>();
    stores.set(name, entries);
    return {
      async match(r: { url: string } | string) {
        return entries.get(keyOf(r))?.clone();
      },
      async put(r: { url: string } | string, res: Response) {
        entries.set(keyOf(r), res);
      },
      async addAll(urls: string[]) {
        for (const u of urls) entries.set(keyOf(u), await network(u));
      },
    };
  };

  const caches = {
    open: async (name: string) => cacheApi(name),
    async match(r: { url: string } | string) {
      for (const entries of stores.values()) {
        const hit = entries.get(keyOf(r));
        if (hit) return hit.clone();
      }
      return undefined;
    },
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
  };

  const self = {
    addEventListener: (type: string, fn: Listener) => void (listeners[type] = fn),
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn() },
    location: { origin: ORIGIN },
  };
  const fetchImpl = async (r: { url: string } | string) => {
    fetches.push(keyOf(r));
    return network(keyOf(r));
  };

  new Function('self', 'caches', 'fetch', SOURCE)(self, caches, fetchImpl);

  /** One event: what the worker answered (or `undefined` if it left the request to the browser), and whether it stored anything. */
  async function dispatch(type: 'fetch' | 'install' | 'activate', init: Record<string, unknown> = {}) {
    const waits: Promise<unknown>[] = [];
    let answer: Promise<Response> | undefined;
    const event = {
      ...init,
      respondWith: (p: Promise<Response>) => void (answer = p),
      waitUntil: (p: Promise<unknown>) => void waits.push(p),
    };
    listeners[type]!(event as never);
    const response = answer ? await answer : undefined;
    await Promise.all(waits);
    return { response, answered: answer !== undefined };
  }

  const get = (path: string, opts: { mode?: string; headers?: Record<string, string>; method?: string; origin?: string } = {}) =>
    dispatch('fetch', {
      request: {
        url: `${opts.origin ?? ORIGIN}${path}`,
        method: opts.method ?? 'GET',
        mode: opts.mode ?? 'cors',
        headers: new Headers(opts.headers),
      },
    });

  return { dispatch, get, stores, fetches, self };
}

const ok = (body = 'ok') => new Response(body, { status: 200 });
const CURRENT = 'booking-dashboard-v5';

/** Everything held in every cache, excluding the offline notice the worker precaches at install. */
const stored = (w: ReturnType<typeof makeWorker>) =>
  [...w.stores.values()].flatMap((entries) => [...entries.keys()]).filter((k) => !k.endsWith('/offline.html'));

describe('the service worker', () => {
  it('precaches only the offline notice at install, and takes over at once', async () => {
    const w = makeWorker(() => ok('offline notice'));
    await w.dispatch('install');
    expect([...(w.stores.get(CURRENT)?.keys() ?? [])]).toEqual([`${ORIGIN}/offline.html`]);
    expect(w.self.skipWaiting).toHaveBeenCalled();
  });

  describe('a page load (AC-01, AC-02, AC-05)', () => {
    it('always goes to the network and stores nothing', async () => {
      const w = makeWorker(() => ok('<html>Hindi</html>'));
      const r = await w.get('/clients?q=9900100001', { mode: 'navigate' });
      expect(await r.response!.text()).toBe('<html>Hindi</html>');
      expect(stored(w)).toEqual([]);
    });

    it('shows the offline notice when the network fails, never an earlier copy of the page', async () => {
      let offline = false;
      const w = makeWorker((url) => {
        if (offline && !url.endsWith('/offline.html')) throw new TypeError('offline');
        return ok(url.endsWith('/offline.html') ? 'offline notice' : "<html>previous user's clients</html>");
      });
      await w.dispatch('install');
      await w.get('/clients', { mode: 'navigate' }); // visited while online
      offline = true;
      const r = await w.get('/clients', { mode: 'navigate' });
      expect(await r.response!.text()).toBe('offline notice');
    });

    it('does not store a 502 from the proxy either', async () => {
      const w = makeWorker(() => new Response('bad gateway', { status: 502 }));
      const r = await w.get('/', { mode: 'navigate' });
      expect(r.response!.status).toBe(502);
      expect(stored(w)).toEqual([]);
    });

    it('treats a navigation that carries _rsc as a page load, not as a payload', async () => {
      const w = makeWorker(() => ok('page'));
      expect((await w.get('/clients?_rsc=abc', { mode: 'navigate' })).answered).toBe(true);
      expect(stored(w)).toEqual([]);
    });
  });

  describe('what it leaves to the browser (BR-01)', () => {
    it.each([
      ['a Next RSC payload (header)', '/appointments', { headers: { RSC: '1' } }],
      ['a Next RSC payload (query)', '/appointments?_rsc=x1y2', {}],
      ['the API', '/api/v1/appointments', {}],
      ['an upload', '/uploads/tenant-1/logo.png', {}],
    ])('does not answer, and stores nothing, for %s', async (_name, path, opts) => {
      const w = makeWorker(() => ok());
      const r = await w.get(path, opts);
      expect(r.answered).toBe(false);
      expect(w.fetches).toEqual([]);
      expect(stored(w)).toEqual([]);
    });

    it('ignores a POST and another origin', async () => {
      const w = makeWorker(() => ok());
      expect((await w.get('/anything', { method: 'POST' })).answered).toBe(false);
      expect((await w.get('/_next/static/a.js', { origin: 'https://cdn.test' })).answered).toBe(false);
    });
  });

  describe('build assets (AC-04)', () => {
    it('serves a cached chunk without asking the network again', async () => {
      const w = makeWorker(() => ok('chunk'));
      await w.get('/_next/static/chunks/app-1.js');
      await w.get('/_next/static/chunks/app-1.js');
      expect(w.fetches).toEqual([`${ORIGIN}/_next/static/chunks/app-1.js`]);
    });

    it.each([502, 404])('never stores a %i, so the next request fetches again', async (status) => {
      const w = makeWorker(() => new Response('nope', { status }));
      await w.get('/_next/static/chunks/app-2.js');
      await w.get('/_next/static/chunks/app-2.js');
      expect(w.fetches).toHaveLength(2);
      expect(stored(w)).toEqual([]);
    });

    it('never stores a redirect', async () => {
      const redirected = ok();
      Object.defineProperty(redirected, 'redirected', { value: true });
      const w = makeWorker(() => redirected);
      await w.get('/_next/static/chunks/app-3.js');
      expect(stored(w)).toEqual([]);
    });

    it('holds the write open with waitUntil, so it cannot be cut short', async () => {
      const w = makeWorker(() => ok('chunk'));
      await w.get('/_next/static/chunks/app-4.js');
      expect(stored(w)).toEqual([`${ORIGIN}/_next/static/chunks/app-4.js`]);
    });
  });

  describe('install assets', () => {
    it('keeps icons and manifests, serving the copy first and refreshing behind it', async () => {
      let version = 'one';
      const w = makeWorker(() => ok(version));
      expect(await (await w.get('/icons/icon-192.png')).response!.text()).toBe('one');
      version = 'two';
      expect(await (await w.get('/icons/icon-192.png')).response!.text()).toBe('one'); // stale first…
      expect(await (await w.get('/icons/icon-192.png')).response!.text()).toBe('two'); // …then refreshed
      expect((await w.get('/manifest.json')).answered).toBe(true);
      expect((await w.get('/admin-manifest.json')).answered).toBe(true);
    });
  });

  describe('activate (AC-03)', () => {
    it('deletes every earlier cache, including one that holds logged-in pages', async () => {
      const w = makeWorker(() => ok());
      w.stores.set('booking-dashboard-v4', new Map([[`${ORIGIN}/clients`, ok("<html>a client's phone</html>")]]));
      w.stores.set('some-other-cache', new Map());
      await w.dispatch('install');
      await w.dispatch('activate');
      expect([...w.stores.keys()]).toEqual([CURRENT]);
      expect(w.self.clients.claim).toHaveBeenCalled();
    });
  });
});
