/**
 * The branch-setting keys each branch tab edits (`BRANCH_SETTING_KEYS` in src/modules/tenant/branch-settings.ts)
 * — what that tab's note means by "its own", "Use business settings" and "Apply to all branches".
 *
 * Closed days are not among the booking rules' keys: a branch's closed days are a list of its own on top of the
 * business's (a holiday for every branch), not a value that replaces it, so neither resetting nor applying the
 * rules may touch them. Every-branch closed days are added and removed on the form itself (Jira GRW-396).
 */
export const HOURS_KEYS = ['working_hours', 'attendance_late_grace_min'];
export const BOOKING_RULE_KEYS = ['slot_granularity_min', 'slot_policy', 'min_notice_min', 'booking_horizon_days', 'cancellation_cutoff_min'];
/**
 * The booking rules that bind only a client booking or cancelling by WhatsApp (owner, 2026-10-10): the desk books
 * with no notice and cancels at any time. Without WhatsApp booking they are not drawn — and "Copy to all", "Use the
 * usual settings" and "has its own" must mean the rules on screen, or copying would change what nobody can see.
 *
 * The ONE list: the form draws a field only when `showsBookingRule` says so, and the note takes `bookingRuleKeys`,
 * so the two cannot disagree about which rules are on the page.
 */
export const WHATSAPP_ONLY_BOOKING_KEYS: readonly string[] = ['min_notice_min', 'booking_horizon_days', 'cancellation_cutoff_min'];

export function showsBookingRule(key: string, whatsappLive: boolean): boolean {
  return whatsappLive || !WHATSAPP_ONLY_BOOKING_KEYS.includes(key);
}

export function bookingRuleKeys(whatsappLive: boolean): string[] {
  return BOOKING_RULE_KEYS.filter((k) => showsBookingRule(k, whatsappLive));
}
export const REMINDER_KEYS = ['reminder_rules'];
