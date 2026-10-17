import { screenTitle } from '../../lib/page-title';
import { api } from '../../lib/api';
import { LoadErrorBanner } from '../../components/LoadErrorBanner';
import { loadErrorKind } from '../../lib/load-error';
import { GstForm } from './GstForm';

export const dynamic = 'force-dynamic';

/**
 * Jira GRW-582 — Settings › GST and invoices.
 *
 * Not scoped by a branch picker: the registration is the business's, and the one branch-level card below it belongs
 * to whichever branch this Settings is showing. A business with several branches sets each one's state from that
 * branch's own Settings, the same way hours and the payment QR already work.
 */
export default async function GstSettingsPage() {
  let settings;
  try {
    settings = await api.settings();
  } catch (error) {
    return <LoadErrorBanner kind={loadErrorKind(error)} />;
  }
  return <GstForm initial={settings} branchName={settings.location?.name ?? null} />;
}

// Jira GRW-192 — the tab says which screen this is.
export const metadata = screenTitle('GST and invoices');
