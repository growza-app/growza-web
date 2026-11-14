'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pagination } from '../components/Pagination';
import { csvLines } from '../lib/csv';
import { formatDate, formatPhone, formatRecency, intlLocale } from '../lib/format';
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
import { useAnchoredPanel } from '../lib/useAnchoredPanel';
import { PageHeader } from '../components/PageHeader';
import { useAreas, useWritable } from '../components/SessionProvider';
import { PaginatedTable } from '../components/PaginatedTable';
import { PAGE_SIZE } from '../components/Pagination';
import {
  IconChevronDown,
  IconChevronRight,
  IconClose,
  IconCoins,
  IconPercent,
  IconPlus,
  IconRepeat,
  IconSearch,
  IconSort,
  IconStaff,
  IconUserPlus,
} from '../components/icons';
import { useTranslations, useLocale } from 'next-intl';
import { copy } from '../lib/copy';
import { pickNoun } from '../lib/nouns';
import { useNouns } from '../lib/use-nouns';
import { ClientProfileCard } from '../components/ClientProfileCard';
import { ClientCartoon } from '../components/ClientCartoon';
import { PhoneField } from '../components/PhoneField';
import { toStoredPhone } from '../lib/phone';
import { usePhoneProblem } from '../lib/use-phone-problem';
import { SEARCH_DEBOUNCE_MS, worthSearching } from '../lib/search-tuning';
import { autoFocusField } from '../../shared/a11y/soft-keyboard';
import { MAX_PAGE_SIZE } from '@growza-app/shared';
import { SearchClear } from '../components/SearchClear';
import { segmentRangeValues } from '../lib/segment-range';

