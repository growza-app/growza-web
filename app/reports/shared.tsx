'use client';

import type { ReactNode } from 'react';

import { copy } from '../lib/copy';
import { formatMoney, type ReportNamedValue } from '../lib/api';

/** Money, through the one renderer (conventions §4). */
export function money(minor: number | null): string {
  return minor === null ? '—' : formatMoney(String(minor));
}

/** A percentage, or an em dash where there is nothing to take a percentage of. */
export function pct(value: number | null): string {
  return value === null ? '—' : `${value}%`;
}

/** "3h 20m" — an owner reads hours, not 200 minutes. */
export function hoursAndMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
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

/** Bars of money: the value shown is the real figure, the bar only its share. */
export function moneyBars(items: ReportNamedValue[]) {
  return items.map((item) => ({
    label: item.label,
    value: item.value,
    display: money(item.value),
    note: item.retired ? copy.reports.servicesTab.retired : undefined,
  }));
}

export function countBars(items: ReportNamedValue[], suffix = '') {
  return items.map((item) => ({
    label: item.label,
    value: item.value,
    display: `${item.value}${suffix}`,
    note: item.retired ? copy.reports.servicesTab.retired : undefined,
  }));
}

/** Green ≥70, amber ≥50, red below — the same bands the table's inline bar uses. */
export function utilisationColour(value: number): string {
  return value >= 70 ? 'var(--rp-brand)' : value >= 50 ? 'var(--rp-amber)' : 'var(--rp-red)';
}
