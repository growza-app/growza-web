/**
 * The words for a client band's boundaries — "0–14 days" — in the reader's language.
 *
 * QA 2026-10-26. These four ranges were written out as finished strings in the message files, once per
 * language, because they never varied: every business used 0–30 / 31–45 / 46–90 / 90+. `client_segment_days`
 * made them a property of the vertical, a restaurant's became 14 / 30 / 60, and the words stayed behind — a
 * card reading "Coming in · 29 · 0–30 days" under a rule that stops at 14.
 *
 * The API sends the numbers and this turns them into the sentence, so the boundary is stated once (in the
 * vertical) and worded once (in the message files). The fallback is the salon's, for a response cached
 * before the API sent any.
 */
export type SegmentKey = 'active' | 'due' | 'at_risk' | 'inactive';

/** What every vertical used before the restaurant asked for its own. */
export const DEFAULT_SEGMENT_RANGE: Record<SegmentKey, { from: number; to: number | null }> = {
  active: { from: 0, to: 30 },
  due: { from: 31, to: 45 },
  at_risk: { from: 46, to: 90 },
  inactive: { from: 90, to: null },
};

/**
 * The numbers a band's message needs: `segments.active.range` is "0–{to} days" / "0–{to} दिन".
 *
 * Values and not a finished string, so each screen calls its OWN `useTranslations` and next-intl's types
 * stay honest. A first draft had this call the translator for them and had to widen its signature to `never`
 * to compile, which is the shape of a helper reaching somewhere it should not.
 */
export function segmentRangeValues(
  key: SegmentKey,
  range?: { from: number; to: number | null },
): { from: number; to: number } {
  const { from, to } = range ?? DEFAULT_SEGMENT_RANGE[key];
  return { from, to: to ?? from };
}
