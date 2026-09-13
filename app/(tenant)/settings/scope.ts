import { api, type SettingsSummary } from '../lib/api';

/**
 * Jira GRW-230 — the settings a tab loads: the picked branch's (`?branch=`),
 * or the business's. A branch id that no longer resolves (closed, or a stale
 * link) falls back to the business view rather than breaking the screen.
 */
export async function loadScopedSettings(
  searchParams: Promise<{ branch?: string }>,
): Promise<{ settings: SettingsSummary | null; branchName: string | null }> {
  const { branch } = await searchParams;
  const settings = (branch ? await api.settings(branch).catch(() => null) : null) ?? (await api.settings().catch(() => null));
  const branchName = settings?.scope.locationId ? (settings.location?.name ?? null) : null;
  return { settings, branchName };
}

/** Remount a form when its branch, or the branch's own keys, change (after "Use business settings"). */
export function scopeKey(settings: SettingsSummary): string {
  return `${settings.scope.locationId ?? 'all'}:${settings.scope.ownKeys.join(',')}`;
}
