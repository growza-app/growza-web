import { redirect } from 'next/navigation';
import { screenTitle } from '../../lib/page-title';
import { api } from '../../lib/api';
import { LoadErrorBanner } from '../../components/LoadErrorBanner';
import { loadErrorKind } from '../../lib/load-error';
import { ProfileForm } from '../profile/ProfileForm';

export const dynamic = 'force-dynamic';

/**
 * Jira GRW-396 — what a business with several branches has only once: its name, logo and time zone.
 *
 * Business profile became one branch's profile (its name, address, phone and "about"), so these needed a home
 * of their own. A one-branch business edits all of it on Business profile, as before, and never sees this row.
 */
export default async function BusinessSettingsPage() {
  let settings;
  try {
    settings = await api.settings();
  } catch (error) {
    return <LoadErrorBanner kind={loadErrorKind(error)} />;
  }
  if (settings.branchCount <= 1) redirect('/settings/profile');
  return <ProfileForm initial={settings} branchCount={settings.branchCount} />;
}

// Jira GRW-192 — the tab says which screen this is.
export const metadata = screenTitle('Business name and logo');
