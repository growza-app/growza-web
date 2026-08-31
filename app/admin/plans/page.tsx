'use client';

import { useRouter } from 'next/navigation';
import { Card, PrimaryButton, SecondaryButton, SectionTitle } from '../components/primitives';
import { Icon } from '../icons';
import { inr, oklch } from '../tokens';

const ENTITLEMENTS: [string, string][] = [
  ['Monthly bookings', '100'],
  ['WhatsApp (utility)', '800 / mo'],
  ['WhatsApp marketing', 'Not included'],
  ['AI', 'Not included'],
];
const FEATURES = ['Customer CRM & history', 'Spending & behaviour insights', 'Bookings, staff & services', 'Service combos & offers', 'Reports & business analytics', 'WhatsApp booking'];

/**
 * GRW-80's Plans screen. One plan today — Growza Base — and deliberately no
 * discount data anywhere on this screen: a discount belongs to a
 * subscription, never to the plan (13-platform-administration.md §2.1).
 */
export default function AdminPlansPage() {
  const router = useRouter();

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <PrimaryButton onClick={() => router.push('/admin/plans/new')}>
          <Icon name="plus" size={16} />
          Create plan
        </PrimaryButton>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 380px) minmax(320px, 1fr)', gap: 16, alignItems: 'start' }}>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: oklch.textStrong }}>Growza Base</div>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'oklch(0.44 0.12 150)', background: 'oklch(0.95 0.035 150)', padding: '4px 10px', borderRadius: 8, display: 'inline-block', marginTop: 4 }}>
                Active · v1
              </span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 30, fontWeight: 800, color: oklch.textStrong, lineHeight: 1 }}>₹799</div>
              <div style={{ fontSize: 12, color: oklch.textFaint, fontWeight: 600 }}>per month · pre-tax</div>
            </div>
          </div>

          <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {ENTITLEMENTS.map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, paddingBottom: 9, borderBottom: `1px solid ${oklch.divider}` }}>
                <span style={{ color: 'oklch(0.5 0.02 155)', fontWeight: 600 }}>{label}</span>
                <span style={{ fontWeight: 800, color: 'oklch(0.28 0.02 155)' }}>{value}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 16, fontSize: 13, color: oklch.textFaint, fontWeight: 600 }}>1,284 businesses on this plan</div>
          <div style={{ display: 'flex', gap: 9, marginTop: 16 }}>
            <PrimaryButton onClick={() => router.push('/admin/plans/base')} style={{ flex: 1, height: 42, justifyContent: 'center' }}>
              Edit plan
            </PrimaryButton>
            <SecondaryButton onClick={() => router.push('/admin/subscriptions')} style={{ flex: 1, height: 42 }}>
              Subscriptions
            </SecondaryButton>
          </div>
        </Card>

        <Card>
          <SectionTitle title="Included in Base" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            {FEATURES.map((f) => (
              <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, color: 'oklch(0.3 0.02 155)', fontWeight: 600 }}>
                <span style={{ width: 22, height: 22, borderRadius: 7, background: 'oklch(0.95 0.035 150)', color: 'oklch(0.44 0.12 150)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                  <Icon name="check" size={14} />
                </span>
                {f}
              </div>
            ))}
          </div>

          <div style={{ marginTop: 18, padding: '14px 16px', borderRadius: 12, background: 'oklch(0.98 0.008 80)', border: '1px solid oklch(0.92 0.03 80)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'oklch(0.45 0.1 65)' }}>Not in Base — future / add-on</div>
            <div style={{ fontSize: 12.5, color: 'oklch(0.5 0.06 70)', marginTop: 3 }}>AI conversations · WhatsApp marketing broadcasts · Advanced analytics</div>
          </div>

          <div style={{ marginTop: 16, padding: '15px 16px', borderRadius: 13, background: 'oklch(0.98 0.012 150)', border: '1px solid oklch(0.9 0.02 150)', display: 'flex', alignItems: 'center', gap: 13, flexWrap: 'wrap' }}>
            <span style={{ width: 38, height: 38, borderRadius: 11, background: 'oklch(0.95 0.035 150)', color: 'oklch(0.44 0.12 150)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
              <Icon name="money" size={19} />
            </span>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: oklch.textStrong }}>Giving a customer a discount?</div>
              <div style={{ fontSize: 12.5, color: 'oklch(0.5 0.02 155)', marginTop: 2, lineHeight: 1.45 }}>
                The list price stays ₹799 for everyone. A discount (e.g. ₹599 for early adopters) is applied per customer on their subscription — it never changes the plan.
              </div>
            </div>
            <PrimaryButton onClick={() => router.push('/admin/subscriptions')} style={{ flex: 'none' }}>
              Apply a discount
            </PrimaryButton>
          </div>
        </Card>
      </div>
    </div>
  );
}
