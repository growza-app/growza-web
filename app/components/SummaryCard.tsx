'use client';

import { useEffect, useState } from 'react';
import { api, formatMoney, type RangeSummary, type TodayStats } from '../lib/api';
import { copy } from '../lib/copy';
import { IconCheck, IconDots } from './icons';

/**
 * The at-a-glance card. Three interchangeable layouts because the useful
 * framing genuinely differs by owner — some want "how full am I", some want
 * "what's left to do". The choice is a per-device preference, not tenant
 * config, so it lives in localStorage rather than the database.
 */

export type SummaryStyle = 'ring' | 'tiles' | 'progress';
type Range = 'today' | 'week' | 'month';

const STORAGE_KEY = 'wa-booking:summaryStyle';
const DEFAULT_STYLE: SummaryStyle = 'progress';

const STYLE_OPTIONS: Array<{ id: SummaryStyle; name: string; desc: string }> = [
  { id: 'ring', name: 'Busy ring', desc: 'See how full the day is' },
  { id: 'tiles', name: 'Colour tiles', desc: 'Light and easy to scan' },
  { id: 'progress', name: 'Day progress', desc: "What's left to do today" },
];

function readStoredStyle(): SummaryStyle {
  if (typeof window === 'undefined') return DEFAULT_STYLE;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw === 'ring' || raw === 'tiles' || raw === 'progress' ? raw : DEFAULT_STYLE;
}

interface Figures {
  bookings: number;
  earned: string;
  busyPct: number;
  freeHours: number;
  done: number;
  toGo: number;
}

function derive(stats: TodayStats): Figures {
  const busyPct =
    stats.capacityMinutesToday > 0 ? Math.round((stats.bookedMinutesToday / stats.capacityMinutesToday) * 100) : 0;
  return {
    bookings: stats.bookingsToday,
    earned: formatMoney(stats.revenueTodayMinor),
    busyPct,
    freeHours: Math.round(Math.max(stats.capacityMinutesToday - stats.bookedMinutesToday, 0) / 60),
    done: stats.completedToday,
    toGo: Math.max(stats.bookingsToday - stats.completedToday, 0),
  };
}

const RING_RADIUS = 32;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

