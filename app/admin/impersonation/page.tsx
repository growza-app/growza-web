'use client';

import { useRouter } from 'next/navigation';
import { IMPERSONATION_SESSIONS } from '../data';
import { Icon } from '../icons';
import { Card, PrimaryButton, Pill, SectionTitle } from '../components/primitives';
import { oklch } from '../tokens';

/**
 * GRW-90's Impersonation screen. Starting a session happens from a
 * business's own detail page ("Impersonate owner") — this screen is the
 * entry point and the log of recent sessions, never allowing a silent one
 * (13-platform-administration.md §7).
 */
export default function AdminImpersonationPage() {
  const router = useRouter();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 13, flexWrap: 'wrap' }}>
          <span style={{ width: 42, height: 42, borderRadius: 12, background: oklch.dangerBg, color: 'oklch(0.5 0.16 25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <Icon name="impersonate" size={20} />
          </span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: oklch.textStrong }}>Start an impersonation session</div>
            <div style={{ fontSize: 13, color: oklch.textMuted, marginTop: 2 }}>
              Open a business, then use “Impersonate owner”. A reason is mandatory and every session is logged.
            </div>
          </div>
          <PrimaryButton onClick={() => router.push('/admin/businesses')} style={{ marginLeft: 'auto' }}>
            Go to businesses
          </PrimaryButton>
        </div>
      </Card>

      <Card>
        <SectionTitle title="Recent sessions" />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {IMPERSONATION_SESSIONS.map((s, i) => (
            <div
              key={`${s.admin}-${s.biz}-${i}`}
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: 12,
                alignItems: 'center',
                padding: '13px 0',
                borderBottom: i < IMPERSONATION_SESSIONS.length - 1 ? `1px solid ${oklch.divider}` : 'none',
              }}
            >
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: oklch.textStrong }}>
                  {s.biz} · {s.user}
                </div>
                <div style={{ fontSize: 12, color: oklch.textFaint }}>by {s.admin}</div>
              </div>
              <div style={{ fontSize: 13, color: 'oklch(0.45 0.02 155)', fontWeight: 600 }}>{s.reason}</div>
              <div style={{ fontSize: 13, color: 'oklch(0.5 0.02 155)', fontWeight: 600 }}>{s.dur}</div>
              <div>
                {s.live ? (
                  <Pill text="Active now" fg="oklch(0.5 0.16 25)" bg={oklch.dangerBg} />
                ) : (
                  <span style={{ fontSize: 12.5, color: oklch.textFaint, fontWeight: 600 }}>{s.when}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
