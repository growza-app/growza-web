'use client';

import { useLocale, useTranslations } from 'next-intl';
import { csvLines } from '../lib/csv';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useWritable } from '../components/SessionProvider';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, BookingConflictError, type ServiceAdmin, type ServiceCategory, type ServiceCategoryAdmin } from '../lib/api';
import { pickNoun } from '../lib/nouns';
import { PaginatedTable } from '../components/PaginatedTable';
import { PAGE_SIZE } from '../components/Pagination';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PageHeader } from '../components/PageHeader';
import { IconPlus, IconSearch } from '../components/icons';
import { ServiceForm } from './ServiceForm';
import { asMinor, matchItems, MIN_CHARS } from '../lib/service-match';
import { extraSuggestions } from '../lib/service-suggest';
import { useServiceSuggestions } from '../lib/useServiceSuggestions';
import { ImportServices } from './ImportServices';
import { AddServicesChooser, type AddServicesRoute } from './AddServicesChooser';
import { CataloguePicker } from './CataloguePicker';
import { CopyFromBranch } from './CopyFromBranch';
import { CategoriesSheet } from './CategoriesSheet';
import { ALL_TAB, RETIRED_TAB, hasRetired, servicesOnTab, tabAfterChange, tabCounts } from './services-tabs';
import { ServiceCards, ServiceTableRows, type RowActions } from './ServiceRows';
import { HeldByPackagesDialog } from './HeldByPackagesDialog';
import { packagesInRefusal, type HeldPackage } from './held-by-packages';
import { categoryTotals, copyName, orderedByCategory } from './services-groups';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/**
 * The catalogue screen. Until now this was read-only apart from photos, which
 * meant an owner could not change their own prices, durations or service list
 * without someone editing Postgres for them.
 *
 * Photo upload still lives here (not the combo builder) — a service's photo is
 * a property of the service itself, reused everywhere it's pictured, so it's
 * set once at the source rather than per-combo.
 */
