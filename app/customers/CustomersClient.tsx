'use client';

import { useEffect, useRef, useState } from 'react';
import {
  api,
  formatMoney,
  type Customer,
  type CustomerPage,
  type CustomerStats,
  type CustomerStatusFilter,
} from '../lib/api';
import { initials } from '../lib/appointment-display';
import { dialable } from '../components/BookingSheet';
import { PageHeader } from '../components/PageHeader';
import { IconSearch, IconUserPlus, IconWhatsApp } from '../components/icons';
import { useFitRows } from '../lib/use-fit-rows';

/** Server-rendered first page; the client immediately re-measures and refetches the count that actually fits. */
const INITIAL_PAGE_SIZE = 6;
/** Matches the backend's own derived-status window (customer/repository.ts). */
const ACTIVE_WINDOW_DAYS = 90;

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso));
}

/** Derived the same way the backend filter does — a customer is active if they've booked recently. */
function isActive(c: Customer): boolean {
  if (!c.lastBookingAt) return false;
  const days = (Date.now() - new Date(c.lastBookingAt).getTime()) / 86_400_000;
  return days <= ACTIVE_WINDOW_DAYS;
}

export function CustomersClient({
  initialStats,
  initialPage,
  label,
}: {
  initialStats: CustomerStats;
  initialPage: CustomerPage;
  /** "Clients" for a salon, "Patients" for a clinic — from the vertical config. */
  label: string;
}) {
  const lower = label.toLowerCase();
  const singular = lower.replace(/s$/, '');
  const [stats] = useState(initialStats);
  const [page, setPage] = useState(initialPage);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<CustomerStatusFilter>('all');
  const [pageIndex, setPageIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  // Page size is whatever fits the screen, so the list never scrolls.
  const { pageSize, listRef } = useFitRows({ fallback: INITIAL_PAGE_SIZE });
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
        .customers({ search, status, limit: pageSize, offset: pageIndex * pageSize })
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
  }, [search, status, pageIndex, pageSize]);

  const refresh = () => {
    api.customers({ search, status, limit: pageSize, offset: pageIndex * pageSize }).then(setPage);
    // Stats are server-rendered once; a full refresh is the honest way to
    // re-derive them rather than incrementing a local copy that could drift.
    window.location.reload();
  };

  // Sliced, not just fetched: on shrink the row count must drop on the same
  // frame as the measurement, or the list scrolls until the refetch returns.
  const visibleRows = page.rows.slice(0, pageSize);
  const pageCount = Math.max(1, Math.ceil(page.total / pageSize));
  const from = page.total === 0 ? 0 : pageIndex * pageSize + 1;
  const to = Math.min(pageIndex * pageSize + visibleRows.length, page.total);

  const exportCsv = () => {
    const header = ['Name', 'Phone', 'Last booking', 'Last service', 'Total bookings', 'Total spent', 'Status'];
    const rows = page.rows.map((c) => [
      c.name ?? '',
      c.waPhone,
      c.lastBookingAt ? formatDate(c.lastBookingAt) : '',
      c.lastServiceName ?? '',
      String(c.totalBookings),
      formatMoney(c.totalSpentMinor),
      isActive(c) ? 'Active' : 'Inactive',
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
          <Kpi label={`Total ${lower}`} value={String(stats.total)} sub={`${stats.newThisMonth} new this month`} />
          <Kpi label="New this month" value={String(stats.newThisMonth)} sub="First seen this month" />
          <Kpi
            label={`Returning ${lower}`}
            value={String(stats.returning)}
            sub={stats.total > 0 ? `${Math.round((stats.returning / stats.total) * 100)}% of total` : '—'}
          />
          <Kpi label="Repeat rate" value={`${stats.repeatRatePct}%`} sub="Booked more than once" />
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
                {status === 'all' ? 'Filter' : status === 'active' ? 'Active only' : 'Inactive only'} ⌄
              </button>
              {filterOpen && (
                <div className="dropdown-panel dropdown-panel-sm" onMouseLeave={() => setFilterOpen(false)}>
                  {(['all', 'active', 'inactive'] as CustomerStatusFilter[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="dropdown-item dropdown-item-plain"
                      onClick={() => {
                        setStatus(s);
                        setPageIndex(0);
                        setFilterOpen(false);
                      }}
                    >
                      {s === 'all' ? `All ${lower}` : s === 'active' ? 'Active only' : 'Inactive only'}
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
              <div ref={listRef}>
              <div className="table-scroll cust-table">
                <table>
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Phone / WhatsApp</th>
                      <th>Last booking</th>
                      <th>Bookings</th>
                      <th>Total spent</th>
                      <th>Status</th>
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
                            {c.waPhone}
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
                        <td>
                          <span className={`chip ${isActive(c) ? 'chip-confirmed' : 'chip-completed'}`}>
                            {isActive(c) ? 'Active' : 'Inactive'}
                          </span>
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
                          <span className={`chip ${isActive(c) ? 'chip-confirmed' : 'chip-completed'}`}>
                            {isActive(c) ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        <a className="cust-phone" href={`https://wa.me/${dialable(c.waPhone)}`} target="_blank" rel="noreferrer">
                          <IconWhatsApp />
                          {c.waPhone}
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
              </div>

              <div className="pagination">
                <span className="muted">
                  Showing {from} to {to} of {page.total} {lower}
                </span>
                <div className="pagination-controls">
                  <button type="button" className="pagination-btn" disabled={pageIndex === 0} onClick={() => setPageIndex(pageIndex - 1)}>
                    ‹
                  </button>
                  <button type="button" className="pagination-btn pagination-btn-active">
                    {pageIndex + 1}
                  </button>
                  <button
                    type="button"
                    className="pagination-btn"
                    disabled={pageIndex + 1 >= pageCount}
                    onClick={() => setPageIndex(pageIndex + 1)}
                  >
                    ›
                  </button>
                </div>
              </div>
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
