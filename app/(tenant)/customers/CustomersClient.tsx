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
  IconPlus,
  IconRepeat,
  IconSearch,
  IconSort,
  IconStaff,
  IconUserPlus,
  IconWhatsApp,
} from '../components/icons';
import { useTranslations, useLocale } from 'next-intl';
import { copy } from '../lib/copy';
import { ClientProfileCard } from '../components/ClientProfileCard';
import { PhoneField } from '../components/PhoneField';
import { toStoredPhone } from '../lib/phone';
import { usePhoneProblem } from '../lib/use-phone-problem';

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
  if (segment === 'due') return { cls: 'chip-lapsed', key: 'segments.due.label' } as const;
  if (segment === 'at_risk') return { cls: 'chip-cancelled', key: 'segments.at_risk.label' } as const;
  if (segment === 'inactive') return { cls: 'chip-completed', key: 'segments.inactive.label' } as const;
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
  const t = useTranslations('customers');
  const active = sort === col;
  return (
    <th className={numeric ? 'th-sortable th-numeric' : 'th-sortable'}>
      <button type="button" onClick={() => onSort(col)} title={t('sortBy', { column: label.toLowerCase() })}>
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
  initialDirection,
  label,
}: {
  initialStats: CustomerStats;
  initialPage: CustomerPage;
  /** From the URL (?status=at_risk, e.g. the Home "Needs attention" deep link) — defaults to 'all'. */
  initialStatus?: CustomerStatusFilter;
  /** From the URL (?sort=spent) — defaults to 'recent'. */
  initialSort?: CustomerSort;
  /** From the URL (?dir=asc) — defaults to 'desc'. Travels with `initialSort`. */
  initialDirection?: SortDirection;
  /** "Clients" for a salon, "Patients" for a clinic — from the vertical config. */
  label: string;
}) {
  const locale = useLocale();
  const t = useTranslations('customers');
  const lower = label.toLowerCase();
  const singular = lower.replace(/s$/, '');
  const statusLabel = (s: Exclude<CustomerStatusFilter, 'all'>) =>
    s === 'never' ? t('statusNever') : s === 'lapsed' ? t('statusLapsed') : t(`segments.${s}.label`);
  const chipOf = (segment: Customer['segment']) => {
    const chip = recencyChip(segment);
    return chip ? <span className={`chip ${chip.cls}`}>{t(chip.key)}</span> : null;
  };
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
  const [direction, setDirection] = useState<SortDirection>(initialDirection ?? 'desc');
  // ?add=1 (from the Home quick-actions panel) opens the sheet straight away
  // instead of landing here and requiring a second click.
  const [adding, setAdding] = useState(() => searchParams.get('add') === '1');
  // Fixed page size: the list scrolls within the page and a numbered footer
  // pages through it — the standard pattern for a potentially large list.
  const pageSize = PAGE_SIZE;
  // Skip the fetch on first render — the server already sent page 0.
  const primed = useRef(false);

  /**
   * The band and sort live in the address bar, not only in React state.
   *
   * The URL already decided what this screen looks like on arrival — Home
   * links `?status=at_risk&sort=spent`, and so does every Reports segment
   * card — but the screen could not produce the link it consumes. Filtering
   * to Slipping away and reloading put you back on everyone, and sending
   * someone the link sent them the unfiltered list.
   *
   * `history`, not `router`. This page is force-dynamic, so router.replace
   * would re-run the server component and re-query Postgres for a change the
   * client has already rendered. The native call moves the address bar and
   * nothing else; Next keeps useSearchParams in step with it.
   *
   * Changing the band is a change of what you are looking at, so it pushes
   * and Back undoes it. Sorting refines the same list, so it replaces —
   * otherwise Back would walk you through every column you had tried.
   *
   * `search` and the page number stay out. Nothing reads them on the way in,
   * and writing a param the server ignores would produce a link that half
   * restores — the band back, the search silently dropped.
   */
  const lastUrlStatus = useRef(initialStatus ?? 'all');
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (status === 'all') params.delete('status');
    else params.set('status', status);
    if (sort === 'recent') params.delete('sort');
    else params.set('sort', sort);
    if (direction === 'desc') params.delete('dir');
    else params.set('dir', direction);
    // ?add=1 opened the sheet on arrival; leaving it in the URL would reopen
    // the sheet on every reload of a link that was only meant to be a filter.
    params.delete('add');

    const query = params.toString();
    const next = `${window.location.pathname}${query ? `?${query}` : ''}`;
    if (next === `${window.location.pathname}${window.location.search}`) return;

    const bandChanged = status !== lastUrlStatus.current;
    lastUrlStatus.current = status;
    window.history[bandChanged ? 'pushState' : 'replaceState'](null, '', next);
  }, [status, sort, direction, initialStatus]);

  // Back/Forward move through the bands pushed above. Without this the URL
  // would change under a screen that kept showing the previous band.
  useEffect(() => {
    const onPop = () => {
      const params = new URLSearchParams(window.location.search);
      const nextStatus = (params.get('status') ?? 'all') as CustomerStatusFilter;
      const nextSort = (params.get('sort') ?? 'recent') as CustomerSort;
      lastUrlStatus.current = nextStatus;
      setStatus(nextStatus);
      setSort(nextSort);
      setDirection(params.get('dir') === 'asc' ? 'asc' : 'desc');
      setPageIndex(0);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

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

  /** Null when everyone has been in at least once — then there is nothing to explain. */
  const neverPct =
    stats.neverVisited > 0 && stats.total > 0 ? Math.round((stats.neverVisited / stats.total) * 100) : null;

  const visibleRows = page.rows.slice(0, pageSize);

  const exportCsv = () => {
    const header = ['Name', 'Phone', 'Last booking', 'Last service', copy.clients.visitsCsvHeader, 'Total spent', 'Last seen'];
    const rows = page.rows.map((c) => [
      c.name ?? '',
      formatPhone(c.waPhone),
      c.lastBookingAt ? formatDate(c.lastBookingAt, undefined, locale) : '',
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
        subtitle={t('subtitle', { noun: lower })}
        actions={
          <button type="button" className="btn" onClick={() => setAdding(true)}>
            {/* A real icon, not a typed "+". GRW-30: on a phone the header
                action collapses to its icon, and a button whose plus is a
                character has nothing left to show. */}
            <IconPlus /> {t('addNoun', { noun: singular })}
          </button>
        }
      />
      <div className="page-body table-fit cust-fit">
        <div className="cust-kpis">
          {/* Four distinct facts. Previously tile 1's subtitle repeated tile 2's
              value, and tile 3's subtitle repeated tile 4's — so half the row
              restated the other half and the numbers read as contradicting
              each other. */}
          <Kpi icon={<IconStaff />} label={t('kpiTotal', { noun: lower })} value={String(stats.total)} sub={t('kpiTotalSub')} />
          <Kpi icon={<IconUserPlus />} label={t('kpiNew')} value={String(stats.newThisMonth)} sub={t('kpiNewSub')} />
          <Kpi icon={<IconRepeat />} label={t('kpiReturning', { noun: lower })} value={String(stats.returning)} sub={t('kpiReturningSub')} />
          <Kpi icon={<IconPercent />} label={t('kpiRepeat')} value={`${stats.repeatRatePct}%`} sub={t('kpiRepeatSub', { noun: lower })} />
        </div>

        {/* The cards are also the filter. Their counts come back with the
            page's own stats, from the same predicate the filter runs, so a
            card reading "462 Slipping away" cannot show a different number of
            rows than it counted (platform/segments.ts). */}
        <div className="card cust-segments">
          <div className="cust-segments-head">
            <h2>{t('segmentsTitle')}</h2>
            {/*
              Two versions of the same aside, one per screen size — not one
              string left to wrap. On a phone the full sentence ran to eleven
              lines at 320px, which is most of the screen spent on a footnote.

              What the short one keeps is the number: without it the four bands
              look like they should add up to the total above and never will.
              What it drops is the tap hint, because tapping a card is the
              obvious gesture on a touch screen and the card highlights when
              you do.
            */}
            <p>
              <span className="cust-aside-full">
                {t('segmentsHint')}
                {neverPct !== null && ` · ${t('neverVisited', { count: stats.neverVisited, pct: neverPct })}`}
              </span>
              {neverPct !== null && (
                <span className="cust-aside-brief">
                  {t('neverVisitedShort', { count: stats.neverVisited, pct: neverPct })}
                </span>
              )}
            </p>
            {status !== 'all' && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setStatus('all'); setPageIndex(0); }}>
                {t('clearFilter')}
              </button>
            )}
          </div>
          <div className="cust-segment-grid">
            {stats.segments.map((seg) => {
              const words = { label: t(`segments.${seg.key}.label`), range: t(`segments.${seg.key}.range`) };
              const on = status === seg.key;
              return (
                <button
                  key={seg.key}
                  type="button"
                  className={`cust-segment ${on ? 'is-on' : ''}`}
                  style={{ ['--seg' as string]: SEGMENT_TONE[seg.key] }}
                  aria-pressed={on}
                  // The day window is hidden on a phone to save the line, so it
                  // rides along here rather than being lost — long-press shows
                  // it, and a screen reader reads it either way.
                  title={`${words.label} · ${words.range}`}
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
                placeholder={t('searchPlaceholder', { noun: lower })}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPageIndex(0);
                }}
              />
            </label>
            <div className="dropdown-anchor">
              <button type="button" className="btn btn-ghost" onClick={() => setFilterOpen((v) => !v)}>
                {status === 'all' ? t('filter') : statusLabel(status)} ⌄
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
                      {s === 'all' ? t('allNoun', { noun: lower }) : statusLabel(s)}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button type="button" className="btn btn-ghost" onClick={exportCsv} disabled={page.rows.length === 0}>
              {t('export')}
            </button>
          </div>

          {page.rows.length === 0 ? (
            <div className="empty">{loading ? t('loading') : t('noMatch', { noun: lower })}</div>
          ) : (
            <PaginatedTable
              noun={lower}
              pageSize={pageSize}
              page={pageIndex + 1}
              total={page.total}
              onPageChange={(p) => setPageIndex(p - 1)}
              head={
                <tr>
                  <SortableTh col="name" label={t('colCustomer')} sort={sort} direction={direction} onSort={setSortColumn} />
                  <th>{t('colPhone')}</th>
                  <th>{t('colLastBooking')}</th>
                  <SortableTh col="visits" label={t('visitsColumn')} sort={sort} direction={direction} onSort={setSortColumn} numeric />
                  <SortableTh col="spent" label={t('colTotalSpent')} sort={sort} direction={direction} onSort={setSortColumn} numeric />
                  <SortableTh col="recent" label={t('colLastSeen')} sort={sort} direction={direction} onSort={setSortColumn} />
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
                        {c.name ?? t('unnamed')}
                        {chipOf(c.segment)}
                      </div>
                      {/* Stops the row's own click: tapping the number should
                          open WhatsApp, not the card behind it.
                          GRW-199 — and there may be no number to tap. */}
                      {c.waPhone && (
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
                      )}
                      {c.lastBookingAt && (
                        <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                          📅 {formatDate(c.lastBookingAt, undefined, locale)} · {c.lastServiceName}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="cust-card-foot">
                    <span>{t('visitCount', { count: c.totalBookings })}</span>
                    <span>{t('spent', { amount: formatMoney(c.totalSpentMinor) })}</span>
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
                      <span style={{ fontWeight: 620 }}>{c.name ?? t('unnamed')}</span>
                    </div>
                  </td>
                  <td>
                    {/* GRW-199 — a client recorded at the desk may have no
                        number; a wa.me link built from nothing opens WhatsApp
                        on a blank chat. */}
                    {c.waPhone ? (
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
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    {c.lastBookingAt ? (
                      <>
                        <div>{formatDate(c.lastBookingAt, undefined, locale)}</div>
                        <div className="muted" style={{ fontSize: 13 }}>{c.lastServiceName}</div>
                      </>
                    ) : (
                      <span className="muted">{t('never')}</span>
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
                      {chipOf(c.segment)}
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
  const checkPhone = usePhoneProblem();
  const t = useTranslations('customers');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    // GRW-199 — ten digits, or nothing. This used to accept any non-empty
    // string, which is how "abc" and half-typed numbers reached `wa_phone`.
    const phoneProblem = checkPhone(phone);
    if (phoneProblem) {
      setPhoneError(phoneProblem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.createCustomer({ phone: toStoredPhone(phone)!, name: name.trim() || undefined });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('couldNotAdd', { noun: singular }));
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{t('addNoun', { noun: singular })}</h3>
        <p className="muted" style={{ margin: '2px 0 0', fontSize: 13.5 }}>
          {t('addHint')}
        </p>
        <PhoneField
          id="add-client-phone"
          label={t('whatsappNumber')}
          required
          autoFocus
          value={phone}
          onChange={(v) => {
            setPhone(v);
            if (phoneError) setPhoneError(null);
          }}
          error={phoneError}
        />
        <div className="field">
          <label>
            <span>{t('nameOptional')}</span>
          </label>
          <input type="text" value={name} placeholder={t('namePlaceholder')} onChange={(e) => setName(e.target.value)} />
        </div>
        {error && <div role="alert" className="field-error" style={{ marginTop: 12 }}>{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            {t('cancel')}
          </button>
          <button type="button" className="btn" onClick={save} disabled={busy}>
            {busy ? t('adding') : t('addNoun', { noun: singular })}
          </button>
        </div>
      </div>
    </div>
  );
}
