'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError, BookingConflictError, formatMoney, type Offer, type Service } from '../lib/api';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Pagination } from '../components/Pagination';
import { IconPackages, IconSearch } from '../components/icons';
import { useAnchoredPanel } from '../lib/useAnchoredPanel';
import { useFitRows } from '../lib/use-fit-rows';
import { usePhone } from '../lib/use-phone';
import { servicePhotoUrl } from '../lib/service-photos';
import { useBranch } from '../components/BranchProvider';
import { useWritable } from '../components/SessionProvider';
import { partsMinutes, partsOf, partsTotalMinor, savingMinor, savingPct, searchPackages } from './packages-logic';
import { durationPhrase } from '../lib/duration-words';
import { PackageOverview } from './PackageOverview';

/** First paint only — the client then measures how many rows this screen actually fits. */
const INITIAL_PAGE_SIZE = 5;


/**
 * Jira GRW-438 — the owner's packages, on their own screen.
 *
 * Browsing and the per-row actions only. Building and editing one is the wizard at `/packages/new`
 * and `/packages/[id]/edit` — the same wizard that built combos, because a package IS that row.
 */
export function PackagesList({ packages, services }: { packages: Offer[]; services: Service[] }) {
  const t = useTranslations('packages.list');
  const tn = useTranslations('nouns');
  const router = useRouter();
  const branchContext = useBranch();
  // Jira GRW-556 (follow-up) — read-only for a business suspended for non-payment: no builder, no menu, no switch.
  const writable = useWritable();

  const [busyId, setBusyId] = useState<string | null>(null);
  /*
   * Jira GRW-473 — a refused switch or copy says why. These ran in try/finally with no catch: a 400 (a package
   * holding a retired service, say) became an unhandled rejection and the button simply did nothing.
   */
  const [actionError, setActionError] = useState<string | null>(null);
  const tc = useTranslations('common');
  const failed = (err: unknown) => setActionError(err instanceof ApiError && err.status < 500 ? err.message : tc('actionFailed'));
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  /** The package whose contents are open in the overlay — tapping a row, not its ⋮. */
  const [viewId, setViewId] = useState<string | null>(null);
  /*
   * A single click opens the overview, a double-click still goes to the editor. The overview therefore waits out
   * the double-click window: opening it on the first click put a backdrop under the second, so the dblclick
   * never reached the row.
   */
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelOpen = () => {
    if (openTimer.current) clearTimeout(openTimer.current);
    openTimer.current = null;
  };
  useEffect(() => cancelOpen, []);
  /** Jira GRW-435's shape, kept: the row being confirmed, and why the last attempt was refused. */
  const [confirmDelete, setConfirmDelete] = useState<Offer | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [pageStarts, setPageStarts] = useState<number[]>([0]);
  const [pageIndex, setPageIndex] = useState(0);

  const serviceById = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);

  /** Jira GRW-381 — on "All branches" each package says which branch sells it. */
  const branchTag = (locationId: string | undefined) => {
    if (!branchContext.multi || branchContext.choice || !locationId) return null;
    const name = branchContext.branches.find((b) => b.id === locationId)?.name;
    return name ? <span className="chip pkg-branch-chip">{name}</span> : null;
  };

  const viewing = viewId ? (packages.find((p) => p.id === viewId) ?? null) : null;

  const filtered = useMemo(() => searchPackages(packages, serviceById, search), [packages, serviceById, search]);

  /*
   * On a phone the list is one scroll, no pages (owner, 2026-10-08). Fitting rows to the screen left a package with
   * eight services alone on its page ("1–1 of 4") at 344px, and five-a-page hid its own footer until the sixth
   * package. A salon's packages are a short list; the page scrolls, and Pagination is for the laptop.
   */
  const phone = usePhone();
  const start = phone ? 0 : Math.min(pageStarts[pageIndex] ?? 0, Math.max(0, filtered.length - 1));
  const { pageSize: fitCount, listRef } = useFitRows({
    fallback: INITIAL_PAGE_SIZE,
    resetKey: `${start}|${search}`,
  });
  const pageItems = phone ? filtered : filtered.slice(start, start + fitCount);
  const shownTo = start + pageItems.length;

  const goNext = () => {
    setPageStarts((s) => {
      const next = s.slice(0, pageIndex + 1);
      next[pageIndex + 1] = shownTo;
      return next;
    });
    setPageIndex((i) => i + 1);
  };
  const goPrev = () => setPageIndex((i) => Math.max(0, i - 1));

  const onSearch = (value: string) => {
    setSearch(value);
    // A new search is a new list — back to the first screenful.
    setPageStarts([0]);
    setPageIndex(0);
  };

  /** Jira GRW-433 — anchored to the VIEWPORT, so a card's own `overflow` cannot cut Delete in half. */
  const closeMenu = useCallback(() => setOpenMenuId(null), []);
  const menu = useAnchoredPanel(openMenuId !== null, closeMenu);

  const toggleActive = async (pkg: Offer) => {
    setOpenMenuId(null);
    setActionError(null);
    setBusyId(pkg.id);
    try {
      await api.updateOffer(pkg.id, { active: !pkg.active });
      router.refresh();
    } catch (err) {
      failed(err);
    } finally {
      setBusyId(null);
    }
  };

  /**
   * A copy is made retired on purpose. "Groom's Day (copy)" at the same price as the original, live on the
   * booking page the moment it is created, is a second thing the owner is selling without having decided to.
   */
  const duplicate = async (pkg: Offer) => {
    setOpenMenuId(null);
    setActionError(null);
    setBusyId(pkg.id);
    try {
      await api.createOffer({
        locationId: pkg.locationId,
        title: t('copyOf', { title: pkg.title }),
        description: pkg.description,
        active: false,
        serviceIds: pkg.serviceIds,
        comboPriceMinor: pkg.comboPriceMinor == null ? null : Number(pkg.comboPriceMinor),
        visibleWeekdays: pkg.visibleWeekdays,
        visibleFrom: pkg.visibleFrom,
        visibleUntil: pkg.visibleUntil,
      });
      router.refresh();
    } catch (err) {
      failed(err);
    } finally {
      setBusyId(null);
    }
  };

  const askToRemove = (pkg: Offer) => {
    setOpenMenuId(null);
    setDeleteError(null);
    setConfirmDelete(pkg);
  };

  /**
   * Jira GRW-435 — a delete either happens or says why it did not. Never silently stops.
   *
   * Both arms of `refused` are needed: `send()` turns EVERY 409 into a `BookingConflictError`, which extends
   * `Error` and not `ApiError`, so "Somebody is waiting for this right now" (GRW-434) arrives as neither an
   * `ApiError` nor a 409 any `.status` check can see.
   */
  const doRemove = async (pkg: Offer) => {
    setBusyId(pkg.id);
    setDeleteError(null);
    try {
      await api.deleteOffer(pkg.id);
      setConfirmDelete(null);
      router.refresh();
    } catch (err) {
      const refused = err instanceof BookingConflictError || (err instanceof ApiError && err.status < 500);
      setDeleteError(refused && err instanceof Error && err.message ? err.message : t('deleteFailed'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="card pkg-card">
      {actionError && (
        <div className="banner" role="alert" style={{ margin: '0 0 12px' }}>
          {actionError}
        </div>
      )}
      <div className="pkg-toolbar">
        <label className="search-wrap">
          <IconSearch />
          <input
            type="text"
            className="search-input search-input-bare"
            placeholder={t('searchPlaceholder', { count: packages.length })}
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
        </label>
      </div>

      {filtered.length === 0 ? (
        <div className="empty pkg-empty">
          <p>{packages.length === 0 ? t('emptyNone') : t('emptySearch')}</p>
          {packages.length === 0 && writable && (
            <Link className="btn" href="/packages/new">
              {t('buildFirst')}
            </Link>
          )}
        </div>
      ) : (
        <>
          {/* The laptop's column titles. The phone's cards label their own numbers, so this is desktop-only. */}
          <div className="pkg-head">
            <span>{t('cols.package')}</span>
            <span>{t('cols.time')}</span>
            <span className="pkg-head-price">{t('cols.price')}</span>
            <span />
          </div>

          <div className="card-body pkg-list" ref={listRef}>
            {pageItems.map((pkg) => {
              const { parts, missing } = partsOf(pkg, serviceById);
              const total = partsTotalMinor(parts);
              const saved = savingMinor(pkg, parts);
              const pct = savingPct(pkg, parts);

              return (
                <div
                  key={pkg.id}
                  data-row
                  className={`pkg-row ${pkg.active ? '' : 'is-retired'}`}
                  onDoubleClick={
                    writable
                      ? () => {
                          cancelOpen();
                          router.push(`/packages/${pkg.id}/edit`);
                        }
                      : undefined
                  }
                  tabIndex={0}
                  aria-haspopup="dialog"
                  onClick={(e) => {
                    // The ⋮ and its menu are their own targets; only the rest of the card opens the details.
                    if ((e.target as HTMLElement).closest('.pkg-actions')) return;
                    // Without an editor to go to there is no double-click to wait for.
                    cancelOpen();
                    if (!writable) setViewId(pkg.id);
                    else openTimer.current = setTimeout(() => setViewId(pkg.id), 250);
                  }}
                  onKeyDown={(e) => {
                    if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      setViewId(pkg.id);
                    }
                  }}
                >
                  <div className="pkg-row-main">
                    <span className="pkg-icon" aria-hidden="true">
                      <IconPackages />
                    </span>
                    <span className="pkg-text">
                      <span className="pkg-name-row">
                        <span className="pkg-name">{pkg.title}</span>
                        {saved > 0 && <span className="chip chip-discount">{t('pctOff', { pct })}</span>}
                        {!pkg.active && <span className="chip pkg-retired-chip">{t('retired')}</span>}
                        {branchTag(pkg.locationId)}
                      </span>
                      <span className="pkg-includes">
                        {parts.map((p) => p.name).join(' + ') || t('nothingInside')}
                      </span>
                      {/*
                        A package quoting one price for three services when one of them has been deleted is the
                        state GRW-442 exists to prevent. Until that lands, the row has to be able to say so.
                      */}
                      {missing > 0 && <span className="pkg-missing">{t('missingServices', { count: missing })}</span>}
                    </span>
                  </div>

                  {/*
                    Time and price share one wrapper so that on a phone they are a footer spanning the whole
                    card. Without it they sit in the grid's two columns, and the price — the widest thing in
                    the row — sets the name column's width, which wrapped "QA-svc2 KOR combo" one word per
                    line at 375px. At 861px the wrapper turns into `display: contents` and they become grid
                    items again, under their own column titles.
                  */}
                  <div className="pkg-foot">
                    <div className="pkg-time">
                      {durationPhrase(partsMinutes(parts), {
                        minutes: (count) => t('minutes', { count }),
                        hours: (count) => t('hours', { count }),
                        hoursMinutes: (hours, minutes) => t('hoursMinutes', { hours, minutes }),
                      })}
                    </div>

                    <div className="pkg-price">
                      <span className="pkg-price-now">{formatMoney(pkg.comboPriceMinor)}</span>
                      {saved > 0 ? (
                        <span className="pkg-price-was">
                          <span className="pkg-strike">{formatMoney(String(total))}</span>
                          <span className="pkg-price-sep" aria-hidden="true" />
                          {t('save', { amount: formatMoney(String(saved)) })}
                        </span>
                      ) : (
                        <span className="pkg-price-was">{t('noSaving')}</span>
                      )}
                    </div>
                  </div>

                  {writable && (
                  <div
                    className="dropdown-anchor pkg-actions"
                    ref={openMenuId === pkg.id ? menu.anchorRef : undefined}
                  >
                    <button
                      type="button"
                      className="kebab-btn"
                      disabled={busyId === pkg.id}
                      onClick={() => setOpenMenuId(openMenuId === pkg.id ? null : pkg.id)}
                      aria-label={t('actionsAria', { title: pkg.title })}
                    >
                      ⋮
                    </button>
                    {openMenuId === pkg.id && (
                      <div
                        className="dropdown-panel dropdown-panel-sm dropdown-panel-right"
                        ref={menu.panelRef}
                        style={menu.style}
                        onMouseLeave={closeMenu}
                      >
                        <Link href={`/packages/${pkg.id}/edit`} className="dropdown-item dropdown-item-plain">
                          {t('edit')}
                        </Link>
                        <button type="button" className="dropdown-item dropdown-item-plain" onClick={() => duplicate(pkg)}>
                          {t('duplicate')}
                        </button>
                        <button type="button" className="dropdown-item dropdown-item-plain" onClick={() => toggleActive(pkg)}>
                          {pkg.active ? t('retire') : t('restore')}
                        </button>
                        <button
                          type="button"
                          className="dropdown-item dropdown-item-plain dropdown-item-danger"
                          onClick={() => askToRemove(pkg)}
                        >
                          {t('delete')}
                        </button>
                      </div>
                    )}
                  </div>
                  )}
                </div>
              );
            })}
          </div>

          {!phone && (
            <Pagination
              mode="cursor"
              from={filtered.length === 0 ? 0 : start + 1}
              to={shownTo}
              total={filtered.length}
              hasPrev={pageIndex > 0}
              hasNext={shownTo < filtered.length}
              onPrev={goPrev}
              onNext={goNext}
              noun={tn('packages')}
            />
          )}
        </>
      )}

      {viewing && (
        <PackageOverview
          title={viewing.title}
          services={partsOf(viewing, serviceById).parts.map((part) => ({
            ...part,
            photo: servicePhotoUrl(serviceById.get(part.id)!),
          }))}
          missingNote={partsOf(viewing, serviceById).missing > 0 ? t('missingServices', { count: partsOf(viewing, serviceById).missing }) : null}
          priceMinor={viewing.comboPriceMinor}
          editHref={writable ? `/packages/${viewing.id}/edit` : null}
          editLabel={t('edit')}
          onClose={() => setViewId(null)}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={t('deleteTitle', { title: confirmDelete.title })}
          body={t('deleteBody')}
          /*
           * Named because the owner cannot see it from here: a walk-in that asked for this package keeps its
           * token and its client and simply stops pointing at a package that is gone (migration 0096, GRW-434).
           */
          detail={t('deleteDetail')}
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
