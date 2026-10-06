/**
 * Jira GRW-370 — moved to @growza-app/shared (`shared/src/nav-policy.ts`) so the
 * API's tests can check the dashboard's nav against the API's own allowlist
 * without importing web code. Kept as a re-export so every screen's import
 * stays the same.
 *
 * Jira GRW-556 — except `canSee` and `visibleItems`, which take a fourth argument: whether the business is live.
 * They stay the one chokepoint every nav surface asks (the sidebar, the tab bar, the More menu, Home's tiles, the
 * screen guard), so "a business being set up sees four destinations" is decided here and not four times.
 */
import { canSee as roleCanSee, visibleItems as roleVisibleItems, type MemberRole } from '@growza-app/shared';
import { isSetupDestination } from './go-live';

export {
  canSeeReports,
  canSeeRevenue,
  homeHref,
  homeKind,
  mayUse,
  type HomeKind,
  type MemberRole,
  type UiAction,
} from '@growza-app/shared';

/** May this role see this destination — and, until the business is live, is it one of the setup ones? */
export function canSee(href: string, role?: MemberRole | null, reportTabs?: readonly string[], live = true): boolean {
  return (live || isSetupDestination(href)) && roleCanSee(href, role, reportTabs);
}

export function visibleItems<T extends { href: string }>(items: readonly T[], role?: MemberRole | null, reportTabs?: readonly string[], live = true): T[] {
  return roleVisibleItems(items, role, reportTabs).filter((item) => live || isSetupDestination(item.href));
}
