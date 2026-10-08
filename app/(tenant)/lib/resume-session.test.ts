import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { fromDashboard } from './dashboard-root';
import { resumeSession, type ResumeDeps } from './resume-session';

/** A Storage stand-in: just the two methods the module uses. */
function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}

function deps(over: Partial<ResumeDeps> = {}): ResumeDeps {
  return {
    fetch: vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch,
    storage: memory(),
    now: () => 1_000_000,
    ...over,
  };
}

const respond = (status: number) => vi.fn(async () => new Response('{}', { status })) as unknown as typeof fetch;

describe('resuming a session from the refresh cookie', () => {
  it('posts to the refresh route and reports success on a 200', async () => {
    const d = deps();
    expect(await resumeSession(d)).toBe(true);
    const call = (d.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(call[0]).toBe('/api/v1/auth/refresh');
    expect(call[1]).toMatchObject({ method: 'POST' });
  });

  it.each([401, 403, 429, 500, 503])('reports failure on a %i — nothing here can mend it', async (status) => {
    expect(await resumeSession(deps({ fetch: respond(status) }))).toBe(false);
  });

  it('reports failure when the request never lands', async () => {
    const down = vi.fn(async () => {
      throw new TypeError('network down');
    }) as unknown as typeof fetch;
    expect(await resumeSession(deps({ fetch: down }))).toBe(false);
  });

  it('gives up on a hung request instead of stranding the person on a blank screen', async () => {
    vi.useFakeTimers();
    try {
      const hung = vi.fn(
        (_url: unknown, init?: RequestInit) =>
          new Promise<Response>((_, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
          }),
      ) as unknown as typeof fetch;
      const outcome = resumeSession(deps({ fetch: hung }));
      await vi.advanceTimersByTimeAsync(4_100);
      expect(await outcome).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('asks once when two callers ask together (a development double-mount)', async () => {
    const d = deps();
    const [a, b] = await Promise.all([resumeSession(d), resumeSession(d)]);
    expect([a, b]).toEqual([true, true]);
    expect(d.fetch).toHaveBeenCalledTimes(1);
  });

  describe('the loop guard', () => {
    it('refuses a second success within 30 seconds — the session it made did not take', async () => {
      const storage = memory();
      expect(await resumeSession(deps({ storage, now: () => 5_000_000 }))).toBe(true);
      const second = deps({ storage, now: () => 5_000_000 + 29_999 });
      expect(await resumeSession(second)).toBe(false);
      expect(second.fetch).not.toHaveBeenCalled();
    });

    it('allows it again at 30 seconds', async () => {
      const storage = memory();
      await resumeSession(deps({ storage, now: () => 5_000_000 }));
      expect(await resumeSession(deps({ storage, now: () => 5_000_000 + 30_000 }))).toBe(true);
    });

    it('is not tripped by a refresh that FAILED — a flaky network may be retried straight away', async () => {
      const storage = memory();
      expect(await resumeSession(deps({ storage, fetch: respond(503) }))).toBe(false);
      expect(await resumeSession(deps({ storage }))).toBe(true);
    });

    it('fails open when storage is blocked or throws', async () => {
      expect(await resumeSession(deps({ storage: null }))).toBe(true);
      const hostile = {
        getItem: () => {
          throw new Error('SecurityError');
        },
        setItem: () => {
          throw new Error('SecurityError');
        },
      };
      expect(await resumeSession(deps({ storage: hostile }))).toBe(true);
    });

    it('ignores a garbage value rather than locking the person out', async () => {
      expect(await resumeSession(deps({ storage: memory({ 'growza.resumed-at': 'soon' }) }))).toBe(true);
    });
  });
});

/**
 * The review of this fix's first shape found two ways it could sign somebody into an account they had just left or
 * had never had. Both came from resuming on the SIGN-IN PAGE, where arriving is a decision rather than an accident.
 * These pin the placement, because the bug is invisible in the resume code itself — it is in where it is called.
 */
describe('where the resume is wired', () => {
  const read = (p: string) => readFileSync(fromDashboard(p), 'utf8');

  it('is not reached from the sign-in page, so a failed sign-out cannot be undone', () => {
    const login = read('app/(auth)/login/page.tsx');
    expect(login, 'the sign-in form must not resume a session').not.toMatch(/resumeSession|SessionResume|auth\/refresh/);
  });

  it('is reached from the dashboard shell, which is where the accidental 401 happens', () => {
    const layout = read('app/(tenant)/layout.tsx');
    expect(layout).toMatch(/<SessionResume \/>/);
    expect(layout, 'the 401 path must render the gate rather than redirect past it').toMatch(/shouldSignInAgain\(error\)\) lapsed = true/);
  });

  it('still sends a genuinely signed-out person to the form', () => {
    expect(read('app/(tenant)/components/SessionResume.tsx')).toMatch(/else window\.location\.replace\(SIGN_IN_PATH\)/);
  });
});
