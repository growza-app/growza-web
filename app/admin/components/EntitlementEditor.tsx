'use client';

import { useEffect, useMemo, useState } from 'react';
import { adminFetch, AdminApiError } from '../lib/api';
import { Icon } from '../icons';
import { oklch } from '../tokens';
import { Card, Field, SectionTitle, TextInput, Toggle, PrimaryButton } from './primitives';
import { ConfirmDialog } from './ConfirmDialog';

/**
 * GRW-107 — the plan entitlement editor. Every field it renders comes from
 * `GET /capability-keys` (listCapabilityKeys(), the one sanctioned way out
 * of the capability registry) — there is no hardcoded key list here (FR-01),
 * so a key added to capabilities.ts shows up here with no frontend change.
 */

interface CapabilityKeyMeta {
  key: string;
  type: 'boolean' | 'number';
  codeDefault: boolean | number;
  label: string;
  group: string;
}

export interface EntitlementEditorProps {
  planCode: string;
  limits: Record<string, number>;
  capabilityGrants: Record<string, boolean>;
  onSaved: (updated: { limits: Record<string, number>; capabilityGrants: Record<string, boolean> }) => void;
}

const GROUP_ORDER = ['booking', 'messaging', 'catalog', 'scheduling', 'dashboard', 'conversation', 'limits'];
const GROUP_LABEL: Record<string, string> = {
  booking: 'Booking',
  messaging: 'Messaging',
  catalog: 'Catalog',
  scheduling: 'Scheduling',
  dashboard: 'Dashboard',
  conversation: 'Conversation',
  limits: 'Limits',
};

