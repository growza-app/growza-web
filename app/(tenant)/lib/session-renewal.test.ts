import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { renewForRequest, type ResumeDeps } from './resume-session';
import { withSessionRenewal, type FetchLike } from './session-renewal';

/**
 * Owner, 2026-11-24 — "sometimes I'm getting locked out … multiple times a day", reproduced: a page open past the hour
 * met a 401 and went to /login while the refresh cookie still worked. These pin what the fix does — and every case
 * where it must change nothing, so it cannot become a regression.
 */
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const signedOut = () => json(401, { error: 'unauthorized', detail: 'Sign in again.' });
const ok = () => json(200, { ok: true });

/** A fetch that answers each call from a list, and remembers what it was asked. */
function scripted(...answers: Array<() => Response>) {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const fn: FetchLike = async (input, init) => {
    calls.push([input, init]);
    const next = answers.shift();
    if (!next) throw new Error(`unexpected call ${input}`);
    return next();
  };
  return { fn, calls };
}
const always = () => true;

describe('a request that meets "signed out" renews once, then tries once more', () => {
  it('lapsed session, renewal works: the request is repeated and its answer is what the caller gets — no sign-in', async () => {
    const f = scripted(signedOut, ok);
    const renew = vi.fn(async () => true);
    const res = await withSessionRenewal(f.fn, renew, always)('/api/v1/home', { method: 'GET' });
    expect(res.status).toBe(200);
    expect(renew).toHaveBeenCalledTimes(1);
    expect(f.calls.map((c) => c[0])).toEqual(['/api/v1/home', '/api/v1/home']);
  });

  it('a POST is repeated with the same method and body (the guard refused it before it did anything)', async () => {
    const f = scripted(signedOut, ok);
    const init = { method: 'POST', body: JSON.stringify({ qty: 2 }) };
    await withSessionRenewal(f.fn, async () => true, always)('/api/v1/counter-sales', init);
    expect(f.calls[1]![1]).toBe(init);
  });

  it('negative — renewal refused (signed out on purpose, password changed): the 401 is handed back, so /login follows as before', async () => {
    const f = scripted(signedOut);
    const res = await withSessionRenewal(f.fn, async () => false, always)('/api/v1/home');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized', detail: 'Sign in again.' });
    expect(f.calls).toHaveLength(1);
  });

  it('boundary — renewed but refused again: the second 401 is final; never a third try, so it cannot loop', async () => {
    const f = scripted(signedOut, signedOut);
    const renew = vi.fn(async () => true);
    const res = await withSessionRenewal(f.fn, renew, always)('/api/v1/home');
    expect(res.status).toBe(401);
    expect(renew).toHaveBeenCalledTimes(1);
    expect(f.calls).toHaveLength(2);
  });

  it('changes nothing for any other answer: 200, 403, 404, 409, 500 pass straight through, no renewal', async () => {
    for (const status of [200, 403, 404, 409, 500]) {
      const f = scripted(() => json(status, { error: 'x' }));
      const renew = vi.fn(async () => true);
      const res = await withSessionRenewal(f.fn, renew, always)('/api/v1/home');
      expect(res.status).toBe(status);
      expect(renew).not.toHaveBeenCalled();
    }
  });

  it('a 401 that is not "signed out" (a wrong password, an expired invite) passes straight through', async () => {
    const f = scripted(() => json(401, { error: 'invalid_credentials' }));
    const renew = vi.fn(async () => true);
    expect((await withSessionRenewal(f.fn, renew, always)('/api/v1/team/invite')).status).toBe(401);
    expect(renew).not.toHaveBeenCalled();
  });

  it('a 401 with no readable body passes straight through', async () => {
    const f = scripted(() => new Response('<html>', { status: 401 }));
    const renew = vi.fn(async () => true);
    expect((await withSessionRenewal(f.fn, renew, always)('/api/v1/home')).status).toBe(401);
    expect(renew).not.toHaveBeenCalled();
  });

  it('where renewal is not allowed (server side, the sign-in page, the /auth/ routes) it is plain fetch', async () => {
    const f = scripted(signedOut);
    const renew = vi.fn(async () => true);
    expect((await withSessionRenewal(f.fn, renew, () => false)('/api/v1/auth/logout')).status).toBe(401);
    expect(renew).not.toHaveBeenCalled();
  });
});

describe('renewForRequest — one renewal for everyone who meets the lapse at once', () => {
  function memory(initial: Record<string, string> = {}) {
    const data = new Map(Object.entries(initial));
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
  }
  const deps = (over: Partial<ResumeDeps> = {}): ResumeDeps => ({
    fetch: vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch,
    storage: memory(),
    now: () => 1_000_000,
    ...over,
  });

  it('renews: true', async () => {
    expect(await renewForRequest(deps())).toBe(true);
  });

  it('a renewal worked 5 s ago (another request\'s): true without asking again — its fresh cookies are already here', async () => {
    const d = deps({ storage: memory({ 'growza.resumed-at': String(1_000_000 - 5_000) }) });
    expect(await renewForRequest(d)).toBe(true);
    expect(d.fetch).not.toHaveBeenCalled();
  });

  it('negative — the refresh route refuses (signed out on purpose): false, so sign-in follows', async () => {
    expect(await renewForRequest(deps({ fetch: vi.fn(async () => new Response('{}', { status: 401 })) as unknown as typeof fetch }))).toBe(false);
  });

  it('boundary — a renewal 31 s ago is not "moments ago": it asks again', async () => {
    const d = deps({ storage: memory({ 'growza.resumed-at': String(1_000_000 - 31_000) }) });
    expect(await renewForRequest(d)).toBe(true);
    expect(d.fetch).toHaveBeenCalledTimes(1);
  });

  it('three requests meeting the lapse together ask the refresh route once', async () => {
    const d = deps();
    const all = await Promise.all([renewForRequest(d), renewForRequest(d), renewForRequest(d)]);
    expect(all).toEqual([true, true, true]);
    expect(d.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('api.ts sends every request through the renewal, and keeps sign-in where it was', () => {
  const src = readFileSync(new URL('./api.ts', import.meta.url), 'utf8');
  it('no request calls fetch directly any more', () => {
    expect(src).not.toMatch(/await fetch\(`\$\{API_URL\}/);
    expect(src.match(/await apiFetch\(`\$\{API_URL\}/g)?.length).toBe(6);
  });
  it('renewal only in the browser, off the sign-in page, never for the /auth/ routes', () => {
    expect(src).toContain("typeof window !== 'undefined' && window.location.pathname !== '/login' && !input.includes('/api/v1/auth/')");
  });
  it('a 401 that survives renewal still sends the browser to /login (unchanged)', () => {
    expect(src).toContain("if (res.status === 401 && body?.error === 'unauthorized' && typeof window !== 'undefined' && window.location.pathname !== '/login') {");
  });
});
