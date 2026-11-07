/**
 * The vertical's own nouns ("Stylist", "Client", "Doctor"…) in the reader's language.
 *
 * They come from the business's vertical definition, in English, and reach client components through `useLabel`. A
 * Hindi screen printed them as they came: New booking said "Client" over the name and "Stylist" beside the chips,
 * with everything around them in Hindi (salon QA 2026-11-07). `messages/*.json` → `verticalNouns` holds every noun the
 * vertical definitions use; a word it does not know — a business's own wording — is left as typed.
 */
export function nounsIn(labels: Record<string, string>, words: Record<string, string> | undefined): Record<string, string> {
  if (!words) return labels;
  return Object.fromEntries(Object.entries(labels).map(([key, word]) => [key, words[word] ?? word]));
}
