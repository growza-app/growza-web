'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { formatDate, formatPhone, formatRecency } from '../lib/format';
import { useSearchParams } from 'next/navigation';
import {
  api,
  formatMoney,
  type Customer,
  type CustomerPage,
  type CustomerSort,
  type CustomerStats,
  type CustomerStatusFilter,
  type SortDirection,
} from '../lib/api';
import { initials } from '../lib/appointment-display';
import { dialable } from '../components/BookingSheet';
import { PageHeader } from '../components/PageHeader';
import { PaginatedTable } from '../components/PaginatedTable';
import { PAGE_SIZE } from '../components/Pagination';
import {
  IconPercent,
  IconRepeat,
  IconSearch,
  IconSort,
  IconStaff,
  IconUserPlus,
  IconWhatsApp,
} from '../components/icons';
import { copy } from '../lib/copy';
import { ClientProfileCard } from '../components/ClientProfileCard';

/** The same four words the cards, the chips and `?status=` all use. */
function statusLabel(s: Exclude<CustomerStatusFilter, 'all'>): string {
  if (s === 'never') return 'Never been in';
  if (s === 'lapsed') return 'Due or slipping';
  return copy.clients.segments[s].label;
}

/**
 * Chips only where they say something. "Active" on every row was the original
 * sin here: a client seen last week needs no chip at all. A client who has
 * never been in is in no band — there is nothing to win back — so they get no
 * chip either.
 *
 * The band comes from the row, which the backend computed with the same rule
 * the filter and the cards use. It was briefly worked out here instead, from
 * the row's last *booking* — which counts no-shows and visits still to happen
 * — so filtering to "Gone quiet" returned rows chipped "Due a visit".
 */
function recencyChip(segment: Customer['segment']) {
  if (segment === 'due') return <span className="chip chip-lapsed">{copy.clients.segments.due.label}</span>;
  if (segment === 'at_risk') return <span className="chip chip-cancelled">{copy.clients.segments.at_risk.label}</span>;
  if (segment === 'inactive') return <span className="chip chip-completed">{copy.clients.segments.inactive.label}</span>;
  return null;
}

/** Left rule colour per band — the same four the Reports segment cards use. */
const SEGMENT_TONE: Record<string, string> = {
  active: 'var(--accent)',
  due: '#f59e0b',
  at_risk: '#e5533c',
  inactive: 'var(--purple)',
};

/** A column header that sorts. The arrow only appears on the active column. */
function SortableTh({
  col,
  label,
  sort,
  direction,
  onSort,
  numeric,
}: {
  col: CustomerSort;
  label: string;
  sort: CustomerSort;
  direction: SortDirection;
  onSort: (col: CustomerSort) => void;
  numeric?: boolean;
}) {
  const active = sort === col;
  return (
    <th className={numeric ? 'th-sortable th-numeric' : 'th-sortable'}>
      <button type="button" onClick={() => onSort(col)} title={copy.clients.sortBy(label.toLowerCase())}>
        {label}
        <span className={`th-arrow ${active ? 'is-on' : ''}`} aria-hidden>
          {active ? (direction === 'desc' ? '↓' : '↑') : <IconSort />}
        </span>
      </button>
    </th>
  );
}

