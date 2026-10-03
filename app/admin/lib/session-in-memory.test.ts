import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { clearAdminSession, readAdminSession, writeAdminSession } from './session';

/** Jira GRW-476 — the admin bearer token is held in memory, never written to browser storage. */
describe('admin session', () => {
  it('round-trips in memory and never writes sessionStorage', () => {
    const src = readFileSync(resolve(__dirname, 'session.ts'), 'utf8');
    expect(src).not.toMatch(/sessionStorage\.setItem/);
    writeAdminSession({ expiresAt: new Date(Date.now() + 60_000).toISOString() });
    expect(readAdminSession()).not.toBeNull();
    clearAdminSession();
    expect(readAdminSession()).toBeNull();
  });

  it('forgets an expired token', () => {
    writeAdminSession({ expiresAt: new Date(Date.now() - 1).toISOString() });
    expect(readAdminSession()).toBeNull();
  });
});
