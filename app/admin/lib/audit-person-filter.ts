/**
 * Admin audit 2026-10-09, L9 (review fixes) — the Admin and Business boxes on the Audit log.
 *
 * A name is searched with a wildcard across the whole log, so a request per keystroke was a full-table query per
 * keystroke: the boxes wait `NAME_SEARCH_DEBOUNCE_MS` after the last one. An id goes as the `actorId` / `tenantId`
 * every API has always read, so it filters correctly on a server with or without the name search.
 */
export const NAME_SEARCH_DEBOUNCE_MS = 350;

/** Same shape as the API's `UUID_RE` (src/platform/ids.ts): any 32 hex digits, no version check. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Sets the person filters on `params`; true when a NAME search was sent — one an older API would ignore. */
export function applyPersonFilters(params: URLSearchParams, typed: { actor: string; business: string }): boolean {
  let byName = false;
  const actor = typed.actor.trim();
  if (actor) {
    if (UUID_RE.test(actor)) params.set('actorId', actor);
    else {
      params.set('actor', actor);
      byName = true;
    }
  }
  const business = typed.business.trim();
  if (business) {
    if (UUID_RE.test(business)) params.set('tenantId', business);
    else {
      params.set('business', business);
      byName = true;
    }
  }
  return byName;
}

/** What to say when the server answered a name search without reading it — it sent every row, unfiltered. */
export const NAME_SEARCH_UNSUPPORTED = 'Searching by name is not available on this server yet. Paste the full id instead.';
