/**
 * Jira GRW-315 — the vertical's word, or a generic one.
 *
 * "Clients" for a salon, "Patients" for a clinic: the noun is vertical config
 * (`ctx.labels`), never hardcoded. English keeps it. The vertical configs carry
 * no other language yet, so any other language uses a generic word from the
 * `nouns` messages rather than an English noun in the middle of a sentence —
 * what Home already does for Hindi. Story 5 (vertical labels per language)
 * replaces this with the vertical's own word in each language.
 */
export function pickNoun(locale: string, vertical: string, generic: string): string {
  return locale === 'en' ? vertical : generic;
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
