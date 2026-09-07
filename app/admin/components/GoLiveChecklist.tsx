'use client';

import { Icon } from '../icons';
import { PrimaryButton } from './primitives';
import { oklch } from '../tokens';

/**
 * Jira GRW-138 · GRW-176 — what a business is still waiting for, and the
 * decision to end that wait.
 *
 * Shown only while a business is `provisioning`. Once it is live the checklist
 * is gone rather than shown all-ticked: the decision has been taken, and a
 * screen still offering it is a screen inviting it to be taken again.
 *
 * The control is disabled until every item is met, and it says which item it is
 * waiting for — a greyed button with no reason is the failure `PrimaryButton`'s
 * own `disabled` prop was added to stop being told visually and lied about
 * functionally.
 */
export interface ReadinessItem {
  key: string;
  label: string;
  met: boolean;
}

export function GoLiveChecklist({
  items,
  ready,
  canManage,
  busy,
  onGoLive,
}: {
  items: ReadinessItem[];
  ready: boolean;
  canManage: boolean;
  busy: boolean;
  onGoLive: () => void;
}) {
  const missing = items.filter((item) => !item.met);

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 16,
        padding: '16px 18px',
        borderRadius: 14,
        background: 'oklch(0.97 0.02 95)',
        border: '1px solid oklch(0.82 0.09 85)',
      }}
    >
      <div style={{ minWidth: 260, flex: 1 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: oklch.textStrong }}>This business is still being set up</div>
        <div style={{ fontSize: 12.5, color: oklch.textMuted, marginTop: 2, lineHeight: 1.5 }}>
          Its owner can sign in and finish setting it up. It cannot take bookings until it goes live.
        </div>

        <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'grid', gap: 7 }}>
          {items.map((item) => (
            <li key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13 }}>
              <span style={{ color: item.met ? oklch.accent : oklch.textFaint, flex: 'none', display: 'flex' }}>
                <Icon name={item.met ? 'check' : 'alert'} size={15} />
              </span>
              <span style={{ color: item.met ? oklch.textMuted : oklch.textStrong, fontWeight: item.met ? 600 : 700 }}>
                {item.label}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {canManage ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <PrimaryButton
            onClick={onGoLive}
            disabled={!ready || busy}
            title={ready ? undefined : `Still waiting for: ${missing.map((m) => m.label).join(', ')}`}
          >
            {busy ? 'Going live…' : 'Go live'}
          </PrimaryButton>
          {!ready ? (
            <div style={{ fontSize: 11.5, color: oklch.textMuted, maxWidth: 220, textAlign: 'right' }}>
              {missing.length === 1 ? 'Waiting for one more thing' : `Waiting for ${missing.length} more things`}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
