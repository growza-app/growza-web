'use client';

import { useState } from 'react';
import { adminFetch, AdminApiError } from '../lib/api';
import { Card, SectionTitle, Toggle } from './primitives';
import { oklch } from '../tokens';

/**
 * Jira GRW-692 — mark a business as a test one. The Businesses list and the dashboard leave a test business out
 * unless asked for; nothing about how the business itself works changes, so this saves on the tap, no confirm.
 */
export function TestBusinessCard({ businessId, isTest, onChanged }: { businessId: string; isTest: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const flip = () => {
    setBusy(true);
    setError(null);
    adminFetch(`/businesses/${businessId}/test`, { method: 'POST', body: JSON.stringify({ isTest: !isTest }) })
      .then(onChanged)
      .catch((err) => setError(err instanceof AdminApiError ? err.message : 'Could not save. Try again.'))
      .finally(() => setBusy(false));
  };

  return (
    <Card>
      <SectionTitle title="Test business" />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <p style={{ margin: 0, fontSize: '0.84375rem', lineHeight: 1.5, color: oklch.textMuted }}>
          A test business is left out of the Businesses list and every figure on the dashboard. It still works as normal.
        </p>
        <Toggle on={isTest} onClick={flip} disabled={busy} label="Test business" />
      </div>
      {error ? (
        <div role="alert" style={{ marginTop: 10, fontSize: '0.8125rem', color: oklch.danger }}>
          {error}
        </div>
      ) : null}
    </Card>
  );
}
