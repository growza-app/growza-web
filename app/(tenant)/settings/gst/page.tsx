import { screenTitle } from '../../lib/page-title';
import { LoadErrorBanner } from '../../components/LoadErrorBanner';
import { loadScopedSettings, scopeKey } from '../scope';
import { GstForm } from './GstForm';

export const dynamic = 'force-dynamic';

/**
 * Jira GRW-582 — Settings › GST and invoices.
 *
 * The registration is the business's; the card below it is a branch's own — its state decides CGST + SGST or IGST,
 * and a branch in another state holds its own GSTIN. Review of the overnight stack (item 15): that branch is the one
 * the header's picker shows, loaded and saved the same way every other per-branch setting is (`loadScopedSettings`).
 * It used to read the business's settings with no branch, so at a business with several branches the card always
 * edited the main branch, whatever the header said.
 */
export default async function GstSettingsPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  const { settings, branchName, loadError } = await loadScopedSettings(searchParams);
  if (!settings) return <LoadErrorBanner kind={loadError ?? 'down'} />;
  return <GstForm key={scopeKey(settings)} initial={settings} branchName={branchName ?? settings.location?.name ?? null} />;
}

// Jira GRW-192 — the tab says which screen this is.
export const metadata = screenTitle('GST and invoices');