export function ServicesTable({
  services: initial,
  categories,
  tenantName,
  serviceLabel,
  branchId,
  branches,
}: {
  services: ServiceAdmin[];
  categories: ServiceCategory[];
  /** Jira GRW-378 — the branch on screen. Each branch has its own services; everything added here lands here. */
  branchId: string;
  /** The branches an owner may switch between and copy from; empty for a one-branch business or a pinned role. */
  branches: ReadonlyArray<{ id: string; name: string }>;
  tenantName: string | null;
  /** ctx.labels — every customer-visible noun comes from the vertical, not a literal. */
  serviceLabel: string;
}) {
  const router = useRouter();
  const writable = useWritable();
  const t = useTranslations('services');
  const tn = useTranslations('nouns');
  const locale = useLocale();
  // The vertical's word in English; a generic one in other languages until vertical labels are translated (GRW-315 Story 5).
  const title = pickNoun(locale, serviceLabel, tn('servicesTitle'));
  const lower = pickNoun(locale, serviceLabel.toLowerCase(), tn('services'));
  const [services, setServices] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /*
   * Jira GRW-478 (U-15) — the search, the tab and the page live in the address (`q`, `tab`, `page`), so Back from
   * a service, or a reload, lands where the owner was instead of on page 1 of All with the search cleared.
   */
  const params = useSearchParams();
  const [search, setSearch] = useState(() => params.get('q') ?? '');
  /** Jira GRW-437 — `all`, `retired`, or a category id. */
  const [categoryId, setCategoryId] = useState<string>(() => params.get('tab') ?? ALL_TAB);
  const [editing, setEditing] = useState<ServiceAdmin | null>(null);
  const [creating, setCreating] = useState(false);
  /*
   * Jira GRW-473 — the form's category picker lists EVERY category at this branch, empty ones included. It was
   * handed `categories`, the tab list, which leaves out a category with no services — so a category just made in
   * Manage categories could not be chosen for the first service meant to go in it.
   */
  const [pickerCategories, setPickerCategories] = useState<ServiceCategory[] | null>(null);
  const formOpen = creating || editing !== null;
  useEffect(() => {
    if (!formOpen || !branchId) return;
    let live = true;
    api
      .categoriesAtBranch(branchId)
      .then((all) => {
        if (live) setPickerCategories(all);
      })
      .catch(() => {
        if (live) setPickerCategories(null);
      });
    return () => {
      live = false;
    };
  }, [formOpen, branchId]);
  const [importing, setImporting] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [copying, setCopying] = useState(false);
  /**
   * Jira GRW-428 — the category sheet, and the admin list it needs.
   *
   * Not the `categories` prop: that is the picker's list, which leaves out a category with nothing in it, so a
   * category created in the sheet would vanish from it. Fetched when the sheet opens rather than with the page,
   * because most visits to this screen never open it.
   */
  const [managing, setManaging] = useState<ServiceCategoryAdmin[] | null>(null);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const canCopy = branches.length > 1;
  const reload = async () => {
    setServices(await api.allServices(branchId));
    router.refresh();
  };
  const [confirmRetire, setConfirmRetire] = useState<{ service: ServiceAdmin; bookings: number } | null>(null);
  /** Jira GRW-431 — the other thing an owner can mean. Delete is final; retire above is not. */
  const [confirmDelete, setConfirmDelete] = useState<{ service: ServiceAdmin; bookings: number } | null>(null);
  /** Jira GRW-442 — the service that could not be retired, and the packages still selling it. */
  const [heldBy, setHeldBy] = useState<{ service: ServiceAdmin; packages: HeldPackage[] } | null>(null);
  /**
   * Jira GRW-439 — one file input for the screen, not one per row.
   *
   * The photo button moved into the ··· menu, and a menu that is only mounted while it is open cannot own the
   * input it clicks: the input would unmount with the menu before the file dialog returned. So the input lives
   * here, and `photoFor` remembers which service asked.
   */
  const photoInput = useRef<HTMLInputElement | null>(null);
  const [photoFor, setPhotoFor] = useState<ServiceAdmin | null>(null);

  const replace = (saved: ServiceAdmin) => {
    setServices((prev) => (prev.some((s) => s.id === saved.id) ? prev.map((s) => (s.id === saved.id ? saved : s)) : [saved, ...prev]));
    router.refresh();
  };

  /**
   * Jira GRW-439 — a copy starts retired.
   *
   * "Haircut (copy)" at the same price, live on the booking page the moment it is created, is a second thing
   * the owner is selling without having decided to. It appears under Retired, one tap from a restore once
   * they have edited it.
   *
   * And the screen GOES to Retired, because `All` lists what is being sold: a copy that starts retired landed
   * on a tab the owner was not looking at, so Duplicate changed nothing they could see and the second tap gave
   * them "Haircut (copy) 2" to clean up. The copy is shown where it actually is.
   */
  const duplicate = async (service: ServiceAdmin) => {
    setError(null);
    setBusyId(service.id);
    try {
      const created = await api.createService(branchId, {
        name: copyName(service.name, services.map((s) => s.name), (name) => t('copySuffix', { name })),
        categoryId: service.categoryId,
        durationMin: service.durationMin,
        bufferBeforeMin: service.bufferBeforeMin,
        bufferAfterMin: service.bufferAfterMin,
        priceMinor: service.priceMinor == null ? null : Number(service.priceMinor),
        active: false,
      });
      replace(created);
      // The copy carries the original's name, so an active search still matches it; only the tab has to move.
      setCategoryId(RETIRED_TAB);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t('errors.duplicateFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const askPhoto = (service: ServiceAdmin) => {
    setPhotoFor(service);
    photoInput.current?.click();
  };

  const onPick = async (service: ServiceAdmin, file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (file.size > MAX_PHOTO_BYTES) {
      setError(t('errors.photoTooBig', { name: service.name }));
      return;
    }
    setBusyId(service.id);
    try {
      const updated = await api.uploadServicePhoto(service.id, file);
      setServices((prev) => prev.map((s) => (s.id === service.id ? { ...s, imageUrl: updated.imageUrl } : s)));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.uploadFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const onRemovePhoto = async (service: ServiceAdmin) => {
    setError(null);
    setBusyId(service.id);
    try {
      const updated = await api.removeServicePhoto(service.id);
      setServices((prev) => prev.map((s) => (s.id === service.id ? { ...s, imageUrl: updated.imageUrl } : s)));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.removeFailed'));
    } finally {
      setBusyId(null);
    }
  };

  /**
   * "Retire", never delete. `service.id` is referenced by appointment,
   * provider_service and offer_service with no cascade, so a hard delete on
   * anything with history would fail at the database — and the history is
   * worth keeping regardless. Asks first, with the booking count, so the owner
   * knows what they're pulling out of the booking flows.
   */
  const askDelete = async (service: ServiceAdmin) => {
    setBusyId(service.id);
    try {
      const usage = await api.serviceUsage(service.id).catch(() => ({ bookings: 0, providers: 0, offers: 0 }));
      setConfirmDelete({ service, bookings: usage.bookings });
    } finally {
      setBusyId(null);
    }
  };

  /**
   * Jira GRW-431 — a real delete. Its bookings keep the name and price they were taken at (GRW-430), so the
   * 409 this can answer is about the CATALOGUE — a combo it is in, a question it still asks — never history.
   */
  const remove = async (service: ServiceAdmin) => {
    setBusyId(service.id);
    setError(null);
    try {
      await api.deleteService(branchId, service.id);
      setServices((prev) => prev.filter((x) => x.id !== service.id));
      setConfirmDelete(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.saveFailed'));
      setConfirmDelete(null);
    } finally {
      setBusyId(null);
    }
  };

  const askRetire = async (service: ServiceAdmin) => {
    setBusyId(service.id);
    try {
      const usage = await api.serviceUsage(service.id).catch(() => ({ bookings: 0, providers: 0, offers: 0 }));
      setConfirmRetire({ service, bookings: usage.bookings });
    } finally {
      setBusyId(null);
    }
  };

  const setActive = async (service: ServiceAdmin, active: boolean) => {
    setBusyId(service.id);
    setError(null);
    try {
      replace(await api.updateService(service.id, { active }));
    } catch (err) {
      /*
       * Jira GRW-442 — a 409 naming packages is not an error to put in the page banner; it is a question with
       * an answer. Anything else, including a 409 about something entirely different, keeps the old behaviour.
       */
      const packages = err instanceof BookingConflictError ? packagesInRefusal(err.details) : null;
      if (packages) setHeldBy({ service, packages });
      else setError(err instanceof Error ? err.message : t('errors.saveFailed'));
    } finally {
      setBusyId(null);
      setConfirmRetire(null);
    }
  };

  // Jira GRW-437 — every count is the number of rows its own tab lists. It used to count retired services too,
  // so retiring something changed no number on the screen.
  const counts = useMemo(() => tabCounts(services), [services]);
  const showRetiredTab = useMemo(() => hasRetired(services), [services]);
  /*
   * A tab can stop existing underneath the owner — Retired when the last retired service is restored, a
   * category when it is deleted from the sheet — so the tab actually rendered is derived rather than read
   * straight from state.
   *
   * Deriving alone is not enough, and that was a bug: `categoryId` kept saying `retired` while the screen showed
   * All, so the next thing the owner retired brought the Retired tab back and the view jumped onto it, hiding
   * every live service. Derive for this render so there is no empty frame, then commit it so it cannot come
   * back.
   */
  const categoryIds = useMemo(() => categories.map((c) => c.id), [categories]);
  /** Jira GRW-441 — the headings read in the owner's order, the same one the tabs above them read. */
  const categoryOrder = useMemo(() => categories.map((c) => c.name), [categories]);
  const tab = tabAfterChange(services, categoryId, categoryIds);
  useEffect(() => {
    if (tab !== categoryId) setCategoryId(tab);
  }, [tab, categoryId]);

  /** The services the tab in view lists — what the search looks through, and the only things it may offer. */
  const inTab = useMemo(() => servicesOnTab(services, tab), [services, tab]);

  const filtered = useMemo(() => {
    const q = search.trim();
    if (q.length < MIN_CHARS) return inTab;
    // Jira GRW-375 — the same matching the walk-in sheet uses, so a service
    // found by "phacial" at the desk is found by "phacial" here too.
    return matchItems(
      inTab.map((s) => ({ item: s, text: [s.name, s.categoryName ?? ''], priceMinor: asMinor(s.priceMinor) })),
      q,
    );
  }, [inTab, search]);

  /**
   * Jira GRW-449 — and the half of that search the screen never had: what the typed words MEAN.
   *
   * Only the walk-in sheet ever asked the server, so "nails" found Manicure at the front desk and nothing on
   * the screen where the owner edits it.
   *
   * Resolved against `inTab` and not the whole branch, because a chip has to land somewhere: offering Manicure
   * while the Hair tab is in view would set a search the tab then filters out, and the owner would be looking
   * at "No services match here" having just been told there was a match.
   */
  const remote = useServiceSuggestions(search, branchId);
  const byIdInTab = useMemo(() => new Map(inTab.map((s) => [s.id, s])), [inTab]);
  const alsoTry = useMemo(
    () => extraSuggestions(filtered, remote, search, (id) => byIdInTab.get(id)),
    [filtered, remote, search, byIdInTab],
  );

  /*
   * Jira GRW-439 — the page is sliced HERE, and `PaginatedTable` is driven in controlled mode.
   *
   * It used to slice its own `children`, which worked while they were one `<tr>` per service. They are a
   * single `<ServiceTableRows>` now — the grouping has to see the whole page to put a heading above each
   * category — and `Children.toArray` counts that as one item: every service rendered on one page and the
   * footer disappeared, because `Pagination` draws nothing for a single page.
   *
   * Slicing the services and grouping afterwards also keeps the page honest at ten SERVICES, which slicing
   * rows would not: a page of ten rows is eight services and two headings.
   */
  const [wantedPage, setWantedPage] = useState(() => Math.max(1, Number(params.get('page')) || 1));
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(wantedPage, pageCount);
  /*
   * Jira GRW-446 — ordered by category BEFORE it is sliced, and the headings count the category rather than
   * the page. Slicing the list as it arrived and grouping the slice put "Hair" on three different pages with a
   * different count each time, beside a tab that said 18.
   */
  const ordered = useMemo(() => orderedByCategory(filtered, categoryOrder), [filtered, categoryOrder]);
  const totals = useMemo(() => categoryTotals(filtered), [filtered]);
  const pageRows = useMemo(() => ordered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [ordered, page]);
  // Back to the first page when the list under it changes: page 3 of a search that now matches four rows is empty.
  // Not on arrival, which is the address's page (GRW-478).
  const listShown = useRef({ tab, search });
  useEffect(() => {
    if (listShown.current.tab === tab && listShown.current.search === search) return;
    listShown.current = { tab, search };
    setWantedPage(1);
  }, [tab, search]);
  // Written with `replaceState`, not the router: a router replace would re-render this server page per keystroke.
  useEffect(() => {
    const url = new URL(window.location.href);
    const put = (key: string, value: string | null) => (value ? url.searchParams.set(key, value) : url.searchParams.delete(key));
    put('q', search.trim() || null);
    put('tab', tab === ALL_TAB ? null : tab);
    put('page', page > 1 ? String(page) : null);
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, '', url);
  }, [search, tab, page]);

  const exportCsv = () => {
    const header = ['Name', 'Type', 'Minutes', 'Cleanup after (min)', 'Price', 'Status'];
    const rows = filtered.map((s) => [
      s.name,
      s.categoryName ?? '',
      String(s.durationMin),
      String(s.bufferAfterMin),
      s.priceMinor ? String(Number(s.priceMinor) / 100) : '',
      s.active ? 'Active' : 'Retired',
    ]);
    const csv = csvLines([header, ...rows]);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'services.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  /** Everything a row can do, handed to both shapes so the table and the cards cannot drift apart. */
  const rowActions: RowActions = {
    onEdit: setEditing,
    onPhoto: askPhoto,
    onRemovePhoto: (s) => void onRemovePhoto(s),
    onDuplicate: (s) => void duplicate(s),
    onRetire: (s) => void askRetire(s),
    onRestore: (s) => void setActive(s, true),
    onDelete: (s) => void askDelete(s),
    busyId,
  };

  return (
    <>
      {/*
        Jira GRW-30 — the header lives here now so Add can sit in it.

        Add was the FIRST control in the row below, where Staff had it last.
        Two screens, two orders, both using the same toolbar class —
        and neither looked wrong on its own, which is why it survived. Creating
        is the header's slot; this row searches and exports.
      */}
      <PageHeader
        title={title}
        subtitle={t('subtitle')}
        actions={
          // Jira GRW-556 (follow-up) — a business suspended for non-payment reads its menu and adds nothing to it.
          writable ? (
            <button type="button" className="btn" onClick={() => setChoosing(true)}>
              <IconPlus /> {t('addLabel', { label: lower })}
            </button>
          ) : undefined
        }
      />
      <div className="page-body table-fit">
      <div className="page-toolbar">
        <div className="staff-search-wrap">
          <IconSearch />
          <input
            type="search"
            /*
             * Jira GRW-437 — the number the search will actually look through, which is the tab in view and not
             * the whole branch. "Search 19 services…" sitting beside a tab reading "All 1" invites the owner to
             * type a retired service's name into a box that cannot find it.
             */
            placeholder={t('searchPlaceholder', { count: inTab.length })}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={t('searchAria')}
          />
        </div>
        {/* Jira GRW-428 — beside Export and not in the header: the header's slot is for creating a service.
            Jira GRW-556 (follow-up) — the sheet it opens only adds, renames, reorders and deletes categories. */}
        {writable && (
        <button
          type="button"
          className="btn btn-ghost"
          disabled={loadingCategories}
          onClick={async () => {
            setLoadingCategories(true);
            setError(null);
            try {
              setManaging(await api.categoriesAtBranch(branchId));
            } catch (err) {
              setError(err instanceof Error ? err.message : t('categories.errors.failed'));
            } finally {
              setLoadingCategories(false);
            }
          }}
        >
          {loadingCategories ? '…' : t('categories.open')}
        </button>
        )}
        <button type="button" className="btn btn-ghost" onClick={exportCsv}>
          {t('export')}
        </button>
      </div>

      <div className="page-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === ALL_TAB}
          className={`page-tab ${tab === ALL_TAB ? 'active' : ''}`}
          onClick={() => setCategoryId(ALL_TAB)}
        >
          {t('all')} <span className="page-tab-count">{counts.all}</span>
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={tab === c.id}
            className={`page-tab ${tab === c.id ? 'active' : ''}`}
            onClick={() => setCategoryId(c.id)}
          >
            {c.name} <span className="page-tab-count">{counts.byCategory.get(c.id) ?? 0}</span>
          </button>
        ))}
        {/*
         * Jira GRW-437 — last, and only when there is something in it. The owner's live menu reads left to
         * right; what they have taken off it sits at the end, out of the way but one tap from a restore.
         */}
        {showRetiredTab && (
          <button
            type="button"
            role="tab"
            aria-selected={tab === RETIRED_TAB}
            className={`page-tab svc-tab-retired ${tab === RETIRED_TAB ? 'active' : ''}`}
            onClick={() => setCategoryId(RETIRED_TAB)}
          >
            {t('retired')} <span className="page-tab-count">{counts.retired}</span>
          </button>
        )}
      </div>

      {/*
        Jira GRW-449 — services close in MEANING to what was typed, above the table rather than inside it.
        Tapping one puts its name in the search box: the table then lists it with its own row actions, which a
        chip cannot carry, and the counts, grouping and paging below stay exactly what the owner typed for.
      */}
      {alsoTry.length > 0 && (
        <div className="also-try">
          <span className="also-try-label">{t('alsoTry')}</span>
          <div className="also-try-chips">
            {alsoTry.map((s) => (
              <button key={s.id} type="button" className="also-try-chip" onClick={() => setSearch(s.name)}>
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* One input for the screen (see `photoFor`): the ··· menu unmounts when it closes, so it cannot own this. */}
      <input
        ref={photoInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={(e) => {
          const service = photoFor;
          const file = e.target.files?.[0];
          setPhotoFor(null);
          // Cleared so picking the SAME file twice in a row still fires a change event.
          e.target.value = '';
          if (service) void onPick(service, file);
        }}
      />

      <div className="card svc-shell">
        {error && <div role="alert" className="card-body field-error" style={{ padding: '10px 16px 0' }}>{error}</div>}
        {services.length === 0 ? (
          <div className="empty svc-branch-empty">
            <p>{branches.length > 1 ? t('emptyBranch') : t('emptyAll')}</p>
            <div className="svc-branch-empty-actions">
              {writable && canCopy && (
                <button type="button" className="btn" onClick={() => setCopying(true)}>
                  {t('copyFromBranch')}
                </button>
              )}
              {writable && (
                <button type="button" className={canCopy ? 'btn btn-ghost' : 'btn'} onClick={() => setChoosing(true)}>
                  <IconPlus /> {t('addLabel', { label: lower })}
                </button>
              )}
            </div>
          </div>
        ) : filtered.length === 0 ? (
          /*
           * Jira GRW-437 — "No services match here" is right for a search that found nothing and alarming when
           * the branch has a full catalogue that simply happens to be entirely retired: it reads as though the
           * menu is gone. Say where everything went, and offer the one tap that gets there.
           */
          <div className="empty">
            {tab === ALL_TAB && search.trim().length < MIN_CHARS && showRetiredTab ? (
              <>
                <p>{t('allRetired')}</p>
                <button type="button" className="btn btn-ghost" onClick={() => setCategoryId(RETIRED_TAB)}>
                  {t('retired')} ({counts.retired})
                </button>
              </>
            ) : (
              t('empty')
            )}
          </div>
        ) : (
          <PaginatedTable
            noun={tn('services')}
            page={page}
            total={filtered.length}
            pageSize={PAGE_SIZE}
            onPageChange={setWantedPage}
            cards={<ServiceCards rows={pageRows} actions={rowActions} t={t} order={categoryOrder} totals={totals} />}
            head={
              <tr>
                <th>{t('cols.name')}</th>
                <th>{t('cols.time')}</th>
                <th>{t('cols.price')}</th>
                <th>{t('cols.actions')}</th>
              </tr>
            }
          >
            <ServiceTableRows rows={pageRows} actions={rowActions} t={t} order={categoryOrder} totals={totals} />
          </PaginatedTable>
        )}
      </div>

      {heldBy && (
        <HeldByPackagesDialog
          serviceName={heldBy.service.name}
          packages={heldBy.packages}
          onClose={() => setHeldBy(null)}
        />
      )}

      {managing && (
        <CategoriesSheet
          branchId={branchId}
          initial={managing}
          services={services}
          onClose={() => setManaging(null)}
          // A rename shows on every row of the list, and a delete frees services it lists: reload, don't patch.
          onChanged={() => void reload()}
        />
      )}

      {(creating || editing) && (
        <ServiceForm
          service={editing}
          categories={pickerCategories ?? categories}
          branchId={branchId}
          /*
           * Jira GRW-440 — the sheet's own Retire and Delete. Handled here, not in the sheet, so they open the
           * same confirmations the row's ··· menu opens (GRW-431): one dialog, asked the same way from both.
           * The sheet closes first, because a confirmation stacked on top of it is two modals deep.
           */
          onRetire={(s) => {
            setEditing(null);
            void askRetire(s);
          }}
          onRestore={(s) => {
            setEditing(null);
            void setActive(s, true);
          }}
          onDelete={(s) => {
            setEditing(null);
            void askDelete(s);
          }}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={(saved) => {
            replace(saved);
            setCreating(false);
            setEditing(null);
          }}
        />
      )}

      {choosing && (
        <AddServicesChooser
          tenantName={tenantName}
          serviceCount={services.length}
          serviceLabel={lower}
          branchId={branchId}
          canCopy={canCopy}
          onClose={() => setChoosing(false)}
          onPick={(route: AddServicesRoute) => {
            setChoosing(false);
            if (route === 'copy') setCopying(true);
            else if (route === 'catalogue') setPicking(true);
            else if (route === 'sheet') setImporting(true);
            else setCreating(true);
          }}
        />
      )}

      {picking && (
        <CataloguePicker
          existing={services}
          branchId={branchId}
          onBack={() => {
            setPicking(false);
            setChoosing(true);
          }}
          onClose={() => setPicking(false)}
          onImported={async () => {
            setPicking(false);
            await reload();
          }}
        />
      )}

      {importing && (
        <ImportServices
          existing={services}
          branchId={branchId}
          onClose={() => setImporting(false)}
          onImported={async () => {
            setImporting(false);
            await reload();
          }}
        />
      )}

      {copying && (
        <CopyFromBranch
          branchId={branchId}
          branches={branches}
          existing={services}
          onClose={() => setCopying(false)}
          onCopied={async () => {
            setCopying(false);
            await reload();
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={t('deleteTitle', { name: confirmDelete.service.name })}
          body={t('deleteBody')}
          detail={
            confirmDelete.bookings > 0
              ? t('deleteDetail', { count: confirmDelete.bookings })
              : t('deleteDetailNone')
          }
          confirmLabel={t('delete')}
          tone="danger"
          busy={busyId === confirmDelete.service.id}
          onConfirm={() => void remove(confirmDelete.service)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {confirmRetire && (
        <ConfirmDialog
          title={t('retireTitle', { name: confirmRetire.service.name })}
          body={t('retireBody')}
          detail={
            confirmRetire.bookings > 0
              ? t('retireDetail', { count: confirmRetire.bookings })
              : t('retireDetailNone')
          }
          confirmLabel={t('retire')}
          tone="danger"
          busy={busyId === confirmRetire.service.id}
          onConfirm={() => setActive(confirmRetire.service, false)}
          onCancel={() => setConfirmRetire(null)}
        />
      )}
      </div>
    </>
  );
}
