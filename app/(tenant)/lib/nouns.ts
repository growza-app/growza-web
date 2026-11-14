/**
 * Jira GRW-315 — the vertical's word, or a generic one.
 *
 * "Clients" for a salon, "Patients" for a clinic: the noun is vertical config
 * (`ctx.labels`), never hardcoded. English keeps it. The vertical configs carry
 * no other language yet, so any other language uses a generic word from the
 * `nouns` messages rather than an English noun in the middle of a sentence —
 * what Home already does for Hindi.
 *
 * QA 2026-11-14 (F17) — a clinic's Hindi screens said "सेवाएँ / स्टाफ़" where English said Consultations / Doctors.
 * The labels reaching client components are already in the reader's language (`nounsIn` + `verticalNouns`, salon
 * QA 2026-11-07): परामर्श, डॉक्टर. So a vertical word that is already in that language's script is the vertical's own
 * word and wins; only a word still in English (a server page's raw `me.labels`, or a business's own wording the
 * dictionary does not know) falls back to the generic noun.
 */
export function pickNoun(locale: string, vertical: string, generic: string): string {
  if (locale === 'en') return vertical;
  return isLocalised(vertical) ? vertical : generic;
}

/** A word with no Latin letter in it has been put into the reader's language already. */
export function isLocalised(word: string | undefined): word is string {
  return typeof word === 'string' && word.trim() !== '' && !/[A-Za-z]/.test(word);
}

/**
 * Jira GRW-363 — a vertical's noun as it reads inside a sentence: "Stylist" → "No stylist".
 *
 * Only the first letter is lowered, and only when the rest is already lower case, so a label that
 * is not plain Title case keeps its own spelling: "MUA" stays "No MUA", "Hair Stylist" stays as
 * written. `toLowerCase()` on the whole label turned an acronym into a word nobody uses.
 */
export function nounInSentence(label: string): string {
  const rest = label.slice(1);
  return rest === rest.toLowerCase() ? label.charAt(0).toLowerCase() + rest : label;
}
