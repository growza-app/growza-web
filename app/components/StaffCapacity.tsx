'use client';

import { useState } from 'react';

type Mode = 'total' | 'upcoming';

export interface StaffCapacityRow {
  id: string;
  name: string;
  totalCount: number;
  totalBookedMin: number;
  upcomingCount: number;
  upcomingBookedMin: number;
}

/**
 * Named generically after the vertical's own provider label ("Staff",
 * "Doctors", ...) rather than hardcoded as "Chair capacity" — a chair is a
 * salon-specific idea, but every vertical has providers who get busy.
 *
 * Total vs Upcoming is a real toggle, not two different numbers competing
 * for the same label: "Total" is every confirmed booking today (a stylist
 * who's already finished for the day still reads as having had a full one),
 * "Upcoming" is only what's still ahead of the current moment. Each mode
 * scales its own bar relative to the busiest person shown IN THAT MODE, so
 * switching modes can't leave a stale, wrongly-scaled bar on screen.
 */
export function StaffCapacity({ label, staff, hiddenCount }: { label: string; staff: StaffCapacityRow[]; hiddenCount: number }) {
  const [mode, setMode] = useState<Mode>('total');
  if (staff.length === 0) return null;

  const count = (p: StaffCapacityRow) => (mode === 'total' ? p.totalCount : p.upcomingCount);
  const bookedMin = (p: StaffCapacityRow) => (mode === 'total' ? p.totalBookedMin : p.upcomingBookedMin);
  const maxBookedMin = Math.max(...staff.map(bookedMin), 1);

  return (
    <section className="rail-card">
      <div className="rail-head-row">
        <h3>{label} capacity</h3>
        <div className="capacity-mode-toggle">
          <button type="button" className={mode === 'total' ? 'active' : ''} onClick={() => setMode('total')}>
            Total
          </button>
          <button type="button" className={mode === 'upcoming' ? 'active' : ''} onClick={() => setMode('upcoming')}>
            Upcoming
          </button>
        </div>
      </div>
      {staff.map((p) => (
        <div className="capacity-row" key={p.id}>
          <div className="capacity-row-head">
            <span className="capacity-name">{p.name}</span>
            <span className="capacity-status">{count(p) > 0 ? `${count(p)} in queue` : 'free'}</span>
          </div>
          <div className="capacity-bar">
            <span style={{ width: `${Math.round((bookedMin(p) / maxBookedMin) * 100)}%` }} />
          </div>
        </div>
      ))}
      {hiddenCount > 0 && (
        <a className="rail-see-more" href="/providers">
          +{hiddenCount} more
        </a>
      )}
    </section>
  );
}
