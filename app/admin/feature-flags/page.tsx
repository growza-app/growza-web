'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FEATURE_FLAGS } from '../data';
import { Card, SecondaryButton, Toggle } from '../components/primitives';
import { oklch } from '../tokens';

/**
 * GRW-87's Feature Flags screen. A flag and an entitlement are two
 * different gates — this screen shows the flag's global switch and its
 * per-plan rollout, never a business's actual entitlement
 * (13-platform-administration.md §4).
 */
export default function AdminFeatureFlagsPage() {
  const router = useRouter();
  const [on, setOn] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(FEATURE_FLAGS.map((f) => [f.key, f.on])),
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
      {FEATURE_FLAGS.map((f) => {
        const enabled = on[f.key] ?? f.on;
        return (
          <Card key={f.key}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
              <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 15.5, fontWeight: 800, color: oklch.textStrong, lineHeight: 1.25 }}>{f.name}</span>
                  {f.future ? (
                    <span
                      style={{
                        fontSize: 10.5,
                        fontWeight: 800,
                        letterSpacing: '0.04em',
                        color: 'oklch(0.52 0.13 65)',
                        background: oklch.warnBg,
                        padding: '2px 7px',
                        borderRadius: 6,
                        textTransform: 'uppercase',
                      }}
                    >
                      Future
                    </span>
                  ) : null}
                </div>
                <div style={{ fontSize: 12.5, color: oklch.textMuted, lineHeight: 1.4 }}>{f.desc}</div>
                <div style={{ fontSize: 11.5, color: 'oklch(0.6 0.015 155)', fontFamily: 'ui-monospace, monospace' }}>{f.key}</div>
              </div>
              <div style={{ flex: 'none' }}>
                <Toggle on={enabled} onClick={() => setOn((prev) => ({ ...prev, [f.key]: !enabled }))} />
              </div>
            </div>
            <div style={{ marginTop: 15, paddingTop: 14, borderTop: `1px solid ${oklch.border}`, display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
              <RolloutDot label="Base" on={enabled && f.base} />
              <RolloutDot label="Pro" on={enabled && f.pro} />
              <SecondaryButton onClick={() => router.push(`/admin/feature-flags/${encodeURIComponent(f.key)}`)} style={{ marginLeft: 'auto', height: 30, padding: '0 13px', fontSize: 12.5, color: oklch.accentText }}>
                Configure
              </SecondaryButton>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function RolloutDot({ label, on }: { label: string; on: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: 'oklch(0.5 0.02 155)' }}>{label}</span>
      <span
        style={{
          fontSize: 11.5,
          fontWeight: 700,
          color: on ? 'oklch(0.44 0.12 150)' : 'oklch(0.58 0.02 155)',
          background: on ? 'oklch(0.95 0.035 150)' : 'oklch(0.95 0.006 150)',
          padding: '2px 9px',
          borderRadius: 6,
        }}
      >
        {on ? 'ON' : 'OFF'}
      </span>
    </div>
  );
}