function Ring({ f }: { f: Figures }) {
  const filled = (Math.min(f.busyPct, 100) / 100) * RING_LENGTH;
  return (
    <div className="summary-ring-row">
      <div className="summary-ring-fig">
        <svg width="84" height="84" viewBox="0 0 84 84" aria-hidden="true">
          <circle cx="42" cy="42" r={RING_RADIUS} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="7" />
          <circle
            cx="42"
            cy="42"
            r={RING_RADIUS}
            fill="none"
            stroke="#5be08a"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${RING_LENGTH}`}
            transform="rotate(-90 42 42)"
          />
        </svg>
        <div className="summary-ring-mid">
          <span className="summary-big">{f.busyPct}%</span>
          <span className="summary-cap">busy</span>
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
          <span style={{ fontSize: 23, fontWeight: 660 }}>{f.bookings}</span>
          <span className="summary-cap">booked</span>
        </div>
        <div className="summary-rule" />
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
          <span style={{ fontSize: 23, fontWeight: 660 }}>{f.earned}</span>
          <span className="summary-cap">earned</span>
        </div>
      </div>
    </div>
  );
}

function Tiles({ f }: { f: Figures }) {
  return (
    <div className="summary-tiles">
      <div className="summary-tile tile-blue">
        <div className="v">{f.bookings}</div>
        <div className="k">booked</div>
      </div>
      <div className="summary-tile tile-green">
        <div className="v">{f.earned}</div>
        <div className="k">earned</div>
      </div>
      <div className="summary-tile tile-amber">
        <div className="v">{f.busyPct}%</div>
        <div className="k">busy</div>
      </div>
    </div>
  );
}

function Progress({ f }: { f: Figures }) {
  const pct = f.bookings > 0 ? (f.done / f.bookings) * 100 : 0;
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 11, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 25, fontWeight: 660 }}>{f.done}</span>
        <span className="summary-cap">done ·</span>
        <span style={{ fontSize: 25, fontWeight: 660 }}>{f.toGo}</span>
        <span className="summary-cap">to go · of {f.bookings}</span>
      </div>
      <div className="summary-bar">
        <span style={{ width: `${pct}%` }} />
      </div>
      <div className="summary-foot">
        <span className="summary-cap">{f.earned} earned so far</span>
        <span className="summary-cap">{f.freeHours}h still free</span>
      </div>
    </>
  );
}

/**
 * Week/month view — same card, a different question ("how's the period
 * going" instead of "what's left today"). Only one layout exists for this,
 * unlike Today's three — the style picker is hidden outside the Today tab.
 */
function RangeBars({ summary }: { summary: RangeSummary }) {
  const max = Math.max(...summary.buckets.map((b) => b.bookings), 1);
  const periodWord = summary.range === 'week' ? 'week' : 'month';

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 4, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 23, fontWeight: 660 }}>{summary.bookings}</span>
        <span className="summary-cap">bookings ·</span>
        <span style={{ fontSize: 23, fontWeight: 660 }}>{formatMoney(summary.revenueMinor)}</span>
        <span className="summary-cap">earned</span>
      </div>
      <div className="summary-cap" style={{ marginBottom: 14 }}>
        {summary.label}
      </div>

      <div className="range-bars">
        {summary.buckets.map((b) => (
          <div className="range-bar-col" key={b.label}>
            <div
              className={`range-bar ${b.isCurrent ? 'range-bar-current' : ''} ${b.bookings === 0 ? 'range-bar-empty' : ''}`}
              style={b.bookings > 0 ? { height: `${Math.max((b.bookings / max) * 44, 8)}px` } : undefined}
            />
            <span className={`range-bar-label ${b.isCurrent ? 'range-bar-label-current' : ''}`}>{b.label}</span>
          </div>
        ))}
      </div>

      <div className="summary-rule" />
      <div className="summary-foot">
        <span className="summary-cap" style={summary.comparisonPct !== null && summary.comparisonPct >= 0 ? { color: '#5be08a' } : undefined}>
          {summary.comparisonPct === null
            ? 'Nothing to compare yet'
            : `${summary.comparisonPct >= 0 ? '↑' : '↓'} ${Math.abs(summary.comparisonPct)}% vs last ${periodWord}`}
        </span>
        <span className="summary-cap">
          {summary.noShows} no-show{summary.noShows === 1 ? '' : 's'}
        </span>
      </div>
    </>
  );
}

/** Miniature previews so the picker is chosen by sight rather than by name. */
function Thumb({ id }: { id: SummaryStyle }) {
  if (id === 'tiles') {
    return (
      <div style={{ display: 'flex', gap: 4 }}>
        <div style={{ flex: 1, background: '#eaf1fb', borderRadius: 6, padding: '8px 5px', color: '#17427f', fontSize: 12, fontWeight: 620 }}>8</div>
        <div style={{ flex: 1, background: '#e6f5ec', borderRadius: 6, padding: '8px 5px', color: '#14663c', fontSize: 12, fontWeight: 620 }}>₹3</div>
        <div style={{ flex: 1, background: '#fdf3e3', borderRadius: 6, padding: '8px 5px', color: '#8a5a10', fontSize: 12, fontWeight: 620 }}>18</div>
      </div>
    );
  }
  if (id === 'ring') {
    return (
      <div style={{ background: '#0f3d2e', borderRadius: 9, padding: '9px 8px', display: 'flex', alignItems: 'center', gap: 7 }}>
        <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
          <circle cx="13" cy="13" r="10" fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="3" />
          <circle cx="13" cy="13" r="10" fill="none" stroke="#5be08a" strokeWidth="3" strokeLinecap="round" strokeDasharray="11 63" transform="rotate(-90 13 13)" />
        </svg>
        <div>
          <div style={{ fontSize: 11, color: '#fff' }}>8</div>
          <div style={{ fontSize: 11, color: '#8fd4b0' }}>₹300</div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ background: '#0f3d2e', borderRadius: 9, padding: '10px 9px' }}>
      <div style={{ fontSize: 11, color: '#fff', marginBottom: 6 }}>1 done · 7 to go</div>
      <div style={{ height: 4, borderRadius: 3, background: 'rgba(255,255,255,0.16)' }}>
        <div style={{ width: '13%', height: '100%', borderRadius: 3, background: '#5be08a' }} />
      </div>
    </div>
  );
}

export function SummaryCard({ stats }: { stats: TodayStats }) {
  // Starts at the default and corrects after mount — reading localStorage
  // during render would produce different server and client markup.
  const [style, setStyle] = useState<SummaryStyle>(DEFAULT_STYLE);
  const [picking, setPicking] = useState(false);
  const [range, setRange] = useState<Range>('today');
  // Fetched on demand, once per tab per page load — switching back to an
  // already-loaded tab is instant instead of re-hitting the API.
  const [rangeData, setRangeData] = useState<Partial<Record<'week' | 'month', RangeSummary>>>({});
  const [rangeLoading, setRangeLoading] = useState(false);
  const [rangeFailed, setRangeFailed] = useState(false);
  const f = derive(stats);

  useEffect(() => {
    setStyle(readStoredStyle());
  }, []);

  const selectRange = (next: Range) => {
    setRange(next);
    if (next === 'today' || rangeData[next]) return;
    setRangeLoading(true);
    setRangeFailed(false);
    api
      .rangeSummary(next)
      .then((data) => setRangeData((prev) => ({ ...prev, [next]: data })))
      .catch(() => setRangeFailed(true))
      .finally(() => setRangeLoading(false));
  };

  const choose = (next: SummaryStyle) => {
    setStyle(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    setPicking(false);
  };

  const activeRangeData = range !== 'today' ? rangeData[range] : undefined;

  return (
    <>
      <div className={`summary ${style === 'tiles' && range === 'today' ? 'summary-light' : ''}`}>
        <div className="summary-head">
          <div className="range-toggle">
            <button type="button" className={range === 'today' ? 'active' : ''} onClick={() => selectRange('today')}>
              {copy.home.rangeToday}
            </button>
            <button type="button" className={range === 'week' ? 'active' : ''} onClick={() => selectRange('week')}>
              {copy.home.rangeWeek}
            </button>
            <button type="button" className={range === 'month' ? 'active' : ''} onClick={() => selectRange('month')}>
              {copy.home.rangeMonth}
            </button>
          </div>
          {range === 'today' && (
            <button
              type="button"
              className="summary-more"
              aria-label={copy.home.summaryStyle}
              onClick={() => setPicking(true)}
            >
              <IconDots />
            </button>
          )}
        </div>

        {range === 'today' && style === 'ring' && <Ring f={f} />}
        {range === 'today' && style === 'tiles' && <Tiles f={f} />}
        {range === 'today' && style === 'progress' && <Progress f={f} />}

        {range !== 'today' && activeRangeData && <RangeBars summary={activeRangeData} />}
        {range !== 'today' && !activeRangeData && rangeLoading && (
          <div className="summary-cap" style={{ padding: '8px 0' }}>
            Loading…
          </div>
        )}
        {range !== 'today' && !activeRangeData && !rangeLoading && rangeFailed && (
          <div className="summary-cap" style={{ padding: '8px 0' }}>
            Couldn&apos;t load — tap {range === 'week' ? 'Week' : 'Month'} to try again.
          </div>
        )}
      </div>

      {picking && (
        <>
          <div className="sheet-backdrop" onClick={() => setPicking(false)} />
          <div className="sheet" role="dialog" aria-label={copy.home.summaryStyle}>
            <div className="sheet-grab" />
            <div style={{ padding: '0 18px 14px' }}>
              <div className="sheet-title">{copy.home.summaryStyle}</div>
              <div className="sheet-sub">{copy.home.summaryStyleHint}</div>
            </div>
            <div style={{ padding: '0 16px' }}>
              {STYLE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`pick ${style === opt.id ? 'pick-on' : ''}`}
                  onClick={() => choose(opt.id)}
                >
                  <span className="pick-thumb">
                    <Thumb id={opt.id} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="pick-name" style={{ display: 'block' }}>
                      {opt.name}
                    </span>
                    <span className="pick-desc">{opt.desc}</span>
                  </span>
                  <span className="pick-radio">{style === opt.id && <IconCheck />}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
