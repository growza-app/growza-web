'use client';

import { Icon } from '../icons';
import { oklch } from '../tokens';

/**
 * Marks a screen that is a design preview running on sample data.
 *
 * GRW-102 set the rule for this portal: a surface whose data does not exist
 * yet renders an honest "not built yet" state naming the epic that fills it
 * in — "never a zero, never a fake chart". Eleven screens shipped ahead of
 * their stories and broke it, presenting invented businesses, invented usage
 * percentages and invented invoice numbers as though they were real accounts.
 * Two screens contradicted each other about the same fact: Businesses
 * correctly refused to show a booking count it does not have, while Usage
 * showed per-business booking counts and percentages for the same period.
 *
 * The layouts are worth keeping — they are the ported design and they say
 * what the screen will do. What is not acceptable is the reader being unable
 * to tell. This banner is the difference, and it names the epic so the next
 * question ("when is it real?") has an answer on the screen.
 */
export function PreviewBanner({ shows, epic }: { shows: string; epic: string }) {
  return (
    <div
      role="note"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 11,
        padding: '13px 16px',
        marginBottom: 18,
        borderRadius: 12,
        background: oklch.warnBg,
        border: '1px solid oklch(0.88 0.06 80)',
        color: 'oklch(0.4 0.11 65)',
        fontSize: 13,
        fontWeight: 600,
        lineHeight: 1.55,
      }}
    >
      <span style={{ flex: 'none', marginTop: 1 }}>
        <Icon name="alert" size={16} />
      </span>
      <span>
        <strong style={{ fontWeight: 800 }}>Sample data — not real accounts.</strong> This screen is a design preview:
        the figures, names and dates below are invented. {shows} becomes real with {epic}.
      </span>
    </div>
  );
}
