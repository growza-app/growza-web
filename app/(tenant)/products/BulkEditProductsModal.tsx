'use client';

import { useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useDialog } from '../../shared/a11y/useDialog';
import { api, ApiError, type Product, type ProductCategory } from '../lib/api';
import { useNouns } from '../lib/use-nouns';
import { IconClose, IconEdit, IconSearch, IconTrash } from '../components/icons';

interface DraftFields {
  name: string;
  categoryId: string;
  priceRupees: string;
  costRupees: string;
  active: boolean;
}

function toDraft(p: Product): DraftFields {
  const priceNum = Number(p.priceMinor) / 100;
  const costNum = p.costMinor != null ? Number(p.costMinor) / 100 : null;
  return {
    name: p.name,
    categoryId: p.categoryId ?? '',
    priceRupees: Number.isFinite(priceNum) ? String(priceNum) : '0',
    costRupees: costNum != null && Number.isFinite(costNum) ? String(costNum) : '',
    active: p.active,
  };
}

function isRowDirty(p: Product, d: DraftFields | undefined): boolean {
  if (!d) return false;
  const orig = toDraft(p);
  return (
    d.name.trim() !== orig.name.trim() ||
    d.categoryId !== orig.categoryId ||
    d.priceRupees.trim() !== orig.priceRupees.trim() ||
    d.costRupees.trim() !== orig.costRupees.trim() ||
    d.active !== orig.active
  );
}

