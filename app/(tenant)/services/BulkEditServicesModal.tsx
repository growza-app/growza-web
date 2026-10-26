'use client';

import { useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useDialog } from '../../shared/a11y/useDialog';
import { api, ApiError, type ServiceAdmin, type ServiceCategory } from '../lib/api';
import { IconClose, IconEdit, IconSearch, IconTrash } from '../components/icons';

interface ServiceDraft {
  name: string;
  categoryId: string;
  durationMin: string;
  priceRupees: string;
  active: boolean;
}

function toServiceDraft(s: ServiceAdmin): ServiceDraft {
  const priceNum = s.priceMinor != null ? Number(s.priceMinor) / 100 : null;
  return {
    name: s.name,
    categoryId: s.categoryId ?? '',
    durationMin: String(s.durationMin),
    priceRupees: priceNum != null && Number.isFinite(priceNum) ? String(priceNum) : '',
    active: s.active,
  };
}

function isServiceDirty(s: ServiceAdmin, d: ServiceDraft | undefined): boolean {
  if (!d) return false;
  const orig = toServiceDraft(s);
  return (
    d.name.trim() !== orig.name.trim() ||
    d.categoryId !== orig.categoryId ||
    d.durationMin.trim() !== orig.durationMin.trim() ||
    d.priceRupees.trim() !== orig.priceRupees.trim() ||
    d.active !== orig.active
  );
}

