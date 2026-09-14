'use client';

import { formatDateOnly, formatMoneyMinor } from '../lib/format';
import { oklch } from '../tokens';
import type { SubscriptionPanelSubscription } from './SubscriptionPanel';

/**
 * The price card on a subscription (GRW-112), with the branch line and the next
 * bill (Jira GRW-161). Its figures come from the API's `nextBill`, which the
 * invoice generator's own pricing produced — nothing is added up here.
 */
export function SubscriptionPriceBox({ s }: { s: SubscriptionPanelSubscription }) {
  const bill = s.nextBill;
  const discounted = (bill?.discountAmountMinor ?? s.discountAmountMinor) > 0;
  return (
    <div style={{ marginTop: 18, borderRadius: 14, border: '1px solid oklch(0.9 0.02 150)', background: 'oklch(0.98 0.012 150)', padding: '16px 18px' }}>
      <PriceRow label="Plan price" value={formatMoneyMinor(s.listPriceMinor)} />
      {bill ? (
        <PriceRow
          label={
            bill.extraBranches > 0
              ? `Extra branches (${bill.extraBranches} × ${formatMoneyMinor(bill.branchAddonMinor)})`
              : `Branches (${bill.openBranches} open, ${s.branchesIncluded ?? 1} included)`
          }
          value={formatMoneyMinor(bill.branchAmountMinor)}
        />
      ) : null}
      <PriceRow
        label="Discount"
        value={discounted ? '− ' + formatMoneyMinor(bill?.discountAmountMinor ?? s.discountAmountMinor) : formatMoneyMinor(0)}
        color={discounted ? 'oklch(0.5 0.15 25)' : undefined}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, marginTop: 5, borderTop: '1px solid oklch(0.9 0.02 150)' }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: oklch.textStrong }}>
          Charged per {s.billingCycle === 'monthly' ? 'month' : s.billingCycle}
        </span>
        <span style={{ fontSize: 18, fontWeight: 800, color: oklch.accentText }}>{formatMoneyMinor(bill?.finalPriceMinor ?? s.finalPriceMinor)}</span>
      </div>
      {/* GST is calculated on top and is GRW-83's to compute and record.
          This card used to show an 18% line from a hardcoded frontend
          constant — a tax figure invented by a UI. */}
      <div style={{ marginTop: 10, fontSize: 12, color: oklch.textFaint, fontWeight: 600 }}>
        Pre-tax. GST is calculated on top when the invoice is raised (Jira GRW-83).
        {bill ? ` Branches are counted when the bill is raised on ${formatDateOnly(s.nextBillingDate)}.` : ''}
      </div>
      {s.branchAddonOverrideMinor != null ? (
        <div style={{ marginTop: 8, fontSize: 12, color: oklch.textMuted, fontWeight: 700 }}>
          This customer pays {formatMoneyMinor(s.branchAddonOverrideMinor)} per extra branch (plan: {formatMoneyMinor(s.branchAddonMinor ?? 0)})
          {s.branchAddonOverrideReason ? ` — ${s.branchAddonOverrideReason}` : ''}
        </div>
      ) : null}
      {discounted && s.discountReason ? (
        <div style={{ marginTop: 10, fontSize: 12, color: 'oklch(0.5 0.15 25)', fontWeight: 700 }}>
          {s.discountReason}
          {/* §2.1's own line: "the subscription screen says so before it
              happens" — a discount that reverts on its own should never
              come as a surprise the day it does. */}
          {s.discountEndsAt ? ` — reverts to list price on ${formatDateOnly(s.discountEndsAt)}` : ' — permanent'}
        </div>
      ) : null}
    </div>
  );
}

function PriceRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, padding: '5px 0' }}>
      <span style={{ color: 'oklch(0.5 0.02 155)', fontWeight: 600 }}>{label}</span>
      <span style={{ fontWeight: 700, color: color ?? 'oklch(0.3 0.02 155)' }}>{value}</span>
    </div>
  );
}