export function BulkEditProductsModal({
  branchId,
  counted,
  products,
  categories,
  onProductsChange,
  onCategoriesChange,
  onClose,
}: {
  branchId: string;
  counted: boolean;
  products: Product[];
  categories: ProductCategory[];
  onProductsChange: (next: Product[]) => void;
  onCategoriesChange: (next: ProductCategory[]) => void;
  onClose: () => void;
}) {
  const t = useTranslations('products');
  const tc = useTranslations('common');
  const nouns = useNouns();

  const [catFilter, setCatFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [drafts, setDrafts] = useState<Record<string, DraftFields>>({});
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

  const noneCount = useMemo(() => products.filter((p) => p.categoryId === null).length, [products]);
  const catCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of products) {
      if (p.categoryId) map.set(p.categoryId, (map.get(p.categoryId) ?? 0) + 1);
    }
    return map;
  }, [products]);

  const selectedCategoryObj = useMemo(
    () => (catFilter !== 'all' && catFilter !== 'none' ? categories.find((c) => c.id === catFilter) ?? null : null),
    [catFilter, categories],
  );

  const shownRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (catFilter === 'none' && p.categoryId !== null) return false;
      if (catFilter !== 'all' && catFilter !== 'none' && p.categoryId !== catFilter) return false;
      if (q.length > 0) {
        const draftName = drafts[p.id]?.name ?? p.name;
        const catName = p.categoryName ?? '';
        if (!draftName.toLowerCase().includes(q) && !catName.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [products, catFilter, search, drafts]);

  const dirtyProducts = useMemo(
    () => products.filter((p) => isRowDirty(p, drafts[p.id])),
    [products, drafts],
  );

  const getField = (p: Product): DraftFields => drafts[p.id] ?? toDraft(p);

  const updateField = (p: Product, patch: Partial<DraftFields>) => {
    setSavedBanner(false);
    setDrafts((prev) => {
      const cur = prev[p.id] ?? toDraft(p);
      const next = { ...cur, ...patch };
      if (!isRowDirty(p, next)) {
        const copy = { ...prev };
        delete copy[p.id];
        return copy;
      }
      return { ...prev, [p.id]: next };
    });
  };

  const handleAddCategory = async () => {
    const trimmed = newCatName.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api.createProductCategory(branchId, trimmed);
      onCategoriesChange([...categories, created]);
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
      const updated = await api.renameProductCategory(branchId, selectedCategoryObj.id, trimmed);
      onCategoriesChange(categories.map((c) => (c.id === updated.id ? { ...c, name: updated.name } : c)));
      onProductsChange(
        products.map((p) => (p.categoryId === updated.id ? { ...p, categoryName: updated.name } : p)),
      );
      setRenamingCat(false);
    } catch (err) {
      setError(err instanceof ApiError && err.status < 500 ? err.message : tc('actionFailed'));
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteOne = async (p: Product) => {
    setRowBusyId(p.id);
    setError(null);
    try {
      await api.deleteProduct(p.id);
      const next = products.filter((x) => x.id !== p.id);
      onProductsChange(next);
      setDrafts((prev) => {
        const copy = { ...prev };
        delete copy[p.id];
        return copy;
      });
    } catch (err) {
      setError(err instanceof ApiError && err.status < 500 ? err.message : tc('actionFailed'));
    } finally {
      setRowBusyId(null);
    }
  };

  const handleDeleteShown = async () => {
    if (shownRows.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const ids = shownRows.map((p) => p.id);
      await api.deleteProducts(branchId, ids);
      const idSet = new Set(ids);
      const next = products.filter((p) => !idSet.has(p.id));
      onProductsChange(next);
      setDrafts((prev) => {
        const copy = { ...prev };
        for (const id of ids) delete copy[id];
        return copy;
      });
      setConfirmMode(null);
      if (catFilter === 'none' && next.every((p) => p.categoryId !== null)) {
        setCatFilter('all');
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
      await api.deleteProductCategory(branchId, catId, { deleteProducts: true });
      const nextProducts = products.filter((p) => p.categoryId !== catId);
      const nextCategories = categories.filter((c) => c.id !== catId);
      onProductsChange(nextProducts);
      onCategoriesChange(nextCategories);
      setConfirmMode(null);
      setCatFilter('all');
    } catch (err) {
      setError(err instanceof ApiError && err.status < 500 ? err.message : tc('actionFailed'));
    } finally {
      setBusy(false);
    }
  };

  const handleSaveChanges = async () => {
    if (dirtyProducts.length === 0) return;
    const payloads: Array<{ id: string; body: { name: string; categoryId: string | null; priceMinor: number; costMinor: number | null; active: boolean } }> = [];
    for (const p of dirtyProducts) {
      const d = drafts[p.id];
      if (!d) continue;
      const name = d.name.trim();
      if (!name) {
        setError(t('form.needName'));
        return;
      }
      const priceNum = Number(d.priceRupees);
      if (!Number.isFinite(priceNum) || priceNum < 0) {
        setError(t('form.belowZero'));
        return;
      }
      const priceMinor = Math.round(priceNum * 100);
      let costMinor: number | null = null;
      if (d.costRupees.trim() !== '') {
        const costNum = Number(d.costRupees);
        if (!Number.isFinite(costNum) || costNum < 0) {
          setError(t('form.belowZero'));
          return;
        }
        costMinor = Math.round(costNum * 100);
      }
      payloads.push({
        id: p.id,
        body: { name, categoryId: d.categoryId || null, priceMinor, costMinor, active: d.active },
      });
    }

    setBusy(true);
    setError(null);
    setSavedBanner(false);
    const updatedById = new Map<string, Product>();
    try {
      for (const item of payloads) {
        const saved = await api.updateProduct(item.id, item.body);
        updatedById.set(saved.id, saved);
      }
      setSavedBanner(true);
    } catch (err) {
      setError(err instanceof ApiError && err.status < 500 ? err.message : tc('actionFailed'));
    } finally {
      if (updatedById.size > 0) {
        const nextProducts = products.map((p) => updatedById.get(p.id) ?? p);
        onProductsChange(nextProducts);
        setDrafts((prev) => {
          const copy = { ...prev };
          for (const id of updatedById.keys()) delete copy[id];
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
        aria-labelledby="bulk-edit-products-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="bulk-edit-head">
          <div className="bulk-edit-head-copy">
            <h2 id="bulk-edit-products-title" className="bulk-edit-title">
              {t('bulkTable.title', { items: nouns.products.toLowerCase() })}
            </h2>
            <span className="bulk-edit-sub">
              {t('bulkTable.subtitle', { shown: shownRows.length, total: products.length })}
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
                placeholder={t(counted ? 'searchPlaceholder' : 'searchUncounted')}
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
                {t('filters.all')} ({products.length})
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
            <div className="empty">{t(counted ? 'filters.none.all' : 'filters.none.uncounted')}</div>
          ) : (
            <table className="bulk-edit-table">
              <thead>
                <tr>
                  <th>{t('cols.product', { product: nouns.Product })}</th>
                  <th>{t('cols.category')}</th>
                  <th className="bulk-th-num">{t('bulkTable.priceRupees')}</th>
                  <th className="bulk-th-num">{t('bulkTable.costRupees')}</th>
                  <th>{t('cols.status')}</th>
                  <th className="bulk-th-act">{t('delete')}</th>
                </tr>
              </thead>
              <tbody>
                {shownRows.map((p) => {
                  const d = getField(p);
                  const dirty = isRowDirty(p, drafts[p.id]);
                  const rowBusy = rowBusyId === p.id;
                  return (
                    <tr key={p.id} className={dirty ? 'is-dirty' : undefined}>
                      <td className="bulk-td-name">
                        <input
                          type="text"
                          className="bulk-cell-input"
                          aria-label={`${t('form.name')} — ${p.name}`}
                          value={d.name}
                          disabled={busy || rowBusy}
                          onChange={(e) => updateField(p, { name: e.target.value })}
                        />
                      </td>
                      <td className="bulk-td-cat" data-label={t('cols.category')}>
                        <select
                          className="bulk-cell-select"
                          aria-label={`${t('cols.category')} — ${p.name}`}
                          value={d.categoryId}
                          disabled={busy || rowBusy}
                          onChange={(e) => updateField(p, { categoryId: e.target.value })}
                        >
                          <option value="">{t('bulkTable.noCategory')}</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="bulk-td-num bulk-td-price" data-label={t('bulkTable.priceRupees')}>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          className="bulk-cell-input bulk-cell-num"
                          aria-label={`${t('bulkTable.priceRupees')} — ${p.name}`}
                          value={d.priceRupees}
                          disabled={busy || rowBusy}
                          onChange={(e) => updateField(p, { priceRupees: e.target.value })}
                        />
                      </td>
                      <td className="bulk-td-num bulk-td-cost" data-label={t('bulkTable.costRupees')}>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          className="bulk-cell-input bulk-cell-num"
                          aria-label={`${t('bulkTable.costRupees')} — ${p.name}`}
                          placeholder="—"
                          value={d.costRupees}
                          disabled={busy || rowBusy}
                          onChange={(e) => updateField(p, { costRupees: e.target.value })}
                        />
                      </td>
                      <td className="bulk-td-status" data-label={t('cols.status')}>
                        <select
                          className="bulk-cell-select"
                          aria-label={`${t('cols.status')} — ${p.name}`}
                          value={d.active ? 'active' : 'retired'}
                          disabled={busy || rowBusy}
                          onChange={(e) => updateField(p, { active: e.target.value === 'active' })}
                        >
                          <option value="active">{counted ? t('inStock') : t('strip.onMenu')}</option>
                          <option value="retired">{counted ? t('retired') : t('strip.offMenu')}</option>
                        </select>
                      </td>
                      <td className="bulk-td-act">
                        <button
                          type="button"
                          className="btn btn-ghost bulk-row-del"
                          aria-label={t('bulkTable.deleteRowAria', { name: p.name })}
                          title={t('bulkTable.deleteRowAria', { name: p.name })}
                          disabled={busy || rowBusy}
                          onClick={() => void handleDeleteOne(p)}
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
            {dirtyProducts.length > 0
              ? t('bulkTable.changedCount', { count: dirtyProducts.length })
              : t('bulkTable.subtitle', { shown: shownRows.length, total: products.length })}
          </div>
          <div className="bulk-edit-foot-btns">
            {dirtyProducts.length > 0 ? (
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
              disabled={busy || dirtyProducts.length === 0}
              onClick={() => void handleSaveChanges()}
            >
              {busy ? t('bulkTable.saving') : t('bulkTable.saveChanges', { count: dirtyProducts.length })}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
