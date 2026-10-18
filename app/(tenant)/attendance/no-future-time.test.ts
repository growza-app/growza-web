import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import { localiseApiMessage } from '../lib/api-messages';

/**
 * Owner, 2026-10-19 — the register no longer takes a time that has not happened yet. The server refuses it (the
 * rule); the screen caps the field at now and says so in words before the server has to.
 */
const register = readFileSync(new URL('./AttendanceRegister.tsx', import.meta.url), 'utf8');

describe('a time that has not happened yet', () => {
  it('caps both time fields at now, on today only', () => {
    expect(register.match(/max=\{isToday \? wallClockNow\(tz\) : undefined\}/g)).toHaveLength(2);
  });

  it('is refused before anything is sent, because a typed value gets past a cap', () => {
    const body = register.slice(register.indexOf('function timeChanged'), register.indexOf('function setNow'));
    expect(body).toMatch(/if \(isToday && value && value > wallClockNow\(tz\)\) \{\s*setError\(t\('errors\.futureTime'\)\);\s*return;/);
    // The refusal comes before the draft is built and saved.
    expect(body.indexOf('errors.futureTime')).toBeLessThan(body.indexOf('void save('));
  });

  it('says it in both languages, and a server refusal is read in Hindi too', () => {
    expect(en.attendance.register.errors.futureTime).toBe('That time has not happened yet.');
    expect(hi.attendance.register.errors.futureTime).toBeTruthy();
    expect(localiseApiMessage('That time has not happened yet', 'hi')).toBe('वह समय अभी आया नहीं है');
  });
});
