'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type ReactNode } from 'react';

import { copy } from '../lib/copy';
import type { ReportRangeKey, ReportTabKey } from '../lib/api';
import { IconCalendar, IconChevronDown, IconDownload, IconFilter, IconRepeat } from '../components/icons';

const TAB_ORDER: ReportTabKey[] = [
  'overview',
  'customers',
  'revenue',
  'bookings',
  'services',
  'staff',
  'retention',
  'insights',
];

const RANGE_ORDER: ReportRangeKey[] = [
  'today',
  'last_7_days',
  'this_month',
  'last_month',
  'last_3_months',
  'this_year',
];

/**
 * The chrome above every Reports tab: title, the question the tab answers,
 * range picker, comparison toggle, and the tab bar.
 *
 * Tab and range live in the URL rather than in component state, so a report an
 * owner is looking at is a link they can send, a bookmark that still works,
 * and a back button that goes where they expect. It also means every tab is
 * server-rendered from one place instead of eight client fetchers that could
 * each resolve "this month" slightly differently.
 */
export function ReportsShell({
  tab,
  range,
  compare,
  staffTabAvailable,
  children,
}: {
  tab: ReportTabKey;
  range: ReportRangeKey;
  compare: boolean;
  /** Off for verticals where ranking providers is a product smell (07 §3.2). */
  staffTabAvailable: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [rangeOpen, setRangeOpen] = useState(false);

  const go = (next: Record<string, string>) => {
    const query = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) query.set(key, value);
    router.push(`/reports?${query.toString()}`);
  };

  const tabs = TAB_ORDER.filter((key) => key !== 'staff' || staffTabAvailable);

  // A fragment, not a wrapper: `.content` is a three-row grid (header /
  // scroller / footer), so the header and the scrolling body have to be its
  // direct children. Wrapping them would put the whole page in the header row
  // and nothing would scroll (GRW-5's shell grid).
  return (
    <>
      <header className="rp-header">
        <div className="rp-title-row">
          <div>
            <h1>{copy.reports.title}</h1>
            <p>{copy.reports.subtitles[tab]}</p>
          </div>
        </div>

        <div className="rp-controls">
          <div className="rp-range">
            <button type="button" className="rp-control" onClick={() => setRangeOpen((open) => !open)}>
              <span className="rp-control-icon rp-brand-ink">
                <IconCalendar />
              </span>
              <span>{copy.reports.ranges[range]}</span>
              <span className="rp-control-icon rp-muted">
                <IconChevronDown />
              </span>
            </button>
            {rangeOpen && (
              <>
                <button
                  type="button"
                  className="rp-range-scrim"
                  aria-label="Close"
                  onClick={() => setRangeOpen(false)}
                />
                <div className="rp-range-menu">
                  {RANGE_ORDER.map((key) => (
                    <button
                      key={key}
                      type="button"
                      className={key === range ? 'active' : ''}
                      onClick={() => {
                        setRangeOpen(false);
                        go({ range: key });
                      }}
                    >
                      {copy.reports.ranges[key]}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            className={`rp-control ${compare ? 'rp-control-on' : ''}`}
            onClick={() => go({ compare: String(!compare) })}
          >
            <span className="rp-control-icon">
              <IconRepeat />
            </span>
            <span>{copy.reports.compare}</span>
          </button>

          <div className="rp-controls-spacer" />

          {/* Both controls are drawn by the design and defined by no part of
              it — the mock's own logic class wires neither. They ship visible
              but disabled with a stated reason rather than as buttons that
              look alive and silently do nothing (GRW-60). */}
          <button type="button" className="rp-control" disabled title={copy.reports.notBuiltYet}>
            <span className="rp-control-icon rp-muted">
              <IconFilter />
            </span>
            <span>{copy.reports.filters}</span>
          </button>
          <button type="button" className="rp-control rp-control-primary" disabled title={copy.reports.notBuiltYet}>
            <span className="rp-control-icon">
              <IconDownload />
            </span>
            <span>{copy.reports.export}</span>
          </button>
        </div>

        <nav className="rp-tabs">
          {tabs.map((key) => (
            <button
              key={key}
              type="button"
              className={key === tab ? 'active' : ''}
              onClick={() => go({ tab: key })}
            >
              {copy.reports.tabs[key]}
            </button>
          ))}
        </nav>
      </header>

      <div className="rp-body page-body">{children}</div>
    </>
  );
}
