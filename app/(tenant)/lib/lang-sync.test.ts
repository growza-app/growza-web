import { describe, expect, it } from 'vitest';
import { decideLangSync } from './lang';

/**
 * Jira GRW-329 — every branch of the cookie/account reconciliation is a bug QA
 * found in the first version, so each one is pinned by name.
 */
describe('decideLangSync', () => {
  describe('a pending save is the person’s choice and is never reverted', () => {
    it('QA UI-01g — slow save: the account still says English, the person just chose Hindi', () => {
      // The first version read this disagreement as a stale cookie, restored
      // English, and the screen went Hindi -> English on a slow network.
      expect(decideLangSync({ stored: 'en', rendered: 'hi', pending: 'hi' })).toEqual({ kind: 'push', lang: 'hi' });
    });

    it('QA UI-02a — the save FAILED: keep what they chose and retry it later', () => {
      expect(decideLangSync({ stored: 'en', rendered: 'hi', pending: 'hi' }).kind).toBe('push');
      expect(decideLangSync({ stored: null, rendered: 'hi', pending: 'hi' }).kind).toBe('push');
    });

    it('drops the marker once the account holds what was pending', () => {
      expect(decideLangSync({ stored: 'hi', rendered: 'hi', pending: 'hi' })).toEqual({ kind: 'clear-pending' });
    });

    it('a pending choice wins even when the account disagrees, in either direction', () => {
      expect(decideLangSync({ stored: 'hi', rendered: 'en', pending: 'en' })).toEqual({ kind: 'push', lang: 'en' });
    });
  });

  describe('otherwise the account is the record', () => {
    it('AC-03 — a lost cookie is put back from the account', () => {
      expect(decideLangSync({ stored: 'hi', rendered: 'en', pending: null })).toEqual({ kind: 'set-cookie', lang: 'hi' });
    });

    it('a change made on another device is followed', () => {
      expect(decideLangSync({ stored: 'en', rendered: 'hi', pending: null })).toEqual({ kind: 'set-cookie', lang: 'en' });
    });

    it('does nothing when they already agree', () => {
      expect(decideLangSync({ stored: 'hi', rendered: 'hi', pending: null })).toEqual({ kind: 'none' });
      expect(decideLangSync({ stored: 'en', rendered: 'en', pending: null })).toEqual({ kind: 'none' });
    });

    it('AC-02 — an unrecognised stored value reads as English and cannot loop', () => {
      // toLang: anything that is not exactly 'hi' is English.
      expect(decideLangSync({ stored: 'klingon', rendered: 'en', pending: null })).toEqual({ kind: 'none' });
      expect(decideLangSync({ stored: 'klingon', rendered: 'hi', pending: null })).toEqual({ kind: 'set-cookie', lang: 'en' });
    });
  });

  describe('an account with no choice', () => {
    it('QA UI-04b — Hindi picked before this feature existed is adopted onto the account', () => {
      expect(decideLangSync({ stored: null, rendered: 'hi', pending: null })).toEqual({ kind: 'push', lang: 'hi' });
      expect(decideLangSync({ stored: undefined, rendered: 'hi', pending: null })).toEqual({ kind: 'push', lang: 'hi' });
    });

    it('does NOT write English for everyone — “never chose” must stay distinguishable', () => {
      expect(decideLangSync({ stored: null, rendered: 'en', pending: null })).toEqual({ kind: 'none' });
    });
  });
});
