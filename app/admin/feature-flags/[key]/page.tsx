'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { adminFetch, AdminApiError } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { Card, EmptyState, PrimaryButton, SecondaryButton, SectionTitle, TextInput, Toggle } from '../../components/primitives';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { oklch } from '../../tokens';

/**
 * GRW-131's flag detail: the global switch, the default, the plan rollout, and
 * the businesses that override it.
 *
 * The mock this replaces had a hardcoded three-plan rollout (`Base/Growth/Pro`)
 * and three invented overrides ("Glow Salon", "BrightSmile Dental") — which is
 * a screen that answers "who is in this beta" with fiction, on the one page an
 * admin opens to find out.
 *
 * The precedence is stated on the page rather than left to be remembered,
 * because none of these four controls means anything without the other three.
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

interface OverrideRow {
  businessId: string;
  businessName: string;
  enabled: boolean;
  reason: string;
  updatedAt: string;
}

interface Plan {
  code: string;
  name: string;
}

export default function FeatureFlagDetailPage() {
  const params = useParams<{ key: string }>();
  const key = decodeURIComponent(params.key);

  const [flag, setFlag] = useState<FlagRow | null>(null);
  const [overrides, setOverrides] = useState<OverrideRow[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [confirm, setConfirm] = useState<{ kind: 'enabled' | 'default'; next: boolean } | { kind: 'plans'; next: string[] } | null>(null);
  const [removing, setRemoving] = useState<OverrideRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [draftPlans, setDraftPlans] = useState<string[]>([]);
  const [addBusinessId, setAddBusinessId] = useState('');
  const [addEnabled, setAddEnabled] = useState(true);
  const [adding, setAdding] = useState(false);

  const load = useCallback(
    (signal?: AbortSignal) =>
      Promise.all([
        adminFetch<{ rows: FlagRow[] }>('/feature-flags', { signal }),
        adminFetch<{ rows: OverrideRow[] }>(`/feature-flags/${encodeURIComponent(key)}/overrides`, { signal }),
        // The plan list is what makes the rollout checkboxes real rather than
        // three hardcoded names. A failure here is not fatal — the rest of the
        // page still answers the question it was opened for.
        adminFetch<{ rows: Plan[] }>('/plans', { signal }).catch(() => ({ rows: [] as Plan[] })),
      ])
        .then(([flags, overrideList, planList]) => {
          const found = flags.rows.find((f) => f.key === key) ?? null;
          setFlag(found);
          setMissing(found === null);
          setDraftPlans(found?.planCodes ?? []);
          setOverrides(overrideList.rows);
          setPlans(planList.rows);
          setError(null);
        })
        .catch((err) => {
          if (signal?.aborted) return;
          setError(err instanceof AdminApiError ? err.message : 'Could not load this feature flag.');
        }),
    [key],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  function patch(body: Record<string, unknown>, reason: string) {
    setSaving(true);
    setSaveError(null);
    adminFetch<FlagRow>(`/feature-flags/${encodeURIComponent(key)}`, { method: 'PATCH', body: JSON.stringify({ ...body, reason }) })
      .then((updated) => {
        setFlag(updated);
        setDraftPlans(updated.planCodes);
        setConfirm(null);
      })
      .catch((err) => setSaveError(err instanceof AdminApiError ? err.message : 'Could not save this change.'))
      .finally(() => setSaving(false));
  }

  function addOverride(reason: string) {
    setSaving(true);
    setSaveError(null);
    adminFetch<OverrideRow>(`/feature-flags/${encodeURIComponent(key)}/overrides/${encodeURIComponent(addBusinessId.trim())}`, {
      method: 'PUT',
      body: JSON.stringify({ enabled: addEnabled, reason }),
    })
      .then(() => {
        setAdding(false);
        setAddBusinessId('');
        void load();
      })
      .catch((err) => setSaveError(err instanceof AdminApiError ? err.message : 'Could not set this override.'))
      .finally(() => setSaving(false));
  }

  function removeOverride(reason: string) {
    if (!removing) return;
    setSaving(true);
    setSaveError(null);
    adminFetch(`/feature-flags/${encodeURIComponent(key)}/overrides/${encodeURIComponent(removing.businessId)}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason }),
    })
      .then(() => {
        setRemoving(null);
        void load();
      })
      .catch((err) => setSaveError(err instanceof AdminApiError ? err.message : 'Could not remove this override.'))
      .finally(() => setSaving(false));
  }

  if (missing) return <EmptyState icon="flags" title="Feature flag not found" sub="Flags are defined in code and arrive by migration — check the key." />;

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

  if (!flag) {
    return (
      <Card>
        <div style={{ height: 240, borderRadius: 12, background: oklch.divider, animation: 'admin-fade 1.2s ease infinite alternate' }} />
      </Card>
    );
  }

  const plansChanged = draftPlans.slice().sort().join(',') !== flag.planCodes.slice().sort().join(',');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: oklch.textStrong }}>{flag.label}</div>
            <div style={{ fontSize: 12, color: 'oklch(0.6 0.015 155)', marginTop: 4, fontFamily: 'ui-monospace, monospace' }}>{flag.key}</div>
            <div style={{ fontSize: 13, color: oklch.textMuted, marginTop: 8, maxWidth: 560, lineHeight: 1.45 }}>{flag.description}</div>
          </div>
          <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <Toggle on={flag.enabled} onClick={() => setConfirm({ kind: 'enabled', next: !flag.enabled })} />
            <span style={{ fontSize: 11, fontWeight: 700, color: oklch.textFaint, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {flag.enabled ? 'Live' : 'Off for all'}
            </span>
          </div>
        </div>

        {/* Four controls, none of which means anything alone. Stated on the
            page rather than left to be remembered, because getting the order
            wrong is how someone switches a flag "on" for a pilot and wonders
            why nothing happened. */}
        <div
          style={{
            marginTop: 16,
            padding: '12px 15px',
            borderRadius: 12,
            background: oklch.surfaceSubtle,
            border: `1px solid ${oklch.border}`,
            fontSize: 12.5,
            lineHeight: 1.6,
            color: 'oklch(0.45 0.02 155)',
            fontWeight: 500,
          }}
        >
          <strong>How a business gets this feature</strong>
          <div style={{ marginTop: 6 }}>
            1. If the switch above is off, <strong>nobody</strong> gets it — that beats everything below.
            <br />
            2. Otherwise, a business listed under Overrides gets whatever its own row says.
            <br />
            3. Otherwise, a business on a targeted plan gets it.
            <br />
            4. Otherwise, the default decides.
          </div>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: 16, alignItems: 'start' }}>
        <Card>
          <SectionTitle title="Default" />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
            <div style={{ fontSize: 12.5, color: oklch.textMuted, lineHeight: 1.45 }}>
              What a business gets when it has no override and its plan is not targeted. This is most businesses.
            </div>
            <div style={{ flex: 'none' }}>
              <Toggle on={flag.defaultOn} disabled={!flag.enabled} onClick={() => setConfirm({ kind: 'default', next: !flag.defaultOn })} />
            </div>
          </div>
        </Card>

        <Card>
          <SectionTitle title="Plans" />
          <div style={{ fontSize: 12.5, color: oklch.textMuted, marginBottom: 11, lineHeight: 1.45 }}>
            Businesses on a ticked plan get this feature, unless they have an override of their own.
          </div>
          {plans.length === 0 ? (
            <div style={{ fontSize: 12.5, color: oklch.textFaint, fontWeight: 600 }}>Plans could not be loaded.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {plans.map((plan) => (
                <label key={plan.code} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={draftPlans.includes(plan.code)}
                    disabled={!flag.enabled}
                    onChange={(e) => setDraftPlans((current) => (e.target.checked ? [...current, plan.code] : current.filter((c) => c !== plan.code)))}
                  />
                  <span style={{ color: oklch.textStrong }}>{plan.name}</span>
                  <span style={{ color: oklch.textFaint, fontFamily: 'ui-monospace, monospace', fontSize: 11.5 }}>{plan.code}</span>
                </label>
              ))}
            </div>
          )}
          {plansChanged ? (
            <div style={{ display: 'flex', gap: 9, marginTop: 14 }}>
              <SecondaryButton onClick={() => setDraftPlans(flag.planCodes)}>Discard</SecondaryButton>
              <PrimaryButton onClick={() => setConfirm({ kind: 'plans', next: draftPlans })}>Save plans</PrimaryButton>
            </div>
          ) : null}
        </Card>
      </div>

      <Card>
        <SectionTitle
          title="Businesses with their own answer"
          right={<SecondaryButton onClick={() => { setSaveError(null); setAdding(true); }}>Add a business</SecondaryButton>}
        />
        {overrides.length === 0 ? (
          <div style={{ fontSize: 13, color: oklch.textFaint, fontWeight: 600, padding: '10px 0' }}>
            No business overrides this flag. Everyone follows the plans and the default above.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {overrides.map((row) => (
              <div
                key={row.businessId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '11px 14px',
                  borderRadius: 12,
                  border: `1px solid ${oklch.border}`,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <Link
                    href={`/admin/businesses/${row.businessId}`}
                    className="admin-name"
                    style={{ fontSize: 13.5, fontWeight: 700, color: oklch.textStrong, textDecoration: 'none' }}
                  >
                    {row.businessName}
                  </Link>
                  <div style={{ fontSize: 12, color: oklch.textMuted, marginTop: 3 }}>
                    {row.reason} · {formatDateTime(row.updatedAt)}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 11.5,
                    fontWeight: 800,
                    padding: '3px 9px',
                    borderRadius: 7,
                    textTransform: 'uppercase',
                    letterSpacing: '0.03em',
                    color: row.enabled ? 'oklch(0.4 0.12 150)' : 'oklch(0.5 0.15 25)',
                    background: row.enabled ? 'oklch(0.95 0.035 150)' : 'oklch(0.96 0.02 25)',
                  }}
                >
                  {row.enabled ? 'On' : 'Off'}
                </span>
                <SecondaryButton danger onClick={() => { setSaveError(null); setRemoving(row); }} style={{ height: 30, padding: '0 12px', fontSize: 12.5 }}>
                  Remove
                </SecondaryButton>
              </div>
            ))}
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={confirm !== null}
        danger={confirm?.kind === 'enabled' && confirm.next === false}
        title={
          confirm?.kind === 'enabled'
            ? confirm.next
              ? `Switch ${flag.label} on?`
              : `Switch ${flag.label} off?`
            : confirm?.kind === 'default'
              ? confirm.next
                ? 'Turn the default on?'
                : 'Turn the default off?'
              : 'Save plan targeting?'
        }
        description={
          confirm?.kind === 'enabled'
            ? confirm.next
              ? 'This lets the feature apply again. Who actually gets it is then decided by the default, the plan targeting and any overrides — this does not by itself turn it on for anyone.'
              : 'This turns the feature off for every business immediately, including any switched on for a pilot. It overrides the default, the plans and every override.'
            : confirm?.kind === 'default'
              ? confirm.next
                ? 'Every business without an override, and not on a targeted plan, gets this feature.'
                : 'Every business without an override, and not on a targeted plan, loses this feature.'
              : (confirm?.next as string[] | undefined)?.length
                ? `Businesses on ${(confirm!.next as string[]).join(', ')} get this feature, unless they have an override of their own.`
                : 'No plan will grant this feature. Businesses fall back to the default and their own overrides.'
        }
        confirmLabel="Save"
        reasonRequired
        reasonPlaceholder="Why is this changing?"
        loading={saving}
        error={saveError}
        onConfirm={(reason) => {
          if (!confirm) return;
          if (confirm.kind === 'enabled') patch({ enabled: confirm.next }, reason);
          else if (confirm.kind === 'default') patch({ defaultOn: confirm.next }, reason);
          else patch({ planCodes: confirm.next }, reason);
        }}
        onCancel={() => {
          setConfirm(null);
          setSaveError(null);
        }}
      />

      <ConfirmDialog
        open={adding}
        title={`Give one business its own answer for ${flag.label}`}
        description="Paste the business id. Its own answer beats the plan targeting and the default, in both directions — this is how a business joins a beta, and how one is pulled out of a rollout."
        confirmLabel={addEnabled ? 'Switch on for this business' : 'Switch off for this business'}
        reasonRequired
        reasonPlaceholder="Why does this business differ?"
        loading={saving}
        error={saveError}
        onConfirm={addOverride}
        onCancel={() => {
          setAdding(false);
          setSaveError(null);
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 4 }}>
          <TextInput aria-label="Business id" placeholder="Business id" value={addBusinessId} onChange={(e) => setAddBusinessId(e.target.value)} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 600, color: oklch.textStrong }}>
            <Toggle on={addEnabled} onClick={() => setAddEnabled((v) => !v)} label="Switched on for this business" />
            {addEnabled ? 'On for this business' : 'Off for this business'}
          </label>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={removing !== null}
        danger
        title={`Remove ${removing?.businessName}'s override?`}
        description="They go back to following the plan targeting and the default, which may switch the feature on or off for them. Removing an override is not the same as switching it off."
        confirmLabel="Remove override"
        reasonRequired
        reasonPlaceholder="Why is this override being removed?"
        loading={saving}
        error={saveError}
        onConfirm={removeOverride}
        onCancel={() => {
          setRemoving(null);
          setSaveError(null);
        }}
      />
    </div>
  );
}
