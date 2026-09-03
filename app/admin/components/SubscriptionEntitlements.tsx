'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminFetch, AdminApiError } from '../lib/api';
import { capabilityGroupLabel, orderCapabilityGroups } from '../lib/capability-groups';
import { Icon } from '../icons';
import { oklch } from '../tokens';
import { Card, Pill, SecondaryButton, SectionTitle, TextInput, Toggle } from './primitives';
import { ConfirmDialog } from './ConfirmDialog';

/**
 * GRW-112 — effective entitlements for one subscription, with the layer that
 * produced each value, and the per-customer override editor.
 *
 * GRW-110 shipped all of this server-side: the four-layer resolver, the
 * provenance in `GET /subscriptions/:id/entitlements`, and the write path
 * with its ceiling gate. It had no screen at all, so raising one customer to
 * 150 bookings — the exact case that justified changing the resolution
 * semantics — was a curl command. This is that screen.
 *
 * Two things it must never do:
 *
 *  1. **Show a value without its source.** "Why does this customer have 150?"
 *     is the only question anyone opens this panel to ask, and a bare number
 *     cannot answer it. Every row names the layer it came from, and a value
 *     that was asked for and then capped says both numbers.
 *
 *  2. **Offer an edit that would not apply.** The API refuses an override on
 *     a CANCELLED/EXPIRED subscription (409 `subscription_not_open`) because
 *     the resolver stops reading them; the editor says so up front rather
 *     than letting an admin type a reason for a write that will bounce.
 */

type CapabilityValue = boolean | number;
type CapabilitySource = 'code' | 'vertical' | 'plan' | 'tenant_capability' | 'subscription';

interface EntitlementRow {
  key: string;
  label: string;
  type: 'boolean' | 'number';
  group: string;
  value: CapabilityValue;
  source: CapabilitySource;
  /** Set only when a ceiling overruled the stated value — what was asked for. */
  requested?: CapabilityValue;
  clampedBy?: CapabilitySource;
  override: { value: CapabilityValue; reason: string; updatedAt: string } | null;
}

interface EntitlementsResponse {
  subscriptionId: string;
  businessId: string;
  planCode: string;
  rows: EntitlementRow[];
}

/**
 * Deliberately plain words, not the enum. `tenant_capability` is a table
 * name; "Business setting" is what it means to whoever is reading.
 */
const SOURCE_LABEL: Record<CapabilitySource, string> = {
  code: 'Platform default',
  vertical: 'Vertical',
  plan: 'Plan',
  tenant_capability: 'Business setting',
  subscription: 'Override',
};

/** Only an override is an exception worth colouring; everything else is the normal path. */
function sourcePill(source: CapabilitySource) {
  return source === 'subscription'
    ? { fg: 'oklch(0.4 0.11 65)', bg: oklch.warnBg }
    : { fg: 'oklch(0.5 0.02 155)', bg: 'oklch(0.95 0.006 150)' };
}

function formatValue(row: { type: 'boolean' | 'number' }, value: CapabilityValue): string {
  return row.type === 'boolean' ? (value ? 'On' : 'Off') : Number(value).toLocaleString('en-IN');
}

type PendingEdit =
  | { mode: 'set'; row: EntitlementRow; value: CapabilityValue }
  | { mode: 'remove'; row: EntitlementRow };

