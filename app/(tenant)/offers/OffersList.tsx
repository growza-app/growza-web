'use client';

import { useMemo, useState } from 'react';
import { formatDate } from '../lib/format';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, formatMoney, type Offer, type Service } from '../lib/api';
import { useFitRows } from '../lib/use-fit-rows';
import { Pagination } from '../components/Pagination';
import { IconFilter, IconSearch } from '../components/icons';

/** First paint only — the client immediately measures how many rows the screen actually fits. */
const INITIAL_PAGE_SIZE = 4;
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type Tab = 'all' | 'offers' | 'combos';
type StatusFilter = 'all' | 'active' | 'inactive';


/** Same rules the builder's own Step 2 summarizes — reused here so the list row and the wizard never describe an offer's visibility differently. */
function visibilitySummary(offer: Offer): string {
  if (offer.visibleWeekdays && offer.visibleWeekdays.length > 0) {
    return `Only on: ${offer.visibleWeekdays.map((d) => WEEKDAY_NAMES[d]).join(', ')}`;
  }
  if (offer.visibleFrom || offer.visibleUntil) {
    const from = offer.visibleFrom ? formatDate(offer.visibleFrom) : 'now';
    const until = offer.visibleUntil ? formatDate(offer.visibleUntil) : 'no end date';
    return `${from} → ${until}`;
  }
  return 'Always visible';
}

/**
 * Admin list of offers & combos. Creating/editing a combo happens in the
 * dedicated wizard (`ComboBuilder`, /offers/new and /offers/[id]/edit); a
 * plain offer's quick-create modal lives in `CreateOfferMenu`. This page
 * only handles browsing (search/tabs/filter/pagination) and the per-row
 * actions that don't need the wizard: edit link, toggling active, deleting.
 */
