'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, formatMoney, type SeedCatalog, type ServiceAdmin } from '../lib/api';
import { byNameIndex, type Draft } from './import-drafts';
import { ImportReview } from './ImportReview';
import { ConfirmDialog } from '../components/ConfirmDialog';
import {
  SCALE_STEP,
  SCALE_MIN,
  SCALE_MAX,
  blankRow,
  buildMatcher,
  deriveCategories,
  effectivePrice,
  fromEditRow,
  rowProblem,
  toEditRow,
  type EditRow,
  type WorkingService,
} from './catalogue-logic';

/**
 * What the editor is open on. `original` is null for a category being created, and
 * is kept separate from `name` so the header's field can rename an existing one.
 */
interface EditTarget {
  /** 'all' is the flat editor: every service in the catalogue, in one list. */
  scope: 'category' | 'all';
  original: string | null;
  name: string;
}

/** formatMoney speaks the API's string minor units; the seed catalogue counts in numbers. */
function money(minor: number | null): string {
  return formatMoney(minor === null ? null : String(minor));
}

/**
 * Board 3b — the ready-made catalogue, edited down.
 *
 * Three screens: pick the categories you offer, open any one of them to add,
 * remove or re-price the services inside it, then the same review table every
 * other route ends in.
 */
export function CataloguePicker({
  existing,
  branchId,
  onBack,
  onClose,
  onImported,
}: {
  /** Jira GRW-378 — the branch this screen is showing; everything added here lands there. */
  branchId: string;

  existing: ServiceAdmin[];
  onBack: () => void;
  onClose: () => void;
  onImported: () => void;
}) {
  const t = useTranslations('services.catalogue');
  const tp = useTranslations('services');
  const [catalog, setCatalog] = useState<SeedCatalog | null>(null);
  const [services, setServices] = useState<WorkingService[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scalePct, setScalePct] = useState(0);
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [rows, setRows] = useState<EditRow[]>([]);
  const [search, setSearch] = useState('');
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  // Monotonic, because `rows.length` is not: add, remove, add would hand the
  // second new row the key the first one already had, and React would reuse the
  // wrong input.
  const nextRowId = useRef(0);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const byName = useMemo(() => byNameIndex(existing), [existing]);

  useEffect(() => {
    let live = true;
    api
      .seedCatalog(branchId)
      .then((c) => {
        if (!live) return;
        setCatalog(c);
        setServices(c.services.map((s) => ({ ...s, edited: false })));
      })
      .catch((err) => live && setLoadError(err instanceof Error ? err.message : t('loadFailed')));
    return () => {
      live = false;
    };
  }, []);

  const order = useMemo(() => catalog?.categories.map((c) => c.name) ?? [], [catalog]);
  const categories = useMemo(() => deriveCategories(services, order, scalePct), [services, order, scalePct]);

  // What is in the list is what gets imported. There is no second "but not this
  // one" state: a category the owner does not offer is deleted, not unticked.
  const fresh = services.filter((s) => !s.alreadyHave);
  const skipped = services.length - fresh.length;

  /* ---------- category editor ---------- */

  const toRow = (s: WorkingService, key: string): EditRow => toEditRow(s, key, scalePct);

  const openEditor = (category: string) => {
    setRows(services.filter((s) => s.category === category).map((s, i) => toRow(s, `${category}-${i}`)));
    setSearch('');
    setEditing({ scope: 'category', original: category, name: category });
  };

  /**
   * Every service in the catalogue, in one list. One category at a time is fine
   * for a tidy-up; it is the wrong shape when the owner wants to sweep the whole
   * price list in one pass, or move something into a different category.
   */
  const openAllEditor = () => {
    setRows(services.map((s, i) => toRow(s, `all-${i}`)));
    setSearch('');
    setEditing({ scope: 'all', original: null, name: t('allServices') });
  };

  /**
   * A vertical's catalogue cannot know every trade. A salon that also does
   * threading, or a garage the seed never anticipated, adds its own here — same
   * editor, starting empty.
   */
  const addCategory = () => {
    setRows([blankRow(nextRowId.current++, '')]);
    setSearch('');
    setEditing({ scope: 'category', original: null, name: '' });
  };

  /** Another category already using this name — renaming onto it would merge two lists silently. */
  const nameTaken =
    !!editing &&
    editing.scope === 'category' &&
    categories.some((c) => c.name.toLowerCase() === editing.name.trim().toLowerCase() && c.name !== editing.original);

  const updateRow = (key: string, patch: Partial<EditRow>) =>
    setRows((prev) =>
      prev.map((r) =>
        r.key === key
          ? // Only touching the price opts this row out of "adjust all prices".
            // Renaming a service is not a statement about what it costs.
            { ...r, ...patch, edited: r.edited || patch.price !== undefined }
          : r,
      ),
    );

  const addRow = () =>
    setRows((prev) => [
      ...prev,
      blankRow(nextRowId.current++, editing?.scope === 'all' ? (categories[0]?.name ?? '') : (editing?.name ?? '')),
    ]);

  const removeRow = (key: string) => setRows((prev) => prev.filter((r) => r.key !== key));

  const saveEditor = () => {
    if (!editing) return;
    const category = editing.name.trim();
    // In the flat editor each row says which category it belongs to; in a category
    // editor they all belong to the one being edited (possibly just renamed).
    const rebuilt: WorkingService[] = rows.map((r) =>
      fromEditRow(r, editing.scope === 'all' ? r.category : category, (n) => byName.has(n)),
    );

    if (editing.scope === 'all') {
      setServices(rebuilt);
      setEditing(null);
      return;
    }

    // Replace this category's block where it stood, so the order the vertical
    // declared survives an edit; a brand-new category lands at the end.
    setServices((prev) => {
      if (editing.original === null) return [...prev, ...rebuilt];
      const out: WorkingService[] = [];
      let inserted = false;
      for (const s of prev) {
        if (s.category !== editing.original) {
          out.push(s);
          continue;
        }
        if (!inserted) {
          out.push(...rebuilt);
          inserted = true;
        }
      }
      if (!inserted) out.push(...rebuilt);
      return out;
    });

    setEditing(null);
  };

  /**
   * Drop the whole category and everything in it.
   *
   * The single "I do not offer this" action. It only edits the working copy — the
   * vertical's own catalogue is untouched, and leaving the picker and coming back
   * reloads the full 52 from the API, so nothing here is a one-way door.
   */
  const deleteCategory = (gone: string) => {
    setServices((prev) => prev.filter((s) => s.category !== gone));
    setConfirmDelete(null);
    // Only leave the editor if it was open on the category that just went.
    setEditing((prev) => (prev?.original === gone ? null : prev));
  };

  /* Raised from either screen, so it is built once and dropped into both. */
  const deleteConfirm = confirmDelete ? (
    <ConfirmDialog
      title={t('deleteTitle', { name: confirmDelete })}
      body={t('deleteBody', { count: services.filter((s) => s.category === confirmDelete).length })}
      detail={t('deleteDetail')}
      confirmLabel={t('deleteConfirm')}
      tone="danger"
      onConfirm={() => deleteCategory(confirmDelete)}
      onCancel={() => setConfirmDelete(null)}
    />
  ) : null;

  // Jira GRW-478 (U-10) — plain words only: the ".*" pattern switch is gone, an owner is not asked for a regex.
  const matcher = useMemo(() => buildMatcher(search, false), [search]);
  // Display only. `rows` stays whole: filtering must never quietly drop a service
  // from what Save writes back, nor hide a row that is blocking the save.
  const visibleRows = rows.filter((r) => matcher.test(r));
  const editorBlocked = rows.filter((r) => rowProblem(r) !== null).length;
  const hiddenBlocked = rows.filter((r) => rowProblem(r) !== null && !matcher.test(r)).length;
  const editorNameProblem =
    editing?.scope === 'all'
      ? null
      : !editing?.name.trim()
        ? t('giveName')
        : nameTaken
          ? t('nameTaken')
          : null;

  /* ---------- review ---------- */

  const review = () => {
    setDrafts(
      fresh.map((s) => {
        const price = effectivePrice(s, scalePct);
        return {
          name: s.name,
          categoryName: s.category ?? '',
          durationMin: String(s.durationMin),
          bufferAfterMin: String(s.bufferAfterMin),
          price: price === null ? '' : String(price / 100),
          existing: null,
          skip: false,
        };
      }),
    );
  };

  if (drafts) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal import-modal" onClick={(e) => e.stopPropagation()}>
          <h3>{t('reviewTitle')}</h3>
          <p className="confirm-body">{t('step2', { label: catalog?.label ?? '' })}</p>
          <ImportReview
            drafts={drafts}
            setDrafts={(fn) => setDrafts((prev) => (prev ? fn(prev) : prev))}
            onBack={() => setDrafts(null)}
            backLabel={t('backToCategories')}
            onImported={onImported}
            lookup={(name) => byName.get(name.trim().toLowerCase()) ?? null}
            branchId={branchId}
          />
        </div>
      </div>
    );
  }

  if (editing) {
    return (
      <>
        <div className="modal-backdrop" onClick={onClose}>
          <div className="modal modal-fit import-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cat-head">
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>
                {t('back')}
              </button>
              <div className="cat-head-name">
                <input
                  type="text"
                  className="cat-name-input"
                  value={editing.name}
                  aria-label={t('categoryNameAria')}
                  placeholder={t('categoryNamePlaceholder')}
                  onChange={(e) => setEditing((p) => (p ? { ...p, name: e.target.value } : p))}
                />
                <span className="muted">
                  {editorNameProblem ? (
                    <span className="import-issue">{editorNameProblem}</span>
                  ) : (
                    t('editorHint')
                  )}
                </span>
              </div>
            </div>

            {/* 52 rows is past the point of scanning by eye. Only the flat editor
                gets this — a category holds a handful. */}
            {editing.scope === 'all' && (
              <div className="cat-search">
                <input
                  type="search"
                  value={search}
                  aria-label={t('searchAria')}
                  placeholder={t('searchPlaceholder')}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <span className="muted cat-search-count">
                  {matcher.error ? (
                    <span className="import-issue">{tp(`patternErrors.${matcher.error}`)}</span>
                  ) : (
                    t('shownOf', { shown: visibleRows.length, total: rows.length })
                  )}
                </span>
              </div>
            )}

            <div className="import-review cat-edit-list modal-body is-boxed">
              <div
                className={`import-row cat-edit-row ${editing.scope === 'all' ? 'cat-edit-row-all' : ''} import-head`}
                aria-hidden="true"
              >
                <span className="ih-pad">{tp('cols.name')}</span>
                {editing.scope === 'all' && <span>{t('category')}</span>}
                <span className="ih-pad">{tp('cols.duration')}</span>
                <span>{tp('cols.price')}</span>
                <span>{tp('cols.status')}</span>
                <span />
              </div>
              {visibleRows.map((r) => {
                const issue = rowProblem(r);
                return (
                  <div
                    key={r.key}
                    className={`import-row cat-edit-row ${editing.scope === 'all' ? 'cat-edit-row-all' : ''} ${issue ? 'is-bad' : ''}`}
                  >
                    <input
                      type="text"
                      value={r.name}
                      aria-label={t('serviceNameAria')}
                      placeholder={t('serviceNamePlaceholder')}
                      onChange={(e) => updateRow(r.key, { name: e.target.value })}
                    />
                    {/* A pick-list, not free text: moving a service into a category
                        that does not exist yet is what "+ Add a category" is for. */}
                    {editing.scope === 'all' && (
                      <select
                        value={r.category}
                        aria-label={t('categoryAria')}
                        onChange={(e) => updateRow(r.key, { category: e.target.value })}
                      >
                        {categories.map((c) => (
                          <option key={c.name} value={c.name}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    )}
                    <input
                      type="text"
                      value={r.minutes}
                      aria-label={t('minutesAria')}
                      onChange={(e) => updateRow(r.key, { minutes: e.target.value })}
                    />
                    <span className="import-money">
                      <span className="import-money-sym" aria-hidden="true">
                        ₹
                      </span>
                      <input
                        type="text"
                        value={r.price}
                        aria-label={t('priceAria')}
                        onChange={(e) => updateRow(r.key, { price: e.target.value })}
                      />
                    </span>
                    <span className="import-note">
                      {issue ? (
                        <span className="import-issue">{tp(`problems.${issue}`)}</span>
                      ) : r.alreadyHave ? (
                        <span className="muted">{t('alreadyHaveIt')}</span>
                      ) : (
                        <span className="muted">{t('new')}</span>
                      )}
                    </span>
                    <button type="button" className="btn btn-ghost btn-danger" onClick={() => removeRow(r.key)}>
                      {t('remove')}
                    </button>
                  </div>
                );
              })}
            </div>

            <button type="button" className="btn btn-ghost cat-add-row" onClick={addRow}>
              {t('addServiceTo', { target: editing.scope === 'all' ? t('theCatalogue') : editing.name.trim() || t('thisCategory') })}
            </button>

            <div className="modal-actions cat-actions">
              <span className="muted">
                {t('footer', {
                  count: rows.length,
                  where: editing.scope === 'all' ? t('inCatalogue') : t('inCategory', { name: editing.name.trim() || t('thisCategory') }),
                })}
              </span>
              <div className="cat-actions-buttons">
                {/* Only an existing category can be deleted — abandoning one you are
                    still creating is what Back already does. */}
                {editing.original !== null && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-danger"
                    onClick={() => setConfirmDelete(editing.original)}
                  >
                    {t('deleteCategory')}
                  </button>
                )}
                {hiddenBlocked > 0 && (
                  <button type="button" className="linkish" onClick={() => setSearch('')}>
                    {t('hiddenBlocked', { count: hiddenBlocked })}
                  </button>
                )}
                <button
                  type="button"
                  className="btn"
                  disabled={editorBlocked > 0 || editorNameProblem !== null}
                  onClick={saveEditor}
                >
                  {editorBlocked > 0 ? t('fixFirst', { count: editorBlocked }) : t('save')}
                </button>
              </div>
            </div>
          </div>
        </div>
        {deleteConfirm}
      </>
    );
  }

  return (
    <>
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-fit import-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cat-head">
          <button type="button" className="btn btn-ghost" onClick={onBack}>
            {t('back')}
          </button>
          <div>
            <h3>{catalog?.label ?? t('readyMade')}</h3>
            <span className="muted">{t('step1')}</span>
          </div>
        </div>

        {loadError && <div role="alert" className="field-error">{loadError}</div>}
        {!catalog && !loadError && <div className="empty">{t('loading')}</div>}

        {catalog && (
          <>
              {/* Every catalogue-wide action sits above the list, including the
                  one that moves on: reaching any of them meant scrolling past
                  every category first. */}
              <div className="cat-toolbar">
                <button type="button" className="btn cat-edit-btn" onClick={addCategory}>
                  {t('addCategory')}
                </button>
                <button type="button" className="btn cat-edit-btn" onClick={openAllEditor}>
                  {t('reviewAll')}
                </button>
                {/* "Check", not a second "Review" — this one moves to the next
                    step, and two buttons reading Review would be a coin toss. */}
                <button
                  type="button"
                  className="btn cat-toolbar-next"
                  disabled={fresh.length === 0}
                  onClick={review}
                >
                  {t('next', { count: fresh.length })}
                </button>
              </div>

              <div className="cat-list-head">
                <span>
                  {t('stats', { categories: categories.length, services: services.length })}
                </span>
              </div>

              <div className="cat-list modal-body is-boxed">
                {categories.map((c) => {
                  const range =
                    c.minPriceMinor !== null && c.maxPriceMinor !== null
                      ? ` · ${money(c.minPriceMinor)}–${money(c.maxPriceMinor)}`
                      : '';
                  return (
                    <div key={c.name} className="cat-row">
                      <div className="cat-text">
                        <span className="cat-name">{c.name}</span>
                        {/* Two lines, not one string: clamped as a single line the
                            example names ate the space and the count and price
                            range — the half an owner actually needs — fell off. */}
                        <span className="muted cat-samples">{c.sample.join(', ')}…</span>
                        <span className="muted cat-stats">
                          {t('catStats', { count: c.count, range })}
                        </span>
                      </div>
                      <div className="cat-row-actions">
                        <button type="button" className="btn cat-edit-btn" onClick={() => openEditor(c.name)}>
                          {t('viewEdit')}
                        </button>
                        {/* Spelled out rather than a bin icon: an unlabelled glyph is
                            one more thing to work out, and this row is destructive. */}
                        <button
                          type="button"
                          className="btn btn-ghost btn-danger cat-delete-btn"
                          onClick={() => setConfirmDelete(c.name)}
                        >
                          {t('delete')}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="cat-scale">
                <div>
                  <strong>{t('adjust')}</strong>
                  <div className="muted">{t('adjustHint')}</div>
                </div>
                <div className="cat-stepper">
                  <button
                    type="button"
                    aria-label={t('lowerAria')}
                    disabled={scalePct <= SCALE_MIN}
                    onClick={() => setScalePct((p) => Math.max(SCALE_MIN, p - SCALE_STEP))}
                  >
                    −
                  </button>
                  <span>{scalePct > 0 ? `+${scalePct}%` : `${scalePct}%`}</span>
                  <button
                    type="button"
                    aria-label={t('raiseAria')}
                    disabled={scalePct >= SCALE_MAX}
                    onClick={() => setScalePct((p) => Math.min(SCALE_MAX, p + SCALE_STEP))}
                  >
                    ＋
                  </button>
                </div>
              </div>

              {/* Count only — the action it used to sit beside is now at the top. */}
              <div className="cat-footnote muted">
                {t('toAdd', { count: fresh.length })}
                {skipped > 0 && t('skippedNote', { count: skipped })}
              </div>
            </>
          )}
        </div>
      </div>
      {deleteConfirm}
    </>
  );
}
