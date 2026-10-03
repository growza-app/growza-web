'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState, useCallback } from 'react';
import { formatDate } from '../lib/format';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError, BookingConflictError, formatMoney, type Offer, type Service } from '../lib/api';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useAnchoredPanel } from '../lib/useAnchoredPanel';
import { useFitRows } from '../lib/use-fit-rows';
import { Pagination } from '../components/Pagination';
import { IconFilter, IconSearch } from '../components/icons';
import { weekdayNames } from '../lib/weekday-names';
import { useBranch } from '../components/BranchProvider';

/** First paint only — the client immediately measures how many rows the screen actually fits. */
const INITIAL_PAGE_SIZE = 4;

type StatusFilter = 'all' | 'active' | 'inactive';


/** Same rules the builder's own Step 2 summarizes — reused here so the list row and the wizard never describe an offer's visibility differently. */
function visibilitySummary(offer: Offer, t: ReturnType<typeof useTranslations<'offers.list'>>, locale: string): string {
  if (offer.visibleWeekdays && offer.visibleWeekdays.length > 0) {
    return t('onlyOn', { days: offer.visibleWeekdays.map((d) => weekdayNames(locale).short[d]).join(', ') });
  }
  if (offer.visibleFrom || offer.visibleUntil) {
    const from = offer.visibleFrom ? formatDate(offer.visibleFrom, undefined, locale) : t('now');
    const until = offer.visibleUntil ? formatDate(offer.visibleUntil, undefined, locale) : t('noEnd');
    return t('window', { from, until });
  }
  return t('always');
}

/**
 * Admin list of announcements — the wording-only offers a customer reads.
 *
 * Jira GRW-438 — packages left this screen for `/packages`. They were the other half of it, and the two
 * halves had nothing in common from the owner's side: an announcement is a line of text with a date window,
 * a package is a priced bundle that is booked, allocated, checked out and reported on. The tabs that used to
 * separate them here are gone with them, because one tab is not a choice.
 *
 * Creating one is the quick modal in `CreateOfferMenu`; this page handles browsing (search, status filter,
 * paging) and the per-row actions: edit, toggling active, deleting.
 */
