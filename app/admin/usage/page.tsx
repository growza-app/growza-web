'use client';

import { getBusinesses } from '../data';
import { Card, SectionTitle } from '../components/primitives';
import { useAdminSearch } from '../components/SearchContext';
import { oklch, usageState } from '../tokens';

/**
 * GRW-85/86's Usage dashboard. Bookings and WhatsApp only — AI stays at
 * zero and explicitly "not enabled," per the platform-administration rule
 * against building fake functionality for a capability that doesn't exist
 * yet (13-platform-administration.md §12).
 */
export default function AdminUsagePage() {
  const { query } = useAdminSearch();
  let businesses = getBusinesses();
  const q = query.trim().toLowerCase();
  if (q) businesses = businesses.filter((b) => b.name.toLowerCase().includes(q));

  const totals = [
    { l: 'Bookings used', v: businesses.reduce((s, b) => s + b.bookings[0], 0).toLocaleString('en-IN'), s: `across ${businesses.length} businesses` },
    { l: 'WhatsApp (utility)', v: businesses.reduce((s, b) => s + b.wa[0], 0).toLocaleString('en-IN'), s: 'transactional messages' },
    { l: 'WhatsApp (marketing)', v: '0', s: 'not in Base plan' },
    { l: 'AI messages', v: '0', s: 'not enabled', muted: true },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
        {totals.map((t) => (
          <Card key={t.l}>
            <div style={{ fontSize: 12.5, color: oklch.textMuted, fontWeight: 600 }}>{t.l}</div>
            <div style={{ fontSize: 25, fontWeight: 800, color: t.muted ? 'oklch(0.6 0.02 155)' : oklch.textStrong, marginTop: 6, lineHeight: 1 }}>{t.v}</div>
            <div style={{ fontSize: 12, color: oklch.textFaint, marginTop: 7, fontWeight: 500 }}>{t.s}</div>
          </Card>
        ))}
      </div>

      <Card>
        <SectionTitle
          title="WhatsApp usage by business"
          right={
            <span style={{ fontSize: 11.5, fontWeight: 700, color: 'oklch(0.44 0.12 150)', background: 'oklch(0.95 0.035 150)', padding: '4px 10px', borderRadius: 8 }}>
              Billing period 1–31 Aug
            </span>
          }
        />
        <div style={{ border: `1px solid ${oklch.borderStrong}`, borderRadius: 13, overflow: 'hidden' }}>
          <div className="admin-table-scroll">
            <div style={{ minWidth: 680 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.6fr 0.8fr 0.8fr 0.8fr 0.9fr 1fr',
                  padding: '11px 20px',
                  background: oklch.surfaceSubtle,
                  borderBottom: `1px solid ${oklch.borderStrong}`,
                  fontSize: 11,
                  fontWeight: 800,
                  color: oklch.textFaint,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                {['Business', 'Utility', 'Marketing', 'Total', 'Limit', 'Usage'].map((h) => (
                  <div key={h}>{h}</div>
                ))}
              </div>
              {businesses.map((b) => {
                const utility = b.wa[0];
                const marketing = 0;
                const total = utility + marketing;
                const limit = b.wa[1];
                const { pct, color } = usageState(total, limit);
                return (
                  <div
                    key={b.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1.6fr 0.8fr 0.8fr 0.8fr 0.9fr 1fr',
                      alignItems: 'center',
                      padding: '13px 20px',
                      borderBottom: `1px solid ${oklch.divider}`,
                    }}
                  >
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: oklch.textStrong }}>{b.name}</div>
                    <div style={{ fontSize: 13, color: 'oklch(0.4 0.02 155)', fontWeight: 600 }}>{utility}</div>
                    <div style={{ fontSize: 13, color: 'oklch(0.6 0.02 155)', fontWeight: 600 }}>{marketing}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'oklch(0.3 0.02 155)' }}>{total}</div>
                    <div style={{ fontSize: 13, color: 'oklch(0.5 0.02 155)', fontWeight: 600 }}>
                      {total}/{limit}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 7, borderRadius: 99, background: oklch.divider, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: color, borderRadius: 99 }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color, width: 34, textAlign: 'right' }}>{pct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
