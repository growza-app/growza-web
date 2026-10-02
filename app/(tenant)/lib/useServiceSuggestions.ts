'use client';

/**
 * Jira GRW-449 — asking the server what a typed term MEANS, for any screen that searches services.
 *
 * The rules for using the answer live in `service-suggest.ts` and are pure. This is the other half — when to
 * ask, when not to, and what to remember — and it was written out longhand inside the walk-in sheet. The
 * package builder and the Services screen search the same catalogue for the same reason and had only the
 * browser's spelling matching, so "nails" found Manicure at the front desk and nothing anywhere else.
 *
 * Four rules, and all three screens now get them from here rather than from a copy:
 *
 * - **Not before there is a word.** Under `SUGGEST_MIN_CHARS` the request costs a round trip to rank the whole
 *   catalogue against two letters.
 * - **Not while the typist is typing.** Only the WAIT is cancelled on the next keystroke, never a request
 *   already sent: a reply is tagged with its term and ignored once the box says something else, so letting it
 *   finish costs nothing — and it is how a slow 503 still switches the screen off. Cancelling it cost one more
 *   request (QA, GRW-375).
 * - **Never twice for the same question.** Typing "facial", back to "faci", then "facial" again asks once.
 *   Searches can be paid calls (GRW-389). The cache is per branch, because the answer is (GRW-390).
 * - **A 503 is final.** Meaning search is optional and unset on the prod box today, so the normal answer is
 *   "not configured". One of those switches it off for the life of the screen rather than costing a failed
 *   request per keystroke.
 *
 * Returns the last usable reply, or null. The caller hands it to `extraSuggestions`, which is what decides
 * whether any of it is worth showing.
 */

import { useEffect, useRef, useState } from 'react';
import { ApiError, api } from './api';
import { SUGGEST_DEBOUNCE_MS, normaliseTerm, shouldAskServer, type RemoteSuggestions } from './service-suggest';

export function useServiceSuggestions(term: string, branch?: string | null): RemoteSuggestions | null {
  const [remote, setRemote] = useState<RemoteSuggestions | null>(null);
  const offRef = useRef(false);
  const cacheRef = useRef(new Map<string, RemoteSuggestions>());

  useEffect(() => {
    if (offRef.current || !shouldAskServer(term)) return;
    const q = normaliseTerm(term);
    const key = `${branch ?? ''}|${q}`;
    const cached = cacheRef.current.get(key);
    if (cached) {
      setRemote(cached);
      return;
    }
    const timer = setTimeout(() => {
      api
        .suggestCatalog(q, branch ?? undefined)
        .then(({ hits, floors }) => {
          const reply: RemoteSuggestions = { term: q, hits, floors };
          cacheRef.current.set(key, reply);
          setRemote(reply);
        })
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.status === 503) offRef.current = true;
        });
    }, SUGGEST_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [term, branch]);

  return remote;
}
