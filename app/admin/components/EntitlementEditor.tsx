'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { adminFetch, AdminApiError } from '../lib/api';
import { Icon } from '../icons';
import { oklch } from '../tokens';
import { Card, EntitlementRow, SectionTitle, TextInput, Toggle, PrimaryButton } from './primitives';
import { ConfirmDialog } from './ConfirmDialog';
import { capabilityGroupLabel, orderCapabilityGroups } from '../lib/capability-groups';
import { capabilityRoleLabel, orderCapabilityRoles } from '../lib/capability-roles';

/**
 * GRW-107 — the plan entitlement editor. Every field it renders comes from
 * `GET /capability-keys` (listCapabilityKeys(), the one sanctioned way out
 * of the capability registry) — there is no hardcoded key list here (FR-01),
 * so a key added to capabilities.ts shows up here with no frontend change.
 *
 * GRW-296 — grouped by role (Owner/Business, Receptionist/Front-desk,
 * Stylist/Staff), not by the registry's own technical group, because the
 * audience for THIS screen is someone deciding what a plan tier promises a
 * business, and thinks in "what does my receptionist get" rather than
 * "what does booking.* mean." The role a key belongs to is a presentation-
 * only inference (`../lib/capability-roles.ts`) with no RBAC behind it —
 * `SubscriptionEntitlements` keeps the technical grouping on purpose, since
 * that screen answers a different question ("why does this one customer
 * have 150 bookings").
 */

interface CapabilityKeyMeta {
  key: string;
  type: 'boolean' | 'number';
  codeDefault: boolean | number;
  label: string;
  description: string;
  group: string;
}

export interface EntitlementEditorProps {
  planCode: string;
  limits: Record<string, number>;
  capabilityGrants: Record<string, boolean>;
  onSaved: (updated: { limits: Record<string, number>; capabilityGrants: Record<string, boolean> }) => void;
}

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

  const roleGrouped = useMemo(() => (registry ? orderCapabilityRoles(registry) : []), [registry]);

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

  /**
   * A key absent from this plan's own JSONB isn't "off"/"zero" —
   * resolveCapabilities falls through to the code default for any layer
   * that doesn't mention a key ("missing layers do not affect the
   * result"). Showing the raw absence as OFF would tell an admin a plan
   * denies something it actually grants by default — the exact lie BR-01
   * exists to prevent.
   */
  function renderRow(k: CapabilityKeyMeta) {
    if (k.type === 'boolean') {
      const effective = draftGrants[k.key] ?? (k.codeDefault as boolean);
      return (
        <EntitlementRow
          key={k.key}
          label={k.label}
          keyForTitle={k.key}
          tooltip={k.description}
          control={<Toggle label={k.label} on={effective} onClick={() => setDraftGrants((g) => ({ ...g, [k.key]: !effective }))} />}
        />
      );
    }
    const effective = draftLimits[k.key] ?? (k.codeDefault as number);
    return (
      <EntitlementRow
        key={k.key}
        label={k.label}
        keyForTitle={k.key}
        tooltip={k.description}
        description={
          <div style={{ fontSize: 11.5, color: oklch.textFaint, marginTop: 4 }}>
            Ceiling: {(k.codeDefault as number).toLocaleString('en-IN')} · {k.key}
          </div>
        }
        control={
          <div style={{ width: 110 }}>
            <TextInput
              type="number"
              value={effective}
              aria-label={k.label}
              onChange={(e) => setDraftLimits((l) => ({ ...l, [k.key]: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))}
            />
          </div>
        }
      />
    );
  }

  return (
    <Card>
      {/* UI/UX Requirements — "the save action is never below the fold": this
          card can run to 20+ fields across three role sections, so Save
          lives in the header rather than at the end of a scroll a reviewer
          might never reach. The confirm dialog still surfaces the ceiling
          warning at save time regardless of scroll position. */}
      <SectionTitle
        title="Entitlements & limits"
        right={
          <PrimaryButton onClick={() => setConfirmOpen(true)} disabled={!hasChanges} title={hasChanges ? undefined : 'No entitlements have changed'}>
            Save entitlements
          </PrimaryButton>
        }
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 26, marginTop: 6 }}>
        {roleGrouped.map(({ role, rows: roleRows }) => (
          <div key={role}>
            <div style={{ fontSize: 14, fontWeight: 800, color: oklch.textStrong, marginBottom: 12 }}>{capabilityRoleLabel(role)}</div>

            {/* GRW-296 AC-03 — most of a stylist's day isn't decided here. */}
            {role === 'stylist' ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  padding: '12px 14px',
                  borderRadius: 11,
                  background: oklch.surfaceSubtle,
                  border: `1px dashed ${oklch.borderStrong}`,
                  marginBottom: 12,
                }}
              >
                <span style={{ color: oklch.textFaint, flex: 'none', marginTop: 1 }}>
                  <Icon name="alert" size={16} />
                </span>
                <div style={{ fontSize: 12.5, color: oklch.textFaint, lineHeight: 1.5 }}>
                  <strong style={{ color: oklch.textMuted }}>Most of a stylist&rsquo;s day isn&rsquo;t set here.</strong> Their calendar,
                  what they can edit, what they can see — that&rsquo;s{' '}
                  <Link href="/admin/roles" style={{ color: oklch.accentText, fontWeight: 700, textDecoration: 'underline' }}>
                    Roles &amp; permissions
                  </Link>
                  , not the plan. This section only covers the two things the <em>plan</em> gates for staff: whether they get a
                  dashboard login at all, and whether they see the leaderboard.
                </div>
              </div>
            ) : null}

            {role === 'owner' ? (
              // Owner/Business spans several technical groups (messaging,
              // catalog, scheduling, reporting, conversation, limits) — a
              // second grouping pass, scoped to just this role's rows, keeps
              // 12 otherwise-unrelated-looking fields scannable.
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {orderCapabilityGroups(roleRows).map(({ group, rows: groupRows }) => (
                  <div key={group}>
                    <div
                      style={{
                        fontSize: 11.5,
                        fontWeight: 700,
                        color: oklch.textFaint,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        marginBottom: 8,
                      }}
                    >
                      {capabilityGroupLabel(group)}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{groupRows.map(renderRow)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{roleRows.map(renderRow)}</div>
            )}
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
