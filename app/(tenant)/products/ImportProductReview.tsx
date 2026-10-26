'use client';

import { useTranslations } from 'next-intl';
import { useMemo, useRef, useState } from 'react';
import { api, ApiError, formatMoney } from '../lib/api';
import type { Product, ProductImportResult } from '../lib/api-types';
import { IconChevronRight } from '../components/icons';
import { useAreas } from '../components/SessionProvider';
import {
  countDrafts,
  hasStockToChoose,
  matchExisting,
  MAX_NEW_CATEGORIES,
  newCategoryNames,
  reviewProblems,
  rupeeText,
  stockNotApplied,
  stockToAdd,
  toItems,
  type ProductDraft,
  type ProductProblem,
} from './product-import';

type Filter = 'all' | 'fix' | 'existing' | 'skipped';

/** The cells the owner can open a row to fix, in the order they are drawn. `numeric` ones bring up the number keypad. */
const EDITABLE: { key: keyof ProductDraft & string; field: 'name' | 'price' | 'stock' | 'barcode' | 'gst' | 'hsn' | 'cost' | 'sku' | 'category' | 'lowStock'; numeric?: 'numeric' | 'decimal' }[] = [
  { key: 'name', field: 'name' },
  { key: 'price', field: 'price', numeric: 'decimal' },
  { key: 'stock', field: 'stock', numeric: 'numeric' },
  { key: 'barcode', field: 'barcode' },
  { key: 'gst', field: 'gst', numeric: 'decimal' },
  { key: 'hsn', field: 'hsn', numeric: 'numeric' },
  { key: 'cost', field: 'cost', numeric: 'decimal' },
  { key: 'sku', field: 'sku' },
  { key: 'category', field: 'category' },
  { key: 'lowStock', field: 'lowStock', numeric: 'numeric' },
];

/**
 * Review by exception, as the price-list import does it: a long list is mostly right, so a row is one line of text
 * and only opens into fields when something is wrong with it or the owner taps it. The count on the button is the
 * count of rows that block it, and the button takes you to the first.
 *
 * A row that is not going in — a negative number, a repeat, one the owner skipped — says so on its line, and is
 * listed again after the import.
 */