export function OffersList({ offers, services }: { offers: Offer[]; services: Service[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  // Greedy fit-paging: each page starts at an offset and shows however many
  // cards physically fit from there. Because a page of tall combos holds fewer
  // than a page of short offers, the page size can't be fixed — so we track the
  // start offset of each visited page and let `fitCount` (measured per page)
  // decide where the next page begins. This is what fills every page to the
  // bottom with no scrollbar and no wasted gap, regardless of card height.
  const [pageStarts, setPageStarts] = useState<number[]>([0]);
  const [pageIndex, setPageIndex] = useState(0);
  const filterSig = `${tab}|${status}|${search}`;

  const serviceById = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);

  const serviceNames = (ids: string[]): string =>
    ids.map((id) => serviceById.get(id)?.name).filter(Boolean).join(' + ');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return offers.filter((o) => {
      const isCombo = o.comboPriceMinor != null;
      if (tab === 'offers' && isCombo) return false;
      if (tab === 'combos' && !isCombo) return false;
      if (status === 'active' && !o.active) return false;
      if (status === 'inactive' && o.active) return false;
      if (q && !o.title.toLowerCase().includes(q) && !(o.description ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [offers, tab, status, search]);

  // Counted off the same predicate the tab itself applies, minus the tab
  // filter — so the number always equals what tapping it would show.
  const tabCounts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = offers.filter((o) => {
      if (status === 'active' && !o.active) return false;
      if (status === 'inactive' && o.active) return false;
      if (q && !o.title.toLowerCase().includes(q) && !(o.description ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
    return {
      all: base.length,
      offers: base.filter((o) => o.comboPriceMinor == null).length,
      combos: base.filter((o) => o.comboPriceMinor != null).length,
    };
  }, [offers, status, search]);

  // Clamp the start into range (the filter may have shrunk the list under us),
  // then let the fit hook measure how many cards fit from that offset. resetKey
  // forces a fresh measurement whenever the page or the filter changes.
  const start = Math.min(pageStarts[pageIndex] ?? 0, Math.max(0, filtered.length - 1));
  const { pageSize: fitCount, listRef } = useFitRows({
    fallback: INITIAL_PAGE_SIZE,
    resetKey: `${start}|${filterSig}`,
  });
  const pageItems = filtered.slice(start, start + fitCount);
  const shownTo = start + pageItems.length;
  const hasPrev = pageIndex > 0;
  const hasNext = shownTo < filtered.length;

  const goNext = () => {
    setPageStarts((s) => {
      const next = s.slice(0, pageIndex + 1);
      next[pageIndex + 1] = shownTo;
      return next;
    });
    setPageIndex((i) => i + 1);
  };
  const goPrev = () => setPageIndex((i) => Math.max(0, i - 1));

  const updateFilter = (fn: () => void) => {
    fn();
    // A new filter is a new list — jump back to the first screenful.
    setPageStarts([0]);
    setPageIndex(0);
  };

  const toggleActive = async (offer: Offer) => {
    setOpenMenuId(null);
    setBusyId(offer.id);
    try {
      await api.updateOffer(offer.id, { active: !offer.active });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  const removeOffer = async (offer: Offer) => {
    setOpenMenuId(null);
    if (!window.confirm(`Delete "${offer.title}"? This can't be undone.`)) return;
    setBusyId(offer.id);
    try {
      await api.deleteOffer(offer.id);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="card offers-card">
      <div className="offers-toolbar">
        <div className="tabs">
          {(['all', 'offers', 'combos'] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              className={`tab ${tab === t ? 'tab-active' : ''}`}
              onClick={() => updateFilter(() => setTab(t))}
            >
              {t === 'all' ? 'All' : t === 'offers' ? 'Offers' : 'Combos'} ({tabCounts[t]})
            </button>
          ))}
        </div>
        <label className="search-wrap">
          <IconSearch />
          <input
            type="text"
            className="search-input search-input-bare"
            placeholder="Search offers & combos…"
            value={search}
            onChange={(e) => updateFilter(() => setSearch(e.target.value))}
          />
        </label>
        <div className="dropdown-anchor">
          <button
            type="button"
            className={`btn btn-ghost filter-btn ${status !== 'all' ? 'filter-btn-on' : ''}`}
            onClick={() => setFilterOpen((v) => !v)}
            aria-label="Filter"
          >
            <span className="filter-btn-text">
              {status === 'all' ? 'Filter' : status === 'active' ? 'Active only' : 'Inactive only'} ⌄
            </span>
            <span className="filter-btn-icon">
              <IconFilter />
            </span>
          </button>
          {filterOpen && (
            <div className="dropdown-panel dropdown-panel-sm" onMouseLeave={() => setFilterOpen(false)}>
              {(['all', 'active', 'inactive'] as StatusFilter[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  className="dropdown-item dropdown-item-plain"
                  onClick={() => {
                    updateFilter(() => setStatus(s));
                    setFilterOpen(false);
                  }}
                >
                  {s === 'all' ? 'All statuses' : s === 'active' ? 'Active only' : 'Inactive only'}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty">{offers.length === 0 ? 'No offers yet — create one above.' : 'No offers match your search.'}</div>
      ) : (
        <>
          <div className="card-body offers-list" ref={listRef}>
            {pageItems.map((offer) => {
              const isCombo = offer.comboPriceMinor != null;
              const originalMinor = offer.serviceIds.reduce((sum, id) => sum + Number(serviceById.get(id)?.priceMinor ?? 0), 0);
              const comboMinor = Number(offer.comboPriceMinor ?? 0);
              const savingsMinor = originalMinor - comboMinor;
              const savingsPct = originalMinor > 0 ? Math.round((savingsMinor / originalMinor) * 100) : 0;

              return (
                <div
                  key={offer.id}
                  data-row
                  className={`offer-card-row ${selectedId === offer.id ? 'offer-card-row-selected' : ''}`}
                  onClick={() => setSelectedId(offer.id)}
                  onDoubleClick={() => router.push(`/offers/${offer.id}/edit`)}
                >
                  <div className="offer-row-head">
                    <div className={`offer-icon ${isCombo ? 'offer-icon-combo' : 'offer-icon-offer'}`}>{isCombo ? '🎁' : '🏷️'}</div>

                    <div className="offer-main">
                      <div className="offer-title-row">
                        <span className="offer-title">{offer.title}</span>
                        <span className={`chip ${isCombo ? 'chip-combo' : 'chip-offer'}`}>{isCombo ? 'Combo' : 'Offer'}</span>
                      </div>
                      {offer.serviceIds.length > 0 && <div className="muted offer-subtitle">{serviceNames(offer.serviceIds)}</div>}
                      {offer.description && <div className="muted offer-subtitle offer-desc">{offer.description}</div>}
                      {isCombo && (
                        <div className="offer-price-row">
                          <span className="offer-price">{formatMoney(offer.comboPriceMinor)}</span>
                          {savingsMinor > 0 && (
                            <>
                              <span className="chip chip-discount">{savingsPct}% OFF</span>
                              <span className="offer-strike">{formatMoney(String(originalMinor))}</span>
                              <span className="muted offer-savings">Save {formatMoney(String(savingsMinor))}</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="offer-row-foot">
                    <div className="offer-info-col">
                      <div className="offer-info-item">📅 {visibilitySummary(offer)}</div>
                    </div>

                    {/* A sibling of the stats rather than inside them: on desktop
                        this reads left-to-right as rules | toggle | counts, and on
                        mobile the grid can lift just the toggle up beside the title
                        without dragging the counts with it. */}
                    <label
                      className="switch offer-toggle"
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => e.stopPropagation()}
                      title={offer.active ? 'Turn off' : 'Turn on'}
                    >
                      <input
                        type="checkbox"
                        checked={offer.active}
                        disabled={busyId === offer.id}
                        onChange={() => toggleActive(offer)}
                      />
                      <span className="switch-track">
                        <span className="switch-thumb" />
                      </span>
                      <span className={offer.active ? 'switch-label-on' : 'switch-label-off'}>
                        {offer.active ? 'Active' : 'Inactive'}
                      </span>
                    </label>

                    <div className="offer-stats-col">
                      <div className="offer-stat">
                        <span className="offer-stat-value">{offer.bookingsCount}</span>
                        <span className="offer-stat-label">Bookings</span>
                      </div>
                      <div className="offer-stat">
                        <span className="offer-stat-value">{formatMoney(offer.revenueMinor)}</span>
                        <span className="offer-stat-label">Revenue</span>
                      </div>
                    </div>

                    <div className="dropdown-anchor" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="kebab-btn"
                        disabled={busyId === offer.id}
                        onClick={() => setOpenMenuId(openMenuId === offer.id ? null : offer.id)}
                        aria-label="Offer actions"
                      >
                        ⋮
                      </button>
                      {openMenuId === offer.id && (
                        <div className="dropdown-panel dropdown-panel-sm dropdown-panel-right" onMouseLeave={() => setOpenMenuId(null)}>
                          <Link href={`/offers/${offer.id}/edit`} className="dropdown-item dropdown-item-plain">
                            Edit
                          </Link>
                          <button type="button" className="dropdown-item dropdown-item-plain dropdown-item-danger" onClick={() => removeOffer(offer)}>
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <Pagination
            mode="cursor"
            from={filtered.length === 0 ? 0 : start + 1}
            to={shownTo}
            total={filtered.length}
            hasPrev={hasPrev}
            hasNext={hasNext}
            onPrev={goPrev}
            onNext={goNext}
            noun="offers"
          />
        </>
      )}
    </div>
  );
}
