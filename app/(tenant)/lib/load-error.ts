import { copy } from './copy';

/**
 * Why a page could not load, in the only two ways the owner needs told apart.
 *
 * - `busy` — the API answered HTTP 429 `rate_limited`. The server is fine; it
 *   is asking for a moment. Nothing for anyone to fix.
 * - `down` — everything else: a network failure (no response at all), a 5xx,
 *   or a status this screen does not single out. This is the message every
 *   page showed for ALL errors before, so its behaviour is unchanged.
 *
 * Every page that used to print `copy.errors.apiDown` from a bare `catch` goes
 * through here, so a 429 cannot be reported as "cannot reach the server" by
 * one screen while another gets it right.
 */
export type LoadErrorKind = 'busy' | 'down';

/**
 * Duck-typed on `status` / `code` rather than `instanceof ApiError`. This is
 * called from server components AND a client component, and a class identity
 * is not guaranteed to survive both bundles; the two fields are what
 * `ApiError` promises (lib/api.ts) and are all this needs. It also keeps
 * `api.ts` — and its `next/headers` import — out of a unit test.
 */
export function loadErrorKind(error: unknown): LoadErrorKind {
  if (typeof error === 'object' && error !== null) {
    const { status, code } = error as { status?: unknown; code?: unknown };
    if (status === 429 || code === 'rate_limited') return 'busy';
  }
  return 'down';
}

/** The headline for a failed load. `down` keeps its old, headline-only wording. */
export function loadErrorTitle(kind: LoadErrorKind): string {
  return kind === 'busy' ? copy.errors.busy : copy.errors.apiDown;
}

/**
 * One line for a place that shows a single string — the notifications page.
 * A busy answer gets its "try again" with it; `down` stays exactly as it was.
 */
export function loadErrorMessage(error: unknown): string {
  return loadErrorKind(error) === 'busy' ? `${copy.errors.busy} ${copy.errors.busyHelp}` : copy.errors.apiDown;
}
