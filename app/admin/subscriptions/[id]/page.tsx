'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { adminFetch } from '../../lib/api';
import { Card, SecondaryButton } from '../../components/primitives';
import { SubscriptionPanel } from '../../components/SubscriptionPanel';
import { oklch } from '../../tokens';
import { useAdminMe } from '../../components/AdminMeContext';

/**
 * GRW-112's subscription detail. The screen itself is `SubscriptionPanel`,
 * shared with the Subscription tab on business detail; this page's own job is
 * the two things the panel cannot know on its own — who is looking (the
 * manage permission), and what the business is called.
 */

interface BusinessDetailResponse {
  business: { name: string; planName: string };
}

export default function SubscriptionDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  // Batch D — the shared /me (`useAdminMe`). Without it there is no way to know whether this admin may manage
  // subscriptions: defaulting to "yes" would offer controls the server refuses, "no" silently would look like a
  // permission they lack — so a failure is said, as before.
  const { state: meState, me } = useAdminMe();
  const meError = meState.status === 'error' && !meState.unauthorised ? meState.message : null;
  const [business, setBusiness] = useState<{ name: string; planName: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    // The subscription row carries a business id, not a name — fetched here
    // rather than widened into the subscription endpoint, whose other callers
    // do not need it. A failure is silent on purpose: the panel leads with
    // the plan instead, which is a smaller loss than blocking the screen.
    adminFetch<{ businessId: string }>(`/subscriptions/${params.id}`, { signal: controller.signal })
      .then((row) => adminFetch<BusinessDetailResponse>(`/businesses/${row.businessId}`, { signal: controller.signal }))
      .then((detail) => setBusiness(detail.business))
      .catch(() => undefined);
    return () => controller.abort();
  }, [params.id]);

  if (meError) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '24px 12px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: oklch.textStrong, marginBottom: 10 }}>{meError}</div>
          <SecondaryButton onClick={() => window.location.reload()}>Retry</SecondaryButton>
        </div>
      </Card>
    );
  }

  if (!me) {
    return (
      <Card>
        <div style={{ height: 200, borderRadius: 12, background: oklch.divider, animation: 'admin-fade 1.2s ease infinite alternate' }} />
      </Card>
    );
  }

  return (
    <SubscriptionPanel
      subscriptionId={params.id}
      canManage={me.permissions.includes('admin.subscription.manage')}
      canRecordPayment={me.permissions.includes('admin.payment.record')}
      canDiscount={me.permissions.includes('admin.discount.manage')}
      businessName={business?.name}
      planName={business?.planName}
      // Re-enrolling a cancelled subscription creates a new one: this page moves to it, so the admin sees the result
      // instead of the row they re-enrolled from.
      onReplaced={(id) => router.replace(`/admin/subscriptions/${id}`)}
    />
  );
}