export function EntitlementEditor({ planCode, limits, capabilityGrants, onSaved }: EntitlementEditorProps) {
  const [registry, setRegistry] = useState<CapabilityKeyMeta[] | null>(null);
  const [registryError, setRegistryError] = useState<string | null>(null);
  const [draftLimits, setDraftLimits] = useState(limits);
  const [draftGrants, setDraftGrants] = useState(capabilityGrants);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminFetch<{ rows: CapabilityKeyMeta[] }>('/capability-keys')
      .then((r) => {
        if (!cancelled) setRegistry(r.rows);
      })
      .catch((err) => {
        if (!cancelled) setRegistryError(err instanceof AdminApiError ? err.message : 'Could not load capability keys.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Reset drafts if the underlying plan data changes out from under us
  // (e.g. the host page reloaded after a version create).
  useEffect(() => {
    setDraftLimits(limits);
    setDraftGrants(capabilityGrants);
  }, [limits, capabilityGrants]);

  const grouped = useMemo(() => {
    if (!registry) return [];
    const byGroup = new Map<string, CapabilityKeyMeta[]>();
    for (const k of registry) {
      if (!byGroup.has(k.group)) byGroup.set(k.group, []);
      byGroup.get(k.group)!.push(k);
    }
    return GROUP_ORDER.filter((g) => byGroup.has(g)).map((g) => ({ group: g, keys: byGroup.get(g)! }));
  }, [registry]);

  const dirtyLimits = useMemo(
    () => Object.fromEntries(Object.entries(draftLimits).filter(([k, v]) => v !== limits[k])),
    [draftLimits, limits],
  );
  const dirtyGrants = useMemo(
    () => Object.fromEntries(Object.entries(draftGrants).filter(([k, v]) => v !== capabilityGrants[k])),
    [draftGrants, capabilityGrants],
  );
  const hasChanges = Object.keys(dirtyLimits).length > 0 || Object.keys(dirtyGrants).length > 0;

  // FR-04/AC-03 — the plan sets a BASELINE (GRW-110), but the code default is
  // still a ceiling applied last, so a plan value above it is silently
  // ineffective. State it rather than let an admin believe they granted more
  // than they did.
  const overCeiling = registry
    ? (registry.filter((k) => k.type === 'number' && draftLimits[k.key] !== undefined && draftLimits[k.key]! > (k.codeDefault as number)) as CapabilityKeyMeta[])
    : [];

  function submit(reason: string) {
    setSaving(true);
    setSaveError(null);
    adminFetch<{ limits: Record<string, number>; capabilityGrants: Record<string, boolean> }>(`/plans/${planCode}/entitlements`, {
      method: 'PATCH',
      body: JSON.stringify({ reason, limits: dirtyLimits, capabilityGrants: dirtyGrants }),
    })
      .then((updated) => {
        setConfirmOpen(false);
        onSaved(updated);
      })
      .catch((err) => {
        setSaveError(err instanceof AdminApiError ? err.message : 'Could not save entitlements.');
      })
      .finally(() => setSaving(false));
  }

  if (registryError) {
    return (
      <Card>
        <div style={{ fontSize: 13, color: oklch.textFaint }}>{registryError}</div>
      </Card>
    );
  }

  if (!registry) {
    return (
      <Card>
        <div style={{ height: 180, borderRadius: 12, background: oklch.divider, animation: 'admin-fade 1.2s ease infinite alternate' }} />
      </Card>
    );
  }

  return (
    <Card>
      {/* UI/UX Requirements — "the save action is never below the fold": this
          card can run to 20+ fields across seven groups, so Save lives in
          the header rather than at the end of a scroll a reviewer might
          never reach. The confirm dialog still surfaces the ceiling warning
          at save time regardless of scroll position. */}
      <SectionTitle
        title="Entitlements & limits"
        right={
          <PrimaryButton onClick={() => setConfirmOpen(true)} disabled={!hasChanges} title={hasChanges ? undefined : 'No entitlements have changed'}>
            Save entitlements
          </PrimaryButton>
        }
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 6 }}>
        {grouped.map(({ group, keys }) => (
          <div key={group}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: oklch.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
              {GROUP_LABEL[group] ?? group}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
              {keys.map((k) => {
                // A key absent from this plan's own JSONB isn't "off"/"zero"
                // — resolveCapabilities falls through to the code default
                // for any layer that doesn't mention a key ("missing layers
                // do not affect the result"). Showing the raw absence as OFF
                // would tell an admin a plan denies something it actually
                // grants by default — the exact lie BR-01 exists to prevent.
                if (k.type === 'boolean') {
                  const effective = draftGrants[k.key] ?? (k.codeDefault as boolean);
                  return (
                    <div key={k.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }} title={k.key}>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: oklch.text }}>{k.label}</span>
                      <Toggle on={effective} onClick={() => setDraftGrants((g) => ({ ...g, [k.key]: !effective }))} />
                    </div>
                  );
                }
                const effective = draftLimits[k.key] ?? (k.codeDefault as number);
                return (
                  <Field key={k.key} label={k.label} hint={`Ceiling: ${(k.codeDefault as number).toLocaleString('en-IN')} · ${k.key}`}>
                    <TextInput
                      type="number"
                      value={effective}
                      onChange={(e) => setDraftLimits((l) => ({ ...l, [k.key]: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))}
                    />
                  </Field>
                );
              })}
            </div>
          </div>
        ))}

        <div>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: oklch.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
            AI
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              padding: '12px 14px',
              borderRadius: 11,
              background: oklch.surfaceSubtle,
              border: `1px dashed ${oklch.borderStrong}`,
            }}
          >
            <span style={{ color: oklch.textFaint, flex: 'none', marginTop: 1 }}>
              <Icon name="alert" size={16} />
            </span>
            <div style={{ fontSize: 12.5, color: oklch.textFaint, lineHeight: 1.5 }}>
              <strong style={{ color: oklch.textMuted }}>Future / Not enabled.</strong> AI entitlements aren't built
              yet — no keys exist for them, so there is nothing here to toggle. Nothing on this screen claims
              otherwise.
            </div>
          </div>
        </div>

        {overCeiling.length > 0 ? (
          <div style={{ padding: '12px 14px', borderRadius: 11, background: oklch.warnBg, fontSize: 12.5, color: 'oklch(0.42 0.12 65)', fontWeight: 600, lineHeight: 1.5 }}>
            {overCeiling.map((k) => (
              <div key={k.key}>
                {k.label}: entered {draftLimits[k.key]!.toLocaleString('en-IN')}, but {(k.codeDefault as number).toLocaleString('en-IN')} is
                the effective maximum today — the extra has no effect. This ceiling is set in code, so raising it is a
                code change; a per-customer exception on their subscription cannot exceed it either.
              </div>
            ))}
          </div>
        ) : null}

        {saveError ? (
          <div style={{ fontSize: 13, fontWeight: 600, color: oklch.danger }}>{saveError}</div>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={`Save entitlements for ${planCode}?`}
        description={
          overCeiling.length > 0
            ? 'One or more limits you entered are above today\'s effective maximum and will have no additional effect until that changes (see the warning above). This change is audited.'
            : 'This updates what the plan grants and how much of it. This change is audited.'
        }
        confirmLabel="Save"
        reasonRequired
        reasonPlaceholder="Why is this changing?"
        loading={saving}
        error={saveError}
        onConfirm={submit}
        onCancel={() => {
          setConfirmOpen(false);
          setSaveError(null);
        }}
      />
    </Card>
  );
}
