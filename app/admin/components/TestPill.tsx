import { oklch } from '../tokens';

/** Jira GRW-692 — marks a test business, in the list and the finder. Grey: it is a fact, not a warning. */
export function TestPill() {
  return (
    <span
      title="A test business: left out of the dashboard's figures."
      style={{
        fontSize: '0.75rem',
        fontWeight: 700,
        padding: '2px 7px',
        borderRadius: 999,
        whiteSpace: 'nowrap',
        color: oklch.textMuted,
        background: 'oklch(0.96 0.004 250)',
        border: `1px solid ${oklch.border}`,
      }}
    >
      Test
    </span>
  );
}
