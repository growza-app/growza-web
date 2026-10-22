/**
 * Jira GRW-635 — the words for a return's reason are looked up by one of these keys. A code the dashboard does not know (a newer server) reads as
 * "something else" rather than as a missing word; no code at all reads as "no reason given".
 */
export const RETURN_REASON_KEYS = ['size', 'not_as_described', 'faulty', 'wrong_item', 'changed_mind', 'other', 'not_said'] as const;
export type ReturnReasonKey = (typeof RETURN_REASON_KEYS)[number];

export function returnReasonKey(code: string | null | undefined): ReturnReasonKey {
  if (code === null || code === undefined) return 'not_said';
  return (RETURN_REASON_KEYS as readonly string[]).includes(code) ? (code as ReturnReasonKey) : 'other';
}