export function BulkEditServicesModal({
  branchId,
  serviceLabel,
  services,
  categories,
  onChanged,
  onClose,
}: {
  branchId: string;
  serviceLabel: string;
  services: ServiceAdmin[];
  categories: ServiceCategory[];
  onChanged: () => Promise<void> | void;
  onClose: () => void;
}) {
  const t = useTranslations('services');
  const tc = useTranslations('common');

  const [catFilter, setCatFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [drafts, setDrafts] = useState<Record<string, ServiceDraft>>({});
  const [addingCat, setAddingCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [renamingCat, setRenamingCat] = useState(false);
  const [renameCatValue, setRenameCatValue] = useState('');
  const [confirmMode, setConfirmMode] = useState<'shown' | 'category' | null>(null);
  const [busy, setBusy] = useState(false);
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedBanner, setSavedBanner] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialog(dialogRef, {
    onClose: () => {
      if (!busy) onClose();
    },
    initialFocus: 'container',
  });

  const noneCount = useMemo(() => services.filter((s) => s.categoryId === null).length, [services]);
  const catCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of services) {
      if (s.categoryId) map.set(s.categoryId, (map.get(s.categoryId) ?? 0) + 1);
    }
    return map;
  }, [services]);

  const selectedCategoryObj = useMemo(
    () => (catFilter !== 'all' && catFilter !== 'none' ? categories.find((c) => c.id === catFilter) ?? null : null),
    [catFilter, categories],
  );

  const shownRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return services.filter((s) => {
      if (catFilter === 'none' && s.categoryId !== null) return false;
      if (catFilter !== 'all' && catFilter !== 'none' && s.categoryId !== catFilter) return false;
      if (q.length > 0) {
        const draftName = drafts[s.id]?.name ?? s.name;
        const catName = s.categoryName ?? '';
        if (!draftName.toLowerCase().includes(q) && !catName.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [services, catFilter, search, drafts]);

  const dirtyServices = useMemo(
    () => services.filter((s) => isServiceDirty(s, drafts[s.id])),
    [services, drafts],
  );

  const getField = (s: ServiceAdmin): ServiceDraft => drafts[s.id] ?? toServiceDraft(s);

  const updateField = (s: ServiceAdmin, patch: Partial<ServiceDraft>) => {
    setSavedBanner(false);
    setDrafts((prev) => {
      const cur = prev[s.id] ?? toServiceDraft(s);
      const next = { ...cur, ...patch };
      if (!isServiceDirty(s, next)) {
        const copy = { ...prev };
        delete copy[s.id];
        return copy;
      }
      return { ...prev, [s.id]: next };
    });
  };

  const handleAddCategory = async () => {
    const trimmed = newCatName.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api.createCategory(branchId, trimmed);
      await onChanged();
      setNewCatName('');
      setAddingCat(false);
      setCatFilter(created.id);
    } catch (err) {
      setError(err instanceof ApiError && err.status < 500 ? err.message : tc('actionFailed'));
    } finally {
      setBusy(false);
    }
  };

  const handleRenameCategory = async () => {
    if (!selectedCategoryObj) return;
    const trimmed = renameCatValue.trim();
    if (!trimmed || trimmed === selectedCategoryObj.name) {
      setRenamingCat(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.renameCategory(branchId, selectedCategoryObj.id, trimmed);
      await onChanged();
      setRenamingCat(false);
    } catch (err) {
      setError(err instanceof ApiError && err.status < 500 ? err.message : tc('actionFailed'));
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteOne = async (s: ServiceAdmin) => {
    setRowBusyId(s.id);
    setError(null);
    try {
      await api.deleteService(branchId, s.id);
      await onChanged();
      setDrafts((prev) => {
        const copy = { ...prev };
        delete copy[s.id];
        return copy;
      });
    } catch (err) {
      setError(err instanceof ApiError && err.status < 500 ? err.message : tc('actionFailed'));
    } finally {
      setRowBusyId(null);
    }
  };

  const formatBlockedMessage = (
    blocked: Array<{
      id: string;
      name: string;
      blockers: { offers: Array<{ id: string; title: string }>; questions: Array<{ id: string; label: string }>; waitingInQueue: number };
    }>,
  ) => {
    const reasons = blocked.map((b) => {
      const why =
        b.blockers.offers.length > 0
          ? t('categories.blockedByOffer', { offers: b.blockers.offers.map((o) => o.title).join(', ') })
          : b.blockers.questions.length > 0
            ? t('categories.blockedByQuestion', { questions: b.blockers.questions.map((q) => q.label).join(', ') })
            : t('categories.blockedByQueue');
      return `${b.name} (${why})`;
    });
    return `${t('categories.blockedHead', { count: blocked.length })}: ${reasons.join(', ')}. ${t('categories.blockedFoot')}`;
  };

  const handleDeleteShown = async () => {
    if (shownRows.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const ids = shownRows.map((s) => s.id);
      const blockedAll: Array<{
        id: string;
        name: string;
        blockers: { offers: Array<{ id: string; title: string }>; questions: Array<{ id: string; label: string }>; waitingInQueue: number };
      }> = [];
      for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100);
        const res = await api.deleteServices(branchId, chunk);
        if (res.blocked.length > 0) blockedAll.push(...res.blocked);
      }
      await onChanged();
      const blockedIds = new Set(blockedAll.map((b) => b.id));
      setDrafts((prev) => {
        const copy = { ...prev };
        for (const id of ids) {
          if (!blockedIds.has(id)) delete copy[id];
        }
        return copy;
      });
      setConfirmMode(null);
      if (blockedAll.length > 0) {
        setError(formatBlockedMessage(blockedAll));
      }
    } catch (err) {
      setError(err instanceof ApiError && err.status < 500 ? err.message : tc('actionFailed'));
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteCategoryAndItems = async () => {
    if (!selectedCategoryObj) return;
    setBusy(true);
    setError(null);
    try {
      const catId = selectedCategoryObj.id;
      const inCatIds = services.filter((s) => s.categoryId === catId).map((s) => s.id);
      const blockedAll: Array<{
        id: string;
        name: string;
        blockers: { offers: Array<{ id: string; title: string }>; questions: Array<{ id: string; label: string }>; waitingInQueue: number };
      }> = [];
      for (let i = 0; i < inCatIds.length; i += 100) {
        const chunk = inCatIds.slice(i, i + 100);
        const res = await api.deleteServices(branchId, chunk);
        if (res.blocked.length > 0) blockedAll.push(...res.blocked);
      }
      const blockedIds = new Set(blockedAll.map((b) => b.id));
      setDrafts((prev) => {
        const copy = { ...prev };
        for (const id of inCatIds) {
          if (!blockedIds.has(id)) delete copy[id];
        }
        return copy;
      });
      if (blockedAll.length > 0) {
        await onChanged();
        setConfirmMode(null);
        setError(formatBlockedMessage(blockedAll));
      } else {
        await api.deleteCategory(branchId, catId);
        await onChanged();
        setConfirmMode(null);
        setCatFilter('all');
      }
    } catch (err) {
      setError(err instanceof ApiError && err.status < 500 ? err.message : tc('actionFailed'));
    } finally {
      setBusy(false);
    }
  };

  const handleSaveChanges = async () => {
    if (dirtyServices.length === 0) return;
    const payloads: Array<{ id: string; body: { name: string; categoryId: string | null; durationMin: number; priceMinor: number | null; active: boolean } }> = [];
    for (const s of dirtyServices) {
      const d = drafts[s.id];
      if (!d) continue;
      const name = d.name.trim();
      if (!name) {
        setError(t('problems.needsName'));
        return;
      }
      const durationMin = Math.round(Number(d.durationMin));
      if (!Number.isFinite(durationMin) || durationMin <= 0) {
        setError(t('problems.needsDuration'));
        return;
      }
      let priceMinor: number | null = null;
      if (d.priceRupees.trim() !== '') {
        const priceNum = Number(d.priceRupees);
        if (!Number.isFinite(priceNum) || priceNum < 0) {
          setError(t('problems.priceNotNumber'));
          return;
        }
        priceMinor = Math.round(priceNum * 100);
      }
      payloads.push({
        id: s.id,
        body: { name, categoryId: d.categoryId || null, durationMin, priceMinor, active: d.active },
      });
    }

    setBusy(true);
    setError(null);
    setSavedBanner(false);
    const savedIds = new Set<string>();
    try {
      for (const item of payloads) {
        await api.updateService(item.id, item.body);
        savedIds.add(item.id);
      }
      setSavedBanner(true);
    } catch (err) {
      setError(err instanceof ApiError && err.status < 500 ? err.message : tc('actionFailed'));
    } finally {
      if (savedIds.size > 0) {
        await onChanged();
        setDrafts((prev) => {
          const copy = { ...prev };
          for (const id of savedIds) delete copy[id];
          return copy;
        });
      }
      setBusy(false);
    }
  };

  return (
    <div className="sheet-backdrop bulk-edit-backdrop" role="presentation" onClick={() => !busy && onClose()}>
      <div
        ref={dialogRef}
        className="bulk-edit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-edit-services-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="bulk-edit-head">
          <div className="bulk-edit-head-copy">
            <h2 id="bulk-edit-services-title" className="bulk-edit-title">
              {t('bulkTable.title', { label: serviceLabel })}
            </h2>
            <span className="bulk-edit-sub">
              {t('bulkTable.subtitle', { shown: shownRows.length, total: services.length })}
            </span>
          </div>
          <button
            type="button"
            className="btn btn-ghost bulk-edit-close"
            aria-label={t('bulkTable.done')}
            disabled={busy}
            onClick={onClose}
          >
            <IconClose />
          </button>
        </header>

        <div className="bulk-edit-bar">
          <div className="bulk-edit-tools">
            <label className="search-wrap bulk-edit-search">
              <IconSearch />
              <input
                type="search"
                className="search-input search-input-bare"
                placeholder={t('catalogue.searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>

            <select
              className="bulk-cell-select bulk-cat-filter-select"
              aria-label={t('cols.category')}
              value={catFilter}
              onChange={(e) => {
                setCatFilter(e.target.value);
                setConfirmMode(null);
                setRenamingCat(false);
              }}
            >
              <option value="all">
                {t('desk.status.all')} ({services.length})
              </option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({catCounts.get(c.id) ?? 0})
                </option>
              ))}
              {noneCount > 0 || catFilter === 'none' ? (
                <option value="none">
                  {t('bulkTable.noCategory')} ({noneCount})
                </option>
              ) : null}
            </select>

            {addingCat ? (
              <div className="bulk-add-cat-inline">
                <input
                  type="text"
                  className="bulk-cell-input bulk-add-cat-input"
                  placeholder={t('bulkTable.addCategoryPlaceholder')}
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleAddCategory();
                    } else if (e.key === 'Escape') {
                      setAddingCat(false);
                      setNewCatName('');
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn bulk-add-cat-save"
                  disabled={busy || !newCatName.trim()}
                  onClick={() => void handleAddCategory()}
                >
                  {t('categories.add')}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost bulk-add-cat-cancel"
                  disabled={busy}
                  onClick={() => {
                    setAddingCat(false);
                    setNewCatName('');
                  }}
                >
                  {t('categories.cancel')}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-ghost bulk-add-cat-pill"
                onClick={() => setAddingCat(true)}
              >
                <span>{t('bulkTable.addCategoryBtn')}</span>
              </button>
            )}

            <div className="bulk-edit-actions">
              {selectedCategoryObj ? (
                renamingCat ? (
                  <div className="bulk-add-cat-inline">
                    <input
                      type="text"
                      className="bulk-cell-input bulk-add-cat-input"
                      aria-label={t('bulkTable.renameCategory', { name: selectedCategoryObj.name })}
                      value={renameCatValue}
                      onChange={(e) => setRenameCatValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void handleRenameCategory();
                        } else if (e.key === 'Escape') {
                          setRenamingCat(false);
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="btn bulk-add-cat-save"
                      disabled={busy || !renameCatValue.trim()}
                      onClick={() => void handleRenameCategory()}
                    >
                      {t('bulkTable.renameSave')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost bulk-add-cat-cancel"
                      disabled={busy}
                      onClick={() => setRenamingCat(false)}
                    >
                      {t('categories.cancel')}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn btn-ghost bulk-rename-btn"
                    disabled={busy}
                    onClick={() => {
                      setRenameCatValue(selectedCategoryObj.name);
                      setRenamingCat(true);
                      setConfirmMode(null);
                    }}
                  >
                    <IconEdit />
                    <span>{t('bulkTable.renameCategory', { name: selectedCategoryObj.name })}</span>
                  </button>
                )
              ) : null}

              {selectedCategoryObj ? (
                <button
                  type="button"
                  className="btn btn-danger bulk-delete-btn"
                  disabled={busy}
                  onClick={() => setConfirmMode('category')}
                >
                  <IconTrash />
                  <span>
                    {t('bulkTable.deleteCategoryAndItems', {
                      name: selectedCategoryObj.name,
                      count: catCounts.get(selectedCategoryObj.id) ?? 0,
                    })}
                  </span>
                </button>
              ) : null}

              {shownRows.length > 0 ? (
                <button
                  type="button"
                  className="btn btn-danger bulk-delete-btn"
                  disabled={busy}
                  onClick={() => setConfirmMode('shown')}
                >
                  <IconTrash />
                  <span>
                    {catFilter === 'none'
                      ? t('bulkTable.deleteAllInNone', { count: shownRows.length })
                      : t('bulkTable.deleteAllShown', { count: shownRows.length })}
                  </span>
                </button>
              ) : null}
            </div>
          </div>

          {confirmMode ? (
            <div className="bulk-confirm-bar" role="alert">
              <span className="bulk-confirm-text">
                {confirmMode === 'category' && selectedCategoryObj
                  ? t('bulkTable.confirmDeleteCategory', {
                      name: selectedCategoryObj.name,
                      count: catCounts.get(selectedCategoryObj.id) ?? 0,
                    })
                  : t('bulkTable.confirmDeleteShown', { count: shownRows.length })}
              </span>
              <div className="bulk-confirm-btns">
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={busy}
                  onClick={() =>
                    void (confirmMode === 'category' ? handleDeleteCategoryAndItems() : handleDeleteShown())
                  }
                >
                  {busy
                    ? t('bulkTable.deleting')
                    : t('bulkTable.confirmYes', {
                        count:
                          confirmMode === 'category' && selectedCategoryObj
                            ? catCounts.get(selectedCategoryObj.id) ?? 0
                            : shownRows.length,
                      })}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() => setConfirmMode(null)}
                >
                  {t('bulkTable.confirmCancel')}
                </button>
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="banner banner-danger" role="alert">
              {error}
            </div>
          ) : null}
          {savedBanner ? (
            <div className="banner" role="status">
              {t('bulkTable.saved')}
            </div>
          ) : null}
        </div>

        <div className="bulk-edit-table-wrap">
          {shownRows.length === 0 ? (
            <div className="empty">{t('empty')}</div>
          ) : (
            <table className="bulk-edit-table">
              <thead>
                <tr>
                  <th>{t('cols.name')}</th>
                  <th>{t('cols.category')}</th>
                  <th className="bulk-th-num">{t('bulkTable.minutes')}</th>
                  <th className="bulk-th-num">{t('bulkTable.priceRupees')}</th>
                  <th>{t('cols.status')}</th>
                  <th className="bulk-th-act">{t('delete')}</th>
                </tr>
              </thead>
              <tbody>
                {shownRows.map((s) => {
                  const d = getField(s);
                  const dirty = isServiceDirty(s, drafts[s.id]);
                  const rowBusy = rowBusyId === s.id;
                  return (
                    <tr key={s.id} className={dirty ? 'is-dirty' : undefined}>
                      <td className="bulk-td-name">
                        <input
                          type="text"
                          className="bulk-cell-input"
                          aria-label={`${t('cols.name')} — ${s.name}`}
                          value={d.name}
                          disabled={busy || rowBusy}
                          onChange={(e) => updateField(s, { name: e.target.value })}
                        />
                      </td>
                      <td className="bulk-td-cat" data-label={t('cols.category')}>
                        <select
                          className="bulk-cell-select"
                          aria-label={`${t('cols.category')} — ${s.name}`}
                          value={d.categoryId}
                          disabled={busy || rowBusy}
                          onChange={(e) => updateField(s, { categoryId: e.target.value })}
                        >
                          <option value="">{t('bulkTable.noCategory')}</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="bulk-td-num bulk-td-price" data-label={t('bulkTable.minutes')}>
                        <input
                          type="number"
                          min="1"
                          step="5"
                          className="bulk-cell-input bulk-cell-num"
                          aria-label={`${t('bulkTable.minutes')} — ${s.name}`}
                          value={d.durationMin}
                          disabled={busy || rowBusy}
                          onChange={(e) => updateField(s, { durationMin: e.target.value })}
                        />
                      </td>
                      <td className="bulk-td-num bulk-td-cost" data-label={t('bulkTable.priceRupees')}>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          className="bulk-cell-input bulk-cell-num"
                          aria-label={`${t('bulkTable.priceRupees')} — ${s.name}`}
                          placeholder="—"
                          value={d.priceRupees}
                          disabled={busy || rowBusy}
                          onChange={(e) => updateField(s, { priceRupees: e.target.value })}
                        />
                      </td>
                      <td className="bulk-td-status" data-label={t('cols.status')}>
                        <select
                          className="bulk-cell-select"
                          aria-label={`${t('cols.status')} — ${s.name}`}
                          value={d.active ? 'active' : 'retired'}
                          disabled={busy || rowBusy}
                          onChange={(e) => updateField(s, { active: e.target.value === 'active' })}
                        >
                          <option value="active">{t('bulkTable.active')}</option>
                          <option value="retired">{t('bulkTable.retired')}</option>
                        </select>
                      </td>
                      <td className="bulk-td-act">
                        <button
                          type="button"
                          className="btn btn-ghost bulk-row-del"
                          aria-label={t('bulkTable.deleteRowAria', { name: s.name })}
                          title={t('bulkTable.deleteRowAria', { name: s.name })}
                          disabled={busy || rowBusy}
                          onClick={() => void handleDeleteOne(s)}
                        >
                          <IconTrash />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <footer className="bulk-edit-foot">
          <div className="bulk-edit-foot-status">
            {dirtyServices.length > 0
              ? t('bulkTable.changedCount', { count: dirtyServices.length })
              : t('bulkTable.subtitle', { shown: shownRows.length, total: services.length })}
          </div>
          <div className="bulk-edit-foot-btns">
            {dirtyServices.length > 0 ? (
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy}
                onClick={() => setDrafts({})}
              >
                {t('bulkTable.discard')}
              </button>
            ) : null}
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>
              {t('bulkTable.done')}
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy || dirtyServices.length === 0}
              onClick={() => void handleSaveChanges()}
            >
              {busy ? t('bulkTable.saving') : t('bulkTable.saveChanges', { count: dirtyServices.length })}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
