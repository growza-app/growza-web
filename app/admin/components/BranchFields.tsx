'use client';

import { ERROR_COLOR, Field, SecondaryButton, TextInput, Toggle } from './primitives';
import { oklch } from '../tokens';

/**
 * Jira GRW-138 · GRW-181 — one branch or several, on the Add Business form.
 *
 * The toggle changes what is SHOWN, not what is sent: the request carries
 * `locations: [...]` either way, so nothing downstream has to ask which kind of
 * business this is. That mirrors the schema, where `location_id` has been on
 * every booking table since migration 0001 precisely so multi-branch would be a
 * data change rather than a shape change.
 *
 * **What a second branch does and does not do today.** It creates a real
 * `location` row, and the first branch is the primary — every read that still
 * assumes one location resolves to it deterministically (0049's `sort_order`).
 * It does NOT yet scope anything: staff are not filtered by branch and neither
 * is availability, so until Jira GRW-64 lands a branch is a place, not a scope.
 * That is why the hint says a second branch can be added later — nothing here
 * is a decision the owner is locked into.
 */
export interface Branch {
  name: string;
  line1: string;
  city: string;
  /** Jira GRW-557 — how many stylists this branch may have, as typed; starts at the plan's number. */
  stylists: string;
}

export const emptyBranch = (stylists = ''): Branch => ({ name: '', line1: '', city: '', stylists });

export function BranchFields({
  branches,
  multiBranch,
  errorFor,
  onToggle,
  onChange,
  onAdd,
  onRemove,
}: {
  branches: Branch[];
  multiBranch: boolean;
  errorFor: (field: string) => string | undefined;
  onToggle: () => void;
  onChange: (index: number, patch: Partial<Branch>, field: keyof Branch) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '12px 14px',
          borderRadius: 11,
          background: 'oklch(0.96 0.01 155)',
        }}
      >
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: oklch.textStrong }}>More than one branch</div>
          <div style={{ fontSize: 11.5, color: oklch.textMuted, marginTop: 2 }}>
            The first branch is the main one. More can be added later too.
          </div>
        </div>
        <Toggle on={multiBranch} label="This business has more than one branch" onClick={onToggle} />
      </div>

      {branches.map((branch, index) => (
        <div
          key={index}
          style={
            multiBranch
              ? { display: 'grid', gap: 14, padding: 14, borderRadius: 11, border: `1px solid ${oklch.borderStrong}` }
              : { display: 'grid', gap: 14 }
          }
        >
          {multiBranch ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: oklch.textMuted }}>
                {index === 0 ? 'Main branch' : `Branch ${index + 1}`}
              </div>
              {index > 0 ? (
                <button
                  type="button"
                  onClick={() => onRemove(index)}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: ERROR_COLOR, padding: 0 }}
                >
                  Remove
                </button>
              ) : null}
            </div>
          ) : null}

          <Field label="Branch name" error={errorFor(`branch.${index}.name`)}>
            <TextInput
              value={branch.name}
              invalid={!!errorFor(`branch.${index}.name`)}
              onChange={(e) => onChange(index, { name: e.target.value }, 'name')}
              placeholder="MG Road"
            />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: 14 }}>
            <Field label="Address (optional)" error={errorFor(`branch.${index}.line1`)}>
              <TextInput
                value={branch.line1}
                invalid={!!errorFor(`branch.${index}.line1`)}
                onChange={(e) => onChange(index, { line1: e.target.value }, 'line1')}
                placeholder="42 MG Road"
              />
            </Field>
            <Field label="City (optional)" error={errorFor(`branch.${index}.city`)}>
              <TextInput
                value={branch.city}
                invalid={!!errorFor(`branch.${index}.city`)}
                onChange={(e) => onChange(index, { city: e.target.value }, 'city')}
                placeholder="Bengaluru"
              />
            </Field>
          </div>

          {/* Jira GRW-557 — each branch's own number: a few for a small branch, more for a large one. */}
          <Field
            label="Stylists at most"
            hint="Starts at the plan's number. Can be changed later from the business page."
            error={errorFor(`branch.${index}.stylists`)}
          >
            <TextInput
              value={branch.stylists}
              invalid={!!errorFor(`branch.${index}.stylists`)}
              onChange={(e) => onChange(index, { stylists: e.target.value.replace(/[^0-9]/g, '') }, 'stylists')}
              inputMode="numeric"
              placeholder="5"
            />
          </Field>
        </div>
      ))}

      {multiBranch ? (
        <SecondaryButton onClick={onAdd} disabled={branches.length >= 20}>
          Add another branch
        </SecondaryButton>
      ) : null}
    </>
  );
}
