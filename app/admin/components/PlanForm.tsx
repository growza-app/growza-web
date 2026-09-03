'use client';

import { useState, type CSSProperties } from 'react';
import { adminFetch, AdminApiError } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { Card, Field, PrimaryButton, SecondaryButton, SectionTitle, StatusPill, Table, TableRow, TextInput, type TableColumn } from './primitives';
import { ConfirmDialog } from './ConfirmDialog';
import { EntitlementEditor } from './EntitlementEditor';
import { inr, oklch } from '../tokens';

/**
 * GRW-108 — the real plan editor: details, pricing (via GRW-106's
 * versioning, never a silent price overwrite), status (retire/reactivate),
 * entitlements (GRW-107's editor, untouched), and version history. Edit
 * only — creating a plan is its own smaller form (plans/new/page.tsx),
 * since a not-yet-created plan has no entitlements or versions to show.
 */

export interface PlanDetail {
  code: string;
  name: string;
  description: string;
  basePriceMinor: number;
  currency: string;
  billingCycle: string;
  status: string;
  limits: Record<string, number>;
  capabilityGrants: Record<string, boolean>;
  /** Which version the live values above came from — what tells Active apart from Superseded. */
  currentVersion: number;
}

export interface PlanVersion {
  id: string;
  version: number;
  basePriceMinor: number;
  cohortChoice: string;
  scheduledAt: string | null;
  activatedAt: string | null;
  createdAt: string;
}

const COHORT_CHOICES: { value: string; label: string; description: string; disabled?: boolean }[] = [
  {
    value: 'existing_customers_keep_price',
    label: 'Existing customers keep their price',
    description: 'New businesses get the new price; nobody already on this plan is affected.',
  },
  {
    value: 'new_customers_only',
    label: 'New customers only',
    description: "Same effect as above — there's no subscription yet (Jira GRW-81) for these to differ against.",
  },
  {
    value: 'named_customers_migrate',
    label: 'Named customers migrate',
    description: 'Not available yet — there is no subscription to migrate (Jira GRW-81).',
    disabled: true,
  },
  {
    value: 'scheduled',
    label: 'Scheduled for a date',
    description: 'Takes effect on a future date you choose, instead of immediately.',
  },
];
const COHORT_LABEL = Object.fromEntries(COHORT_CHOICES.map((c) => [c.value, c.label]));

export function PlanForm({
  plan,
  versions,
  otherActivePlansCount,
  onPlanUpdated,
  onVersionCreated,
}: {
  plan: PlanDetail;
  versions: PlanVersion[];
  otherActivePlansCount: number;
  onPlanUpdated: (plan: PlanDetail) => void;
  onVersionCreated: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PlanDetailsCard plan={plan} onSaved={onPlanUpdated} />
      <PricingCard plan={plan} onVersionCreated={onVersionCreated} />
      <StatusCard plan={plan} otherActivePlansCount={otherActivePlansCount} onSaved={onPlanUpdated} />
      <EntitlementEditor
        planCode={plan.code}
        limits={plan.limits}
        capabilityGrants={plan.capabilityGrants}
        onSaved={(updated) => onPlanUpdated({ ...plan, ...updated })}
      />
      <VersionHistoryCard versions={versions} currentVersion={plan.currentVersion} />
    </div>
  );
}

const textareaStyle: CSSProperties = {
  width: '100%',
  minHeight: 70,
  padding: '12px 14px',
  borderRadius: 11,
  border: `1px solid ${oklch.borderStrong}`,
  background: oklch.inputBg,
  fontSize: 14,
  fontWeight: 500,
  outline: 'none',
  resize: 'vertical',
  fontFamily: 'inherit',
};

function PlanDetailsCard({ plan, onSaved }: { plan: PlanDetail; onSaved: (p: PlanDetail) => void }) {
  const [name, setName] = useState(plan.name);
  const [description, setDescription] = useState(plan.description);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = name !== plan.name || description !== plan.description;

  function submit(reason: string) {
    setSaving(true);
    setError(null);
    adminFetch<PlanDetail>(`/plans/${plan.code}`, { method: 'PATCH', body: JSON.stringify({ reason, name, description }) })
      .then((updated) => {
        setConfirmOpen(false);
        onSaved(updated);
      })
      .catch((err) => setError(err instanceof AdminApiError ? err.message : 'Could not save.'))
      .finally(() => setSaving(false));
  }

  return (
    <Card>
      <SectionTitle
        title="Plan details"
        right={
          <PrimaryButton onClick={() => setConfirmOpen(true)} disabled={!dirty} title={dirty ? undefined : 'Nothing has changed yet'}>
            Save details
          </PrimaryButton>
        }
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 6 }}>
        <Field label="Plan name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Description">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} style={textareaStyle} />
        </Field>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        title={`Save details for ${plan.name}?`}
        description="Updates the plan's name and description only — price and entitlements are unaffected. This change is audited."
        confirmLabel="Save"
        reasonRequired
        loading={saving}
        error={error}
        onConfirm={submit}
        onCancel={() => {
          setConfirmOpen(false);
          setError(null);
        }}
      />
    </Card>
  );
}

