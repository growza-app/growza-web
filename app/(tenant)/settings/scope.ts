import { api, type SettingsSummary } from '../lib/api';
import { loadErrorKind, type LoadErrorKind } from '../lib/load-error';

/**
 * The settings a branch tab loads.
 *
 * - One branch: the business's own settings, exactly as before branches existed.
 * - Several: always ONE branch's (Jira GRW-396 — Settings has no "all branches"). The one in the address
 *   (`?branch=`, put there from the header's picker by `BranchUrlSync`), else the main branch. A branch id that
 *   no longer resolves (closed, or a stale link) shows the main branch rather than breaking the screen.
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
  const done = (settings: SettingsSummary | null) => ({
    settings,
    branchName: settings?.scope.locationId ? (settings.location?.name ?? null) : null,
    loadError: settings ? null : (failure.kind ?? 'down'),
  });

  const asked = branch && branch !== 'all' ? await api.settings(branch).catch(failed) : null;
  if (asked && asked.branchCount > 1) return done(asked);

  const business = await api.settings().catch(failed);
  if (!business || business.branchCount <= 1 || !business.location) return done(business);
  // The business view names the main branch as its `location`.
  return done(await api.settings(business.location.id).catch(failed));
}

/**
 * Remount a form when its branch changes. Not when the branch's own keys change: a save gives the branch its own
 * values and refreshes the page so the note above says so, and a remount there threw away the form's "Saved"
 * (GRW-396 QA). "Use business settings", the one change that alters what the form shows, reloads the page.
 */
export function scopeKey(settings: SettingsSummary): string {
  return settings.scope.locationId ?? 'all';
}
