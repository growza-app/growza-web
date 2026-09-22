/**
 * Jira GRW-370 — moved to @growza-app/shared (`shared/src/nav-policy.ts`) so the
 * API's tests can check the dashboard's nav against the API's own allowlist
 * without importing web code. Kept as a re-export so every screen's import
 * stays the same.
 */
export {
  canSee,
  canSeeReports,
  canSeeRevenue,
  homeHref,
  homeKind,
  visibleItems,
  type HomeKind,
  type MemberRole,
} from '@growza-app/shared';