/** "Today" → "today", to sit after "Came". Devanagari has no case, so Hindi passes through as it is. */
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

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
  branchId,
  branches,
  initialStats,
  initialPage,
  initialStatus,
  initialSort,
  initialDirection,
  initialOpenClientId,
  label,
}: {
  /** Jira GRW-392 — the branch whose clients these are; null is every branch (an owner on "All"). */
  branchId: string | null;
  /** The owner's branches, for the tabs and the branch on each row; empty for one branch or a pinned person. */
  branches: ReadonlyArray<{ id: string; name: string }>;
  initialStats: CustomerStats;
  initialPage: CustomerPage;
  /** From the URL (?status=at_risk, e.g. the Home "Needs attention" deep link) — defaults to 'all'. */
  initialStatus?: CustomerStatusFilter;
  /** From the URL (?sort=spent) — defaults to 'recent'. */
  initialSort?: CustomerSort;
  /** From the URL (?dir=asc) — defaults to 'desc'. Travels with `initialSort`. */
  initialDirection?: SortDirection;
  /** From the URL (?open=<id>) — a guest's orders go Back to here, with that guest's card open as they left it. */
  initialOpenClientId?: string;
  /** "Clients" for a salon, "Patients" for a clinic — from the vertical config. */
  label: string;
}) {
  const locale = useLocale();
  const t = useTranslations('customers');
  const tn = useTranslations('nouns');
  // Jira GRW-478 (U-3) — the vertical's word in English, the generic one in Hindi, as every other screen does.
  const lower = pickNoun(locale, label.toLowerCase(), tn('customers'));
  const singular = lower.replace(/s$/, '');
  // Restaurant QA 2026-10-24 — the column says who is listed in the business's own word (Guest, Client, Patient).
  const { Customer } = useNouns();
  // A list opened from a card is named by its card (owner, 13 Nov 2026): the Filter button says "Came back".
  const statusLabel = (s: Exclude<CustomerStatusFilter, 'all'>) =>
    s === 'never'
      ? t('statusNever')
      : s === 'lapsed'
        ? t('statusLapsed')
        : s === 'new'
          ? t('kpiNew')
          : s === 'returning'
            ? t('kpiReturning', { noun: lower })
            : t(`segments.${s}.label`);
  // Jira GRW-392 — on "All", each row says whose client it is: the same person at two branches is two rows.
  const branchName = new Map(branches.map((b) => [b.id, b.name]));
  const branchTag = (locationId: string | undefined) =>
    !branchId && locationId && branchName.has(locationId) ? <span className="chip cust-branch-chip">{branchName.get(locationId)}</span> : null;
  const chipOf = (segment: Customer['segment']) => {
    const chip = recencyChip(segment);
    return chip ? <span className={`chip ${chip.cls}`}>{t(chip.key)}</span> : null;
  };
  const [stats] = useState(initialStats);
  /*
   * Owner, 12 Nov 2026 — the reward points everyone holds, as a fifth figure.
   *
   * Null when the business runs no rewards (the API leaves the field out), and then no card is drawn. The short
   * form is for a phone, where four figures share the width and "1,24,500" does not fit an 52px cell: "1.2L".
   * It is `en-IN` in Hindi too — K, L and Cr are how the number is said here, and "12.5 हज़ार" is the long form
   * again.
   */
  const points =
    typeof stats.rewardPoints === 'number'
      ? {
          full: new Intl.NumberFormat(intlLocale(locale)).format(stats.rewardPoints),
          // Under ten thousand the whole number fits, and "1,494" is not "1.5K" to the person who owes them.
          short:
            Math.abs(stats.rewardPoints) < 10_000
              ? new Intl.NumberFormat(intlLocale(locale)).format(stats.rewardPoints)
              : new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(stats.rewardPoints),
        }
      : null;
  const [page, setPage] = useState(initialPage);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<CustomerStatusFilter>(initialStatus ?? 'all');
  // Owner's call (2026-10-04): on a phone the client bands fold away behind a button, as the
  // Bookings filters do. Open from the start when a band is already on, so a filter arriving in
  // the URL is never hidden behind a shut panel.
  const [segmentsOpen, setSegmentsOpen] = useState((initialStatus ?? 'all') !== 'all');
  /* The band that is on, taken from the list the card itself draws — so its key is one the words exist for. */
  const onSegment = stats.segments.find((seg) => seg.key === status) ?? null;
  const [sort, setSort] = useState<CustomerSort>(initialSort ?? 'recent');
  /** Jira GRW-433 — positioned against the viewport, and above the bottom nav rather than under it. */
  const closeFilter = useCallback(() => setFilterOpen(false), []);
  const [pageIndex, setPageIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterMenu = useAnchoredPanel(filterOpen, closeFilter);
  const searchParams = useSearchParams();
  // Which client's card is open. Null closes it; the list keeps its scroll
  // position because nothing navigates away.
  const [openClientId, setOpenClientId] = useState<string | null>(initialOpenClientId ?? null);
  // Which way the sorted column runs. Clicking the same header again flips it,
  // which is what makes "who spends least" reachable without a second control.
  const [direction, setDirection] = useState<SortDirection>(initialDirection ?? 'desc');
  // Jira GRW-556 (follow-up) — a business suspended for non-payment reads its clients and adds none.
  const writable = useWritable();
  // Jira GRW-610 — a business that takes no bookings has no "last booking" and no "visits" to list: absent, not zero.
  const bookingsOn = useAreas().bookings;
  /*
   * Owner, 2026-10-14 — Clients on a wide desk, as Services: the bands on the left, the list in the middle, the
   * client's card in place on the right. Decided by the window, not the device: the desktop tier (≥1101px) gets
   * the panels; a tablet keeps the paged table. Null until the width is known, so neither layout flashes first.
   */
  const [desk, setDesk] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1101px)');
    const apply = () => setDesk(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
  // ?add=1 (from the Home quick-actions panel) opens the sheet straight away
  // instead of landing here and requiring a second click. Not for a read-only business: the link would open a form
  // whose save the API refuses.
  const [adding, setAdding] = useState(() => writable && searchParams.get('add') === '1');
  // Fixed page size: the list scrolls within the page and a numbered footer
  // pages through it — the standard pattern for a potentially large list.
  const pageSize = PAGE_SIZE;
  // Skip the fetch on first render — the server already sent page 0.
  const primed = useRef(false);
  // What the list on screen was asked for. Export reads this, so the file is the list, not the half-typed box.
  const shown = useRef({ search, status, sort, direction, location: branchId });

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
    /*
     * Jira GRW-422 — a term too short to be worth asking about is skipped, but an
     * EMPTY box is not short, it is "everyone", and must still be fetched (BR-01).
     * Before this, one keystroke fired a request and so did clearing the box.
     */
    if (!worthSearching(search)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    const asked = { search, status, sort, direction, location: branchId };
    // Debounced so typing a phone number doesn't fire a request per digit.
    const timer = setTimeout(() => {
      api
        .customers({ ...asked, limit: pageSize, offset: pageIndex * pageSize })
        .then((r) => {
          if (cancelled) return;
          shown.current = asked;
          setPage(r);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, status, sort, direction, pageIndex, pageSize, branchId]);

  const refresh = () => {
    api.customers({ search, status, sort, direction, limit: pageSize, offset: pageIndex * pageSize, location: branchId }).then(setPage);
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

  /*
   * Owner, 13 Nov 2026 — on a laptop the right third sat empty until a row was clicked. The first person on
   * the list opens there by default. Three things it must not do: reopen a card the owner closed by hand,
   * replace a person the owner picked, or follow the window down to a tablet, where the same id would open
   * as a sheet over the list nobody asked for.
   */
  const autoOpened = useRef<string | null>(null);
  const deskClosed = useRef(false);
  const firstId = visibleRows[0]?.id ?? null;
  useEffect(() => {
    if (desk === null) return;
    const mine = openClientId !== null && openClientId === autoOpened.current;
    if (!desk || !firstId) {
      if (mine) {
        autoOpened.current = null;
        setOpenClientId(null);
      }
      return;
    }
    if (deskClosed.current || firstId === openClientId) return;
    if (openClientId !== null && !mine) return;
    autoOpened.current = firstId;
    setOpenClientId(firstId);
  }, [desk, firstId, openClientId]);
  const closeDeskCard = () => {
    deskClosed.current = true;
    setOpenClientId(null);
  };

  /*
   * Owner, 13 Nov 2026 — Export wrote the ten rows on screen and called it the list. It now asks for every
   * person the list holds — the same search, group, order and branch the screen last drew (`shown`, not the
   * box: one typed letter is not searched for, and must not change the file) — a hundred at a time, which is
   * the API's own page limit.
   */
  const [exporting, setExporting] = useState(false);
  const [exportFailed, setExportFailed] = useState(false);
  const exportBusy = useRef(false);
  const exportCsv = async () => {
    if (exportBusy.current) return;
    exportBusy.current = true;
    setExporting(true);
    setExportFailed(false);
    try {
      const everyone = new Map<string, CustomerPage['rows'][number]>();
      for (let offset = 0; ; ) {
        const part = await api.customers({ ...shown.current, limit: MAX_PAGE_SIZE, offset });
        // By id: someone added between two requests shifts the pages, and would be written twice.
        for (const c of part.rows) everyone.set(c.id, c);
        offset += part.rows.length;
        if (part.rows.length === 0 || offset >= part.total) break;
      }
      writeCsv([...everyone.values()]);
    } catch {
      setExportFailed(true);
    } finally {
      exportBusy.current = false;
      setExporting(false);
    }
  };
  const writeCsv = (people: CustomerPage['rows']) => {
    const header = ['Name', 'Phone', 'Last booking', 'Last service', copy.clients.visitsCsvHeader, 'Total spent', 'Last seen'];
    const rows = people.map((c) => [
      c.name ?? '',
      formatPhone(c.waPhone),
      c.lastBookingAt ? formatDate(c.lastBookingAt, undefined, locale) : '',
      c.lastServiceName ?? '',
      String(c.totalBookings),
      formatMoney(c.totalSpentMinor),
      // The exported band is the row's own, so a spreadsheet and the screen
      // cannot disagree about which clients are slipping.
      // Jira GRW-478 (U-15) — the band's own words, as the screen says it; the raw code (`at_risk`) read as a bug.
      `${formatRecency(c.lastBookingAt, undefined, locale)} (${statusLabel(c.segment)})`,
    ]);
    // Jira GRW-476 — through the shared writer: a client's own name could be a formula.
    const csv = csvLines([header, ...rows]);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'clients.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const tableHead = (
    <tr>
      <SortableTh col="name" label={t('colCustomer', { customer: Customer })} sort={sort} direction={direction} onSort={setSortColumn} />
      <th>{t('colPhone')}</th>
      {bookingsOn ? <th>{t('colLastBooking')}</th> : null}
      {bookingsOn ? <SortableTh col="visits" label={t('visitsColumn')} sort={sort} direction={direction} onSort={setSortColumn} numeric /> : null}
      <SortableTh col="spent" label={t('colTotalSpent')} sort={sort} direction={direction} onSort={setSortColumn} numeric />
      <SortableTh col="recent" label={t('colLastSeen')} sort={sort} direction={direction} onSort={setSortColumn} />
    </tr>
  );
  /* The desk's row and the phone's are the same `<tr>`: on a desk a click also highlights it. */
  // Desktop: a scannable table. Mobile: the same rows as cards — a 6-column table can't be read on a phone
  // without pinch-zoom.
  const tableRows = visibleRows.map((c) => (
      <tr key={c.id} data-row className={`cust-row-click${openClientId === c.id ? ' is-selected' : ''}`} aria-selected={openClientId === c.id || undefined} onClick={() => setOpenClientId(c.id)}>
        <td>
          <div className="cust-name-cell">
            <ClientCartoon id={c.id} className="avatar" />
            <span style={{ fontWeight: 620 }}>{c.name ?? t('unnamed')}</span>
            {branchTag(c.locationId)}
          </div>
        </td>
        <td>
          {/* GRW-199 — a client recorded at the desk may have no number: a dash, not an empty cell. */}
          {/* Owner, 9 Nov 2026 — the number is read here; WhatsApp is in the card the row opens, not a link a stray tap fires. */}
          {c.waPhone ? (
            <span className="cust-phone">{formatPhone(c.waPhone)}</span>
          ) : (
            <span className="muted">—</span>
          )}
        </td>
        {bookingsOn ? (
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
        ) : null}
        {bookingsOn ? <td>{c.totalBookings}</td> : null}
        <td>{formatMoney(c.totalSpentMinor)}</td>
        {/* Recency, not a constant. "Active" was true for every row in
            the table, so the column carried no signal at all; how long
            ago someone last came in does. */}
        <td>
          <div className="cust-recency">
            <span>{formatRecency(c.lastBookingAt, undefined, locale)}</span>
            {/* Owner, 13 Nov 2026 — not when a group is picked: every row would repeat the one word. */}
            {status === 'all' ? chipOf(c.segment) : null}
          </div>
        </td>
      </tr>
  ));

  const addButton = writable ? (
    <button type="button" className="btn" onClick={() => setAdding(true)}>
      <IconPlus /> {t('addNoun', { noun: singular })}
    </button>
  ) : undefined;
  // Owner, 13 Nov 2026 — "All" and "Never came" are gone from here as from the phone's Filter: the Total
  // figure is the way back to everyone, and a picked band, tapped again, lets go.
  const bands = ['active', 'due', 'at_risk', 'inactive'] as const;
  const bandCount = (s: (typeof bands)[number]) => stats.segments.find((seg) => seg.key === s)?.count ?? null;
  const pickBand = (s: CustomerStatusFilter) => {
    setStatus(s);
    // A band of people who have drifted is a call list, so it opens highest-spend-first.
    setSort(s === 'all' || s === 'active' ? 'recent' : 'spent');
    setDirection('desc');
    setPageIndex(0);
  };
  /*
   * Owner, 13 Nov 2026 — "make top cards clickable so they will filter the data".
   *
   * A card lists the people it counted: the API runs the card's own predicate for `new` and `returning`, so
   * the figure on the card and the total under the list are one number. "Total" is everyone, which is the
   * filter taken off. Tapping the card that is on takes it off again.
   */
  const pickCard = (s: 'all' | 'new' | 'returning') => {
    setStatus(status === s ? 'all' : s);
    setSort('recent');
    setDirection('desc');
    setPageIndex(0);
  };

  if (desk === null) {
    return (
      <>
        <PageHeader title={label} menu subtitle={t('subtitle', { noun: lower })} actions={addButton} />
        <div className="page-body" aria-busy="true" />
      </>
    );
  }

  if (desk) {
    return (
      <>
        <PageHeader title={label} menu subtitle={t('subtitle', { noun: lower })} actions={addButton} />
        <div className="page-body cust-desk">
          {/* Emerald v3 (owner, 14 Nov 2026: "fix all") — the figures are a row of tiles over the list, as on Home,
              not a 2×3 block squeezed into the left column. */}
          <dl className="cust-desk-kpis">
            {/* The figure is the button, stretched over its whole box (79-desk-clients.css): still a list of
                terms and values to a screen reader, and a tap anywhere on the box to everyone else. */}
            {(
              [
                // Owner, 14 Nov 2026 ("can we add more info") — each figure carries one line that explains it, from
                // the stats this page already has. Total also shows how its people split across the four bands.
                {
                  card: 'all',
                  label: t('kpiTotal', { noun: lower }),
                  value: String(stats.total),
                  note: neverPct !== null ? t('neverVisitedShort', { count: stats.neverVisited, pct: neverPct }) : t('kpiTotalSub'),
                },
                {
                  card: 'new',
                  label: t('kpiNew'),
                  value: String(stats.newThisMonth),
                  note: t('kpiNewPct', { pct: stats.total > 0 ? Math.round((stats.newThisMonth / stats.total) * 100) : 0, noun: lower }),
                },
                { card: 'returning', label: t('kpiReturning', { noun: lower }), value: String(stats.returning), note: t('kpiReturningSub') },
                {
                  card: 'returning',
                  label: t('kpiRepeat'),
                  value: `${stats.repeatRatePct}%`,
                  note: t('kpiRepeatOf', { returning: stats.returning, total: stats.total, noun: lower }),
                },
              ] as const
            ).map((figure) => (
              <div key={figure.label} className={figure.card !== 'all' && status === figure.card ? 'is-on' : undefined}>
                <dt>{figure.label}</dt>
                <dd>
                  <button
                    type="button"
                    className="cust-desk-kpi-tap"
                    aria-label={`${figure.label}: ${figure.value}`}
                    aria-pressed={figure.card === 'all' ? undefined : status === figure.card}
                    onClick={() => pickCard(figure.card)}
                  >
                    {figure.value}
                  </button>
                </dd>
                <dd className="cust-desk-kpi-note">{figure.note}</dd>
                {figure.card === 'all' && stats.total > 0 ? (
                  <dd className="cust-desk-kpi-bands" aria-hidden="true">
                    {bands.map((b) => {
                      const n = bandCount(b) ?? 0;
                      return n > 0 ? <span key={b} style={{ flexGrow: n, background: SEGMENT_TONE[b] }} /> : null;
                    })}
                    {stats.neverVisited > 0 ? <span className="is-never" style={{ flexGrow: stats.neverVisited }} /> : null}
                  </dd>
                ) : null}
              </div>
            ))}
            {/* Flat, where the others are raised: raised means "tap me", and the points open nothing. */}
            {points && (
              <div className="cust-desk-kpi-flat">
                <dt>{t('kpiPoints')}</dt>
                <dd>{points.full}</dd>
                <dd className="cust-desk-kpi-note">{t('kpiPointsSub', { noun: lower })}</dd>
              </div>
            )}
          </dl>
          <div className="pf-wide-grid cust-desk-grid">
            <aside className="pf-wide-left cust-desk-left" aria-label={t('segmentsTitle', { noun: lower })}>
              <h2 className="pf-wide-h">{t('segmentsTitle', { noun: lower })}</h2>
              <ul className="cust-desk-bands">
                {bands.map((s) => {
                  const on = status === s;
                  const n = bandCount(s);
                  const seg = stats.segments.find((x) => x.key === s);
                  return (
                    <li key={s}>
                      <button
                        type="button"
                        className={`cust-desk-band ${on ? 'is-on' : ''}`}
                        aria-pressed={on}
                        style={SEGMENT_TONE[s] ? { ['--seg' as string]: SEGMENT_TONE[s] } : undefined}
                        title={seg ? `${t(`segments.${seg.key}.label`)} · ${t(`segments.${seg.key}.range`, segmentRangeValues(seg.key, seg.range))}` : undefined}
                        onClick={() => pickBand(on ? 'all' : s)}
                      >
                        <span className="cust-desk-band-name">
                          {SEGMENT_TONE[s] && <span className="cust-segment-dot" />}
                          {statusLabel(s)}
                        </span>
                        {n !== null && <span className="cust-desk-n">{n}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </aside>

            <section className="pf-wide-mid cust-desk-mid" aria-label={label}>
              <div className="cust-desk-tools">
                <label className="pf-wide-search">
                  <IconSearch />
                  <input
                    type="search"
                    placeholder={t('searchPlaceholder', { noun: lower })}
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPageIndex(0);
                    }}
                    aria-label={t('searchPlaceholder', { noun: lower })}
                    autoComplete="off"
                  />
                  <SearchClear value={search} onClear={() => { setSearch(''); setPageIndex(0); }} />
                </label>
                <button type="button" className="btn btn-ghost" onClick={() => void exportCsv()} disabled={page.rows.length === 0 || exporting}>
                  {exporting ? t('exporting') : t('export')}
                </button>
              </div>
              {exportFailed && <p className="field-error cust-export-failed" role="alert">{t('exportFailed')}</p>}
              <div className="card cust-desk-table">
                {page.rows.length === 0 ? (
                  <div className="empty">{loading ? t('loading') : search.trim() ? t('noMatch', { noun: lower }) : t('noneYet', { noun: lower })}</div>
                ) : (
                  <div className="table-scroll">
                    <table>
                      <thead>{tableHead}</thead>
                      <tbody>{tableRows}</tbody>
                    </table>
                  </div>
                )}
                {/* Still ten a page: the list is the server's, and a numbered footer is how a long one reads. */}
                <Pagination page={pageIndex + 1} total={page.total} pageSize={pageSize} noun={lower} onChange={(p) => setPageIndex(p - 1)} />
              </div>
            </section>

            <aside className="pf-wide-right cust-desk-right" aria-label={singular}>
              {openClientId ? (
                <ClientProfileCard clientId={openClientId} inline onClose={closeDeskCard} />
              ) : (
                <div className="cust-desk-nothing">
                  <p>{t('deskPick', { noun: singular })}</p>
                </div>
              )}
            </aside>
          </div>
          {adding && (
            <AddCustomerModal singular={singular} branchId={branchId} branches={branches} onClose={() => setAdding(false)} onSaved={refresh} />
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={label}
        menu
        subtitle={t('subtitle', { noun: lower })}
        actions={
          writable ? (
            <button type="button" className="btn" onClick={() => setAdding(true)}>
              {/* A real icon, not a typed "+". GRW-30: on a phone the header
                  action collapses to its icon, and a button whose plus is a
                  character has nothing left to show. */}
              <IconPlus /> {t('addNoun', { noun: singular })}
            </button>
          ) : undefined
        }
      />
      <div className="page-body table-fit cust-fit">
        <div className={points ? 'cust-kpis cust-kpis-points' : 'cust-kpis'}>
          {/* Four distinct facts. Previously tile 1's subtitle repeated tile 2's
              value, and tile 3's subtitle repeated tile 4's — so half the row
              restated the other half and the numbers read as contradicting
              each other. */}
          {/* Owner, 13 Nov 2026 — a card, tapped, lists the people it counted. The points are a figure, not a list. */}
          <Kpi icon={<IconStaff />} label={t('kpiTotal', { noun: lower })} value={String(stats.total)} sub={t('kpiTotalSub')} onClick={() => pickCard('all')} />
          <Kpi icon={<IconUserPlus />} label={t('kpiNew')} value={String(stats.newThisMonth)} sub={t('kpiNewSub')} onClick={() => pickCard('new')} pressed={status === 'new'} />
          {/* On a phone the points take this card's place (owner, 12 Nov 2026): "% came back" already says it,
              and opens the same list. */}
          <Kpi className="cust-kpi-returning" icon={<IconRepeat />} label={t('kpiReturning', { noun: lower })} value={String(stats.returning)} sub={t('kpiReturningSub')} onClick={() => pickCard('returning')} pressed={status === 'returning'} />
          <Kpi icon={<IconPercent />} label={t('kpiRepeat')} value={`${stats.repeatRatePct}%`} sub={t('kpiRepeatSub', { noun: lower })} onClick={() => pickCard('returning')} pressed={status === 'returning'} />
          {points && <Kpi icon={<IconCoins />} label={t('kpiPoints')} value={points.full} short={points.short} sub={t('kpiPointsSub', { noun: lower })} className="cust-kpi-flat" />}
        </div>

        {/* The cards are also the filter. Their counts come back with the
            page's own stats, from the same predicate the filter runs, so a
            card reading "462 Slipping away" cannot show a different number of
            rows than it counted (platform/segments.ts). */}
        {/*
          On a phone the bands fold away (owner, 2026-10-04).

          Four KPI tiles and then four bands with a two-line note above them is eight numbers and
          about 420px before the first client. They cannot move BELOW the list — tapping a band
          filters it, and a filter under its own results is a trick — so they fold, the way the
          Bookings filters do, and the button names the band that is on.
        */}
        <button
          type="button"
          className={`cust-segments-toggle mobile-only ${segmentsOpen ? 'is-open' : ''}`}
          aria-expanded={segmentsOpen}
          aria-controls="cust-segments"
          onClick={() => setSegmentsOpen((v) => !v)}
        >
          <IconPercent />
          <span>{t('segmentsTitle', { noun: lower })}</span>
          {onSegment && <span className="cust-segments-on">{t(`segments.${onSegment.key}.label`)}</span>}
          <IconChevronDown />
        </button>
        <div id="cust-segments" className={`card cust-segments ${segmentsOpen ? 'is-open' : ''}`}>
          <div className="cust-segments-head">
            <h2>{t('segmentsTitle', { noun: lower })}</h2>
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
              {/* Owner, 13 Nov 2026 — the words that count the people who never came open their list. */}
              <span className="cust-aside-full">
                {t('segmentsHint')}
                {neverPct !== null && ' · '}
                {neverPct !== null && (
                  <button type="button" className="cust-never-link" aria-pressed={status === 'never'} onClick={() => pickBand(status === 'never' ? 'all' : 'never')}>
                    {t('neverVisited', { count: stats.neverVisited, pct: neverPct })}
                  </button>
                )}
              </span>
              {neverPct !== null && (
                <span className="cust-aside-brief">
                  <button type="button" className="cust-never-link" aria-pressed={status === 'never'} onClick={() => pickBand(status === 'never' ? 'all' : 'never')}>
                    {t('neverVisitedShort', { count: stats.neverVisited, pct: neverPct })}
                  </button>
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
              const words = { label: t(`segments.${seg.key}.label`), range: t(`segments.${seg.key}.range`, segmentRangeValues(seg.key, seg.range)) };
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

        <div className="card cust-list-card">
          <div className="offers-toolbar cust-toolbar">
            <label className="search-wrap">
              <IconSearch />
              <input
                type="search"
                className="search-input search-input-bare"
                placeholder={t('searchPlaceholder', { noun: lower })}
                aria-label={t('searchPlaceholder', { noun: lower })}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPageIndex(0);
                }}
              />
              <SearchClear value={search} onClear={() => { setSearch(''); setPageIndex(0); }} />
            </label>
            <div className="dropdown-anchor" ref={filterMenu.anchorRef}>
              {/* The line under the toolbar names the list that is on, so the button keeps one word and one width. */}
              <button type="button" className={`btn btn-ghost${status === 'all' ? '' : ' is-on'}`} aria-haspopup="menu" aria-expanded={filterOpen} onClick={() => setFilterOpen((v) => !v)}>
                {t('filter')} ⌄
              </button>
              {filterOpen && (
                <div
                  className="dropdown-panel dropdown-panel-sm"
                  role="menu"
                  ref={filterMenu.panelRef}
                  style={filterMenu.style}
                  onMouseLeave={closeFilter}
                >
                  {/*
                    Owner, 12 Nov 2026 — the groups are this menu on a phone too, beside Export, in place of the row
                    of pills above the list. Each line keeps what its pill said: the group's colour and how many.
                  */}
                  {/*
                    Owner, 13 Nov 2026 — "All" and "Never came" are gone from here: the Total card is everyone,
                    and a group that is on comes off when it is tapped again.
                  */}
                  {stats.segments.map((group) => (
                    <button
                      key={group.key}
                      type="button"
                      role="menuitemradio"
                      aria-checked={status === group.key}
                      className="dropdown-item dropdown-item-plain cust-filter-item"
                      style={{ ['--seg' as string]: SEGMENT_TONE[group.key] }}
                      onClick={() => {
                        // A band of people who have drifted is a call list, so
                        // it opens highest-spend-first. Anything else goes back
                        // to most-recent.
                        pickBand(status === group.key ? 'all' : group.key);
                        setFilterOpen(false);
                      }}
                    >
                      <span>{t(`segments.${group.key}.label`)}</span>
                      <b>{group.count}</b>
                    </button>
                  ))}
                  {/*
                    Owner, 12 Nov 2026 — "who has spent the most". A laptop sorts by clicking a column; a phone has
                    no columns, so the order lives here, under the groups, and Filter and Export stay two buttons.
                    Picking a group above still sets its own order (a drifted band opens biggest spender first).
                  */}
                  <span className="dropdown-sep" aria-hidden="true" />
                  <div role="group" aria-labelledby="cust-order-head">
                    <div className="cust-filter-head" id="cust-order-head">{t('showFirst')}</div>
                    {(
                      [
                        { key: 'recent', direction: 'desc', label: t('orderRecent') },
                        { key: 'spent', direction: 'desc', label: t('orderSpent') },
                        { key: 'name', direction: 'asc', label: t('orderName') },
                      ] as const
                    ).map((order) => (
                      <button
                        key={order.key}
                        type="button"
                        role="menuitemradio"
                        aria-checked={sort === order.key && direction === order.direction}
                        className="dropdown-item dropdown-item-plain cust-filter-item cust-order-item"
                        onClick={() => {
                          setSort(order.key);
                          setDirection(order.direction);
                          setPageIndex(0);
                          setFilterOpen(false);
                        }}
                      >
                        <span>{order.label}</span>
                      </button>
                    ))}
                  </div>
                  {/* Owner, 13 Nov 2026 — on a phone Export is the last line here, so Search and Filter share one row. */}
                  <span className="dropdown-sep cust-filter-export-sep" aria-hidden="true" />
                  <button
                    type="button"
                    role="menuitem"
                    className="dropdown-item dropdown-item-plain cust-filter-item cust-filter-export"
                    disabled={page.rows.length === 0 || exporting}
                    onClick={() => {
                      void exportCsv();
                      setFilterOpen(false);
                    }}
                  >
                    <span>{t('export')}</span>
                  </button>
                </div>
              )}
            </div>
            <button type="button" className="btn btn-ghost" onClick={() => void exportCsv()} disabled={page.rows.length === 0 || exporting}>
              {exporting ? t('exporting') : t('export')}
            </button>
          </div>
          {/* On a phone the menu has shut by the time the file is made, so both the wait and a failure say so here. */}
          {exporting && <p className="cust-export-wait" role="status">{t('exporting')}</p>}
          {exportFailed && <p className="field-error cust-export-failed" role="alert">{t('exportFailed')}</p>}
          {/* How many, of which list, and the way back — a phone has no panel above saying which group is on. */}
          {(status !== 'all' || search.trim() !== '') && (
            <p className="cust-list-count" aria-live="polite">
              <span>
                {t('listCount', { count: page.total, one: singular, many: lower })}
                {status !== 'all' ? ` · ${statusLabel(status)}` : ''}
              </span>
              {status !== 'all' && (
                <button type="button" className="cust-list-clear" aria-label={t('clearFilter')} onClick={() => pickBand('all')}>
                  <IconClose />
                </button>
              )}
            </p>
          )}

          {page.rows.length === 0 ? (
            <div className="empty">{loading ? t('loading') : search.trim() ? t('noMatch', { noun: lower }) : t('noneYet', { noun: lower })}</div>
          ) : (
            <PaginatedTable
              noun={lower}
              pageSize={pageSize}
              page={pageIndex + 1}
              total={page.total}
              onPageChange={(p) => setPageIndex(p - 1)}
              head={tableHead}
              cards={visibleRows.map((c) => {
                /*
                 * Owner, 9 Nov 2026 — one clean row per person, the same height every time: who and what they have
                 * spent on top, the facts in grey under it, a › to say the row opens. The number is TEXT: it was a
                 * WhatsApp link, and a thumb scrolling the list opened chats nobody meant. WhatsApp (and Call) are in
                 * the card the row opens.
                 */
                const facts = [
                  c.waPhone ? formatPhone(c.waPhone) : null,
                  // "Came 2 days ago", as the laptop's column says it — a bare "10 Nov" did not say what happened then.
                  c.lastBookingAt ? t('cameWhen', { when: lowerFirst(formatRecency(c.lastBookingAt, undefined, locale)) }) : null,
                  bookingsOn ? t('visitCount', { count: c.totalBookings }) : null,
                ].filter((x): x is string => Boolean(x));
                return (
                  <div
                    className="cust-card cust-row-click"
                    key={c.id}
                    style={SEGMENT_TONE[c.segment] ? { ['--seg' as string]: SEGMENT_TONE[c.segment] } : undefined}
                    data-row
                    role="button"
                    tabIndex={0}
                    aria-label={`${c.name ?? t('unnamed')}, ${t('spent', { amount: formatMoney(c.totalSpentMinor) })}`}
                    onClick={() => setOpenClientId(c.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setOpenClientId(c.id);
                      }
                    }}
                  >
                    <ClientCartoon id={c.id} className="cust-avatar" />
                    <span className="cust-card-body">
                      <span className="cust-card-top">
                        <span className="cust-card-name">{c.name ?? t('unnamed')}</span>
                        <span className="cust-card-amt">{formatMoney(c.totalSpentMinor)}</span>
                      </span>
                      <span className="cust-card-sub">
                        {/* The group's word, beside its colour — but not when the pill above already names it for every row. */}
                        {status === 'all' ? chipOf(c.segment) : null}
                        {branchTag(c.locationId)}
                        <span className="cust-card-facts">{facts.join(' · ')}</span>
                      </span>
                    </span>
                    <IconChevronRight />
                  </div>
                );
              })}
            >
              {tableRows}
            </PaginatedTable>
          )}
        </div>
      </div>

      {adding && (
        <AddCustomerModal singular={singular} branchId={branchId} branches={branches} onClose={() => setAdding(false)} onSaved={refresh} />
      )}
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
function Kpi({
  label,
  value,
  short,
  sub,
  icon,
  className,
  onClick,
  pressed,
}: {
  label: string;
  value: string;
  short?: string;
  sub: string;
  icon: ReactNode;
  className?: string;
  /** Given, the card is a button that lists the people it counted (owner, 13 Nov 2026). */
  onClick?: () => void;
  /** Whether the list below is this card's. Left out for "Total", which takes a filter off and is never "on". */
  pressed?: boolean;
}) {
  const classes = `cust-kpi${className ? ` ${className}` : ''}${onClick ? ' cust-kpi-tap' : ''}`;
  const inside = (
    <>
      <span className="cust-kpi-icon">{icon}</span>
      {/* Spans, not divs: inside a button only phrasing content is valid. The sheet lays them out as blocks. */}
      <span className="cust-kpi-text">
        <span className="cust-kpi-label">{label}</span>
        {short && short !== value ? (
          // Two spellings of one number: the whole of it where there is room, the short one on a phone. A screen
          // reader is given the whole one only.
          <span className="cust-kpi-value" aria-label={value}>
            <span className="cust-kpi-full" aria-hidden="true">{value}</span>
            <span className="cust-kpi-short" aria-hidden="true">{short}</span>
          </span>
        ) : (
          <span className="cust-kpi-value">{value}</span>
        )}
      </span>
    </>
  );
  // `sub` becomes the tooltip rather than a third line. Two of the four
  // restated their own label ("New this month" / "First seen this month");
  // the two that genuinely defined something still do, on hover, without
  // costing every screen a row of the list.
  return onClick ? (
    <button type="button" className={classes} title={sub} aria-pressed={pressed} onClick={onClick}>
      {inside}
    </button>
  ) : (
    <div className={classes} title={sub}>
      {inside}
    </div>
  );
}

function AddCustomerModal({
  singular,
  branchId,
  branches,
  onClose,
  onSaved,
}: {
  singular: string;
  branchId: string | null;
  branches: ReadonlyArray<{ id: string; name: string }>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const checkPhone = usePhoneProblem();
  const t = useTranslations('customers');
  // Jira GRW-392 — a client is a client OF a branch: the one on screen, or on "All" the one picked here.
  const [atBranch, setAtBranch] = useState<string | null>(branchId ?? branches[0]?.id ?? null);
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
      await api.createCustomer({ phone: toStoredPhone(phone)!, name: name.trim() || undefined, ...(atBranch ? { locationId: atBranch } : {}) });
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
        <p className="muted" style={{ margin: '2px 0 0', fontSize: 13 }}>
          {t('addHint')}
        </p>
        <PhoneField
          id="add-client-phone"
          label={t('whatsappNumber')}
          required
          autoFocus={autoFocusField()}
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
        {!branchId && branches.length > 1 && (
          <div className="field">
            <label htmlFor="add-client-branch">
              <span>{t('whichBranch')}</span>
            </label>
            <select id="add-client-branch" value={atBranch ?? ''} onChange={(e) => setAtBranch(e.target.value)}>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}
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
