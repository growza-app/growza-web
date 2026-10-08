/**
 * Jira GRW-375 — the server's meaning-based suggestions, and the rules that
 * keep them from making a good list worse.
 *
 * Two sources:
 * - what `service-match.ts` found in the browser, instantly, from spelling;
 * - what `/api/v1/catalog/suggest` found by meaning ("nails" → Manicure),
 *   which needs a round trip and exists only when embeddings are configured.
 *
 * **A neighbour is not a match.** A nearest-neighbour search always returns
 * neighbours: ask it about "facial" and after the three real answers it offers
 * Beard Styling, Head Shave and Bleach, because something has to be tenth.
 * Appending those to a list that was already right is how a working search
 * starts looking broken (reported on the first run of this feature).
 *
 * So a suggestion has to clear two floors — an absolute one, and one relative
 * to the reply's own best hit — and no more than a handful are ever shown. On
 * this catalogue that leaves "nails" bringing Manicure and Pedicure up, and
 * "facial" adding nothing at all, because it had nothing to add.
 *
 * A reply is used only while it answers the term on screen NOW, so a slow
 * answer for "fac" cannot overwrite the results for "facial".
 */

import { priceAsked } from './service-match';

export interface SuggestionHit {
  serviceId: string;
  score: number;
}

/** The model's bars (Jira GRW-389): each model scores on its own scale, so the server says what "close" means. */
export interface SuggestFloors {
  rescue: number;
  withMatches: number;
}

/** The server's reply, tagged with the term it answers. */
export interface RemoteSuggestions {
  term: string;
  hits: SuggestionHit[];
  /** Absent only from a server older than GRW-389, which ran all-minilm — the defaults below are its numbers. */
  floors?: SuggestFloors;
}

/** Below this the server is not asked: fewer letters mean more round trips for less meaning. */
export const SUGGEST_MIN_CHARS = 4;
/** How long the typist must pause before the request goes. */
export const SUGGEST_DEBOUNCE_MS = 300;
/**
 * Two floors, because the bar depends on what the browser already found. These are all-minilm's; since Jira
 * GRW-389 the server sends the running model's own (`SuggestFloors`), and these are only the fallback.
 *
 * Measured on a real 52-service salon: "cut my hair" scores 0.76, "clean my
 * face" 0.59, "tired shoulders" 0.54 — while "car repair" reaches 0.36,
 * "relax" 0.29 and "pizza" 0.20.
 *
 * When the list is EMPTY, 0.5 is the rescue: the typist wrote something the
 * catalogue does not say, and a decent neighbour beats "no services match".
 * When the list already has rows, the bar goes up: an extra has to be clearly
 * related, or "makeup" quietly grows a Facial and "haircat" grows a Hair Spa.
 */
export const MIN_SCORE_RESCUE = 0.5;
/**
 * 0.66, not 0.6: QA found "haircat" adding Hair Spa at 0.651 beside a correct Haircut. The meaning rescues that
 * earn a place next to real matches score well above this ("nails" → French Manicure 0.70, Pedicure 0.76).
 */
export const MIN_SCORE_WITH_MATCHES = 0.66;
/** And nothing much worse than the best hit: "nails" may bring Manicure, not everything down to Head Shave. */
export const RELATIVE_FLOOR = 0.85;
/** At most this many, however good they look. The rescue is a handful of rows, not a second list. */
export const MAX_SUGGESTIONS = 5;

export function normaliseTerm(term: string): string {
  return term.trim().toLowerCase();
}

/**
 * True when this term is long enough to be worth a request — and is words rather than a price.
 *
 * A price search ("1200", owner 2026-10-07) is answered exactly, in the browser, from a number the screen
 * already holds. Asking a meaning model what 1200 means is a round trip for an answer that cannot be right:
 * nearest-neighbour always returns neighbours, so it would hand back five services that merely have digits
 * near them in the embedding space and offer them as "also try".
 */
export function shouldAskServer(term: string): boolean {
  if (priceAsked(term) !== null) return false;
  return normaliseTerm(term).length >= SUGGEST_MIN_CHARS;
}

/** The hits worth showing: above the floor for this case, close to the best, and few. */
export function usefulHits(
  hits: SuggestionHit[],
  hasLocalMatches: boolean,
  floors: SuggestFloors = { rescue: MIN_SCORE_RESCUE, withMatches: MIN_SCORE_WITH_MATCHES },
): SuggestionHit[] {
  const floor = hasLocalMatches ? floors.withMatches : floors.rescue;
  const best = hits[0]?.score ?? 0;
  if (best < floor) return [];
  return hits.filter((h) => h.score >= floor && h.score >= best * RELATIVE_FLOOR).slice(0, MAX_SUGGESTIONS);
}

/**
 * The suggestions worth showing BESIDE what the browser matched — never mixed into that list.
 *
 * QA found the appended rows landing below the walk-in list's four-row fold, where nobody saw them. So they are
 * returned separately and the sheet shows them as their own short "Also try" row, always in view, while the
 * typed matches keep their list and their order untouched.
 */
export function extraSuggestions<T>(
  local: ReadonlyArray<T>,
  remote: RemoteSuggestions | null,
  term: string,
  byId: (id: string) => T | undefined,
): T[] {
  if (!remote || remote.term !== normaliseTerm(term)) return [];
  const extras: T[] = [];
  for (const hit of usefulHits(remote.hits, local.length > 0, remote.floors)) {
    const item = byId(hit.serviceId);
    // An id the sheet does not hold — deactivated since it loaded, or a vector a moment behind the catalogue —
    // is skipped, never shown as a blank chip.
    if (item && !local.includes(item) && !extras.includes(item)) extras.push(item);
  }
  return extras;
}
