'use client';

import { useState } from 'react';
import { oklch } from '../tokens';

/**
 * A from/to date range, shared by the Payments and Invoices screens
 * (GRW-119) rather than implemented twice.
 *
 * The one rule it owns: **a backwards range issues no request.** `invalid` is
 * exposed so the caller can skip the fetch entirely and say so inline —
 * asking the server to confirm that nothing exists between two dates in the
 * wrong order is a round trip whose only possible answer is an empty list
 * that looks exactly like a real one.
 */
export interface DateRange {
  from: string;
  to: string;
  invalid: boolean;
  setFrom: (value: string) => void;
  setTo: (value: string) => void;
  clear: () => void;
}

export function useDateRange(): DateRange {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  return {
    from,
    to,
    // ISO dates compare correctly as strings, which is the whole reason this
    // repo stores and passes them in that shape.
    invalid: Boolean(from && to && to < from),
    setFrom,
    setTo,
    clear: () => {
      setFrom('');
      setTo('');
    },
  };
}

export function DateRangeFilter({ range }: { range: DateRange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <DateInput label="From" value={range.from} onChange={range.setFrom} invalid={range.invalid} />
      <span style={{ fontSize: 12.5, color: oklch.textFaint, fontWeight: 600 }}>to</span>
      <DateInput label="To" value={range.to} onChange={range.setTo} invalid={range.invalid} />
      {range.from || range.to ? (
        <button
          type="button"
          onClick={range.clear}
          style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: oklch.accentText, padding: '0 4px' }}
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}

function DateInput({ label, value, onChange, invalid }: { label: string; value: string; onChange: (v: string) => void; invalid: boolean }) {
  return (
    <input
      type="date"
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        height: 38,
        padding: '0 10px',
        borderRadius: 10,
        border: `1px solid ${invalid ? oklch.danger : oklch.borderStrong}`,
        background: oklch.inputBg,
        fontSize: 13,
        fontWeight: 600,
        color: oklch.text,
        outline: 'none',
      }}
    />
  );
}
