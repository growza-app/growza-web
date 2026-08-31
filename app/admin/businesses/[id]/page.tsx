'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { getBusiness } from '../../data';
import { TypeIcon } from '../../icons';
import { Bar, Card, EmptyState, PrimaryButton, SecondaryButton, SectionTitle, StatusPill } from '../../components/primitives';
import { DiscountModal } from '../../components/DiscountModal';
import { useImpersonation } from '../../components/ImpersonationContext';
import { inr, oklch, typeColor } from '../../tokens';

/**
 * GRW-79's business detail — the screen the whole platform product hangs
 * off. Answers plan, price, status, next billing and usage without
 * navigating away (13-platform-administration.md §13). Read-only: every
 * mutating action here (suspend, discount, impersonate) belongs to its own
 * epic and is currently a client-side stub, not a real write.
 */
export default function BusinessDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { start: startImpersonation } = useImpersonation();
  const [discountOpen, setDiscountOpen] = useState(false);

  const business = getBusiness(params.id);
  if (!business) {
    return <EmptyState title="Business not found" sub="It may have been removed, or the link is out of date." />;
  }

  const b = business;
  const tc = typeColor(b.type);
  const summary: [string, string][] = [
    ['Plan', 'Growza Base'],
    ['List price', inr(b.list) + '/mo'],
    ['Customer price', inr(b.final) + '/mo'],
    ['Discount', b.discount ? '− ' + inr(b.discount) + '/mo' : 'None'],
    ['Status', b.status],
    ['Next billing', b.next],
    ['Branches', String(b.branches)],
    ['Users', String(b.users)],
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <span
            style={{
              width: 54,
              height: 54,
              borderRadius: 15,
              background: tc.bg,
              color: tc.fg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 'none',
            }}
          >
            <TypeIcon type={b.type} size={26} />
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: 21, fontWeight: 800, color: oklch.textStrong }}>{b.name}</h2>
              <StatusPill status={b.status} />
            </div>
            <div style={{ fontSize: 13.5, color: oklch.textMuted, marginTop: 3 }}>
              {b.type} · {b.city} · {b.owner} · {b.id}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
            <PrimaryButton onClick={() => setDiscountOpen(true)} style={{ height: 40 }}>
              Manage discount
            </PrimaryButton>
            <SecondaryButton onClick={() => startImpersonation({ business: b.name, user: b.owner, reason: 'Support session' })}>
              Impersonate owner
            </SecondaryButton>
            <SecondaryButton onClick={() => router.push(`/admin/subscriptions/${b.id}`)}>View subscription</SecondaryButton>
            <SecondaryButton danger>Suspend business</SecondaryButton>
          </div>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.3fr) minmax(280px, 1fr)', gap: 16 }}>
        <Card>
          <SectionTitle title="Subscription & pricing" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 16 }}>
            {summary.map(([label, value]) => (
              <div key={label}>
                <div style={{ fontSize: 12, color: oklch.textFaint, fontWeight: 600 }}>{label}</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: oklch.textStrong, marginTop: 3 }}>{value}</div>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <SectionTitle title="Usage this period" right={<span style={{ fontSize: 11.5, color: oklch.textFaint, fontWeight: 600 }}>1–31 Aug</span>} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Bar used={b.bookings[0]} limit={b.bookings[1]} label="Bookings" />
            <Bar used={b.wa[0]} limit={b.wa[1]} label="WhatsApp (utility)" />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ fontWeight: 700, color: 'oklch(0.3 0.02 155)' }}>AI messages</span>
              <span style={{ fontWeight: 600, color: 'oklch(0.6 0.02 155)' }}>Not enabled</span>
            </div>
          </div>
        </Card>
      </div>

      <DiscountModal businessName={discountOpen ? b.name : null} onClose={() => setDiscountOpen(false)} />
    </div>
  );
}
