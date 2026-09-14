'use client';

import { Field, TextInput } from './primitives';

/**
 * Jira GRW-161 — a plan's price per extra branch, and how many branches its base
 * price covers. Edited with the base price, because it is part of the plan's
 * price and changes only through a new plan version.
 */
export function BranchPriceFields({
  branchPrice,
  included,
  onBranchPrice,
  onIncluded,
}: {
  branchPrice: string;
  included: string;
  onBranchPrice: (value: string) => void;
  onIncluded: (value: string) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 180px' }}>
        <Field label="Price per extra branch (₹)" hint="Includes tax, per month. 0 = branches are free">
          <TextInput type="number" min={0} value={branchPrice} onChange={(e) => onBranchPrice(e.target.value)} />
        </Field>
      </div>
      <div style={{ flex: '1 1 140px' }}>
        <Field label="Branches included" hint="Covered by the base price">
          <TextInput type="number" min={1} step={1} value={included} onChange={(e) => onIncluded(e.target.value)} />
        </Field>
      </div>
    </div>
  );
}

/** Whether the two fields hold valid values, and whether they differ from the plan's live ones. */
export function branchPriceState(
  branchPrice: string,
  included: string,
  plan: { branchAddonMinor?: number; branchesIncluded?: number },
): { valid: boolean; changed: boolean } {
  const valid =
    branchPrice.trim().length > 0 && !Number.isNaN(Number(branchPrice)) && Number(branchPrice) >= 0 && Number.isInteger(Number(included)) && Number(included) >= 1;
  const changed = Math.round(Number(branchPrice) * 100) !== (plan.branchAddonMinor ?? 0) || Number(included) !== (plan.branchesIncluded ?? 1);
  return { valid, changed };
}
