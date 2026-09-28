/**
 * Jira GRW-375 — finding a service however reception spells it, in the browser.
 *
 * The walk-in sheet already holds the whole catalogue before anybody types, so
 * this needs no server, no index and no network: 1–2 ms over 180 services,
 * 8 ms over 1,000. That is why the OpenSearch attempt (GRW-367, reverted in
 * PR #156) was not worth 2.5 GB on a 2 GB box —
 * `docs/tickets/GRW-288-opensearch-service-search.md` has the measurements.
 *
 * Four ways a typed word can match a word of a name, best first:
 *
 * | Pass | Catches | Example |
 * |---|---|---|
 * | exact / starts with | what was typed so far | `pedi` → Pedicure |
 * | contains | a word in the middle | `arms` → Full Arms Waxing |
 * | close spelling | 1–3 wrong letters | `haircat` → Haircut |
 * | sounds the same | another spelling of the same sound | `phacial` → Facial |
 *
 * Every typed word must match something, so "hair colour" is not answered by a
 * service that only has "hair" — but the words may be matched by DIFFERENT
 * words of the name, in any order, which is how "cut hair" finds "Haircut".
 */

/** What the caller wants ranked. `text` is everything searchable about it — its name, and for a combo the services inside. */
export interface Matchable<T> {
  item: T;
  text: string[];
}

const norm = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const words = (s: string): string[] => norm(s).split(' ').filter(Boolean);

/**
 * A rough sound key: the spellings salon words actually arrive in.
 *
 * ph→f ("phacial"), sh→s, ck/qu→k, z→s, double letters collapsed, and every
 * vowel after the first dropped ("menicure" and "manicure" both become mnkr).
 * It is not Soundex or Metaphone — those are tuned for English surnames, and
 * this is tuned for what a front desk types.
 */
export const soundKey = (w: string): string =>
  w
    .replace(/ph/g, 'f')
    .replace(/ck/g, 'k')
    .replace(/qu/g, 'k')
    .replace(/[ckq]/g, 'k')
    .replace(/z/g, 's')
    .replace(/sh/g, 's')
    .replace(/ou/g, 'u')
    .replace(/oo/g, 'u')
    .replace(/ee/g, 'i')
    .replace(/y/g, 'i')
    .replace(/[wh]/g, '')
    .replace(/(.)\1+/g, '$1')
    .replace(/[aeiou]+/g, (m, i: number) => (i === 0 ? m[0]! : ''));

/**
 * Levenshtein distance, abandoned as soon as it passes `max`.
 *
 * The bail-out is what keeps this cheap: most comparisons are between words
 * that are nothing like each other, and those stop after a row or two.
 */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur: number[] = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]!);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length]!;
}

/** How well one typed word matches one word of a name. 0 means no match at all. */
function wordScore(q: string, w: string): number {
  if (w === q) return 100;
  // Shorter name wins a tie: typing "mani" offers Manicure before Manicure Premium.
  if (w.startsWith(q)) return 90 - (w.length - q.length) * 0.1;
  if (q.length >= 3 && w.includes(q)) return 70;

  // One wrong letter in a short word, up to three in a long one. Tighter and
  // "threding" misses Threading; looser and three-letter words match half the
  // catalogue.
  const allowed = q.length <= 4 ? 1 : q.length <= 7 ? 2 : 3;
  const d = editDistance(q, w, allowed);
  if (d <= allowed) return 65 - d * 10;

  // The sound keys must be EQUAL, not merely close. "Close keys" was tried and
  // removed: it matched "waxing" to "Anti-Ageing" (both collapse to a-something
  // -ng) and "bridal" to "beard". Equality still carries "phacial" → Facial and
  // "menicure" → Manicure, which is what the rule is for.
  if (q.length >= 4 && soundKey(q) === soundKey(w)) return 55;
  return 0;
}

/**
 * The shortest term that filters at all. One letter filters too — by plain "contains", exactly as the screens
 * did before this matcher (QA found that ignoring one letter left the combo builder listing 20 unrelated
 * services under "b"). Spelling tolerance starts at two letters: one letter has no spelling to be wrong about.
 */
export const MIN_CHARS = 1;

export interface MatchResult<T> {
  item: T;
  score: number;
}

/**
 * Ranks `candidates` against what was typed: real matches only, best first.
 *
 * An empty query returns everything at score 0 in the given order, so a caller
 * can use one code path for browsing and for searching.
 */
export function matchAll<T>(candidates: ReadonlyArray<Matchable<T>>, query: string): Array<MatchResult<T>> {
  const qs = words(query);
  if (qs.length === 0) return candidates.map(({ item }) => ({ item, score: 0 }));

  const single = norm(query);
  if (single.length < 2) {
    return candidates
      .filter((c) => c.text.some((t) => norm(t).includes(single)))
      .map(({ item }) => ({ item, score: 1 }));
  }

  const joinedQuery = qs.join('');
  const out: Array<MatchResult<T>> = [];

  for (const candidate of candidates) {
    let best = 0;
    for (const text of candidate.text) {
      const ws = words(text);
      if (ws.length === 0) continue;

      let total = 0;
      let matchedEveryWord = true;
      for (const q of qs) {
        let bestWord = 0;
        for (const w of ws) bestWord = Math.max(bestWord, wordScore(q, w));
        if (bestWord === 0) {
          matchedEveryWord = false;
          break;
        }
        total += bestWord;
      }

      let score: number;
      if (matchedEveryWord) {
        score = total / qs.length;
        // The whole phrase from the start: "fruit fac" puts Fruit Facial above
        // Facial, which the per-word average alone would not.
        if (norm(text).startsWith(norm(query))) score += 15;
      } else {
        // The words the typist split or joined: "high lites" → Highlights,
        // "hair cut" → Haircut. A fallback only, or it outranks real matches.
        const joinedText = ws.join('');
        score = Math.max(wordScore(joinedQuery, joinedText), ...ws.map((w) => wordScore(joinedQuery, w)));
      }
      // A short name that matches beats a long one that matches as well: the
      // extra words are noise the typist did not ask for.
      if (score > 0) best = Math.max(best, score - ws.length * 0.5);
    }
    if (best > 0) out.push({ item: candidate.item, score: best });
  }

  return out.sort((a, b) => b.score - a.score);
}

/** `matchAll`, for callers that only want the things themselves. */
export function matchItems<T>(candidates: ReadonlyArray<Matchable<T>>, query: string, limit?: number): T[] {
  const ranked = matchAll(candidates, query).map((r) => r.item);
  return limit === undefined ? ranked : ranked.slice(0, limit);
}
