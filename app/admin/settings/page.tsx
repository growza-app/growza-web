'use client';

import { Card, Select, TextInput, Toggle } from '../components/primitives';
import { oklch } from '../tokens';
import { PreviewBanner } from '../components/PreviewBanner';

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 800, color: oklch.textStrong }}>{title}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>{children}</div>
    </Card>
  );
}

// Jira GRW-288 (AC-05) — the row's label is a <div> beside a control it
// cannot point at (a Toggle is a button), so each control below carries the
// row's label as its own name.
function SettingsRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'oklch(0.28 0.02 155)' }}>{label}</div>
        {hint ? <div style={{ fontSize: 12, color: oklch.textFaint, marginTop: 2 }}>{hint}</div> : null}
      </div>
      <div style={{ flex: 'none' }}>{children}</div>
    </div>
  );
}

/**
 * GRW-92's Platform Configuration screen. Filed as scope-only in Jira — the
 * settings it gathers belong to the epics that give them meaning (tax rules
 * to GRW-83, grace period to GRW-84, WhatsApp defaults to GRW-86). This is
 * the visual shell those land in; every toggle here is a client-side stub.
 */
export default function AdminSettingsPage() {
  return (
    <>
      <PreviewBanner shows="Platform configuration — tax rates, grace periods and message caps" epic="Jira GRW-92" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: 16, alignItems: 'start' }}>
        <SettingsSection title="Tax & currency">
          <SettingsRow label="Currency">
            <div style={{ width: 150 }}>
              <Select aria-label="Currency" disabled options={['INR (₹)', 'USD ($)']} defaultValue="INR (₹)" />
            </div>
          </SettingsRow>
          {/* Jira GRW-255 — no GST number yet: the rate comes from the tax rules, and with none in force invoices carry 0%. */}
          <SettingsRow label="GST rate" hint="From the tax rules; 0% while none is in force">
            <TextInput aria-label="GST rate" readOnly defaultValue="0" style={{ width: 90, textAlign: 'center' }} />
          </SettingsRow>
          <SettingsRow label="Prices include tax" hint="The plan price is what the customer pays; any GST is inside it">
            <Toggle label="Prices include tax" on onClick={() => {}} disabled />
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title="Billing defaults">
          <SettingsRow label="Default billing cycle">
            <div style={{ width: 150 }}>
              <Select aria-label="Default billing cycle" disabled options={['Monthly', 'Yearly']} defaultValue="Monthly" />
            </div>
          </SettingsRow>
          <SettingsRow label="Grace period" hint="Days before suspend after failed payment">
            <TextInput aria-label="Grace period" readOnly defaultValue="5" style={{ width: 90, textAlign: 'center' }} />
          </SettingsRow>
          <SettingsRow label="Auto-suspend on past due">
            <Toggle label="Auto-suspend on past due" on onClick={() => {}} disabled />
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title="WhatsApp defaults">
          <SettingsRow label="Utility limit / mo">
            <TextInput aria-label="Utility limit / mo" readOnly defaultValue="800" style={{ width: 110, textAlign: 'center' }} />
          </SettingsRow>
          <SettingsRow label="Warning threshold" hint="% of limit">
            <TextInput aria-label="Warning threshold" readOnly defaultValue="80" style={{ width: 90, textAlign: 'center' }} />
          </SettingsRow>
          <SettingsRow label="Hard cap at 100%" hint="Block non-critical messages over limit">
            <Toggle label="Hard cap at 100%" on onClick={() => {}} disabled />
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title="Platform">
          <SettingsRow label="Payment provider">
            <div style={{ width: 150 }}>
              <Select aria-label="Payment provider" disabled options={['Razorpay', 'Stripe']} defaultValue="Razorpay" />
            </div>
          </SettingsRow>
          <SettingsRow label="Require reason for impersonation">
            <Toggle label="Require reason for impersonation" on onClick={() => {}} disabled />
          </SettingsRow>
          <SettingsRow label="Audit log retention" hint="Days">
            <TextInput aria-label="Audit log retention" readOnly defaultValue="365" style={{ width: 90, textAlign: 'center' }} />
          </SettingsRow>
        </SettingsSection>
      </div>
    </>
  );
}
