'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminFetch, AdminApiError } from '../../lib/api';
import { Card, Field, PrimaryButton, SecondaryButton, Select, SectionTitle, TextInput } from '../../components/primitives';
import { oklch } from '../../tokens';

/**
 * GRW-108 — creating a plan Growza sells, closing the loop GRW-105 left
 * open: "Elite and Royal... whoever prices them creates the rows through
 * the admin UI GRW-108 builds." A separate, smaller form from the edit
 * screen — a not-yet-created plan has no entitlements or version history
 * to show, and needs a `code` field the edit screen never does.
 */
export default function CreatePlanPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [billingCycle, setBillingCycle] = useState('Monthly');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const codeValid = /^[a-z][a-z0-9_]*$/.test(code.trim());
  const priceValid = price.trim().length > 0 && !Number.isNaN(Number(price)) && Number(price) >= 0;
  const canSubmit = codeValid && name.trim().length > 0 && priceValid && reason.trim().length > 0;

  function submit() {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    adminFetch<{ code: string }>('/plans', {
      method: 'POST',
      body: JSON.stringify({
        reason: reason.trim(),
        code: code.trim(),
        name: name.trim(),
        description: description.trim(),
        basePriceMinor: Math.round(Number(price) * 100),
        currency,
        billingCycle: billingCycle.toLowerCase(),
      }),
    })
      .then((created) => router.push(`/admin/plans/${created.code}`))
      .catch((err) => setError(err instanceof AdminApiError ? err.message : 'Could not create the plan.'))
      .finally(() => setSaving(false));
  }

  return (
    <Card>
      <SectionTitle title="Create a plan" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 6, maxWidth: 480 }}>
        <Field label="Plan code" hint="Lowercase letters, digits and underscores — this becomes the database identifier and cannot change later.">
          <TextInput value={code} onChange={(e) => setCode(e.target.value)} placeholder="elite" />
        </Field>
        <Field label="Plan name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Growza Elite" />
        </Field>
        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{
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
            }}
          />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 14 }}>
          <Field label="Base price (₹)" hint="Pre-tax">
            <TextInput type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
          </Field>
          <Field label="Currency">
            <TextInput value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} />
          </Field>
          <Field label="Billing cycle">
            <Select options={['Monthly']} value={billingCycle} onChange={(e) => setBillingCycle(e.target.value)} />
          </Field>
        </div>
        <Field label="Reason" hint="Why this plan is being created — every plan write is audited.">
          <TextInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Elite tier now priced and ready to sell" />
        </Field>

        {error ? <div style={{ fontSize: 13, fontWeight: 600, color: oklch.danger }}>{error}</div> : null}

        <div style={{ display: 'flex', gap: 10 }}>
          <SecondaryButton onClick={() => router.push('/admin/plans')} style={{ flex: 1, height: 44 }}>
            Cancel
          </SecondaryButton>
          <PrimaryButton
            onClick={submit}
            style={{ flex: 1.3, height: 44, justifyContent: 'center', opacity: canSubmit && !saving ? 1 : 0.5, cursor: canSubmit && !saving ? 'pointer' : 'not-allowed' }}
          >
            {saving ? 'Creating…' : 'Create plan'}
          </PrimaryButton>
        </div>
        <div style={{ fontSize: 12, color: oklch.textFaint }}>Entitlements are set on the next screen, once the plan exists.</div>
      </div>
    </Card>
  );
}