export function CustomersClient({
  initialStats,
  initialPage,
  initialStatus,
  initialSort,
  label,
}: {
  initialStats: CustomerStats;
  initialPage: CustomerPage;
  /** From the URL (?status=lapsed, e.g. the Home "Needs attention" deep link) — defaults to 'all'. */
  initialStatus?: CustomerStatusFilter;
  /** From the URL (?sort=spent) — defaults to 'recent'. */
  initialSort?: CustomerSort;
  /** "Clients" for a salon, "Patients" for a clinic — from the vertical config. */
  label: string;
}) {
  const lower = label.toLowerCase();
  const singular = lower.replace(/s$/, '');
  const [stats] = useState(initialStats);
  const [page, setPage] = useState(initialPage);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<CustomerStatusFilter>(initialStatus ?? 'all');
  const [sort, setSort] = useState<CustomerSort>(initialSort ?? 'recent');
  const [pageIndex, setPageIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const searchParams = useSearchParams();
  // Which client's card is open. Null closes it; the list keeps its scroll
  // position because nothing navigates away.
  const [openClientId, setOpenClientId] = useState<string | null>(null);
  // Which way the sorted column runs. Clicking the same header again flips it,
  // which is what makes "who spends least" reachable without a second control.
  const [direction, setDirection] = useState<SortDirection>('desc');
  // ?add=1 (from the Home quick-actions panel) opens the sheet straight away
  // instead of landing here and requiring a second click.
  const [adding, setAdding] = useState(() => searchParams.get('add') === '1');
  // Fixed page size: the list scrolls within the page and a numbered footer
  // pages through it — the standard pattern for a potentially large list.
  const pageSize = PAGE_SIZE;
  // Skip the fetch on first render — the server already sent page 0.
  const primed = useRef(false);

  useEffect(() => {
    if (!primed.current) {
      primed.current = true;
      return;
    }
    setLoading(true);
    let cancelled = false;
    // Debounced so typing a phone number doesn't fire a request per digit.
    const timer = setTimeout(() => {
      api
        .customers({ search, status, sort, direction, limit: pageSize, offset: pageIndex * pageSize })
        .then((r) => {
          if (!cancelled) setPage(r);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, status, sort, direction, pageIndex, pageSize]);

  const refresh = () => {
    api.customers({ search, status, sort, direction, limit: pageSize, offset: pageIndex * pageSize }).then(setPage);
    // Stats are server-rendered once; a full refresh is the honest way to
    // re-derive them rather than incrementing a local copy that could drift.
    window.location.reload();
  };

  /**
   * Clicking a column sorts by it; clicking the one already sorted flips the
   * direction. Two clicks reach "who spends least" without a second control,
   * and the arrow says which way it currently runs.
   */
  const setSortColumn = (col: CustomerSort) => {
    if (col === sort) setDirection((d) => (d === 'desc' ? 'asc' : 'desc'));
    else {
      setSort(col);
      // Names read A–Z; every number reads biggest-first, because that is the
      // question an owner asks of a number column.
      setDirection(col === 'name' ? 'asc' : 'desc');
    }
    setPageIndex(0);
  };

  const visibleRows = page.rows.slice(0, pageSize);

  const exportCsv = () => {
    const header = ['Name', 'Phone', 'Last booking', 'Last service', 'Total bookings', 'Total spent', 'Last seen'];
    const rows = page.rows.map((c) => [
      c.name ?? '',
      formatPhone(c.waPhone),
      c.lastBookingAt ? formatDate(c.lastBookingAt) : '',
      c.lastServiceName ?? '',
      String(c.totalBookings),
      formatMoney(c.totalSpentMinor),
      // The exported band is the row's own, so a spreadsheet and the screen
      // cannot disagree about which clients are slipping.
      `${formatRecency(c.lastBookingAt)} (${c.segment})`,
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'customers.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        title={label}
        subtitle={`View and manage your ${label.toLowerCase()}. See their booking history and spend.`}
        actions={
          <button type="button" className="btn" onClick={() => setAdding(true)}>
            + Add {singular}
          </button>
        }
      />
      <div className="page-body cust-fit">
        <div className="cust-kpis">
          {/* Four distinct facts. Previously tile 1's subtitle repeated tile 2's
              value, and tile 3's subtitle repeated tile 4's — so half the row
              restated the other half and the numbers read as contradicting
              each other. */}
          <Kpi icon={<IconStaff />} label={`Total ${lower}`} value={String(stats.total)} sub="All time" />
          <Kpi icon={<IconUserPlus />} label="New this month" value={String(stats.newThisMonth)} sub="First seen this month" />
          <Kpi icon={<IconRepeat />} label={`Returning ${lower}`} value={String(stats.returning)} sub="Booked more than once" />
          <Kpi icon={<IconPercent />} label="Repeat rate" value={`${stats.repeatRatePct}%`} sub={`Returning ÷ total ${lower}`} />
        </div>

        {/* The cards are also the filter. Their counts come back with the
            page's own stats, from the same predicate the filter runs, so a
            card reading "462 Slipping away" cannot show a different number of
            rows than it counted (platform/segments.ts). */}
        <div className="card cust-segments">
          <div className="cust-segments-head">
            <h2>{copy.clients.segmentsTitle}</h2>
            {/* Both asides on the heading's line. The hint has to stay — it is
                what tells a hesitant reader the cards are tappable at all — and
                the never-been-in count has to stay too, or the four bands look
                like they should add up to the total above and never will. */}
            <p>
              {copy.clients.segmentsHint}
              {stats.neverVisited > 0 && (
                <>
                  {' · '}
                  {copy.clients.neverVisited(
                    stats.neverVisited,
                    stats.total > 0 ? Math.round((stats.neverVisited / stats.total) * 100) : 0,
                  )}
                </>
              )}
            </p>
            {status !== 'all' && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setStatus('all'); setPageIndex(0); }}>
                {copy.clients.clearFilter}
              </button>
            )}
          </div>
          <div className="cust-segment-grid">
            {stats.segments.map((seg) => {
              const words = copy.clients.segments[seg.key];
              const on = status === seg.key;
              return (
                <button
                  key={seg.key}
                  type="button"
                  className={`cust-segment ${on ? 'is-on' : ''}`}
                  style={{ ['--seg' as string]: SEGMENT_TONE[seg.key] }}
                  aria-pressed={on}
                  onClick={() => {
                    // Clicking the band you are already in clears it, so the
                    // card is a toggle rather than a one-way trip.
                    setStatus(on ? 'all' : seg.key);
                    // A band of people who have drifted is a call list, so it
                    // opens highest-spend-first — the ones worth ringing.
                    if (!on && seg.key !== 'active') { setSort('spent'); setDirection('desc'); }
                    setPageIndex(0);
                  }}
                >
                  <span className="cust-segment-label">
                    <span className="cust-segment-dot" />
                    {words.label}
                    <span className="cust-segment-range">{words.range}</span>
                  </span>
                  <span className="cust-segment-count">
                    {seg.count}
                    <em>{seg.pct}%</em>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="card">
          <div className="offers-toolbar cust-toolbar">
            <label className="search-wrap">
              <IconSearch />
              <input
                type="text"
                className="search-input search-input-bare"
                placeholder={`Search ${lower} by name or phone…`}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPageIndex(0);
                }}
              />
            </label>
            <div className="dropdown-anchor">
              <button type="button" className="btn btn-ghost" onClick={() => setFilterOpen((v) => !v)}>
                {status === 'all' ? 'Filter' : statusLabel(status)} ⌄
              </button>
              {filterOpen && (
                <div className="dropdown-panel dropdown-panel-sm" onMouseLeave={() => setFilterOpen(false)}>
                  {(['all', 'active', 'due', 'at_risk', 'inactive', 'never'] as CustomerStatusFilter[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="dropdown-item dropdown-item-plain"
                      onClick={() => {
                        setStatus(s);
                        // A band of people who have drifted is a call list, so
                        // it opens highest-spend-first. Anything else goes back
                        // to most-recent.
                        setSort(s === 'all' || s === 'active' ? 'recent' : 'spent');
                        setDirection('desc');
                        setPageIndex(0);
                        setFilterOpen(false);
                      }}
                    >
                      {s === 'all' ? `All ${lower}` : statusLabel(s)}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button type="button" className="btn btn-ghost" onClick={exportCsv} disabled={page.rows.length === 0}>
              Export
            </button>
          </div>

          {page.rows.length === 0 ? (
            <div className="empty">{loading ? 'Loading…' : `No ${lower} match your search.`}</div>
          ) : (
            <PaginatedTable
              noun={lower}
              pageSize={pageSize}
              page={pageIndex + 1}
              total={page.total}
              onPageChange={(p) => setPageIndex(p - 1)}
              head={
                <tr>
                  <SortableTh col="name" label="Customer" sort={sort} direction={direction} onSort={setSortColumn} />
                  <th>Phone / WhatsApp</th>
                  <th>Last booking</th>
                  <SortableTh col="visits" label="Bookings" sort={sort} direction={direction} onSort={setSortColumn} numeric />
                  <SortableTh col="spent" label="Total spent" sort={sort} direction={direction} onSort={setSortColumn} numeric />
                  <SortableTh col="recent" label="Last seen" sort={sort} direction={direction} onSort={setSortColumn} />
                </tr>
              }
              cards={visibleRows.map((c) => (
                <div
                  className="cust-card cust-row-click"
                  key={c.id}
                  data-row
                  role="button"
                  tabIndex={0}
                  onClick={() => setOpenClientId(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setOpenClientId(c.id);
                    }
                  }}
                >
                  <div className="cust-card-head">
                    <span className="avatar">{initials(c.name)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="cust-card-name">
                        {c.name ?? 'Unnamed'}
                        {recencyChip(c.segment)}
                      </div>
                      {/* Stops the row's own click: tapping the number should
                          open WhatsApp, not the card behind it. */}
                      <a
                        className="cust-phone"
                        href={`https://wa.me/${dialable(c.waPhone)}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <IconWhatsApp />
                        {formatPhone(c.waPhone)}
                      </a>
                      {c.lastBookingAt && (
                        <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                          📅 {formatDate(c.lastBookingAt)} · {c.lastServiceName}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="cust-card-foot">
                    <span>{c.totalBookings} bookings</span>
                    <span>{formatMoney(c.totalSpentMinor)} spent</span>
                  </div>
                </div>
              ))}
            >
              {/* Desktop: a scannable table. Mobile: the same rows as cards — a
                  6-column table can't be read on a phone without pinch-zoom. */}
              {visibleRows.map((c) => (
                <tr key={c.id} data-row className="cust-row-click" onClick={() => setOpenClientId(c.id)}>
                  <td>
                    <div className="cust-name-cell">
                      <span className="avatar">{initials(c.name)}</span>
                      <span style={{ fontWeight: 620 }}>{c.name ?? 'Unnamed'}</span>
                    </div>
                  </td>
                  <td>
                    <a
                      className="cust-phone"
                      href={`https://wa.me/${dialable(c.waPhone)}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <IconWhatsApp />
                      {formatPhone(c.waPhone)}
                    </a>
                  </td>
                  <td>
                    {c.lastBookingAt ? (
                      <>
                        <div>{formatDate(c.lastBookingAt)}</div>
                        <div className="muted" style={{ fontSize: 13 }}>{c.lastServiceName}</div>
                      </>
                    ) : (
                      <span className="muted">Never</span>
                    )}
                  </td>
                  <td>{c.totalBookings}</td>
                  <td>{formatMoney(c.totalSpentMinor)}</td>
                  {/* Recency, not a constant. "Active" was true for every row in
                      the table, so the column carried no signal at all; how long
                      ago someone last came in does. */}
                  <td>
                    <div className="cust-recency">
                      <span>{formatRecency(c.lastBookingAt)}</span>
                      {recencyChip(c.segment)}
                    </div>
                  </td>
                </tr>
              ))}
            </PaginatedTable>
          )}
        </div>
      </div>

      {adding && <AddCustomerModal singular={singular} onClose={() => setAdding(false)} onSaved={refresh} />}
      {/* The same card the Reports Clients tab opens. One component, so a
          name tapped in either place tells the same story. */}
      {openClientId && <ClientProfileCard clientId={openClientId} onClose={() => setOpenClientId(null)} />}
    </>
  );
}

/**
 * One headline figure.
 *
 * The icon differs per tile. All four used to be the same person-plus glyph,
 * which is decoration occupying the space a distinguishing mark could use —
 * the same reason a column whose value never varies got retired from this
 * very table (12-conventions.md §6).
 */
function Kpi({ label, value, sub, icon }: { label: string; value: string; sub: string; icon: ReactNode }) {
  return (
    // `sub` becomes the tooltip rather than a third line. Two of the four
    // restated their own label ("New this month" / "First seen this month");
    // the two that genuinely defined something still do, on hover, without
    // costing every screen a row of the list.
    <div className="cust-kpi" title={sub}>
      <span className="cust-kpi-icon">{icon}</span>
      <div style={{ minWidth: 0 }}>
        <div className="cust-kpi-label">{label}</div>
        <div className="cust-kpi-value">{value}</div>
      </div>
    </div>
  );
}

function AddCustomerModal({ singular, onClose, onSaved }: { singular: string; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!phone.trim()) {
      setPhoneError('Phone number is required');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.createCustomer({ phone: phone.trim(), name: name.trim() || undefined });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not add the ${singular}.`);
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Add {singular}</h3>
        <p className="muted" style={{ margin: '2px 0 0', fontSize: 13.5 }}>
          Someone already on file with this number is updated, never duplicated.
        </p>
        <div className="field">
          <label>
            <span>WhatsApp number *</span>
          </label>
          <input
            type="tel"
            value={phone}
            autoFocus
            placeholder="+91 98765 43210"
            className={phoneError ? 'field-invalid' : undefined}
            onChange={(e) => {
              setPhone(e.target.value);
              if (phoneError && e.target.value.trim()) setPhoneError(null);
            }}
          />
          {phoneError && <div className="field-error">{phoneError}</div>}
        </div>
        <div className="field">
          <label>
            <span>Name (optional)</span>
          </label>
          <input type="text" value={name} placeholder="e.g. Priya Sharma" onChange={(e) => setName(e.target.value)} />
        </div>
        {error && <div className="field-error" style={{ marginTop: 12 }}>{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn" onClick={save} disabled={busy}>
            {busy ? 'Adding…' : `Add ${singular}`}
          </button>
        </div>
      </div>
    </div>
  );
}
