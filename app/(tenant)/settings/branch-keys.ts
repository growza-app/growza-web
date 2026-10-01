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
export const REMINDER_KEYS = ['reminder_rules'];
