'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { getFlag } from '../../data';
import { TypeIcon } from '../../icons';
import { Card, EmptyState, SectionTitle, Toggle } from '../../components/primitives';
import { oklch, typeColor } from '../../tokens';

const ROLLOUT: [string, boolean][] = [
  ['Base', false],
  ['Growth', false],
  ['Pro', true],
];
const OVERRIDES: [string, string, boolean][] = [
  ['Glow Salon', 'Salon', true],
  ['BrightSmile Dental', 'Dental', true],
  ['Serenity Spa', 'Spa', false],
];

/** GRW-87's flag detail: global switch, plan rollout, business overrides (beta). */
export default function FeatureFlagDetailPage() {
  const params = useParams<{ key: string }>();
  const key = decodeURIComponent(params.key);
  const flag = getFlag(key);
  const [on, setOn] = useState(flag?.on ?? false);

  if (!flag) return <EmptyState title="Feature flag not found" sub="Check the key and try again." />;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.3fr) minmax(280px, 1fr)', gap: 16, alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: oklch.textStrong }}>{flag.name}</div>
              <div style={{ fontSize: 12, color: 'oklch(0.6 0.015 155)', marginTop: 4, fontFamily: 'ui-monospace, monospace' }}>{flag.key}</div>
            </div>
            <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: on ? 'oklch(0.44 0.12 150)' : oklch.textFaint }}>{on ? 'Global ON' : 'Global OFF'}</span>
              <Toggle on={on} onClick={() => setOn((v) => !v)} />
            </div>
          </div>
          <div style={{ marginTop: 16, padding: '14px 16px', borderRadius: 12, background: 'oklch(0.98 0.012 150)', border: '1px solid oklch(0.92 0.02 150)', fontSize: 12.5, color: 'oklch(0.4 0.05 152)', fontWeight: 600 }}>
            A business can use this feature only when the global flag is ON, its plan rollout is ON, and the business has the matching entitlement.
          </div>
        </Card>

        <Card>
          <SectionTitle title="Plan rollout" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {ROLLOUT.map(([plan, rolledOut], i) => (
              <div key={plan} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: i < ROLLOUT.length - 1 ? `1px solid ${oklch.divider}` : 'none' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'oklch(0.28 0.02 155)' }}>{plan}</span>
                <Toggle on={on && rolledOut} onClick={() => {}} disabled />
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionTitle title="Business overrides (beta)" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {OVERRIDES.map(([name, type, enabled], i) => {
              const tc = typeColor(type);
              return (
                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 0', borderBottom: i < OVERRIDES.length - 1 ? `1px solid ${oklch.divider}` : 'none' }}>
                  <span style={{ width: 30, height: 30, borderRadius: 9, background: tc.bg, color: tc.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                    <TypeIcon type={type} size={15} />
                  </span>
                  <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700, color: 'oklch(0.28 0.02 155)' }}>{name}</span>
                  <Toggle on={enabled} onClick={() => {}} disabled />
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <Card>
        <SectionTitle title="Status" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13.5 }}>
          {[
            ['Global', on ? 'ON' : 'OFF'],
            ['Environments', 'Production'],
            ['Type', 'Release toggle'],
            ['Owner', 'Platform team'],
            ['Updated', '30 Aug 2026'],
          ].map(([label, value]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'oklch(0.5 0.02 155)', fontWeight: 600 }}>{label}</span>
              <span style={{ fontWeight: 700, color: 'oklch(0.3 0.02 155)' }}>{value}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
