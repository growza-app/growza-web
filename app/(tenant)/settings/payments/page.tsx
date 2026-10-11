import { screenTitle } from '../../lib/page-title';
import { api } from '../../lib/api';
import { LoadErrorBanner } from '../../components/LoadErrorBanner';
import { loadErrorKind } from '../../lib/load-error';
import { PaymentQrForm } from './PaymentQrForm';

export const dynamic = 'force-dynamic';

/**
 * Settings › Payments — the QR the salon shows at the till (owner, 2026-10-11).
 *
 * One upload for the business, and one per branch for a salon that banks per
 * branch. A branch with none shows the business's, which is the state most
 * branches stay in, so the business card comes first and the branch cards read
 * as exceptions to it.
 */
export default async function PaymentsSettingsPage() {
  let state;
  try {
    state = await api.paymentQr();
  } catch (error) {
    return <LoadErrorBanner kind={loadErrorKind(error)} />;
  }
  return <PaymentQrForm initial={state} />;
}

// Jira GRW-192 — the tab says which screen this is.
export const metadata = screenTitle('Payments');
