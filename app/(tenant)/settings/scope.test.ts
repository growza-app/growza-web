import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A plain queue rather than `vi.fn().mockRejectedValue`: the spy attaches its own
 * handler to the promise it records, and that copy is reported as an unhandled
 * rejection, failing a test whose result is right.
 */
let outcomes: Array<{ ok: unknown } | { fail: unknown }> = [];
vi.mock('../lib/api', () => ({
  api: {
    settings: () => {
      const next = outcomes.length > 1 ? outcomes.shift()! : outcomes[0]!;
      return 'fail' in next ? Promise.reject(next.fail) : Promise.resolve(next.ok);
    },
  },
}));

const { loadScopedSettings } = await import('./scope');

const summary = (locationId: string | null) => ({ scope: { locationId, ownKeys: [] }, location: { name: 'MG Road' } });
const rateLimited = Object.assign(new Error('Too many requests'), { status: 429 });
const down = new TypeError('fetch failed');

/** Jira GRW-352 — a Settings page has to say WHY it could not load. */
describe('loadScopedSettings', () => {
  beforeEach(() => {
    outcomes = [];
  });

  it('returns the settings and no error when the API answers', async () => {
    outcomes = [{ ok: summary(null) }];
    const r = await loadScopedSettings(Promise.resolve({}));
    expect(r.settings).not.toBeNull();
    expect(r.loadError).toBeNull();
  });

  it('reports a busy API (429) as busy, not down', async () => {
    outcomes = [{ fail: rateLimited }];
    const r = await loadScopedSettings(Promise.resolve({}));
    expect(r.settings).toBeNull();
    expect(r.loadError).toBe('busy');
  });

  it('reports an unreachable API as down', async () => {
    outcomes = [{ fail: down }];
    const r = await loadScopedSettings(Promise.resolve({}));
    expect(r.settings).toBeNull();
    expect(r.loadError).toBe('down');
  });

  it('falls back to the business view when the picked branch no longer resolves', async () => {
    outcomes = [{ fail: new Error('not found') }, { ok: summary(null) }];
    const r = await loadScopedSettings(Promise.resolve({ branch: 'gone' }));
    expect(r.settings).not.toBeNull();
    expect(r.loadError).toBeNull();
  });

  it('reports the LAST failure when the branch and the fallback both fail', async () => {
    outcomes = [{ fail: down }, { fail: rateLimited }];
    const r = await loadScopedSettings(Promise.resolve({ branch: 'b1' }));
    expect(r.settings).toBeNull();
    expect(r.loadError).toBe('busy');
  });

  it('names the branch when one is picked', async () => {
    outcomes = [{ ok: summary('b1') }];
    const r = await loadScopedSettings(Promise.resolve({ branch: 'b1' }));
    expect(r.branchName).toBe('MG Road');
  });
});
