'use client';

import { useEffect, useRef, useState } from 'react';
import { clientRecency, formatDate, formatPhone, formatRecency, type ClientRecency } from '../lib/format';
import { useSearchParams } from 'next/navigation';
import {
  api,
  formatMoney,
  type Customer,
  type CustomerPage,
  type CustomerSort,
  type CustomerStats,
  type CustomerStatusFilter,
} from '../lib/api';
import { initials } from '../lib/appointment-display';
import { dialable } from '../components/BookingSheet';
import { PageHeader } from '../components/PageHeader';
import { Pagination, PAGE_SIZE } from '../components/Pagination';
import { IconSearch, IconUserPlus, IconWhatsApp } from '../components/icons';

/** Matches the backend's own derived-status window (customer/repository.ts). */

function statusLabel(s: Exclude<CustomerStatusFilter, 'all'>): string {
  if (s === 'active') return 'Active only';
  if (s === 'inactive') return 'Inactive only';
  return `Haven't visited in 30+ days`;
}

/**
 * Chips only where they say something. "Active" on every row was the original
 * sin here; a client seen last week needs no chip at all, and a client who has
 * never booked is neither lapsed nor inactive — there is nothing to win back.
 */
function recencyChip(state: ClientRecency) {
  if (state === 'lapsed') return <span className="chip chip-lapsed">Lapsed</span>;
  if (state === 'inactive') return <span className="chip chip-completed">Inactive</span>;
  return null;
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
        .customers({ search, status, sort, limit: pageSize, offset: pageIndex * pageSize })
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
  }, [search, status, sort, pageIndex, pageSize]);

  const refresh = () => {
    api.customers({ search, status, sort, limit: pageSize, offset: pageIndex * pageSize }).then(setPage);
    // Stats are server-rendered once; a full refresh is the honest way to
    // re-derive them rather than incrementing a local copy that could drift.
    window.location.reload();
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
      `${formatRecency(c.lastBookingAt)} (${clientRecency(c.lastBookingAt)})`,
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
      <div className="page-body">
        <div className="cust-kpis">
          {/* Four distinct facts. Previously tile 1's subtitle repeated tile 2's
              value, and tile 3's subtitle repeated tile 4's — so half the row
              restated the other half and the numbers read as contradicting
              each other. */}
          <Kpi label={`Total ${lower}`} value={String(stats.total)} sub="All time" />
          <Kpi label="New this month" value={String(stats.newThisMonth)} sub="First seen this month" />
          <Kpi label={`Returning ${lower}`} value={String(stats.returning)} sub="Booked more than once" />
          <Kpi label="Repeat rate" value={`${stats.repeatRatePct}%`} sub={`Returning ÷ total ${lower}`} />
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
                  {(['all', 'active', 'inactive', 'lapsed'] as CustomerStatusFilter[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="dropdown-item dropdown-item-plain"
                      onClick={() => {
                        setStatus(s);
                        // Lapsed is a win-back list — sort by lifetime spend so
                        // the highest-value customers to call first sort to the
                        // top. Any other filter goes back to most-recent-first.
                        setSort(s === 'lapsed' ? 'spent' : 'recent');
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
            <>
              {/* Desktop: a scannable table. Mobile: the same rows as cards — a
                  6-column table can't be read on a phone without pinch-zoom. */}
              <div className="table-scroll cust-table">
                <table>
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Phone / WhatsApp</th>
                      <th>Last booking</th>
                      <th>Bookings</th>
                      <th>Total spent</th>
                      <th>Last seen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((c) => (
                      <tr key={c.id} data-row>
                        <td>
                          <div className="cust-name-cell">
                            <span className="avatar">{initials(c.name)}</span>
                            <span style={{ fontWeight: 620 }}>{c.name ?? 'Unnamed'}</span>
                          </div>
                        </td>
                        <td>
                          <a className="cust-phone" href={`https://wa.me/${dialable(c.waPhone)}`} target="_blank" rel="noreferrer">
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
                        {/* Recency, not a constant. "Active" was true for every
                            row in the table, so the column carried no signal at
                            all; how long ago someone last came in does. */}
                        <td>
                          <div className="cust-recency">
                            <span>{formatRecency(c.lastBookingAt)}</span>
                            {recencyChip(clientRecency(c.lastBookingAt))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="cust-cards">
                {visibleRows.map((c) => (
                  <div className="cust-card" key={c.id} data-row>
                    <div className="cust-card-head">
                      <span className="avatar">{initials(c.name)}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="cust-card-name">
                          {c.name ?? 'Unnamed'}
                          {recencyChip(clientRecency(c.lastBookingAt))}
                        </div>
                        <a className="cust-phone" href={`https://wa.me/${dialable(c.waPhone)}`} target="_blank" rel="noreferrer">
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
              </div>

              <Pagination
                page={pageIndex + 1}
                total={page.total}
                pageSize={pageSize}
                noun={lower}
                onChange={(p) => setPageIndex(p - 1)}
              />
            </>
          )}
        </div>
      </div>

      {adding && <AddCustomerModal singular={singular} onClose={() => setAdding(false)} onSaved={refresh} />}
    </>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="cust-kpi">
      <span className="cust-kpi-icon">
        <IconUserPlus />
      </span>
      <div>
        <div className="cust-kpi-label">{label}</div>
        <div className="cust-kpi-value">{value}</div>
        <div className="cust-kpi-sub">{sub}</div>
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
