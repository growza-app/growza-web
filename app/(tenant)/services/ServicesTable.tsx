'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, formatMoney, type ServiceAdmin, type ServiceCategory, type ServiceCategoryAdmin } from '../lib/api';
import { pickNoun } from '../lib/nouns';
import { servicePhotoUrl } from '../lib/service-photos';
import { PaginatedTable } from '../components/PaginatedTable';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PageHeader } from '../components/PageHeader';
import { IconEdit, IconPlus, IconSearch } from '../components/icons';
import { ServiceForm } from './ServiceForm';
import { matchItems, MIN_CHARS } from '../lib/service-match';
import { ImportServices } from './ImportServices';
import { AddServicesChooser, type AddServicesRoute } from './AddServicesChooser';
import { CataloguePicker } from './CataloguePicker';
import { CopyFromBranch } from './CopyFromBranch';
import { CategoriesSheet } from './CategoriesSheet';
import { ALL_TAB, RETIRED_TAB, hasRetired, servicesOnTab, tabAfterChange, tabCounts } from './services-tabs';

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
  const t = useTranslations('services');
  const tn = useTranslations('nouns');
  const locale = useLocale();
  // The vertical's word in English; a generic one in other languages until vertical labels are translated (GRW-315 Story 5).
  const title = pickNoun(locale, serviceLabel, tn('servicesTitle'));
  const lower = pickNoun(locale, serviceLabel.toLowerCase(), tn('services'));
  const [services, setServices] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  /** Jira GRW-437 — `all`, `retired`, or a category id. */
  const [categoryId, setCategoryId] = useState<string>(ALL_TAB);
  const [editing, setEditing] = useState<ServiceAdmin | null>(null);
  const [creating, setCreating] = useState(false);
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
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const replace = (saved: ServiceAdmin) => {
    setServices((prev) => (prev.some((s) => s.id === saved.id) ? prev.map((s) => (s.id === saved.id ? saved : s)) : [saved, ...prev]));
    router.refresh();
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
      setError(err instanceof Error ? err.message : t('errors.saveFailed'));
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
   * Restoring the last retired service takes the Retired tab away from under the owner standing on it, so the
   * tab actually rendered is derived rather than read straight from state.
   *
   * Deriving alone is not enough, and that was a bug: `categoryId` kept saying `retired` while the screen showed
   * All, so the next thing the owner retired brought the Retired tab back and the view jumped onto it, hiding
   * every live service. Derive for this render so there is no empty frame, then commit it so it cannot come
   * back.
   */
  const tab = tabAfterChange(services, categoryId);
  useEffect(() => {
    if (tab !== categoryId) setCategoryId(tab);
  }, [tab, categoryId]);

  const filtered = useMemo(() => {
    const inCategory = servicesOnTab(services, tab);
    const q = search.trim();
    if (q.length < MIN_CHARS) return inCategory;
    // Jira GRW-375 — the same matching the walk-in sheet uses, so a service
    // found by "phacial" at the desk is found by "phacial" here too.
    return matchItems(
      inCategory.map((s) => ({ item: s, text: [s.name, s.categoryName ?? ''] })),
      q,
    );
  }, [services, search, tab]);

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
    const csv = [header, ...rows].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'services.csv';
    a.click();
    URL.revokeObjectURL(url);
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
          <button type="button" className="btn" onClick={() => setChoosing(true)}>
            <IconPlus /> {t('addLabel', { label: lower })}
          </button>
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
            placeholder={t('searchPlaceholder', { count: servicesOnTab(services, tab).length })}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={t('searchAria')}
          />
        </div>
        {/* Jira GRW-428 — beside Export and not in the header: the header's slot is for creating a service. */}
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

      <div className="card">
        {error && <div role="alert" className="card-body field-error" style={{ padding: '10px 16px 0' }}>{error}</div>}
        {services.length === 0 ? (
          <div className="empty svc-branch-empty">
            <p>{branches.length > 1 ? t('emptyBranch') : t('emptyAll')}</p>
            <div className="svc-branch-empty-actions">
              {canCopy && (
                <button type="button" className="btn" onClick={() => setCopying(true)}>
                  {t('copyFromBranch')}
                </button>
              )}
              <button type="button" className={canCopy ? 'btn btn-ghost' : 'btn'} onClick={() => setChoosing(true)}>
                <IconPlus /> {t('addLabel', { label: lower })}
              </button>
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
            cards={filtered.map((s) => (
              <div className={`svc-card ${s.active ? '' : 'is-retired'}`} key={s.id} data-row>
                <div className="svc-card-head">
                  {s.imageUrl ? (
                    <img className="picker-row-thumb" src={servicePhotoUrl(s)} alt="" width={40} height={40} />
                  ) : (
                    <span className="svc-photo-empty">{t('photoAdd')}</span>
                  )}
                  <div className="svc-card-text">
                    <div className="svc-card-name">
                      {s.name}
                      {!s.active && <span className="chip chip-completed">{t('retired')}</span>}
                    </div>
                    <div className="svc-card-meta">
                      {s.categoryName ?? '—'} · {t('minutes', { count: s.durationMin })}
                      {s.bufferAfterMin > 0 && ` · ${t('cleanupPlus', { duration: t('minutes', { count: s.bufferAfterMin }) })}`}
                    </div>
                  </div>
                  <div className="svc-card-price">{formatMoney(s.priceMinor, s.currency)}</div>
                </div>
                <div className="svc-card-foot">
                  {/* `.svc-card-edit`, not `.row-edit-btn`: a card's footer
                      button is full-bleed, not a 38px inline control. */}
                  <button type="button" className="btn btn-ghost svc-card-edit" onClick={() => setEditing(s)}>
                    <IconEdit /> {t('edit')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busyId === s.id}
                    onClick={() => inputRefs.current[s.id]?.click()}
                  >
                    {busyId === s.id ? '…' : s.imageUrl ? t('changePhoto') : t('addPhoto')}
                  </button>
                  {s.active ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-danger"
                      disabled={busyId === s.id}
                      onClick={() => askRetire(s)}
                    >
                      {t('retire')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={busyId === s.id}
                      onClick={() => setActive(s, true)}
                    >
                      {t('restore')}
                    </button>
                  )}
                  {/* Jira GRW-431 — last, after the reversible one. Two different things, in the safe order. */}
                  <button type="button" className="btn btn-ghost btn-danger" disabled={busyId === s.id} onClick={() => askDelete(s)}>
                    {t('delete')}
                  </button>
                </div>
              </div>
            ))}
            head={
              <tr>
                <th>{t('cols.photo')}</th>
                <th>{t('cols.name')}</th>
                <th>{t('cols.type')}</th>
                <th>{t('cols.duration')}</th>
                <th>{t('cols.cleanupTime')}</th>
                <th>{t('cols.price')}</th>
                <th>{t('cols.actions')}</th>
              </tr>
            }
          >
            {filtered.map((s) => (
              <tr key={s.id} data-row className={s.active ? undefined : 'is-retired'}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {/* Says whether a photo EXISTS — previously every row looked
                        identical whether one had been uploaded or not. */}
                    {s.imageUrl ? (
                      <img className="picker-row-thumb" src={servicePhotoUrl(s)} alt="" width={36} height={36} />
                    ) : (
                      <span className="svc-photo-empty">{t('photoAdd')}</span>
                    )}
                    <input
                      ref={(el) => {
                        inputRefs.current[s.id] = el;
                      }}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      style={{ display: 'none' }}
                      onChange={(e) => onPick(s, e.target.files?.[0])}
                    />
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={busyId === s.id}
                      onClick={() => inputRefs.current[s.id]?.click()}
                    >
                      {busyId === s.id ? '…' : s.imageUrl ? t('change') : t('upload')}
                    </button>
                    {s.imageUrl && (
                      <button type="button" className="btn btn-ghost btn-danger" disabled={busyId === s.id} onClick={() => onRemovePhoto(s)}>
                        {t('remove')}
                      </button>
                    )}
                  </div>
                </td>
                <td style={{ fontWeight: 620 }}>
                  {s.name}
                  {!s.active && <span className="chip chip-completed" style={{ marginLeft: 8 }}>{t('retired')}</span>}
                </td>
                <td className="muted">{s.categoryName ?? '—'}</td>
                <td>{t('minutes', { count: s.durationMin })}</td>
                {/* "Cleanup time" instead of "buffer" — same data, words an owner uses. */}
                <td className="muted">{s.bufferAfterMin > 0 ? t('minutes', { count: s.bufferAfterMin }) : t('noCleanup')}</td>
                <td>{formatMoney(s.priceMinor, s.currency)}</td>
                <td>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <button type="button" className="row-edit-btn" onClick={() => setEditing(s)}>
                      <IconEdit /> {t('edit')}
                    </button>
                    {s.active ? (
                      <button type="button" className="btn btn-ghost btn-danger" disabled={busyId === s.id} onClick={() => askRetire(s)}>
                        {t('retire')}
                      </button>
                    ) : (
                      <button type="button" className="btn btn-ghost" disabled={busyId === s.id} onClick={() => setActive(s, true)}>
                        {t('restore')}
                      </button>
                    )}
                    <button type="button" className="btn btn-ghost btn-danger" disabled={busyId === s.id} onClick={() => askDelete(s)}>
                      {t('delete')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </PaginatedTable>
        )}
      </div>

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
          categories={categories}
          branchId={branchId}
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
