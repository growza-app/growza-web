import { describe, expect, it } from 'vitest';
import { copy } from './copy';
import { loadErrorKind, loadErrorMessage, loadErrorTitle } from './load-error';

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

  it.each([400, 401, 403, 404])('keeps a %i as down — only 429 is singled out', (status) => {
    expect(loadErrorKind(apiError(status))).toBe('down');
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

describe('loadErrorTitle / loadErrorMessage', () => {
  it('says the app is busy for a 429, without the server-is-dead wording', () => {
    const err = apiError(429, 'rate_limited');
    expect(loadErrorTitle(loadErrorKind(err))).toBe(copy.errors.busy);
    expect(loadErrorMessage(err)).toBe(`${copy.errors.busy} ${copy.errors.busyHelp}`);
  });

  it('keeps the existing apiDown message for a network failure or a 5xx', () => {
    for (const err of [new TypeError('fetch failed'), apiError(500), apiError(503)]) {
      expect(loadErrorTitle(loadErrorKind(err))).toBe(copy.errors.apiDown);
      expect(loadErrorMessage(err)).toBe(copy.errors.apiDown);
    }
  });

  it('reads a real fetch failure — an AggregateError cause and all — as down', () => {
    // What Node's fetch throws when the API is not listening. Its `cause` is
    // the shape that crashed React's dev serialiser when a page passed the
    // error itself down as a prop (see LoadErrorBanner); the kind it maps to
    // is what a page may safely pass.
    const refused = Object.assign(new TypeError('fetch failed'), {
      cause: Object.assign(new AggregateError([new Error('connect ECONNREFUSED ::1:3011')]), { code: 'ECONNREFUSED' }),
    });
    expect(loadErrorKind(refused)).toBe('down');
    expect(typeof loadErrorKind(refused)).toBe('string');
  });

  it('gives an owner no developer jargon when the server is only busy', () => {
    const shown = `${copy.errors.busy} ${copy.errors.busyHelp}`;
    expect(shown).not.toMatch(/npm|developer|server|unreachable|cannot reach/i);
    expect(shown).toMatch(/busy/i);
    expect(shown).toMatch(/try again/i);
  });
});
