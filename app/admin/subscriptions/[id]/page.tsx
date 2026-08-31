'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { getBusiness } from '../../data';
import { Bar, Card, EmptyState, PrimaryButton, SecondaryButton, SectionTitle, StatusPill } from '../../components/primitives';
import { DiscountModal } from '../../components/DiscountModal';
import { Icon } from '../../icons';
import { inr, oklch } from '../../tokens';

const GST_RATE = 0.18;
const LIFECYCLE = ['Trial', 'Active', 'Payment failed', 'Grace period', 'Past due', 'Cancelled'];

/** GRW-81's subscription detail: pricing breakdown and the lifecycle stepper. */
export default function SubscriptionDetailPage() {
  const params = useParams<{ id: string }>();
  const [discountOpen, setDiscountOpen] = useState(false);

  const business = getBusiness(params.id);
  if (!business) return <EmptyState title="Subscription not found" sub="It may have been removed, or the link is out of date." />;

  const b = business;
  const taxable = b.final;
  const gst = +(taxable * GST_RATE).toFixed(2);
  const total = +(taxable + gst).toFixed(2);
  const curStage = b.status === 'Past due' ? 4 : b.status === 'Trial' ? 0 : 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.3fr) minmax(280px, 1fr)', gap: 16 }}>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: oklch.textStrong }}>{b.name} · Growza Base</div>
              <div style={{ fontSize: 12.5, color: oklch.textFaint, marginTop: 2 }}>
                SUB-{b.id.replace('BZ-', '')} · Monthly · Razorpay
              </div>
            </div>
            <StatusPill status={b.status} />
          </div>

          <div style={{ marginTop: 18, borderRadius: 14, border: '1px solid oklch(0.9 0.02 150)', background: 'oklch(0.98 0.012 150)', padding: '16px 18px' }}>
            <PriceRow label="List price" value="₹799.00" />
            <PriceRow label="Discount" value={b.discount ? '− ' + inr(b.discount) : '₹0.00'} color={b.discount ? 'oklch(0.5 0.15 25)' : undefined} />
            <PriceRow label="Taxable amount" value={inr(taxable)} />
            <PriceRow label="GST (18%)" value={inr(gst)} />
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, marginTop: 5, borderTop: '1px solid oklch(0.9 0.02 150)' }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: oklch.textStrong }}>Total / mo</span>
              <span style={{ fontSize: 18, fontWeight: 800, color: oklch.accentText }}>{inr(total)}</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 9, marginTop: 16, flexWrap: 'wrap' }}>
            <PrimaryButton onClick={() => setDiscountOpen(true)}>{b.discount ? 'Edit discount' : 'Add discount'}</PrimaryButton>
            <SecondaryButton>Schedule price change</SecondaryButton>
            <SecondaryButton danger>Cancel subscription</SecondaryButton>
          </div>
        </Card>

        <Card>
          <SectionTitle title="Effective entitlements" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Bar used={b.bookings[0]} limit={b.bookings[1]} label="Bookings" />
            <Bar used={b.wa[0]} limit={b.wa[1]} label="WhatsApp (utility)" />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ fontWeight: 700, color: 'oklch(0.3 0.02 155)' }}>AI messages</span>
              <span style={{ fontWeight: 600, color: 'oklch(0.6 0.02 155)' }}>0 / Not enabled</span>
            </div>
          </div>
          <div style={{ marginTop: 16, fontSize: 12, color: oklch.textFaint, fontWeight: 600 }}>
            Period: 1–31 Aug 2026 · Resets on next billing date ({b.next})
          </div>
        </Card>
      </div>

      <Card>
        <SectionTitle title="Subscription lifecycle" />
        <div style={{ display: 'flex', alignItems: 'center', overflowX: 'auto', paddingBottom: 4 }}>
          {LIFECYCLE.map((stage, i) => (
            <div key={stage} style={{ display: 'flex', alignItems: 'center', flex: 'none' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
                <span
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: '50%',
                    background: i <= curStage ? oklch.accent : 'oklch(0.94 0.008 150)',
                    color: i <= curStage ? 'white' : 'oklch(0.6 0.02 155)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                >
                  {i === curStage ? <Icon name="check" size={15} /> : i + 1}
                </span>
                <span
                  style={{
                    fontSize: 11.5,
                    fontWeight: i === curStage ? 800 : 600,
                    color: i === curStage ? oklch.accentText : oklch.textFaint,
                    whiteSpace: 'nowrap',
                    padding: '0 8px',
                  }}
                >
                  {stage}
                </span>
              </div>
              {i < LIFECYCLE.length - 1 ? (
                <div style={{ width: 34, height: 2, background: i < curStage ? oklch.accent : oklch.border }} />
              ) : null}
            </div>
          ))}
        </div>
      </Card>

      <DiscountModal businessName={discountOpen ? b.name : null} onClose={() => setDiscountOpen(false)} />
    </div>
  );
}

function PriceRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, padding: '5px 0' }}>
      <span style={{ color: 'oklch(0.5 0.02 155)', fontWeight: 600 }}>{label}</span>
      <span style={{ fontWeight: 700, color: color ?? 'oklch(0.3 0.02 155)' }}>{value}</span>
    </div>
  );
}
