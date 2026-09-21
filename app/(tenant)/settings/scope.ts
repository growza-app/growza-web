import { api, type SettingsSummary } from '../lib/api';
import { loadErrorKind, type LoadErrorKind } from '../lib/load-error';

/**
 * Jira GRW-230 — the settings a tab loads: the picked branch's (`?branch=`),
 * or the business's. A branch id that no longer resolves (closed, or a stale
 * link) falls back to the business view rather than breaking the screen.
 */
export async function loadScopedSettings(
  searchParams: Promise<{ branch?: string }>,
): Promise<{ settings: SettingsSummary | null; branchName: string | null; loadError: LoadErrorKind | null }> {
  const { branch } = await searchParams;
  // Jira GRW-352 — keep WHY it failed: a busy API (429) and a down one need different words.
  const failure: { kind: LoadErrorKind | null } = { kind: null };
  const failed = (error: unknown) => {
    failure.kind = loadErrorKind(error);
    return null;
  };
  const settings = (branch ? await api.settings(branch).catch(failed) : null) ?? (await api.settings().catch(failed));
  const branchName = settings?.scope.locationId ? (settings.location?.name ?? null) : null;
  return { settings, branchName, loadError: settings ? null : (failure.kind ?? 'down') };
}

/** Remount a form when its branch, or the branch's own keys, change (after "Use business settings"). */
export function scopeKey(settings: SettingsSummary): string {
  return `${settings.scope.locationId ?? 'all'}:${settings.scope.ownKeys.join(',')}`;
}
