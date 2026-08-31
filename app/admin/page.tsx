'use client';

import Link from 'next/link';
import { getBusinesses } from './data';
import { Icon, type IconName } from './icons';
import { Bar, Card } from './components/primitives';
import { inr, oklch } from './tokens';

/**
 * Platform dashboard (GRW-79's dashboard story). Every figure here comes
 * from mock data — no `admin.business.view` fetch, no MRR computation —
 * because the businesses/subscriptions backend (GRW-79, GRW-81, GRW-82)
 * has not shipped. GRW-104's own rule applies the moment it does: a number
 * that looks like a metric must be real, never left as a decorative mock.
 */
export default function AdminDashboardPage() {
  const businesses = getBusinesses();

  const kpis: { label: string; value: string; trend: string; icon: IconName; hue: number; warn?: boolean }[] = [
    { label: 'Total businesses', value: '1,248', trend: '▲ 34 this mo', icon: 'businesses', hue: 150 },
    { label: 'Active subscriptions', value: '1,102', trend: '88% active', icon: 'subs', hue: 210 },
    { label: 'Monthly recurring revenue', value: '₹8.56L', trend: '▲ 6.1%', icon: 'money', hue: 150 },
    { label: 'Payment failures', value: '18', trend: 'needs review', icon: 'alert', hue: 25, warn: true },
  ];

  const attention: { t: string; m: string; tag: string; hue: number; icon: IconName }[] = [
    { t: '18 payments failed', m: 'Retry or contact business owners', tag: 'Billing', hue: 25, icon: 'payments' },
    { t: '7 subscriptions in grace period', m: 'Auto-suspend in 3–5 days', tag: 'Lifecycle', hue: 65, icon: 'alert' },
    { t: '23 businesses near booking limit', m: 'Above 90% of monthly bookings', tag: 'Usage', hue: 285, icon: 'usage' },
    { t: '41 businesses near WhatsApp limit', m: 'Above 80% of message quota', tag: 'WhatsApp', hue: 150, icon: 'chat' },
  ];

  const near = businesses.filter((b) => b.bookings[0] / b.bookings[1] >= 0.85 || b.wa[0] / b.wa[1] >= 0.8).slice(0, 4);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        {kpis.map((k) => (
          <Card key={k.label}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 11,
                  background: `oklch(0.95 0.04 ${k.hue})`,
                  color: `oklch(0.45 0.12 ${k.hue})`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name={k.icon} />
              </span>
              <span
                style={{
                  fontSize: 11.5,
                  fontWeight: 700,
                  color: k.warn ? oklch.danger : 'oklch(0.44 0.12 150)',
                  background: k.warn ? oklch.dangerBg : 'oklch(0.95 0.035 150)',
                  padding: '3px 8px',
                  borderRadius: 7,
                }}
              >
                {k.trend}
              </span>
            </div>
            <div style={{ fontSize: 27, fontWeight: 800, lineHeight: 1, marginTop: 14, color: oklch.textStrong }}>{k.value}</div>
            <div style={{ fontSize: 12.5, color: oklch.textMuted, marginTop: 5, fontWeight: 500 }}>{k.label}</div>
          </Card>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.5fr) minmax(260px, 1fr)', gap: 16 }}>
        <Card>
          <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 800, color: oklch.textStrong }}>Billing attention</h3>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {attention.map((a, i) => (
              <div
                key={a.t}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 13,
                  padding: '12px 0',
                  borderBottom: i < attention.length - 1 ? `1px solid ${oklch.divider}` : 'none',
                }}
              >
                <span
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 11,
                    background: `oklch(0.95 0.04 ${a.hue})`,
                    color: `oklch(0.5 0.14 ${a.hue})`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flex: 'none',
                  }}
                >
                  <Icon name={a.icon} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: oklch.textStrong }}>{a.t}</div>
                  <div style={{ fontSize: 12.5, color: oklch.textFaint }}>{a.m}</div>
                </div>
                <span
                  style={{
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: `oklch(0.5 0.13 ${a.hue})`,
                    background: `oklch(0.95 0.035 ${a.hue})`,
                    padding: '4px 10px',
                    borderRadius: 7,
                  }}
                >
                  {a.tag}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 800, color: oklch.textStrong }}>Revenue this month</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ fontSize: 12.5, color: oklch.textMuted, fontWeight: 600 }}>Potential MRR (list price)</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'oklch(0.3 0.02 155)', marginTop: 2 }}>{inr(998000)}</div>
            </div>
            <div>
              <div style={{ fontSize: 12.5, color: oklch.textMuted, fontWeight: 600 }}>Discounts applied</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'oklch(0.5 0.15 25)', marginTop: 2 }}>− {inr(142000)}</div>
            </div>
            <div style={{ borderTop: `1px solid ${oklch.borderStrong}`, paddingTop: 14 }}>
              <div style={{ fontSize: 12.5, color: oklch.textMuted, fontWeight: 600 }}>Realized MRR</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: oklch.accentText, marginTop: 2 }}>{inr(856000)}</div>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: oklch.textStrong }}>Businesses near their limits</h3>
          <Link href="/admin/usage" style={{ fontSize: 13, fontWeight: 700 }}>
            Usage dashboard
          </Link>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {near.map((b) => (
            <div
              key={b.id}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(160px, 1.2fr) minmax(140px, 1fr) minmax(140px, 1fr)',
                gap: 14,
                alignItems: 'center',
                paddingBottom: 12,
                borderBottom: `1px solid ${oklch.divider}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <span
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    background: 'oklch(0.95 0.045 150)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flex: 'none',
                  }}
                >
                  <Icon name="businesses" size={17} />
                </span>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: oklch.textStrong }}>{b.name}</div>
                  <div style={{ fontSize: 11.5, color: oklch.textFaint }}>{b.type}</div>
                </div>
              </div>
              <Bar used={b.bookings[0]} limit={b.bookings[1]} label="Bookings" />
              <Bar used={b.wa[0]} limit={b.wa[1]} label="WhatsApp" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
