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
