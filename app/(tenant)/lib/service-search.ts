import type { Offer, Service } from './api-types';

/**
 * Jira GRW-367 · GRW-288 — what the walk-in sheet shows for what was typed.
 *
 * Two sources, one answer:
 * - the server's typo-tolerant search (OpenSearch), which finds "Facial" for
 *   "phacial" — ids in relevance order, mapped back onto the lists the sheet
 *   already holds;
 * - the old substring filter, which needs nothing but those lists.
 *
 * The server's answer is used only when it is for the term on screen NOW (a
 * slow reply to "fa" must not overwrite results for "facial"). Anything the
 * substring filter finds that the server did not is appended, so switching
 * search on can only ever ADD results, never lose one reception used to see.
 * With search off, down or still answering, this is exactly the old behaviour.
 */

export interface CatalogSearchHit {
  kind: 'service' | 'combo';
  itemId: string;
  score: number;
}

/** The server's reply, tagged with the term it answers. */
export interface RemoteSearch {
  term: string;
  hits: CatalogSearchHit[];
}

/** Below this many characters the server is not asked — two letters is where typos start to mean anything. */
export const REMOTE_MIN_CHARS = 2;
export const RESULT_LIMIT = 20;
export const BROWSE_LIMIT = 6;

export const normaliseTerm = (term: string): string => term.trim().toLowerCase();

export function resolveServiceSearch(input: {
  services: Service[];
  combos: Offer[];
  term: string;
  remote: RemoteSearch | null;
}): { services: Service[]; combos: Offer[] } {
  const q = normaliseTerm(input.term);
  if (!q) return { services: input.services.slice(0, BROWSE_LIMIT), combos: [] };

  const substringServices = input.services.filter((s) => s.name.toLowerCase().includes(q));
  const substringCombos = input.combos.filter((o) => o.title.toLowerCase().includes(q));

  if (!input.remote || input.remote.term !== q) {
    return { services: substringServices.slice(0, RESULT_LIMIT), combos: substringCombos };
  }

  const serviceById = new Map(input.services.map((s) => [s.id, s]));
  const comboById = new Map(input.combos.map((o) => [o.id, o]));
  const ranked = { services: [] as Service[], combos: [] as Offer[] };
  for (const hit of input.remote.hits) {
    // An id the sheet does not hold (deactivated since the sheet loaded, or an
    // index a moment behind) is skipped — never shown as a blank row.
    if (hit.kind === 'service') {
      const s = serviceById.get(hit.itemId);
      if (s && !ranked.services.includes(s)) ranked.services.push(s);
    } else {
      const o = comboById.get(hit.itemId);
      if (o && !ranked.combos.includes(o)) ranked.combos.push(o);
    }
  }
  const services = [...ranked.services, ...substringServices.filter((s) => !ranked.services.includes(s))];
  const combos = [...ranked.combos, ...substringCombos.filter((o) => !ranked.combos.includes(o))];
  return { services: services.slice(0, RESULT_LIMIT), combos };
}
