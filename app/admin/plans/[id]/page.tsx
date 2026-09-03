'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { adminFetch, AdminApiError } from '../../lib/api';
import { Card, EmptyState, SecondaryButton } from '../../components/primitives';
import { PlanForm } from '../../components/PlanForm';
import { oklch } from '../../tokens';

/**
 * GRW-107 — real entitlement data feeds PlanForm's edit-mode entitlement
 * editor; the rest of the form (name/price/status) stays the mock GRW-108
 * makes real, since wiring the whole plan record is that story's own scope.
 */

interface PlanDetail {
  code: string;
  name: string;
  limits: Record<string, number>;
  capabilityGrants: Record<string, boolean>;
}

export default function EditPlanPage() {
  const params = useParams<{ id: string }>();
  const [plan, setPlan] = useState<PlanDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNotFound(false);
    adminFetch<PlanDetail>(`/plans/${params.id}`)
      .then((result) => {
        if (!cancelled) setPlan(result);
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

  return <PlanForm mode="edit" planCode={plan.code} limits={plan.limits} capabilityGrants={plan.capabilityGrants} />;
}
