'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { adminFetch, AdminApiError } from '../lib/api';
import { Card, EmptyState, PrimaryButton, SecondaryButton, StatusPill } from '../components/primitives';
import { Icon } from '../icons';
import { inr, oklch } from '../tokens';

/**
 * GRW-108's Plans screen. Every card here is derived from real data —
 * price, status, inclusions/exclusions and business count all come from
 * GET /plans and GET /capability-keys, none of it authored per plan
 * (Technical Notes: a hand-written exclusions list is exactly the kind of
 * copy that goes stale the moment an entitlement changes — GRW-020's own
 * lesson). Deliberately no discount data anywhere (BR-01) and no "View
 * subscriptions" link — GRW-81's subscriptions list doesn't exist yet, so
 * that action is absent rather than pointing at a broken screen.
 */

interface CapabilityKeyMeta {
  key: string;
  type: 'boolean' | 'number';
  codeDefault: boolean | number;
  label: string;
  group: string;
}

interface PlanSummary {
  code: string;
  name: string;
  description: string;
  basePriceMinor: number;
  currency: string;
  billingCycle: string;
  status: string;
  limits: Record<string, number>;
  capabilityGrants: Record<string, boolean>;
  businessCount: number;
}

export default function AdminPlansPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<PlanSummary[] | null>(null);
  const [registry, setRegistry] = useState<CapabilityKeyMeta[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([adminFetch<{ rows: PlanSummary[] }>('/plans'), adminFetch<{ rows: CapabilityKeyMeta[] }>('/capability-keys')])
      .then(([plansResult, registryResult]) => {
        if (cancelled) return;
        setPlans(plansResult.rows);
        setRegistry(registryResult.rows);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof AdminApiError ? err.message : 'Could not load plans.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [retryToken]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <PrimaryButton onClick={() => router.push('/admin/plans/new')}>
          <Icon name="plus" size={16} />
          Create plan
        </PrimaryButton>
      </div>

      {error ? (
        <Card>
          <div style={{ textAlign: 'center', padding: '24px 12px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: oklch.textStrong, marginBottom: 10 }}>{error}</div>
            <SecondaryButton onClick={() => setRetryToken((n) => n + 1)}>Retry</SecondaryButton>
          </div>
        </Card>
      ) : loading || !plans || !registry ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 16 }}>
          {Array.from({ length: 2 }, (_, i) => (
            <Card key={i}>
              <div style={{ height: 300, borderRadius: 12, background: oklch.divider, animation: 'admin-fade 1.2s ease infinite alternate' }} />
            </Card>
          ))}
        </div>
      ) : plans.length === 0 ? (
        <EmptyState icon="plans" title="No plans yet" sub="Create the first plan to start selling." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 16, alignItems: 'start' }}>
          {plans.map((plan) => (
            <PlanCard key={plan.code} plan={plan} registry={registry} onEdit={() => router.push(`/admin/plans/${plan.code}`)} />
          ))}
        </div>
      )}
    </div>
  );
}

function PlanCard({ plan, registry, onEdit }: { plan: PlanSummary; registry: CapabilityKeyMeta[]; onEdit: () => void }) {
  const booleanKeys = registry.filter((k) => k.type === 'boolean');
  // BR-02 — what a plan does not include is stated as plainly as what it
  // does; both lists read the EFFECTIVE value (plan override, or the
  // registry's own code default when the plan doesn't set one), matching
  // the entitlement editor's own resolution logic.
  const included = booleanKeys.filter((k) => (plan.capabilityGrants[k.key] ?? (k.codeDefault as boolean)) === true);
  const excluded = booleanKeys.filter((k) => (plan.capabilityGrants[k.key] ?? (k.codeDefault as boolean)) === false);

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: oklch.textStrong }}>{plan.name}</div>
          <div style={{ marginTop: 6 }}>
            <StatusPill status={plan.status === 'active' ? 'Active' : 'Retired'} />
          </div>
        </div>
        <div style={{ textAlign: 'right', flex: 'none' }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: oklch.textStrong, lineHeight: 1 }}>{inr(plan.basePriceMinor / 100)}</div>
          <div style={{ fontSize: 12, color: oklch.textFaint, fontWeight: 600 }}>per {plan.billingCycle} · includes tax</div>
        </div>
      </div>

      {plan.description ? <div style={{ fontSize: 13, color: oklch.textMuted, marginTop: 10, lineHeight: 1.5 }}>{plan.description}</div> : null}

      <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }}>
        <CapabilityColumn title="Included" keys={included} tone="on" />
        <CapabilityColumn title="Not included" keys={excluded} tone="off" />
      </div>

      {/* AI has no registry keys at all yet (GRW-107's own honesty rule) — stated
          statically rather than fabricated as a capability being "excluded". */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: oklch.textFaint, marginTop: 10 }}>
        <Icon name="close" size={12} />
        AI — Future / Not enabled
      </div>

      <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${oklch.divider}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 13, color: oklch.textFaint, fontWeight: 600 }}>
          {plan.businessCount} {plan.businessCount === 1 ? 'business' : 'businesses'} on this plan
        </div>
        <SecondaryButton onClick={onEdit}>Edit plan</SecondaryButton>
      </div>
    </Card>
  );
}

function CapabilityColumn({ title, keys, tone }: { title: string; keys: CapabilityKeyMeta[]; tone: 'on' | 'off' }) {
  const shown = keys.slice(0, 6);
  const remaining = keys.length - shown.length;
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 800, color: oklch.textFaint, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>{title}</div>
      {keys.length === 0 ? (
        <div style={{ fontSize: 12.5, color: oklch.textFaint }}>{tone === 'on' ? 'Nothing beyond code defaults.' : 'Everything in the registry is granted.'}</div>
      ) : (
        <>
          {shown.map((k) => (
            <div
              key={k.key}
              style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: tone === 'on' ? oklch.text : oklch.textFaint, marginBottom: 5 }}
            >
              <Icon name={tone === 'on' ? 'check' : 'close'} size={12} />
              {k.label}
            </div>
          ))}
          {remaining > 0 ? <div style={{ fontSize: 12, color: oklch.textFaint, marginTop: 2 }}>+{remaining} more</div> : null}
        </>
      )}
    </div>
  );
}
