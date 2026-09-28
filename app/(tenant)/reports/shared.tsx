'use client';

import type { ReactNode } from 'react';

import { formatMoney, type ReportNamedValue } from '../lib/api';

/** Money, through the one renderer (conventions §4). */
export function money(minor: number | null): string {
  return minor === null ? '—' : formatMoney(String(minor));
}

/** A percentage, or an em dash where there is nothing to take a percentage of. */
export function pct(value: number | null): string {
  return value === null ? '—' : `${value}%`;
}

export function Card({
  title,
  hint,
  figure,
  children,
  foot,
}: {
  title: string;
  /** A node, not just a string: the Bookings trend card puts its verdict here. */
  hint?: ReactNode;
  figure?: ReactNode;
  children: ReactNode;
  foot?: ReactNode;
}) {
  return (
    <section className="rp-card">
      <div className="rp-card-head">
        <div>
          <h2>{title}</h2>
          {hint && <p>{hint}</p>}
        </div>
        {figure !== undefined && <div className="rp-card-figure">{figure}</div>}
      </div>
      {children}
      {foot && <p className="rp-card-foot">{foot}</p>}
    </section>
  );
}

/**
 * How a bar is named. Jira GRW-363 — the tabs pass `useRowName()`, so a row the report
 * named ("Everything else", "Unassigned") reads in the owner's language; the default is
 * the label as sent, which is right for a service or a person.
 */
type RowNamer = (item: ReportNamedValue) => string;
const asSent: RowNamer = (item) => item.label;

/** Bars of money: the value shown is the real figure, the bar only its share. */
export function moneyBars(items: ReportNamedValue[], retiredLabel: string, nameOf: RowNamer = asSent) {
  return items.map((item) => ({
    label: nameOf(item),
    value: item.value,
    display: money(item.value),
    note: item.retired ? retiredLabel : undefined,
  }));
}

export function countBars(items: ReportNamedValue[], retiredLabel: string, nameOf: RowNamer = asSent) {
  return items.map((item) => ({
    label: nameOf(item),
    value: item.value,
    display: String(item.value),
    note: item.retired ? retiredLabel : undefined,
  }));
}

/** Green ≥70, amber ≥50, red below — the same bands the table's inline bar uses. */
export function utilisationColour(value: number): string {
  return value >= 70 ? 'var(--rp-brand)' : value >= 50 ? 'var(--rp-amber)' : 'var(--rp-red)';
}

/**
 * The picked range as a phrase in the owner's language ("Last 7 days" / "पिछले 7 दिन").
 * A named range comes from the messages; a custom one is the dates the API already wrote.
 */
export function rangeName(range: { key: string; label: string }, ranges: Record<string, string>): string {
  return range.key === 'custom' ? range.label : (ranges[range.key] ?? range.label);
}
