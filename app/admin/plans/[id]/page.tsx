'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { adminFetch, AdminApiError } from '../../lib/api';
import { Card, EmptyState, SecondaryButton } from '../../components/primitives';
import { PlanForm, type PlanDetail, type PlanVersion } from '../../components/PlanForm';
import { oklch } from '../../tokens';

/**
 * GRW-108 — the real plan record, its version history, and enough of the
 * rest of the platform (every other plan's status) to warn before retiring
 * the last active one (AC-03) — all fetched here so PlanForm stays a pure
 * presentation/edit component.
 */

interface PlansListRow {
  code: string;
  status: string;
}

export default function EditPlanPage() {
  const params = useParams<{ id: string }>();
  const [plan, setPlan] = useState<PlanDetail | null>(null);
  const [versions, setVersions] = useState<PlanVersion[]>([]);
  const [otherActivePlansCount, setOtherActivePlansCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNotFound(false);

    Promise.all([
      adminFetch<PlanDetail>(`/plans/${params.id}`),
      adminFetch<{ rows: PlanVersion[]; currentVersion: number }>(`/plans/${params.id}/versions`),
      adminFetch<{ rows: PlansListRow[] }>('/plans'),
    ])
      .then(([planResult, versionsResult, plansResult]) => {
        if (cancelled) return;
        setPlan(planResult);
        setVersions(versionsResult.rows);
        setOtherActivePlansCount(plansResult.rows.filter((p) => p.status === 'active' && p.code !== planResult.code).length);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof AdminApiError && err.status === 404) setNotFound(true);
        else setError(err instanceof AdminApiError ? err.message : 'Could not load this plan.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [params.id, retryToken]);

  if (notFound) {
    return <EmptyState icon="plans" title="Plan not found" sub={`No plan with code ${params.id}. It may have been retired or the link is out of date.`} />;
  }

  if (error) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '24px 12px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: oklch.textStrong, marginBottom: 10 }}>{error}</div>
          <SecondaryButton onClick={() => setRetryToken((n) => n + 1)}>Retry</SecondaryButton>
        </div>
      </Card>
    );
  }

  if (loading || !plan) {
    return (
      <Card>
        <div style={{ height: 320, borderRadius: 12, background: oklch.divider, animation: 'admin-fade 1.2s ease infinite alternate' }} />
      </Card>
    );
  }

  return (
    <PlanForm
      plan={plan}
      versions={versions}
      otherActivePlansCount={otherActivePlansCount}
      onPlanUpdated={(updated) => setPlan(updated)}
      onVersionCreated={() => setRetryToken((n) => n + 1)}
    />
  );
}
