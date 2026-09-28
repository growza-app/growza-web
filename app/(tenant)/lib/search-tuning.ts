/**
 * Jira GRW-422 — when the dashboard asks the server what somebody is typing.
 *
 * Two numbers, defined once. They were `< 2` and `250` copy-pasted into three
 * files, which is how the Clients list ended up with no minimum at all: a
 * single keystroke fired a request, and so did clearing the box.
 *
 * They answer different questions, and it is worth keeping them apart:
 *
 * `SEARCH_MIN_CHARS` protects the TYPIST. Too low and one letter matches half
 * the salon; too high and a real client cannot be found. Two, not three: short
 * Indian names are ordinary — Om, Jai, Anu, Raj — and at three a client called
 * Om is unfindable by name, by somebody standing at a counter with a queue.
 *
 * `SEARCH_DEBOUNCE_MS` protects the SERVER, and is the cheaper lever of the
 * two. Every keystroke resets it, so the request goes once the fingers stop.
 * A hesitant typist on a phone — which is who is at the counter — leaves
 * 300–400ms between letters, so at 250ms each letter fired its own request
 * and at 350ms most of them collapse into one. The cost is a tenth of a second
 * after the last keystroke, which is below noticing.
 *
 * Service search deliberately uses neither: its spelling match never leaves
 * the browser, and its meaning match has its own measured floor in
 * `service-suggest.ts`.
 */

/** Shorter than this is not worth asking about — but an EMPTY box is not "short", it is "everyone". */
export const SEARCH_MIN_CHARS = 2;

/** How long the typist must pause before the request goes. */
export const SEARCH_DEBOUNCE_MS = 350;

/**
 * Should this term be sent at all?
 *
 * The empty case is the one a plain `length < MIN` check gets wrong: on a list
 * screen an empty box means "list everyone", so it must still be fetched
 * (BR-01). Only a term that is present and too short is skipped.
 */
export const worthSearching = (term: string): boolean => {
  const trimmed = term.trim();
  return trimmed.length === 0 || trimmed.length >= SEARCH_MIN_CHARS;
};