export function ImportProductReview({
  drafts,
  setDrafts,
  shelf,
  categories,
  branchId,
  addStock,
  setAddStock,
  onBack,
  onImported,
}: {
  drafts: ProductDraft[];
  setDrafts: (fn: (prev: ProductDraft[]) => ProductDraft[]) => void;
  shelf: Product[];
  /** The names of the categories the branch already has. */
  categories: string[];
  branchId: string;
  /** Add the file's counts to the shelf's for products already on it, instead of leaving those counts alone. */
  addStock: boolean;
  setAddStock: (on: boolean) => void;
  onBack: () => void;
  onImported: (result: ProductImportResult) => void;
}) {
  const t = useTranslations('products.import');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<number | null>(null);
  const rowRefs = useRef(new Map<number, HTMLLIElement>());

  /*
   * A kitchen (`catalog.stock_counted` off) imports its MENU: the names, the prices, the categories are the whole
   * point of a file. A Stock column in one is read and then dropped, here in ONE place rather than at each of the
   * six things below that would otherwise honour it — so no count is offered, none is asked about, none is sent,
   * and a silly number in that column cannot block a menu that is otherwise fine. The API drops it too
   * (`importProducts`), which is the boundary; this is so the owner is never shown a count to decide about.
   */
  const counted = useAreas().stock;
  const rows = useMemo(() => (counted ? drafts : drafts.map((d) => ({ ...d, stock: '' }))), [counted, drafts]);
  const adding = counted && addStock;

  const problems = useMemo(() => reviewProblems(rows, shelf, adding), [rows, shelf, adding]);
  const counts = countDrafts(rows, problems);
  const newCategories = useMemo(() => newCategoryNames(rows, categories), [rows, categories]);
  const tooManyCategories = newCategories.length > MAX_NEW_CATEGORIES;
  const stockUnused = stockNotApplied(rows, adding);
  const stockChoice = counted && hasStockToChoose(rows);
  const stockAdding = stockToAdd(rows);
  const chipCount: Record<Filter, number> = { all: rows.length, fix: counts.fix, existing: counts.update, skipped: counts.skipped };
  // A filter whose rows have all been fixed would show an empty list; go back to the whole one instead.
  const shown: Filter = filter !== 'all' && chipCount[filter] === 0 ? 'all' : filter;
  const visible = rows
    .map((draft, index) => ({ draft, index, problem: problems[index] ?? null }))
    .filter(({ draft, problem }) => (shown === 'fix' ? problem !== null : shown === 'existing' ? !draft.skip && !!draft.existing : shown === 'skipped' ? draft.skip : true));
  const toSave = counts.create + counts.update;

  const update = (i: number, patch: Partial<ProductDraft>) =>
    setDrafts((prev) =>
      prev.map((d, idx) => {
        if (idx !== i) return d;
        const next = { ...d, ...patch };
        // Naming a different product, or a different code, may make this row a correction of one already on the shelf.
        if ('name' in patch || 'barcode' in patch || 'sku' in patch) next.existing = matchExisting(next, shelf);
        return next;
      }),
    );

  const reveal = (index: number) => {
    setFilter('all');
    setEditing(index);
    window.setTimeout(() => rowRefs.current.get(index)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 0);
  };

  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      onImported(await api.importProducts(branchId, toItems(rows, adding)));
    } catch (err) {
      setError(err instanceof ApiError && err.status < 500 ? err.message : t('importFailed'));
      // The API names the row of the file it objected to; take the owner to it rather than leave them to hunt.
      const row = err instanceof ApiError ? (err.body as { row?: unknown } | undefined)?.row : undefined;
      const at = typeof row === 'number' ? rows.findIndex((d) => d.row === row) : -1;
      if (at >= 0) reveal(at);
    } finally {
      setBusy(false);
    }
  };

  const goToProblem = () => {
    const at = problems.findIndex((p) => p !== null);
    if (at < 0) return;
    setFilter('fix');
    setEditing(at);
    window.setTimeout(() => rowRefs.current.get(at)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 0);
  };

  const chips: Array<{ key: Filter; label: string }> = [
    { key: 'all', label: t('filterAll') },
    { key: 'fix', label: t('filterFix') },
    { key: 'existing', label: t('filterExisting') },
    { key: 'skipped', label: t('filterSkipped') },
  ];
  const problemText = (p: ProductProblem) => t(`problems.${p}`);

  return (
    <>
      {/* A kitchen has a menu, not a shelf, and dishes on it rather than products. */}
      <p className="confirm-body">{t(counted ? 'summary' : 'summaryUncounted', { create: counts.create, update: counts.update })}</p>
      {newCategories.length > 0 && (
        <p className={tooManyCategories ? 'field-error' : 'confirm-body'} role={tooManyCategories ? 'alert' : undefined}>
          {tooManyCategories
            ? t('tooManyCategories', { count: newCategories.length, max: MAX_NEW_CATEGORIES })
            : t('newCategories', { count: newCategories.length, names: newCategories.join(', ') })}
        </p>
      )}
      {stockChoice && (
        <>
          <div className="rv-chips" role="group" aria-label={t('stockModeLabel')}>
            <button type="button" className="rv-chip" aria-pressed={!addStock} onClick={() => setAddStock(false)}>
              {t('stockModeLeave')}
            </button>
            <button type="button" className="rv-chip" aria-pressed={addStock} onClick={() => setAddStock(true)}>
              {t('stockModeAdd')}
            </button>
          </div>
          <p className="confirm-body">{adding ? t('stockModeAddNote', { count: stockAdding.count, units: stockAdding.units }) : t('stockNotApplied', { count: stockUnused })}</p>
        </>
      )}
      {counts.skipped > 0 && <p className="confirm-body">{t('willSkip', { count: counts.skipped })}</p>}
      <div className="rv-chips" role="group" aria-label={t('filterLabel')}>
        {chips
          .filter((c) => c.key === 'all' || chipCount[c.key] > 0)
          .map((c) => (
            <button key={c.key} type="button" className={`rv-chip ${c.key === 'fix' ? 'is-fix' : ''}`} aria-pressed={shown === c.key} onClick={() => setFilter(c.key)}>
              {c.label} <b>{chipCount[c.key]}</b>
            </button>
          ))}
      </div>

      <div className="rv-list">
        <ul className="rv-rows">
          {visible.map(({ draft: d, index: i, problem }) => {
            const open = !d.skip && (editing === i || problem !== null);
            const meta = [
              d.price.trim() ? rupeeText(d.price) : d.existing ? formatMoney(d.existing.priceMinor, d.existing.currency) : t('noPrice'),
              !d.existing && d.stock.trim() ? t('stockShort', { n: d.stock }) : null,
              adding && d.existing && Number(d.stock) > 0 ? t('stockAddShort', { n: d.stock }) : null,
              d.barcode.trim() || null,
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <li
                key={i}
                ref={(el) => {
                  if (el) rowRefs.current.set(i, el);
                  else rowRefs.current.delete(i);
                }}
                className={`rv-row ${d.skip ? 'is-skipped' : ''} ${problem ? 'is-bad' : ''} ${open ? 'is-open' : ''}`}
              >
                <div className="rv-line">
                  <button type="button" className="rv-summary" aria-expanded={open} disabled={d.skip} onClick={() => setEditing(editing === i ? null : i)}>
                    <span className="rv-main">
                      <span className="rv-name">{d.name.trim() || d.existing?.name || t('unnamed')}</span>
                      <span className="rv-meta">{meta}</span>
                      {d.skip && d.skipReason ? (
                        <span className="import-issue rv-flag">{t(`skipped.${d.skipReason}`)}</span>
                      ) : problem ? (
                        <span className="import-issue rv-flag">{problemText(problem)}</span>
                      ) : d.existing ? (
                        <span className="chip chip-reminder rv-flag">{t(d.existing.active ? 'haveIt' : 'retiredHaveIt', { price: formatMoney(d.existing.priceMinor, d.existing.currency) })}</span>
                      ) : null}
                    </span>
                    {!d.skip && (
                      <span className={`rv-chevron ${open ? 'is-open' : ''}`} aria-hidden="true">
                        <IconChevronRight />
                      </span>
                    )}
                  </button>
                  {d.skip && (
                    <button type="button" className="btn btn-ghost rv-include" onClick={() => update(i, { skip: false, skipReason: null })}>
                      {t('include')}
                    </button>
                  )}
                </div>

                {open && (
                  <div className="rv-edit">
                    {(counted
                      ? EDITABLE
                      : EDITABLE.filter(
                          (f) =>
                            f.key !== 'stock' &&
                            f.key !== 'lowStock' &&
                            f.key !== 'barcode' &&
                            f.key !== 'sku' &&
                            f.key !== 'hsn',
                        )
                    ).map((f) => {
                      // A correction never renames a product or moves its count; the cell is shown, not editable.
                      const locked = !!d.existing && (f.key === 'name' || (f.key === 'stock' && !adding));
                      const fieldLabel =
                        f.key === 'stock' && d.existing && adding
                          ? t('fields.addStock')
                          : !counted && f.field === 'name'
                            ? t('fields.nameUncounted')
                            : t(`fields.${f.field}`);
                      return (
                        <label key={f.key} className={`field ${f.key === 'name' ? 'rv-field-name' : ''}`}>
                          <span className="field-label">{fieldLabel}</span>
                          <input
                            type="text"
                            inputMode={f.numeric}
                            value={locked && f.key === 'name' ? d.existing!.name : (d[f.key] as string)}
                            readOnly={locked}
                            title={locked ? t('correctionOnly') : undefined}
                            aria-label={t('rowCell', { n: d.row, field: fieldLabel })}
                            onChange={(e) => update(i, { [f.key]: e.target.value } as Partial<ProductDraft>)}
                          />
                        </label>
                      );
                    })}
                    <button type="button" className="btn btn-ghost rv-skip" onClick={() => update(i, { skip: true, skipReason: 'owner' })}>
                      {t('skip')}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {error && (
        <div role="alert" className="field-error" style={{ marginTop: 12 }}>
          {error}
        </div>
      )}
      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={onBack}>
          {t('back')}
        </button>
        <button type="button" className="btn" disabled={busy || toSave === 0 || tooManyCategories} onClick={counts.fix > 0 ? goToProblem : apply}>
          {busy ? t('importing') : counts.fix > 0 ? t('fixFirst', { count: counts.fix }) : t(counted ? 'importN' : 'importNUncounted', { count: toSave })}
        </button>
      </div>
    </>
  );
}