function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 800, color: oklch.textFaint, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: oklch.textStrong, marginTop: 3 }}>{value}</div>
    </div>
  );
}

function PricingCard({ plan, onVersionCreated }: { plan: PlanDetail; onVersionCreated: () => void }) {
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState(String(plan.basePriceMinor / 100));
  const [cohortChoice, setCohortChoice] = useState<string | null>(null);
  const [scheduledAt, setScheduledAt] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // `>= 0` as well as "is a number": without it a negative reached the API and
  // came back as a 400 the admin had to read to discover, on a field the form
  // could have refused. plans/new has always guarded this; this form did not.
  const priceValid = price.trim().length > 0 && !Number.isNaN(Number(price)) && Number(price) >= 0;
  const priceChanged = priceValid && Math.round(Number(price) * 100) !== plan.basePriceMinor;
  const canSubmit = priceChanged && !!cohortChoice && cohortChoice !== 'named_customers_migrate' && (cohortChoice !== 'scheduled' || !!scheduledAt);

  function resetAndClose() {
    setEditing(false);
    setCohortChoice(null);
    setScheduledAt('');
    setPrice(String(plan.basePriceMinor / 100));
  }

  function submit(reason: string) {
    setSaving(true);
    setError(null);
    adminFetch(`/plans/${plan.code}/versions`, {
      method: 'POST',
      body: JSON.stringify({
        reason,
        cohortChoice,
        basePriceMinor: Math.round(Number(price) * 100),
        ...(cohortChoice === 'scheduled' && scheduledAt ? { scheduledAt: new Date(scheduledAt).toISOString() } : {}),
      }),
    })
      .then(() => {
        setConfirmOpen(false);
        resetAndClose();
        onVersionCreated();
      })
      .catch((err) => setError(err instanceof AdminApiError ? err.message : 'Could not create a new version.'))
      .finally(() => setSaving(false));
  }

  return (
    <Card>
      <SectionTitle title="Pricing" right={!editing ? <SecondaryButton onClick={() => setEditing(true)}>Change price</SecondaryButton> : null} />
      {!editing ? (
        <div style={{ marginTop: 6, display: 'flex', gap: 28, flexWrap: 'wrap' }}>
          <SummaryField label="List price" value={`${inr(plan.basePriceMinor / 100)}/mo`} />
          <SummaryField label="Currency" value={plan.currency} />
          <SummaryField label="Billing cycle" value={plan.billingCycle} />
        </div>
      ) : (
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Field label="New base price (₹)" hint="Pre-tax">
            <TextInput type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} />
          </Field>

          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: oklch.textMuted, marginBottom: 8 }}>
              What happens to existing customers? <span style={{ color: oklch.danger }}>*</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {COHORT_CHOICES.map((c) => (
                <label
                  key={c.value}
                  style={{
                    display: 'flex',
                    gap: 10,
                    alignItems: 'flex-start',
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: `1px solid ${cohortChoice === c.value ? oklch.accent : oklch.borderStrong}`,
                    cursor: c.disabled ? 'not-allowed' : 'pointer',
                    opacity: c.disabled ? 0.5 : 1,
                  }}
                >
                  <input
                    type="radio"
                    name="cohortChoice"
                    disabled={c.disabled}
                    checked={cohortChoice === c.value}
                    onChange={() => setCohortChoice(c.value)}
                    style={{ marginTop: 2, accentColor: oklch.accent }}
                  />
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: oklch.text }}>{c.label}</div>
                    <div style={{ fontSize: 12, color: oklch.textFaint, marginTop: 2 }}>{c.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {cohortChoice === 'scheduled' ? (
            <Field label="Effective date">
              <TextInput type="date" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
            </Field>
          ) : null}

          <div style={{ display: 'flex', gap: 10 }}>
            <SecondaryButton onClick={resetAndClose} style={{ flex: 1, height: 44 }}>
              Cancel
            </SecondaryButton>
            <PrimaryButton
              onClick={() => setConfirmOpen(true)}
              disabled={!canSubmit}
              title={canSubmit ? undefined : 'Set a new price and choose who it applies to first'}
              style={{ flex: 1.3, height: 44, justifyContent: 'center' }}
            >
              Save as new version
            </PrimaryButton>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={`Create a new price version for ${plan.name}?`}
        description="This creates a new, immutable version — the version customers were already sold stays exactly as it was (12-conventions.md §1). This change is audited."
        confirmLabel="Create version"
        reasonRequired
        loading={saving}
        error={error}
        onConfirm={submit}
        onCancel={() => {
          setConfirmOpen(false);
          setError(null);
        }}
      />
    </Card>
  );
}

function StatusCard({
  plan,
  otherActivePlansCount,
  onSaved,
}: {
  plan: PlanDetail;
  otherActivePlansCount: number;
  onSaved: (p: PlanDetail) => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const retiring = plan.status === 'active';
  const isLastActive = retiring && otherActivePlansCount === 0;

  function submit(reason: string) {
    setSaving(true);
    setError(null);
    adminFetch<PlanDetail>(`/plans/${plan.code}`, { method: 'PATCH', body: JSON.stringify({ reason, status: retiring ? 'retired' : 'active' }) })
      .then((updated) => {
        setConfirmOpen(false);
        onSaved(updated);
      })
      .catch((err) => setError(err instanceof AdminApiError ? err.message : 'Could not change status.'))
      .finally(() => setSaving(false));
  }

  return (
    <Card>
      <SectionTitle
        title="Status"
        right={
          <SecondaryButton danger={retiring} onClick={() => setConfirmOpen(true)}>
            {retiring ? 'Retire plan' : 'Reactivate plan'}
          </SecondaryButton>
        }
      />
      <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <StatusPill status={plan.status === 'active' ? 'Active' : 'Retired'} />
        <span style={{ fontSize: 12.5, color: oklch.textFaint }}>
          {plan.status === 'active'
            ? 'New businesses can be assigned this plan.'
            : 'This plan cannot be chosen for a new business; existing tenants on it are unaffected.'}
        </span>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        title={retiring ? `Retire ${plan.name}?` : `Reactivate ${plan.name}?`}
        description={
          retiring
            ? isLastActive
              ? `This is the only active plan today — after retiring it, no plan will be available for a new business until another is created or reactivated. Existing tenants on ${plan.name} keep working exactly as they do now.`
              : `New businesses can no longer be assigned this plan. Existing tenants on it are completely unaffected — retire, never delete.`
            : 'New businesses can be assigned this plan again.'
        }
        confirmLabel={retiring ? 'Retire plan' : 'Reactivate plan'}
        danger={retiring}
        reasonRequired
        loading={saving}
        error={error}
        onConfirm={submit}
        onCancel={() => {
          setConfirmOpen(false);
          setError(null);
        }}
      />
    </Card>
  );
}

const VERSION_COLUMNS: TableColumn[] = [
  { label: 'Version', width: '0.6fr' },
  { label: 'Price', width: '1fr' },
  { label: 'Cohort choice', width: '1.6fr' },
  { label: 'Status', width: '1fr' },
  { label: 'Created', width: '1.2fr' },
];

/**
 * A version that has ever gone live keeps `activatedAt` set forever, so
 * rendering `activatedAt ? 'Active' : 'Scheduled'` labelled every superseded
 * version Active — v1 at ₹799 and v2 at ₹899 both claiming to be in force,
 * on the one screen that exists to say which price is actually charged.
 * Only the version the plan currently points at is Active.
 */
function versionStatus(v: PlanVersion, currentVersion: number): 'Active' | 'Superseded' | 'Scheduled' {
  if (!v.activatedAt) return 'Scheduled';
  return v.version === currentVersion ? 'Active' : 'Superseded';
}

function VersionHistoryCard({ versions, currentVersion }: { versions: PlanVersion[]; currentVersion: number }) {
  return (
    <Card>
      <SectionTitle title="Version history" />
      {versions.length === 0 ? (
        <div style={{ fontSize: 13, color: oklch.textFaint, marginTop: 6 }}>No versions yet.</div>
      ) : (
        <Table
          columns={VERSION_COLUMNS}
          minWidthPx={560}
          rows={versions.map((v) => (
            <TableRow key={v.id} columns={VERSION_COLUMNS}>
              <div style={{ fontWeight: 800, color: oklch.textStrong }}>v{v.version}</div>
              <div style={{ fontWeight: 700, color: oklch.text }}>{inr(v.basePriceMinor / 100)}/mo</div>
              <div style={{ fontSize: 12.5, color: oklch.textMuted }}>{COHORT_LABEL[v.cohortChoice] ?? v.cohortChoice}</div>
              <div>
                <StatusPill status={versionStatus(v, currentVersion)} />
              </div>
              <div style={{ fontSize: 12.5, color: oklch.textFaint }}>{formatDateTime(v.createdAt)}</div>
            </TableRow>
          ))}
        />
      )}
      <div style={{ fontSize: 12, color: oklch.textFaint, marginTop: 14, lineHeight: 1.5 }}>
        Only the version the plan currently points at is Active; the rest are kept so a price a customer was sold
        stays readable. How many subscriptions are pinned to each isn&apos;t shown here — open a subscription from
        the Subscriptions list to see its own pinned version.
      </div>
    </Card>
  );
}
