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
  /**
   * Jira GRW-255 — as stored. True from then on: the total is the price and the
   * GST is carved out of it, shown under the total. False on older invoices,
   * where GST was added on top; those still read the old way.
   */
  pricesIncludeTax?: boolean;
  /** Jira GRW-161 — the branch line, as stored. Null on invoices issued before branch pricing (plan price only). */
  basePriceMinor?: number | null;
  extraBranches?: number | null;
  branchAddonMinor?: number | null;
  branchAmountMinor?: number | null;
}

export function InvoiceBreakdown({ figures, compact }: { figures: InvoiceFigures; compact?: boolean }) {
  const discounted = figures.discountAmountMinor > 0;
  const ratePercent = figures.taxRateBps / 100;

  return (
    // Jira GRW-288 — it fits instead of scrolling. This used to be its own
    // sideways scroller with a 280px minimum, so on a 320px phone (246px of
    // card) the figure column was cut at "₹79…" and the rest of every amount
    // sat behind a scroll nobody finds — on the one block whose whole job is
    // to show the numbers. Now the LABEL column gives way (it wraps) and the
    // figure column never does (`nowrap`, `flex: none`), so an amount is
    // always whole and the block is never wider than its card.
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          borderRadius: 14,
          border: '1px solid oklch(0.9 0.02 150)',
          background: 'oklch(0.98 0.012 150)',
          padding: compact ? '13px 15px' : '16px 18px',
        }}
      >
        {/* Jira GRW-161 — a branch on the bill is its own line, never folded into the plan price. */}
        {figures.basePriceMinor != null && (figures.branchAmountMinor ?? 0) > 0 ? (
          <>
            <Line label="Plan price" value={formatMoneyMinor(figures.basePriceMinor)} />
            <Line
              label={`Extra branches (${figures.extraBranches} × ${formatMoneyMinor(figures.branchAddonMinor ?? 0)})`}
              value={formatMoneyMinor(figures.branchAmountMinor ?? 0)}
            />
          </>
        ) : null}
        <Line label="List price" value={formatMoneyMinor(figures.listPriceMinor)} />
        <Line
          label="Discount"
          value={discounted ? '− ' + formatMoneyMinor(figures.discountAmountMinor) : formatMoneyMinor(0)}
          color={discounted ? 'oklch(0.5 0.15 25)' : undefined}
        />
        <Rule />
        {figures.pricesIncludeTax ? null : (
          <>
            <Line label="Taxable" value={formatMoneyMinor(figures.taxableAmountMinor)} />
            <Line label={`GST (${ratePercent}%)`} value={formatMoneyMinor(figures.taxAmountMinor)} />
            <Rule />
          </>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, paddingTop: 8 }}>
          <span style={{ fontSize: compact ? 13.5 : 14, fontWeight: 800, color: oklch.textStrong }}>Total</span>
          <span style={{ fontSize: compact ? 16 : 19, fontWeight: 800, color: oklch.accentText, whiteSpace: 'nowrap', flex: 'none' }}>
            {formatMoneyMinor(figures.totalMinor)}
          </span>
        </div>
        {figures.pricesIncludeTax ? (
          figures.taxAmountMinor > 0 ? (
            <>
              <Line label={`Includes GST (${ratePercent}%)`} value={formatMoneyMinor(figures.taxAmountMinor)} faint />
              <Line label="Before GST" value={formatMoneyMinor(figures.taxableAmountMinor)} faint />
            </>
          ) : (
            <Line label="GST" value="None on this invoice" faint />
          )
        ) : null}
      </div>
    </div>
  );
}

function Line({ label, value, color, faint }: { label: string; value: string; color?: string; faint?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, fontSize: faint ? 12.5 : 13.5, padding: faint ? '3px 0' : '5px 0' }}>
      <span style={{ color: 'oklch(0.5 0.02 155)', fontWeight: 600, minWidth: 0 }}>{label}</span>
      <span
        style={{
          fontWeight: faint ? 600 : 700,
          color: color ?? (faint ? 'oklch(0.5 0.02 155)' : 'oklch(0.3 0.02 155)'),
          whiteSpace: 'nowrap',
          flex: 'none',
          textAlign: 'right',
        }}
      >
        {value}
      </span>
    </div>
  );
}

function Rule() {
  return <div style={{ borderTop: '1px solid oklch(0.9 0.02 150)', margin: '5px 0' }} />;
}
