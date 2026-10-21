import { notFound } from 'next/navigation';
import { screenTitle } from '../../lib/page-title';
import { api, ApiError } from '../../lib/api';
import { LoadErrorBanner } from '../../components/LoadErrorBanner';
import { loadErrorKind } from '../../lib/load-error';
import { RolesScreen } from './RolesScreen';

export const dynamic = 'force-dynamic';

/**
 * Jira GRW-72 — Settings › Roles. A shop's owner only: a salon, or anyone who is not the owner, is told there is nothing here,
 * the same answer the API gives them.
 */
export default async function RolesSettingsPage() {
  let payload;
  try {
    payload = await api.roles();
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 403)) notFound();
    return <LoadErrorBanner kind={loadErrorKind(error)} />;
  }
  return <RolesScreen initial={payload} />;
}

export const metadata = screenTitle('Roles');