export function OffersList({ offers, services }: { offers: Offer[]; services: Service[] }) {
  const t = useTranslations('offers.list');
  const tn = useTranslations('nouns');
  const locale = useLocale();
  const router = useRouter();
  // Jira GRW-381 — on "All branches" each offer says which branch runs it: the same offer at two branches is two rows.
  const branchContext = useBranch();
  const branchTag = (locationId: string | undefined) => {
    if (!branchContext.multi || branchContext.choice || !locationId) return null;
    const name = branchContext.branches.find((b) => b.id === locationId)?.name;
    return name ? <span className="chip offer-branch-chip">{name}</span> : null;
  };
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  /** Jira GRW-435 — the offer being confirmed, and why the last attempt was refused. */
  const [confirmDelete, setConfirmDelete] = useState<Offer | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  // Greedy fit-paging: each page starts at an offset and shows however many
  // cards physically fit from there. Because a card with a description is taller
  // than one without, the page size can't be fixed — so we track the
  // start offset of each visited page and let `fitCount` (measured per page)
  // decide where the next page begins. This is what fills every page to the
  // bottom with no scrollbar and no wasted gap, regardless of card height.
  const [pageStarts, setPageStarts] = useState<number[]>([0]);
  const [pageIndex, setPageIndex] = useState(0);
  const filterSig = `${status}|${search}`;

  const serviceById = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);

  const serviceNames = (ids: string[]): string =>
    ids.map((id) => serviceById.get(id)?.name).filter(Boolean).join(' + ');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return offers.filter((o) => {
      if (status === 'active' && !o.active) return false;
      if (status === 'inactive' && o.active) return false;
      if (q && !o.title.toLowerCase().includes(q) && !(o.description ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
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

  /**
   * Jira GRW-433 — the menu is positioned against the VIEWPORT, so the card's `overflow: hidden` cannot cut
   * Delete in half any more. One hook for the list because only one menu is ever open.
   */
  const closeMenu = useCallback(() => setOpenMenuId(null), []);
  const menu = useAnchoredPanel(openMenuId !== null, closeMenu);

  const askToRemove = (offer: Offer) => {
    setOpenMenuId(null);
    setDeleteError(null);
    setConfirmDelete(offer);
  };

  /**
   * Jira GRW-435 — this used to be a `window.confirm` followed by `try/finally` with no `catch`.
   *
   * The missing `catch` is the part that mattered. `DELETE /offers/:id` answers 409 with a sentence written for
   * the owner — "Somebody is waiting for this right now" (GRW-434) — and the rejection was swallowed whole: the
   * spinner stopped, the row stayed, and the owner was told nothing. A combo that cannot be deleted yet and a
   * combo whose delete button is broken looked identical, which is why it was reported as the latter.
   *
   * So a refusal keeps the dialog open and shows what the API said. Only a failure we have no words for falls
   * back to the generic message.
   */
  const doRemove = async (offer: Offer) => {
    setBusyId(offer.id);
    setDeleteError(null);
    try {
      await api.deleteOffer(offer.id);
      setConfirmDelete(null);
      router.refresh();
    } catch (err) {
      /*
       * Both arms are needed, and the first is the one that matters here: `send()` turns EVERY 409 into a
       * `BookingConflictError`, which extends `Error` and not `ApiError` — so "Somebody is waiting for this right
       * now" arrives as neither an `ApiError` nor a 409 that any `.status` check can see. Same pair as
       * CheckoutSheet. A 4xx is the API refusing on purpose, in prose meant for this person; anything else is not.
       */
      const refused = err instanceof BookingConflictError || (err instanceof ApiError && err.status < 500);
      setDeleteError(refused && err instanceof Error && err.message ? err.message : t('deleteFailed'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="card offers-card">
      <div className="offers-toolbar">
        <label className="search-wrap">
          <IconSearch />
          <input
            type="text"
            className="search-input search-input-bare"
            placeholder={t('searchPlaceholder')}
            value={search}
            onChange={(e) => updateFilter(() => setSearch(e.target.value))}
          />
        </label>
        <div className="dropdown-anchor">
          <button
            type="button"
            className={`btn btn-ghost filter-btn ${status !== 'all' ? 'filter-btn-on' : ''}`}
            onClick={() => setFilterOpen((v) => !v)}
            aria-label={t('filter')}
          >
            <span className="filter-btn-text">
              {status === 'all' ? t('filter') : status === 'active' ? t('activeOnly') : t('inactiveOnly')} ⌄
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
                  {s === 'all' ? t('allStatuses') : s === 'active' ? t('activeOnly') : t('inactiveOnly')}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty">{offers.length === 0 ? t('emptyNone') : t('emptySearch')}</div>
      ) : (
        <>
          <div className="card-body offers-list" ref={listRef}>
            {pageItems.map((offer) => {
              return (
                <div
                  key={offer.id}
                  data-row
                  className={`offer-card-row ${selectedId === offer.id ? 'offer-card-row-selected' : ''}`}
                  onClick={() => setSelectedId(offer.id)}
                  onDoubleClick={() => router.push(`/offers/${offer.id}/edit`)}
                >
                  <div className="offer-row-head">
                    <div className="offer-icon offer-icon-offer">🏷️</div>

                    <div className="offer-main">
                      <div className="offer-title-row">
                        <span className="offer-title">{offer.title}</span>
                        {branchTag(offer.locationId)}
                      </div>
                      {offer.serviceIds.length > 0 && <div className="muted offer-subtitle">{serviceNames(offer.serviceIds)}</div>}
                      {offer.description && <div className="muted offer-subtitle offer-desc">{offer.description}</div>}
                    </div>
                  </div>

                  <div className="offer-row-foot">
                    <div className="offer-info-col">
                      <div className="offer-info-item">📅 {visibilitySummary(offer, t, locale)}</div>
                    </div>

                    {/* A sibling of the stats rather than inside them: on desktop
                        this reads left-to-right as rules | toggle | counts, and on
                        mobile the grid can lift just the toggle up beside the title
                        without dragging the counts with it. */}
                    <label
                      className="switch offer-toggle"
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => e.stopPropagation()}
                      title={offer.active ? t('turnOff') : t('turnOn')}
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
                        {offer.active ? t('active') : t('inactive')}
                      </span>
                    </label>

                    <div className="offer-stats-col">
                      <div className="offer-stat">
                        <span className="offer-stat-value">{offer.bookingsCount}</span>
                        <span className="offer-stat-label">{t('bookings')}</span>
                      </div>
                      <div className="offer-stat">
                        <span className="offer-stat-value">{formatMoney(offer.revenueMinor)}</span>
                        <span className="offer-stat-label">{t('revenue')}</span>
                      </div>
                    </div>

                    <div
                      className="dropdown-anchor"
                      ref={openMenuId === offer.id ? menu.anchorRef : undefined}
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        className="kebab-btn"
                        disabled={busyId === offer.id}
                        onClick={() => setOpenMenuId(openMenuId === offer.id ? null : offer.id)}
                        aria-label={t('actionsAria')}
                      >
                        ⋮
                      </button>
                      {openMenuId === offer.id && (
                        <div
                          className="dropdown-panel dropdown-panel-sm dropdown-panel-right"
                          ref={menu.panelRef}
                          style={menu.style}
                          onMouseLeave={closeMenu}
                        >
                          <Link href={`/offers/${offer.id}/edit`} className="dropdown-item dropdown-item-plain">
                            {t('edit')}
                          </Link>
                          <button type="button" className="dropdown-item dropdown-item-plain dropdown-item-danger" onClick={() => askToRemove(offer)}>
                            {t('delete')}
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
            noun={tn('offers')}
          />
        </>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={t('deleteTitle', { title: confirmDelete.title })}
          body={t('deleteBody')}
          confirmLabel={t('delete')}
          tone="danger"
          busy={busyId === confirmDelete.id}
          error={deleteError}
          onConfirm={() => doRemove(confirmDelete)}
          onCancel={() => {
            setConfirmDelete(null);
            setDeleteError(null);
          }}
        />
      )}
    </div>
  );
}
