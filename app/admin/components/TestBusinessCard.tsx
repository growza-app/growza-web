'use client';

import { useState } from 'react';
import { adminFetch, AdminApiError } from '../lib/api';
import { ConfirmDialog } from './ConfirmDialog';
import { Card, SectionTitle, Toggle } from './primitives';
import { oklch } from '../tokens';

/**
 * Jira GRW-692 — mark a business as a test one. The Businesses list and the dashboard leave a test business out
 * unless asked for; nothing about how the business itself works changes.
 *
 * QA loophole L1, 11 Nov 2026 — hiding a business from every figure is not a tap: the switch now asks why (audited),
 * and the API refuses it for a business that has ever paid Growza, with the reason shown here.
 */
export function TestBusinessCard({
  businessId,
  businessName,
  isTest,
  onChanged,
}: {
  businessId: string;
  businessName: string;
  isTest: boolean;
  onChanged: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = !isTest;

  const save = (reason: string) => {
    setBusy(true);
    setError(null);
    adminFetch(`/businesses/${businessId}/test`, { method: 'POST', body: JSON.stringify({ isTest: next, reason }) })
      .then(() => {
        setAsking(false);
        onChanged();
      })
      .catch((err) => setError(err instanceof AdminApiError ? err.message : 'Could not save. Try again.'))
      .finally(() => setBusy(false));
  };

  return (
    <Card>
      <SectionTitle title="Test business" />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <p style={{ margin: 0, fontSize: '0.84375rem', lineHeight: 1.5, color: oklch.textMuted }}>
          A test business is left out of the Businesses list and every figure on the dashboard. It still works as normal.
          A business that has paid Growza cannot be marked.
        </p>
        <Toggle
          on={isTest}
          onClick={() => {
            setError(null);
            setAsking(true);
          }}
          disabled={busy}
          label="Test business"
        />
      </div>
      <ConfirmDialog
        open={asking}
        title={next ? `Mark ${businessName} as a test business?` : `Count ${businessName} again?`}
        description={
          next
            ? 'It will be left out of the Businesses list, Needs attention, the Overdue Payment tile and every figure on the dashboard.'
            : 'It will be back in the Businesses list and every figure on the dashboard.'
        }
        confirmLabel={next ? 'Mark as test' : 'Count it again'}
        reasonRequired
        reasonPlaceholder={next ? 'Why? For example: our own demo salon.' : 'Why? For example: a real client after all.'}
        loading={busy}
        error={error}
        onConfirm={save}
        onCancel={() => setAsking(false)}
      />
    </Card>
  );
}
