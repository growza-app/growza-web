'use client';

import { useRouter } from 'next/navigation';
import { Card, Field, PrimaryButton, SecondaryButton, Select, SectionTitle, TextInput } from './primitives';
import { oklch } from '../tokens';

const ENTITLEMENT_CHECKBOXES: [string, boolean][] = [
  ['Customer CRM', true],
  ['Bookings', true],
  ['Staff & services', true],
  ['Combos', true],
  ['Offers', true],
  ['Reports & analytics', true],
  ['WhatsApp booking', true],
  ['WhatsApp marketing', false],
  ['AI conversations', false],
];

/**
 * The shared plan create/edit form (GRW-80). One component behind both
 * /admin/plans/new and /admin/plans/[id] — the entitlement checkboxes here
 * are a placeholder for the sanctioned `listCapabilityKeys()` export GRW-107
 * builds; this form does not yet enumerate the real registry.
 */
export function PlanForm({ mode }: { mode: 'create' | 'edit' }) {
  const router = useRouter();
  const creating = mode === 'create';

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.4fr) minmax(280px, 1fr)', gap: 16, alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Card>
          <SectionTitle title="Plan details" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="Plan name">
              <TextInput defaultValue={creating ? '' : 'Growza Base'} />
            </Field>
            <Field label="Description">
              <textarea
                defaultValue={creating ? '' : 'CRM, bookings and WhatsApp for service businesses.'}
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
                <TextInput defaultValue={creating ? '' : '799'} type="number" />
              </Field>
              <Field label="Billing cycle">
                <Select options={['Monthly', 'Quarterly', 'Yearly']} defaultValue="Monthly" />
              </Field>
              <Field label="Status">
                <Select options={['Active', 'Draft', 'Archived']} defaultValue={creating ? 'Draft' : 'Active'} />
              </Field>
            </div>
          </div>
        </Card>

        <Card>
          <SectionTitle title="Entitlements & limits" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 14, marginBottom: 18 }}>
            <Field label="Booking limit / mo">
              <TextInput defaultValue={creating ? '' : '100'} type="number" />
            </Field>
            <Field label="WhatsApp limit / mo">
              <TextInput defaultValue={creating ? '' : '800'} type="number" />
            </Field>
            <Field label="AI messages / mo" hint="Future">
              <TextInput defaultValue="0" disabled style={{ color: 'oklch(0.6 0.02 155)' }} />
            </Field>
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'oklch(0.45 0.02 155)', marginBottom: 10 }}>Feature entitlements</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            {ENTITLEMENT_CHECKBOXES.map(([label, checked]) => (
              <label key={label} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, fontWeight: 600, color: checked ? 'oklch(0.3 0.02 155)' : 'oklch(0.6 0.02 155)', cursor: 'pointer' }}>
                <input type="checkbox" defaultChecked={checked} style={{ width: 17, height: 17, accentColor: oklch.accent }} />
                {label}
              </label>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <SectionTitle title="Summary" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13.5 }}>
          {[
            ['Base price', '₹799/mo'],
            ['GST (18%)', 'calculated at billing'],
            ['Booking limit', '100 / mo'],
            ['WhatsApp', '800 / mo'],
            ['AI', 'Not included'],
          ].map(([label, value]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 9, borderBottom: `1px solid ${oklch.divider}` }}>
              <span style={{ color: 'oklch(0.5 0.02 155)', fontWeight: 600 }}>{label}</span>
              <span style={{ fontWeight: 700, color: 'oklch(0.3 0.02 155)' }}>{value}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 11, background: 'oklch(0.98 0.012 150)', border: '1px solid oklch(0.92 0.02 150)', fontSize: 12, color: 'oklch(0.4 0.06 152)', fontWeight: 600 }}>
          Changing price creates a new plan version. Existing subscriptions keep their current pricing until migrated.
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <SecondaryButton onClick={() => router.push('/admin/plans')} style={{ flex: 1, height: 44 }}>
            Cancel
          </SecondaryButton>
          <PrimaryButton onClick={() => router.push('/admin/plans')} style={{ flex: 1.3, height: 44, justifyContent: 'center' }}>
            {creating ? 'Create plan' : 'Save plan'}
          </PrimaryButton>
        </div>
      </Card>
    </div>
  );
}