export function SubscriptionEntitlements({
  subscriptionId,
  canManage,
  isOpen,
  statusLabel,
}: {
  subscriptionId: string;
  /** `admin.subscription.manage`. Without it the panel is read-only — the server refuses regardless. */
  canManage: boolean;
  /** False for a CANCELLED/EXPIRED subscription, whose overrides the resolver ignores. */
  isOpen: boolean;
  /** The subscription's status in words, for the sentence explaining a closed panel. */
  statusLabel: string;
}) {
  const [data, setData] = useState<EntitlementsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showOverridesOnly, setShowOverridesOnly] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, CapabilityValue>>({});
  const [pending, setPending] = useState<PendingEdit | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // QA pass 7 (HIGH) — `submit()` below deliberately still re-reads via
  // `load()` after a save (a clamp on one key can change what another key
  // resolves to, so the table itself has to come from a full server
  // resolve, not a local patch). But the PUT response is the ONLY place
  // `clamped`/`requested`/`clampedBy` for THIS save ever appear — the
  // confirm dialog's own promise ("a value above a ceiling is capped to it,
  // and you will be told") — because `EntitlementLine`'s "Asked for X,
  // capped to Y" banner reads `row.requested`/`row.clampedBy` off the
  // RESOLVED row, and the override is stored already-clamped (admin-routes.ts's
  // own comment: "stored CLAMPED, so the stored row and the resolved value
  // never disagree"), so a later resolve can never again see a gap between
  // what was asked and what's stored — there is none left to see. This
  // banner is what actually keeps that promise.
  const [clampNotice, setClampNotice] = useState<{ label: string; requested: CapabilityValue; effectiveValue: CapabilityValue } | null>(null);

  const load = useCallback(
    (signal?: AbortSignal) =>
      adminFetch<EntitlementsResponse>(`/subscriptions/${subscriptionId}/entitlements`, { signal })
        .then((result) => {
          setData(result);
          // Drafts are seeded from the resolved value so the number a
          // reviewer edits starts at what is actually in force, not at zero.
          setDrafts(Object.fromEntries(result.rows.map((r) => [r.key, r.override?.value ?? r.value])));
          // Removing the LAST override left the panel filtered to overrides
          // only, showing nothing, with the button that would clear the
          // filter now disabled because the count had reached zero — a state
          // only a page reload got out of.
          if (!result.rows.some((r) => r.override)) setShowOverridesOnly(false);
          setError(null);
        })
        .catch((err) => {
          if (signal?.aborted) return;
          setError(err instanceof AdminApiError ? err.message : 'Could not load entitlements.');
        }),
    [subscriptionId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const overrideCount = data ? data.rows.filter((r) => r.override).length : 0;
  const visibleRows = useMemo(() => {
    if (!data) return [];
    return showOverridesOnly ? data.rows.filter((r) => r.override) : data.rows;
  }, [data, showOverridesOnly]);
  const grouped = useMemo(() => orderCapabilityGroups(visibleRows), [visibleRows]);

  function submit(reason: string) {
    if (!pending) return;
    setSaving(true);
    setSaveError(null);
    setClampNotice(null);

    const path = `/subscriptions/${subscriptionId}/entitlements/${encodeURIComponent(pending.row.key)}`;
    const row = pending.row;

    if (pending.mode === 'set') {
      adminFetch<{ key: string; requested: CapabilityValue; effectiveValue: CapabilityValue; clamped: boolean; clampedBy?: CapabilitySource }>(
        path,
        { method: 'PUT', body: JSON.stringify({ reason, value: pending.value }) },
      )
        .then((result) => {
          // Read straight off THIS response, before the re-read below can
          // ever have a chance to launder it away — see the state comment.
          if (result.clamped) setClampNotice({ label: row.label, requested: result.requested, effectiveValue: result.effectiveValue });
          // Always re-read rather than patching state from the response: an
          // override is clamped server-side, and one key's value can be the
          // ceiling another key resolves against. Trusting the local guess is
          // how the panel ends up disagreeing with the resolver it is
          // describing.
          return load();
        })
        .then(() => setPending(null))
        .catch((err) => setSaveError(err instanceof AdminApiError ? err.message : 'Could not save this override.'))
        .finally(() => setSaving(false));
      return;
    }

    adminFetch<unknown>(path, { method: 'DELETE', body: JSON.stringify({ reason }) })
      .then(() => load())
      .then(() => setPending(null))
      .catch((err) => setSaveError(err instanceof AdminApiError ? err.message : 'Could not save this override.'))
      .finally(() => setSaving(false));
  }

  if (error) {
    return (
      <Card>
        <SectionTitle title="Effective entitlements" />
        <div style={{ fontSize: 13.5, fontWeight: 600, color: oklch.textStrong, marginBottom: 10 }}>{error}</div>
        <SecondaryButton onClick={() => void load()}>Retry</SecondaryButton>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <SectionTitle title="Effective entitlements" />
        <div style={{ height: 200, borderRadius: 12, background: oklch.divider, animation: 'admin-fade 1.2s ease infinite alternate' }} />
      </Card>
    );
  }

  const editable = canManage && isOpen;

  return (
    <Card>
      <SectionTitle
        title="Effective entitlements"
        right={
          <SecondaryButton
            onClick={() => setShowOverridesOnly((v) => !v)}
            disabled={overrideCount === 0}
            title={overrideCount === 0 ? 'This subscription has no overrides' : undefined}
            style={showOverridesOnly ? { color: oklch.accentText, borderColor: oklch.accent } : undefined}
          >
            {overrideCount === 0 ? 'No overrides' : `Overrides only (${overrideCount})`}
          </SecondaryButton>
        }
      />

      <p style={{ margin: '2px 0 16px', fontSize: 12.5, lineHeight: 1.55, color: oklch.textFaint }}>
        What this business may actually use, and where each value comes from. A plan sets the baseline; an override
        replaces it for this customer alone and never changes the plan. Platform and vertical ceilings still have the
        last word.
      </p>

      {clampNotice ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderRadius: 11, background: oklch.warnBg, fontSize: 12.5, fontWeight: 600, lineHeight: 1.5, color: 'oklch(0.42 0.12 65)', marginBottom: 16 }}>
          <Icon name="alert" size={14} />
          Asked for {formatValue({ type: typeof clampNotice.effectiveValue === 'boolean' ? 'boolean' : 'number' }, clampNotice.requested)} on{' '}
          {clampNotice.label}, capped to {formatValue({ type: typeof clampNotice.effectiveValue === 'boolean' ? 'boolean' : 'number' }, clampNotice.effectiveValue)}{' '}
          and saved at that value.
        </div>
      ) : null}

      {!isOpen ? (
        <div style={{ padding: '12px 14px', borderRadius: 11, background: oklch.warnBg, fontSize: 12.5, fontWeight: 600, lineHeight: 1.5, color: 'oklch(0.42 0.12 65)', marginBottom: 16 }}>
          This subscription is {statusLabel.toLowerCase()}, so overrides on it are no longer read when capabilities
          resolve. The values below are what would apply if it were open; they cannot be changed from here.
        </div>
      ) : !canManage ? (
        <div style={{ padding: '12px 14px', borderRadius: 11, background: oklch.surfaceSubtle, border: `1px solid ${oklch.border}`, fontSize: 12.5, fontWeight: 600, color: oklch.textMuted, marginBottom: 16 }}>
          You can see entitlements but not change them — that needs the subscription-manage permission.
        </div>
      ) : null}

      {visibleRows.length === 0 ? (
        <div style={{ fontSize: 13, color: oklch.textFaint, padding: '8px 0' }}>No overrides on this subscription.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {grouped.map(({ group, rows }) => (
            <div key={group}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: oklch.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
                {capabilityGroupLabel(group)}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {rows.map((row) => (
                  <EntitlementLine
                    key={row.key}
                    row={row}
                    draft={drafts[row.key] ?? row.value}
                    editable={editable}
                    onDraftChange={(value) => setDrafts((d) => ({ ...d, [row.key]: value }))}
                    onSet={(value) => {
                      setSaveError(null);
                      setClampNotice(null);
                      setPending({ mode: 'set', row, value });
                    }}
                    onRemove={() => {
                      setSaveError(null);
                      setClampNotice(null);
                      setPending({ mode: 'remove', row });
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={pending !== null}
        danger={pending?.mode === 'remove'}
        title={
          pending
            ? pending.mode === 'set'
              ? `Set ${pending.row.label} to ${formatValue(pending.row, pending.value)} for this customer?`
              : `Remove the override on ${pending.row.label}?`
            : ''
        }
        description={
          pending?.mode === 'set'
            ? 'This applies to this customer only and does not change the plan. A value above a platform or vertical ceiling is capped to it, and you will be told. This change is audited.'
            : 'This customer goes back to whatever the plan grants. This change is audited.'
        }
        confirmLabel={pending?.mode === 'remove' ? 'Remove override' : 'Set override'}
        reasonRequired
        reasonPlaceholder="Why does this customer get an exception?"
        loading={saving}
        error={saveError}
        onConfirm={submit}
        onCancel={() => {
          setPending(null);
          setSaveError(null);
        }}
      />
    </Card>
  );
}

function EntitlementLine({
  row,
  draft,
  editable,
  onDraftChange,
  onSet,
  onRemove,
}: {
  row: EntitlementRow;
  draft: CapabilityValue;
  editable: boolean;
  onDraftChange: (value: CapabilityValue) => void;
  onSet: (value: CapabilityValue) => void;
  onRemove: () => void;
}) {
  const pill = sourcePill(row.source);
  // A boolean commits the moment it is toggled (through the confirm dialog);
  // a number needs the typed value to differ from what is already in force,
  // or "Set override" would record a reason for changing nothing.
  const changed = row.type === 'number' ? Number(draft) !== Number(row.override?.value ?? row.value) : false;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 14,
        flexWrap: 'wrap',
        padding: '11px 13px',
        borderRadius: 12,
        border: `1px solid ${row.override ? 'oklch(0.88 0.06 80)' : oklch.border}`,
        background: row.override ? 'oklch(0.99 0.02 85)' : oklch.surfaceSubtle,
      }}
    >
      <div style={{ minWidth: 200, flex: '1 1 240px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: oklch.text }} title={row.key}>
            {row.label}
          </span>
          <Pill text={SOURCE_LABEL[row.source]} fg={pill.fg} bg={pill.bg} />
        </div>

        {/* The resolver reports `requested` only when a ceiling overruled the
            stated value. Saying just the capped number would leave an admin
            who typed 500 wondering whether their write landed at all. */}
        {row.requested !== undefined && row.clampedBy ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, fontSize: 12, fontWeight: 600, color: 'oklch(0.42 0.12 65)' }}>
            <Icon name="alert" size={13} />
            Asked for {formatValue(row, row.requested)}, capped to {formatValue(row, row.value)} by the{' '}
            {SOURCE_LABEL[row.clampedBy].toLowerCase()}.
          </div>
        ) : null}

        {row.override ? (
          <div style={{ marginTop: 5, fontSize: 12, color: oklch.textFaint, fontWeight: 600 }}>
            Override reason: {row.override.reason}
          </div>
        ) : null}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
        {row.type === 'boolean' ? (
          <>
            <span style={{ fontSize: 13, fontWeight: 700, color: oklch.textMuted, minWidth: 26 }}>{formatValue(row, row.value)}</span>
            <Toggle label={row.label} on={Boolean(row.value)} disabled={!editable} onClick={() => onSet(!row.value)} />
          </>
        ) : (
          <>
            <div style={{ width: 110 }}>
              <TextInput
                type="number"
                min={0}
                value={String(draft)}
                disabled={!editable}
                aria-label={row.label}
                onChange={(e) => onDraftChange(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
              />
            </div>
            <SecondaryButton
              onClick={() => onSet(Number(draft))}
              disabled={!editable || !changed}
              title={!editable ? undefined : !changed ? 'This is already the value in force' : undefined}
              style={{ height: 36, padding: '0 12px', fontSize: 12.5 }}
            >
              Set
            </SecondaryButton>
          </>
        )}
        {row.override ? (
          <SecondaryButton danger onClick={onRemove} disabled={!editable} style={{ height: 36, padding: '0 12px', fontSize: 12.5 }}>
            Remove
          </SecondaryButton>
        ) : null}
      </div>
    </div>
  );
}
