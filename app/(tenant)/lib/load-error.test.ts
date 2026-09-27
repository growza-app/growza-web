import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import { loadErrorKind } from './load-error';

/**
 * A 429 is the API saying "one moment", not "I am gone". Every page used to
 * answer any failure with "Cannot reach the server … run npm run dev", so an
 * owner who was only rate-limited went looking for a dead server.
 */

/** Same shape as `ApiError` in lib/api.ts — status, code, message. */
const apiError = (status: number, code?: string) => Object.assign(new Error(`failed: ${status}`), { status, code });

describe('loadErrorKind', () => {
  it('calls a 429 busy', () => {
    expect(loadErrorKind(apiError(429, 'rate_limited'))).toBe('busy');
  });

  it('calls it busy on the status alone, even when the body had no code', () => {
    expect(loadErrorKind(apiError(429))).toBe('busy');
  });

  it('calls it busy on the code alone', () => {
    expect(loadErrorKind({ code: 'rate_limited' })).toBe('busy');
  });

  it.each([500, 502, 503, 504])('keeps a %i as down', (status) => {
    expect(loadErrorKind(apiError(status))).toBe('down');
  });

  it.each([400, 401, 404])('keeps a %i as down — only 429 and 403 are singled out', (status) => {
    expect(loadErrorKind(apiError(status))).toBe('down');
  });

  it('calls a 403 forbidden, not down: the server answered, and said this role may not see it (GRW-395 QA)', () => {
    expect(loadErrorKind(apiError(403))).toBe('forbidden');
  });

  it('keeps a network failure as down', () => {
    // What `fetch` throws when nothing answers: a TypeError with no status.
    expect(loadErrorKind(new TypeError('fetch failed'))).toBe('down');
  });

  it.each([null, undefined, 'boom', 429, {}])('does not trust a non-error thrown value: %j', (thrown) => {
    expect(loadErrorKind(thrown)).toBe('down');
  });

  it('does not read a 429 out of a string status', () => {
    expect(loadErrorKind({ status: '429' })).toBe('down');
  });
});

describe('the busy wording', () => {
  it('gives an owner no developer jargon when the server is only busy', () => {
    const shown = `${en.errors.busy} ${en.errors.busyHelp}`;
    expect(shown).not.toMatch(/npm|developer|server|unreachable|cannot reach/i);
    expect(shown).toMatch(/busy/i);
    expect(shown).toMatch(/try again/i);
  });

  it('keeps the developer hint for a genuinely unreachable server', () => {
    expect(en.errors.downHelp).toMatch(/npm run dev/);
  });
});

describe('a real fetch failure', () => {
  it('reads an AggregateError cause and all as down, and hands back a plain string', () => {
    // What Node's fetch throws when the API is not listening. Its `cause` is the
    // shape that crashed React's dev serialiser when a page passed the error
    // itself down as a prop (see LoadErrorBanner); the kind it maps to is what a
    // page may safely pass.
    const refused = Object.assign(new TypeError('fetch failed'), {
      cause: Object.assign(new AggregateError([new Error('connect ECONNREFUSED ::1:3011')]), { code: 'ECONNREFUSED' }),
    });
    expect(loadErrorKind(refused)).toBe('down');
    expect(typeof loadErrorKind(refused)).toBe('string');
  });
});
