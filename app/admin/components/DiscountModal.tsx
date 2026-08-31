'use client';

import { useMemo, useState } from 'react';
import { Icon } from '../icons';
import { inr, oklch } from '../tokens';
import { PrimaryButton, SecondaryButton, TextInput } from './primitives';

/**
 * Customer-specific pricing (GRW-82). Ported from Admin.dc.html's discount
 * modal, opened from Businesses, Business detail, Subscriptions and
 * Subscription detail.
 *
 * The arithmetic mirrors what GRW-113/114 will do server-side: three
 * discount shapes, the same 18% GST rate the design hardcodes, and — the
 * one rule every screen that touches pricing exists to hold — the plan's
 * ₹799 list price is shown, never edited, alongside whatever this customer
 * actually pays.
 */
type DiscountType = 'fixed' | 'percent' | 'final';

const LIST_PRICE = 799;
const GST_RATE = 0.18;

export function DiscountModal({
  businessName,
  onClose,
}: {
  businessName: string | null;
  onClose: () => void;
}) {
  const [type, setType] = useState<DiscountType>('fixed');
  const [value, setValue] = useState('200');
  const [duration, setDuration] = useState('6');
  const [reason, setReason] = useState('Early adopter');

  const math = useMemo(() => {
    const n = Number(value) || 0;
    let amount = 0;
    if (type === 'fixed') amount = n;
    else if (type === 'percent') amount = Math.round((LIST_PRICE * n) / 100);
    else amount = LIST_PRICE - n;
    amount = Math.max(0, Math.min(LIST_PRICE, amount));
    const taxable = LIST_PRICE - amount;
    const gst = +(taxable * GST_RATE).toFixed(2);
    return { amount, taxable, gst, total: +(taxable + gst).toFixed(2) };
  }, [type, value]);

  if (!businessName) return null;

  const typeOptions: [DiscountType, string][] = [
    ['fixed', 'Fixed ₹'],
    ['percent', 'Percent %'],
    ['final', 'Final price'],
  ];
  const valueLabel = type === 'fixed' ? 'Discount amount (₹)' : type === 'percent' ? 'Discount percent (%)' : 'Final price (₹)';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'oklch(0.2 0.02 155 / 0.5)',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(560px, 100%)',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'white',
          borderRadius: 18,
          boxShadow: '0 24px 60px oklch(0.2 0.04 155 / 0.35)',
          animation: 'admin-fade 0.2s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, padding: '22px 24px 0' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 19, fontWeight: 800, letterSpacing: '-0.01em', color: oklch.textStrong }}>
              Customer-specific pricing
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 13.5, color: oklch.textMuted }}>{businessName} · Growza Base</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              border: `1px solid ${oklch.borderStrong}`,
              background: 'white',
              color: 'oklch(0.45 0.02 155)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flex: 'none',
            }}
          >
            <Icon name="close" size={17} />
          </button>
        </div>

        <div style={{ padding: '20px 24px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 16px',
              borderRadius: 12,
              background: oklch.surfaceSubtle,
              border: `1px solid ${oklch.border}`,
            }}
          >
            <span style={{ fontSize: 13.5, fontWeight: 600, color: 'oklch(0.45 0.02 155)' }}>Standard plan price</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: oklch.text }}>
              {inr(LIST_PRICE)}
              <span style={{ fontSize: 12, fontWeight: 600, color: oklch.textFaint }}>/mo</span>
            </span>
          </div>

          <div style={{ marginTop: 16 }}>
            <label style={{ fontSize: 12.5, fontWeight: 700, color: 'oklch(0.45 0.02 155)' }}>Discount type</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              {typeOptions.map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setType(v)}
                  style={{
                    flex: 1,
                    height: 40,
                    borderRadius: 10,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    ...(type === v
                      ? { background: 'oklch(0.31 0.055 158)', color: 'white', border: '1px solid oklch(0.31 0.055 158)' }
                      : { background: 'white', color: 'oklch(0.45 0.02 155)', border: `1px solid ${oklch.borderStrong}` }),
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 16 }}>
            <div>
              <label style={{ fontSize: 12.5, fontWeight: 700, color: 'oklch(0.45 0.02 155)' }}>{valueLabel}</label>
              <TextInput
                type="number"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                style={{ marginTop: 7, fontSize: 15, fontWeight: 700 }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12.5, fontWeight: 700, color: 'oklch(0.45 0.02 155)' }}>Duration</label>
              <select
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                style={{
                  width: '100%',
                  height: 44,
                  marginTop: 7,
                  padding: '0 12px',
                  borderRadius: 11,
                  border: `1px solid ${oklch.borderStrong}`,
                  background: oklch.inputBg,
                  fontSize: 14,
                  fontWeight: 600,
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="3">3 months</option>
                <option value="6">6 months</option>
                <option value="12">12 months</option>
                <option value="0">Permanent</option>
              </select>
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12.5, fontWeight: 700, color: 'oklch(0.45 0.02 155)', display: 'block', marginTop: 16 }}>
              Reason
            </label>
            <TextInput
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Early adopter"
              style={{ marginTop: 7, fontWeight: 500 }}
            />
          </div>

          <div
            style={{
              marginTop: 20,
              borderRadius: 14,
              border: '1px solid oklch(0.9 0.02 150)',
              background: 'oklch(0.98 0.012 150)',
              padding: '16px 18px',
            }}
          >
            <Row label="List price" value={inr(LIST_PRICE)} />
            <Row label="Discount" value={'− ' + inr(math.amount)} valueColor="oklch(0.5 0.15 25)" />
            <Row label="Taxable amount" value={inr(math.taxable)} divider />
            <Row label="GST (18%)" value={inr(math.gst)} />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '9px 0 2px',
                borderTop: '1px solid oklch(0.9 0.02 150)',
                marginTop: 5,
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 800, color: oklch.textStrong }}>Total payable / mo</span>
              <span style={{ fontSize: 19, fontWeight: 800, color: oklch.accentText }}>{inr(math.total)}</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, padding: '0 24px 22px' }}>
          <SecondaryButton onClick={onClose} style={{ flex: 1, height: 46 }}>
            Cancel
          </SecondaryButton>
          <PrimaryButton onClick={onClose} style={{ flex: 1.4, height: 46 }}>
            Save pricing
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  valueColor,
  divider,
}: {
  label: string;
  value: string;
  valueColor?: string;
  divider?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: 13.5,
        padding: '5px 0',
        ...(divider ? { borderTop: '1px solid oklch(0.9 0.02 150)', marginTop: 5, paddingTop: 10 } : {}),
      }}
    >
      <span style={{ color: 'oklch(0.5 0.02 155)', fontWeight: 600 }}>{label}</span>
      <span style={{ fontWeight: 700, color: valueColor ?? 'oklch(0.3 0.02 155)' }}>{value}</span>
    </div>
  );
}
