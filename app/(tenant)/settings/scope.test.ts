import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * What `api.settings(branch?)` answers, by the branch asked for ('' = the business view). A plain map rather
 * than `vi.fn().mockRejectedValue`: the spy attaches its own handler to the promise it records, and that copy
 * is reported as an unhandled rejection, failing a test whose result is right.
 */
let answers: Record<string, { ok: unknown } | { fail: unknown }> = {};
const asked: string[] = [];
/** What `/me` says: null (could not be read) unless a test gives it a tenant, which most of these do not. */
let meSays: unknown = null;
vi.mock('../lib/api', () => ({
  api: {
    me: () => (meSays === null ? Promise.reject(new Error('no /me')) : Promise.resolve(meSays)),
    settings: (branch?: string) => {
      asked.push(branch ?? '');
      const next = answers[branch ?? ''] ?? { fail: new Error('not found') };
      return 'fail' in next ? Promise.reject(next.fail) : Promise.resolve(next.ok);
    },
  },
}));

const { loadScopedSettings } = await import('./scope');

const MAIN = 'b-main';
const summary = (locationId: string | null, branchCount: number, name = 'MG Road') => ({
  scope: { locationId, ownKeys: [] },
  location: { id: locationId ?? MAIN, name },
  branchCount,
});
const rateLimited = Object.assign(new Error('Too many requests'), { status: 429 });
const down = new TypeError('fetch failed');

describe('loadScopedSettings', () => {
  beforeEach(() => {
    answers = {};
    asked.length = 0;
    meSays = null;
  });

  /** Performance audit — the main branch is already in `/me`, so the business view is not read just to find it. */
  describe('when /me already names the main branch', () => {
    const meOf = (branchCount: number) => ({ tenant: { locationId: MAIN, branchCount } });

    it('asks once, for that branch', async () => {
      meSays = meOf(3);
      answers = { [MAIN]: { ok: summary(MAIN, 3) } };
      const r = await loadScopedSettings(Promise.resolve({}));
      expect(asked).toEqual([MAIN]);
      expect(r.settings?.scope.locationId).toBe(MAIN);
      expect(r.branchName).toBe('MG Road');
    });

    it('does not do it for a one-branch business, which has only the business view', async () => {
      meSays = meOf(1);
      answers = { '': { ok: summary(null, 1) } };
      await loadScopedSettings(Promise.resolve({}));
      expect(asked).toEqual(['']);
    });

    it('falls back to the two-step read when the direct one fails', async () => {
      meSays = meOf(3);
      answers = { '': { ok: summary(null, 3) }, [MAIN]: { fail: down } };
      const r = await loadScopedSettings(Promise.resolve({}));
      expect(asked).toEqual([MAIN, '', MAIN]);
      // The branch cannot be read either way here, so the screen says so — the point is that it still tried the old path.
      expect(r.settings).toBeNull();
      expect(r.loadError).not.toBeNull();
    });
  });

  it('a one-branch business gets the business’s own settings', async () => {
    answers = { '': { ok: summary(null, 1) } };
    const r = await loadScopedSettings(Promise.resolve({}));
    expect(r.settings?.scope.locationId).toBeNull();
    expect(r.branchName).toBeNull();
    expect(r.loadError).toBeNull();
  });

  /** Jira GRW-396 — Settings has no "all branches": with several, it is always one branch's. */
  it('several branches and none named: the main branch, never the business view', async () => {
    answers = { '': { ok: summary(null, 3) }, [MAIN]: { ok: summary(MAIN, 3) } };
    const r = await loadScopedSettings(Promise.resolve({}));
    expect(r.settings?.scope.locationId).toBe(MAIN);
    expect(r.branchName).toBe('MG Road');
  });

  it('"all" in the address is read as no branch named: the main branch', async () => {
    answers = { '': { ok: summary(null, 3) }, [MAIN]: { ok: summary(MAIN, 3) } };
    const r = await loadScopedSettings(Promise.resolve({ branch: 'all' }));
    expect(r.settings?.scope.locationId).toBe(MAIN);
    expect(asked).not.toContain('all');
  });

  it('the named branch, in one call', async () => {
    answers = { b2: { ok: summary('b2', 3, 'Indiranagar') } };
    const r = await loadScopedSettings(Promise.resolve({ branch: 'b2' }));
    expect(r.settings?.scope.locationId).toBe('b2');
    expect(r.branchName).toBe('Indiranagar');
    expect(asked).toEqual(['b2']);
  });

  it('a branch that no longer resolves shows the main branch', async () => {
    answers = { '': { ok: summary(null, 2) }, [MAIN]: { ok: summary(MAIN, 2) } };
    const r = await loadScopedSettings(Promise.resolve({ branch: 'gone' }));
    expect(r.settings?.scope.locationId).toBe(MAIN);
    expect(r.loadError).toBeNull();
  });

  it('a stale branch at a business now down to one branch shows the business view', async () => {
    answers = { b1: { ok: summary('b1', 1) }, '': { ok: summary(null, 1) } };
    const r = await loadScopedSettings(Promise.resolve({ branch: 'b1' }));
    expect(r.settings?.scope.locationId).toBeNull();
  });

  /** Jira GRW-352 — a Settings page has to say WHY it could not load. */
  it('reports a busy API (429) as busy, not down', async () => {
    answers = { '': { fail: rateLimited } };
    const r = await loadScopedSettings(Promise.resolve({}));
    expect(r.settings).toBeNull();
    expect(r.loadError).toBe('busy');
  });

  it('reports an unreachable API as down', async () => {
    answers = { '': { fail: down } };
    const r = await loadScopedSettings(Promise.resolve({}));
    expect(r.settings).toBeNull();
    expect(r.loadError).toBe('down');
  });

  it('reports the LAST failure when the branch and the fallback both fail', async () => {
    answers = { b1: { fail: down }, '': { fail: rateLimited } };
    const r = await loadScopedSettings(Promise.resolve({ branch: 'b1' }));
    expect(r.settings).toBeNull();
    expect(r.loadError).toBe('busy');
  });

  it('a busy API on the main branch is reported, not replaced by the business view', async () => {
    answers = { '': { ok: summary(null, 2) }, [MAIN]: { fail: rateLimited } };
    const r = await loadScopedSettings(Promise.resolve({}));
    expect(r.settings).toBeNull();
    expect(r.loadError).toBe('busy');
  });
});
