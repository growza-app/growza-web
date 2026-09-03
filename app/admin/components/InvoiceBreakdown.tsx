'use client';

import { formatMoneyMinor } from '../lib/format';
import { oklch } from '../tokens';

/**
 * The five figures of an invoice, laid out once (GRW-119 BR-01).
 *
 * **One component, every surface.** Invoice detail, the Billing tab on
 * business detail, and any future PDF render the breakdown through this and
 * nothing else. The recorded precedent for why is this repo's own commit
 * `895e9ac`, "Make the download say what the screen says" — the same numbers
 * rendered through two code paths eventually disagree, and on a tax document
 * that is not a cosmetic problem.
 *
 * Every value is passed in from what the invoice STORED (BR-02). Nothing here
 * multiplies, adds or re-derives anything: the taxable line is not
 * `list - discount` computed in the browser, it is the column. That is the
 * whole reason GRW-118 stores all five rather than two and a rate — a screen
 * that can compute a figure is a screen that can disagree with the document.
 */
export interface InvoiceFigures {
  listPriceMinor: number;
  discountAmountMinor: number;
  taxableAmountMinor: number;
  taxAmountMinor: number;
  totalMinor: number;
  /** Basis points, as stored on the invoice: 1800 → "GST (18%)". Shown because "why 18?" is the next question after "why ₹706.82?". */
  taxRateBps: number;
}

export function InvoiceBreakdown({ figures, compact }: { figures: InvoiceFigures; compact?: boolean }) {
  const discounted = figures.discountAmountMinor > 0;
  const ratePercent = figures.taxRateBps / 100;

  return (
    // Its own overflow container. This block is the most horizontally
    // fragile thing on the screen — a right-aligned figure column next to a
    // label column — so at 320px it scrolls inside itself rather than
    // pushing the page sideways.
    <div style={{ overflowX: 'auto' }}>
      <div
        style={{
          minWidth: compact ? 240 : 280,
          borderRadius: 14,
          border: '1px solid oklch(0.9 0.02 150)',
          background: 'oklch(0.98 0.012 150)',
          padding: compact ? '13px 15px' : '16px 18px',
        }}
      >
        <Line label="List price" value={formatMoneyMinor(figures.listPriceMinor)} />
        <Line
          label="Discount"
          value={discounted ? '− ' + formatMoneyMinor(figures.discountAmountMinor) : formatMoneyMinor(0)}
          color={discounted ? 'oklch(0.5 0.15 25)' : undefined}
        />
        <Rule />
        <Line label="Taxable" value={formatMoneyMinor(figures.taxableAmountMinor)} />
        <Line label={`GST (${ratePercent}%)`} value={formatMoneyMinor(figures.taxAmountMinor)} />
        <Rule />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, paddingTop: 8 }}>
          <span style={{ fontSize: compact ? 13.5 : 14, fontWeight: 800, color: oklch.textStrong }}>Total</span>
          <span style={{ fontSize: compact ? 16 : 19, fontWeight: 800, color: oklch.accentText, whiteSpace: 'nowrap' }}>
            {formatMoneyMinor(figures.totalMinor)}
          </span>
        </div>
      </div>
    </div>
  );
}

function Line({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 13.5, padding: '5px 0' }}>
      <span style={{ color: 'oklch(0.5 0.02 155)', fontWeight: 600 }}>{label}</span>
      <span style={{ fontWeight: 700, color: color ?? 'oklch(0.3 0.02 155)', whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  );
}

function Rule() {
  return <div style={{ borderTop: '1px solid oklch(0.9 0.02 150)', margin: '5px 0' }} />;
}
