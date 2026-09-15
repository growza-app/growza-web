'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminFetch, AdminApiError } from '../lib/api';
import { Card, SecondaryButton, Toggle } from '../components/primitives';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { oklch } from '../tokens';

/**
 * GRW-131's Feature Flags screen, on real data.
 *
 * A flag and an entitlement are two different gates — this screen shows the
 * flag's global switch, its default and its per-plan rollout, and **never** a
 * business's actual entitlement (13-platform-administration.md §4). That was
 * the mock's own docstring and it is still the rule.
 *
 * It used to render `FEATURE_FLAGS` from `data.ts`: six invented flags with
 * keys (`reports.enabled`, `ai.enabled`) that match nothing the platform
 * defines, and a Toggle wired to `disabled` with an empty handler. These are
 * the eleven real ones, and the toggle works.
 *
 * **No create and no delete, deliberately.** A flag key is referenced by
 * deployed code, so creating one here produces a key nothing reads and
 * deleting one silently turns a gate off. Flags arrive by migration, with the
 * code that consults them (BR-03).
 */
interface FlagRow {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
  defaultOn: boolean;
  planCodes: string[];
  overrideCount: number;
}

export default function AdminFeatureFlagsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<FlagRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<FlagRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(
    (signal?: AbortSignal) =>
      adminFetch<{ rows: FlagRow[] }>('/feature-flags', { signal })
        .then((page) => {
          setRows(page.rows);
          setError(null);
        })
        .catch((err) => {
          if (signal?.aborted) return;
          // Never an empty state on a failed read: flags are seeded, so "no
          // flags" is always a lie and always alarming.
          setError(err instanceof AdminApiError ? err.message : 'Could not load feature flags.');
        }),
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  function toggle(reason: string) {
    if (!pending) return;
    setSaving(true);
    setSaveError(null);
    adminFetch<FlagRow>(`/feature-flags/${encodeURIComponent(pending.key)}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled: !pending.enabled, reason }),
    })
      .then((updated) => {
        setRows((current) => (current ? current.map((r) => (r.key === updated.key ? updated : r)) : current));
        setPending(null);
      })
      .catch((err) => setSaveError(err instanceof AdminApiError ? err.message : 'Could not change this flag.'))
      .finally(() => setSaving(false));
  }

  if (error) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '24px 12px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: oklch.textStrong, marginBottom: 10 }}>{error}</div>
          <SecondaryButton onClick={() => void load()}>Retry</SecondaryButton>
        </div>
      </Card>
    );
  }

  if (!rows) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 14 }}>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} style={{ height: 150, borderRadius: 16, background: oklch.divider, animation: 'admin-fade 1.2s ease infinite alternate' }} />
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* §4's rule, said on the screen rather than only in a docstring: the
          two gates are easy to confuse, and confusing them is how a
          commercial decision gets made with a release control. */}
      <Card>
        <div style={{ fontSize: 12.5, lineHeight: 1.55, color: 'oklch(0.45 0.02 155)', fontWeight: 500 }}>
          A flag answers <strong>&ldquo;is this built and switched on&rdquo;</strong>. Whether a business has <em>bought</em> a feature is a
          separate question, answered by their plan and shown on their subscription. Turning a flag off here takes the feature away from
          everyone it applies to, however much they pay.
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 14 }}>
        {rows.map((flag) => (
          <Card key={flag.key}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
              <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span style={{ fontSize: 15.5, fontWeight: 800, color: oklch.textStrong, lineHeight: 1.25 }}>{flag.label}</span>
                <div style={{ fontSize: 12.5, color: oklch.textMuted, lineHeight: 1.4 }}>{flag.description}</div>
                <div style={{ fontSize: 11.5, color: 'oklch(0.6 0.015 155)', fontFamily: 'ui-monospace, monospace' }}>{flag.key}</div>
              </div>
              <div style={{ flex: 'none' }}>
                <Toggle
                  on={flag.enabled}
                  onClick={() => {
                    setSaveError(null);
                    setPending(flag);
                  }}
                />
              </div>
            </div>

            <div
              style={{
                marginTop: 15,
                paddingTop: 14,
                borderTop: `1px solid ${oklch.border}`,
                display: 'flex',
                gap: 14,
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              {/* What a business gets when nothing targets it — the answer for
                  most of them, and the one the old screen had no way to show. */}
              <Fact label="Default" value={flag.defaultOn ? 'On' : 'Off'} tone={flag.defaultOn ? 'on' : 'off'} />
              <Fact
                label="Plans"
                value={flag.planCodes.length > 0 ? flag.planCodes.join(', ') : 'None'}
                tone={flag.planCodes.length > 0 ? 'on' : 'off'}
              />
              <Fact label="Overrides" value={String(flag.overrideCount)} tone={flag.overrideCount > 0 ? 'on' : 'off'} />
              <SecondaryButton
                onClick={() => router.push(`/admin/feature-flags/${encodeURIComponent(flag.key)}`)}
                style={{ marginLeft: 'auto', height: 30, padding: '0 13px', fontSize: 12.5, color: oklch.accentText }}
              >
                Configure
              </SecondaryButton>
            </div>

            {/* The one state where the card would otherwise lie: a flag that is
                switched off globally still shows a default and a plan list,
                and neither applies. */}
            {!flag.enabled ? (
              <div style={{ marginTop: 11, fontSize: 12, fontWeight: 700, color: 'oklch(0.55 0.17 25)' }}>
                Off for everyone — the default and plan targeting below do not apply while it is.
              </div>
            ) : null}
          </Card>
        ))}
      </div>

      <ConfirmDialog
        open={pending !== null}
        danger={pending?.enabled === true}
        title={pending?.enabled ? `Switch ${pending?.label} off?` : `Switch ${pending?.label} on?`}
        // FR-06 — the global switch is the one control here whose behaviour is
        // not obvious from looking at it, so the dialog says what it does
        // instead of assuming the admin remembers the precedence.
        description={
          pending?.enabled
            ? 'This turns the feature off for every business immediately, including any that have been explicitly switched on for a pilot. It overrides the default and the plan targeting. Use it when something is misbehaving in production.'
            : 'This lets the feature apply again. Who actually gets it is then decided by the default, the plan targeting and any per-business overrides — switching this on does not by itself turn it on for anyone.'
        }
        confirmLabel={pending?.enabled ? 'Switch off' : 'Switch on'}
        reasonRequired
        reasonPlaceholder={pending?.enabled ? 'Why is this being switched off?' : 'Why is this being switched on?'}
        loading={saving}
        error={saveError}
        onConfirm={toggle}
        onCancel={() => {
          setPending(null);
          setSaveError(null);
        }}
      />
    </div>
  );
}

function Fact({ label, value, tone }: { label: string; value: string; tone: 'on' | 'off' }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: oklch.textFaint, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          marginTop: 2,
          color: tone === 'on' ? oklch.textStrong : 'oklch(0.6 0.02 155)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </div>
    </div>
  );
}
