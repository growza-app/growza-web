import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readAdminSession } from './session';
import { refreshAdminSession } from './refresh';

/**
 * Jira GRW-417 — what each answer from the refresh route MEANS.
 *
 * The mapping is the whole point of this module, and getting it wrong is not
 * a visible bug in either direction: calling an outage 'dead' signs an
 * administrator out over a blip, and calling a rejected cookie 'unavailable'
 * leaves a poller hammering a credential the server has already refused —
 * which charges the login throttle's per-caller budget and can lock that
 * address out of `/auth/login` itself (GRW-161).
 */
const store = new Map<string, string>();

function respond(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

beforeEach(() => {
  store.clear();
  // `environment: 'node'` — writeAdminSession reaches for window.sessionStorage.
  (globalThis as { window?: unknown }).window = {
    sessionStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  };
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  vi.restoreAllMocks();
});

describe('refreshAdminSession', () => {
  it('renews from a 200 and stores the new token', async () => {
    const expiresAt = new Date(Date.now() + 3600e3).toISOString();
    vi.stubGlobal('fetch', vi.fn(async () => respond(200, { token: 'fresh-token', expiresAt })));

    const outcome = await refreshAdminSession();

    expect(outcome).toEqual({ status: 'renewed', token: 'fresh-token' });
    // Jira GRW-476 — held in memory now, not sessionStorage.
    expect(readAdminSession()).toEqual({ token: 'fresh-token', expiresAt });
    expect(store.get('growza-admin-session')).toBeUndefined();
  });

  // AC-02 — the only answers that may cost an administrator their session.
  it.each([
    ['refresh_failed', 'a cookie the provider rejected'],
    ['no_refresh_token', 'no cookie at all'],
  ])('treats 401 %s as dead — only a fresh sign-in helps', async (error) => {
    vi.stubGlobal('fetch', vi.fn(async () => respond(401, { error })));
    await expect(refreshAdminSession()).resolves.toEqual({ status: 'dead' });
  });

  /**
   * AC-03 — the boundary that matters most. An outage and the throttle both
   * answer 401/429, and neither is evidence the session is over; reporting
   * them as 'dead' is exactly the sign-out this feature exists to prevent.
   */
  it.each([
    [401, { error: 'provider_unavailable' }, 'a provider outage'],
    [429, { error: 'too_many_attempts' }, 'the throttle'],
    [500, { error: 'internal_error' }, 'a server fault'],
  ])('leaves the session alone for %i (%s)', async (status, body) => {
    vi.stubGlobal('fetch', vi.fn(async () => respond(status, body)));
    await expect(refreshAdminSession()).resolves.toEqual({ status: 'unavailable' });
  });

  it('reports a request that never landed as unavailable, not dead', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    await expect(refreshAdminSession()).resolves.toEqual({ status: 'unavailable' });
  });

  it('treats a 200 with nothing usable in it as unavailable rather than a renewal', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respond(200, { expiresAt: 'but no token' })));
    await expect(refreshAdminSession()).resolves.toEqual({ status: 'unavailable' });
  });

  /**
   * Every concurrent caller shares one request. A page load whose token has
   * just expired fires several adminFetch calls that 401 together, and each
   * extra POST would charge the throttle for a question already in flight.
   */
  it('collapses concurrent callers into a single request', async () => {
    const expiresAt = new Date(Date.now() + 3600e3).toISOString();
    const fetchMock = vi.fn(async () => respond(200, { token: 'fresh-token', expiresAt }));
    vi.stubGlobal('fetch', fetchMock);

    const outcomes = await Promise.all([refreshAdminSession(), refreshAdminSession(), refreshAdminSession()]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    for (const outcome of outcomes) expect(outcome).toEqual({ status: 'renewed', token: 'fresh-token' });
  });

  it('asks again after the previous attempt has settled', async () => {
    const fetchMock = vi.fn(async () => respond(401, { error: 'provider_unavailable' }));
    vi.stubGlobal('fetch', fetchMock);

    await refreshAdminSession();
    await refreshAdminSession();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
