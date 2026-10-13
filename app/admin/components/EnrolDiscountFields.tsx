'use client';

import { oklch } from '../tokens';
import { Field, Select, TextInput } from './primitives';
import { discountPreview } from './DiscountModal';
import type { EnrolDiscountValues } from '../lib/enrol-validation';

/**
 * The offer agreed when a business is sold — the optional section at the foot of Add a business.
 *
 * It lives HERE rather than on the business afterwards because billing starts when the business goes live, and a
 * discount applied after a bill exists reaches the next one (GRW-256). An offer typed even a day after enrolment
 * would therefore miss the first bill, which is the one it was sold as. Off by default: most businesses are sold
 * at list price, and a section that is always open is a section that gets filled in by accident.
 *
 * The arithmetic is `discountPreview`'s — the discount dialog's own, which is the API's `billFor` — so the two
 * screens that can set a discount cannot show different figures for the same entry. No branch amount is passed:
 * the branches do not exist yet, so the preview is the plan price alone, and the dialog is where a salon with
 * branches sees its real bill.
 */
const TYPE_LABELS: Record<EnrolDiscountValues['type'], string> = {
  percent: 'Percent off',
  fixed: 'Amount off',
  final: 'Final price',
};

const inr = (minor: number) => '₹' + Math.round(minor / 100).toLocaleString('en-IN');

export function EnrolDiscountFields({
  value,
  planPriceMinor,
  errorFor,
  onChange,
}: {
  value: EnrolDiscountValues;
  planPriceMinor: number;
  errorFor: (field: string) => string | undefined;
  onChange: (patch: Partial<EnrolDiscountValues>, clearField?: string) => void;
}): React.ReactElement {
  const typed = Number(value.value.trim());
  const math = discountPreview(value.type, Number.isFinite(typed) ? typed : 0, planPriceMinor, 0);
  const bills = value.durationMonths === '0' ? null : Number(value.durationMonths);

  return (
    <div style={{ borderTop: `1px solid ${oklch.border}`, paddingTop: 14 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', fontSize: 13.5, fontWeight: 700, color: oklch.textStrong }}>
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(e) => onChange({ enabled: e.target.checked })}
          style={{ width: 16, height: 16, accentColor: 'oklch(0.45 0.13 155)', cursor: 'pointer' }}
        />
        Give this business a discount
      </label>
      <p style={{ margin: '4px 0 0 25px', fontSize: 12.5, color: oklch.textMuted }}>
        Applied to the first bill, which is raised when the business goes live.
      </p>

      {value.enabled ? (
        <div style={{ display: 'grid', gap: 14, marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Field label="Discount">
              <Select
                options={Object.values(TYPE_LABELS)}
                value={TYPE_LABELS[value.type]}
                onChange={(e) => {
                  const type = (Object.keys(TYPE_LABELS) as EnrolDiscountValues['type'][]).find((k) => TYPE_LABELS[k] === e.target.value);
                  onChange({ type: type ?? 'percent' }, 'discount.value');
                }}
              />
            </Field>
            <Field label={value.type === 'percent' ? 'Percent' : 'Rupees'} error={errorFor('discount.value')}>
              <TextInput
                value={value.value}
                inputMode="decimal"
                invalid={!!errorFor('discount.value')}
                onChange={(e) => onChange({ value: e.target.value.replace(/[^\d.]/g, '') }, 'discount.value')}
              />
            </Field>
            <Field label="For how long">
              <Select
                options={['1 bill', '2 bills', '3 bills', '6 bills', '12 bills', 'Until removed']}
                value={value.durationMonths === '0' ? 'Until removed' : `${value.durationMonths} bill${value.durationMonths === '1' ? '' : 's'}`}
                onChange={(e) => onChange({ durationMonths: e.target.value === 'Until removed' ? '0' : e.target.value.split(' ')[0]! })}
              />
            </Field>
          </div>

          <Field label="Why this discount" error={errorFor('discount.reason')}>
            <TextInput
              value={value.reason}
              maxLength={500}
              invalid={!!errorFor('discount.reason')}
              onChange={(e) => onChange({ reason: e.target.value }, 'discount.reason')}
              placeholder="e.g. Signup offer"
            />
          </Field>

          {planPriceMinor > 0 ? (
            <div style={{ borderRadius: 12, background: 'oklch(0.98 0.012 150)', border: '1px solid oklch(0.9 0.02 150)', padding: '12px 14px', fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: oklch.textMuted }}>
                <span>Plan price</span>
                <span>{inr(planPriceMinor)} a month</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontWeight: 700, color: oklch.textStrong }}>
                <span>They pay</span>
                <span>{inr(math.finalMinor)} a month</span>
              </div>
              <p style={{ margin: '8px 0 0', fontSize: 12.5, color: oklch.textMuted }}>
                {bills === null
                  ? 'Every bill, until an admin removes it.'
                  : `The first ${bills === 1 ? 'bill' : `${bills} bills`} from go-live. ${inr(planPriceMinor)} a month after that.`}
              </p>
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: 12.5, color: oklch.textMuted }}>Choose a plan above to see what they will pay.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
