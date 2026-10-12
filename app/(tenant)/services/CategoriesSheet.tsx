'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { api, type ServiceAdmin, type ServiceCategoryAdmin } from '../lib/api';
import { IconCheck, IconChevronRight, IconPlus, IconSearch } from '../components/icons';
import { CategoryRow, type CategoryRowMode } from './CategoryRow';
import { CategoryServices } from './CategoryServices';
import { FILTER_FROM, matchesFilter, movedOrder, unsorted, worthOrdering } from './category-order';
import { useDialog } from '../../shared/a11y/useDialog';

/**
 * Escape belongs to the field it was pressed in before it belongs to the sheet. `useDialog` listens on `document`
 * and React 19 mounts at `document` too, so `stopPropagation` — which only stops the event travelling on — does
 * nothing; the immediate form is what keeps the later listener from firing.
 */
const keepFromDialog = (e: { nativeEvent: Event }) => e.nativeEvent.stopImmediatePropagation();

/**
 * Jira GRW-428 — where an owner names, orders and removes their own categories.
 *
 * Until this, `service_category` had a GET and nothing else: a category existed only as a side effect of
 * seeding or a spreadsheet import, so a typo was permanent and a group the salon had stopped offering stayed in
 * the filter, the booking flow and the combo builder forever.
 *
 * On the app's shared `.modal-fit` shell, which is 380px wide and `100dvh`-aware — a phone sheet that happens
 * to centre itself on a desktop, rather than a desktop dialog squeezed onto a phone. Every row here is one
 * tappable thing with its controls beside it, at 44px, because this is used one-handed at a reception desk.
 *
 * Jira GRW-441 — reordering is a drag OR the ↑/↓ buttons, and the buttons are not a fallback to apologise
 * for: a keyboard reaches them, a thumb does not have to be precise with them, and HTML5 drag does not fire
 * on touch at all. The whole branch's order goes to the server in one call whichever is used.
 *
 * Jira GRW-591 — those controls are no longer on screen all the time. A row carried a grip, two arrows and a
 * rename permanently, which on a phone stacked into three lines: 172px per category, so a salon with 26 of
 * them saw 2.7 at a time and scrolled 4,472px to reach the last. The list is now one tappable line per
 * category — name, count, chevron, 53px — and the controls live behind Edit, the way a list that can be
 * reordered has worked on this platform since the first Settings app. Editing is a state you enter on
 * purpose, not four targets you have to aim past every time you want to open a category.
 */
export function CategoriesSheet({
  branchId,
  initial,
  services,
  onClose,
  onChanged,
  startIn = 'read',
}: {
  /** Jira GRW-378 — the branch on screen. A category belongs to one branch; nothing here reaches another. */
  branchId: string;
  initial: ServiceCategoryAdmin[];
  /** Every service of this branch, retired ones included — a category's own are picked out of it. */
  services: ServiceAdmin[];
  onClose: () => void;
  /** Called after anything is written, so the Services list behind reloads — a delete frees services it lists. */
  onChanged: () => void;
  /** Which state the sheet opens in. Only a test passes it: a static render cannot press Delete to get to `pick`. */
  startIn?: CategoryRowMode;
}) {
  const t = useTranslations('services.categories');
  const [rows, setRows] = useState(initial);
  const [adding, setAdding] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Jira GRW-591 · GRW-592 — which of the sheet's three states it is in.
   *
   * `read` is the list. `edit` is Edit on the title line: the handle, the arrows and the rename. `pick` is
   * Delete in the footer: ticks and nothing else. Two separate modes and not one, because an owner who
   * wants to delete a category should not have to look for it behind a button called Edit — which is
   * exactly what happened the first time this was built.
   */
  const [mode, setMode] = useState<CategoryRowMode>(startIn);
  /** The category opened into its own list of services; the sheet shows one or the other, never both. */
  const [openId, setOpenId] = useState<string | null>(null);
  /** Jira GRW-441 — the row being dragged, by index. Null whenever nothing is in flight. */
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  /** Jira GRW-591 — what the owner typed to find one category among many. Never leaves the browser. */
  const [filter, setFilter] = useState('');
  /** Jira GRW-591 — the add field, which is a row the owner opens, not one standing open under the list. */
  const [addOpen, setAddOpen] = useState(false);
  /** Jira GRW-591 — the loose services, named only when asked for. */
  const [looseOpen, setLooseOpen] = useState(false);
  /** Jira GRW-592 — the categories ticked for deletion. Empty whenever the sheet is not in edit mode. */
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  /** Jira GRW-592 — the confirmation, shown inside the sheet rather than on a layer above it. */
  const [confirming, setConfirming] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLInputElement>(null);
  const addRef = useRef<HTMLInputElement>(null);
  const pickAllRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const cancelConfirmRef = useRef<HTMLButtonElement>(null);
  const prevMode = useRef<CategoryRowMode>(mode);
  useDialog(dialogRef, { onClose: busy ? undefined : onClose });

  useEffect(() => {
    if (editingId) editRef.current?.focus();
  }, [editingId]);

  useEffect(() => {
    if (addOpen) addRef.current?.focus();
  }, [addOpen]);

  // The button that was pressed to change mode is unmounted by the change, which would drop focus on `body` and
  // send the next Tab to the top of the sheet. Put it on the first control of the state the owner just entered —
  // and back on Delete when they leave picking.
  useEffect(() => {
    if (mode === 'pick') pickAllRef.current?.focus();
    else if (prevMode.current === 'pick') deleteRef.current?.focus();
    prevMode.current = mode;
  }, [mode]);

  // The confirmation replaces the button that opened it; focus goes to its safe choice, inside the group that
  // announces what is being asked.
  useEffect(() => {
    if (confirming) cancelConfirmRef.current?.focus();
  }, [confirming]);

  /** One place for every write: the server's message is the owner's message, never a generic "failed". */
  const run = async <T,>(work: () => Promise<T>, after: (result: T) => void) => {
    setBusy(true);
    setError(null);
    try {
      after(await work());
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.failed'));
    } finally {
      setBusy(false);
    }
  };

  const closeAdd = () => {
    setAddOpen(false);
    setAdding('');
  };

  const add = async () => {
    const name = adding.trim();
    if (!name) return;
    await run(
      () => api.createCategory(branchId, name),
      (created) => {
        setRows((prev) => [...prev, created]);
        setAdding('');
        // The field stays open: a salon filling in its menu adds several in a row, not one.
        addRef.current?.focus();
        // Jira GRW-591 — and a filter that hides the row just created would make it look like it failed.
        setFilter('');
      },
    );
  };

  const rename = async (row: ServiceCategoryAdmin) => {
    const name = editingName.trim();
    if (!name || name === row.name) {
      setEditingId(null);
      return;
    }
    await run(
      () => api.renameCategory(branchId, row.id, name),
      (saved) => {
        setRows((prev) => prev.map((c) => (c.id === saved.id ? saved : c)));
        setEditingId(null);
      },
    );
  };

  /**
   * Moves one row and sends the WHOLE order: the server refuses a partial list rather than half-applying it.
   *
   * Jira GRW-441 — and puts the rows BACK if that write fails. They were shown moved straight away (this is a
   * two-tap-in-a-row control and must not feel laggy), which meant a failed save left the screen showing an
   * order the server did not have — the owner closed the sheet believing it was saved.
   */
  const moveTo = async (from: number, to: number) => {
    const next = movedOrder(rows, from, to);
    if (next.length !== rows.length || next.every((c, i) => c.id === rows[i]?.id)) return;
    const before = rows;
    setRows(next);
    setBusy(true);
    setError(null);
    try {
      setRows(await api.reorderCategories(branchId, next.map((c) => c.id)));
      onChanged();
    } catch (err) {
      setRows(before);
      setError(err instanceof Error && err.message ? err.message : t('reorderFailed'));
    } finally {
      setBusy(false);
    }
  };

  const move = (index: number, by: -1 | 1) => moveTo(index, index + by);

  /**
   * Jira GRW-592 — deletes the ticked categories, one call each, and keeps whichever ones succeeded.
   *
   * Sequential and not `Promise.all`: these are deletes, and a half-failed batch has to leave the screen
   * showing exactly what is still there. The first failure stops the run and says so; the rows that went
   * are already gone from the list, so a second press retries only the rest.
   */
  const deletePicked = async () => {
    // Only what is ticked AND on screen: the confirmation named that count, and nothing hidden is deleted.
    const ids = pickedRows.map((c) => c.id);
    if (ids.length === 0) return;
    setBusy(true);
    setError(null);
    const gone: string[] = [];
    try {
      for (const id of ids) {
        await api.deleteCategory(branchId, id);
        gone.push(id);
      }
      setMode('read');
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t('errors.failed'));
    } finally {
      if (gone.length > 0) {
        setRows((prev) => prev.filter((c) => !gone.includes(c.id)));
        setPicked((prev) => new Set([...prev].filter((id) => !gone.includes(id))));
        // The services they held are loose now, and the sheet is the only screen that says so.
        onChanged();
      }
      setConfirming(false);
      setBusy(false);
    }
  };

  /** Back to the list, with nothing half-done left behind it. */
  const toRead = () => {
    setError(null);
    setMode('read');
    setEditingId(null);
    setPicked(new Set());
    setConfirming(false);
  };

  // Looked up by id rather than held as an object, so a count that changed behind the detail view is the one shown.
  const open = rows.find((c) => c.id === openId) ?? null;
  const loose = unsorted(services);
  /**
   * Jira GRW-441 — a handle, two arrows and a sentence about order, above a list of one, change nothing.
   *
   * Jira GRW-591 — and neither does an order over a filtered list. The rows between two of the ones on
   * screen are hidden, so "move down" would move a category past something the owner cannot see; the
   * arrows go until the search is cleared, rather than silently meaning something else.
   */
  /** Jira GRW-591 — the field appears at a dozen, which is where scanning the list stops working. */
  const filterable = rows.length >= FILTER_FROM;
  // A term only counts while the field that holds it is on screen: delete below a dozen rows with one typed and
  // the list would otherwise stay filtered by something nobody can see or clear.
  const searching = filterable && filter.trim() !== '';
  const orderable = worthOrdering(rows) && !searching;
  const editing = mode === 'edit';
  const picking = mode === 'pick';
  const shown = searching ? rows.filter((c) => matchesFilter(c.name, filter)) : rows;
  /**
   * Jira GRW-592 — "all" means all of what is on screen. With a search running, ticking Select all and
   * getting back the twenty-six it was hiding is how an owner deletes their whole menu by accident.
   */
  const allPicked = shown.length > 0 && shown.every((c) => picked.has(c.id));
  /**
   * Ticked AND on screen. A tick on a row the search has since hidden is not counted, not named by the
   * confirmation and not deleted — what the owner can see ticked is exactly what goes.
   */
  const pickedRows = shown.filter((c) => picked.has(c.id));
  /** What the confirmation has to promise: the services that come loose, not ones that are deleted. */
  const releasing = pickedRows.reduce((n, c) => n + c.serviceCount, 0);

  return (
    <>
      <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
        <div
          className="modal modal-fit"
          role="dialog"
          aria-modal="true"
          aria-label={t('title')}
          ref={dialogRef}
          onClick={(e) => e.stopPropagation()}
        >
          {open ? (
            <CategoryServices
              branchId={branchId}
              category={open}
              services={services.filter((s) => s.categoryId === open.id)}
              onBack={() => setOpenId(null)}
              onChanged={async (gone) => {
                if (gone) {
                  setRows((prev) => prev.filter((c) => c.id !== open.id));
                  setOpenId(null);
                } else {
                  // A retire changed this category's counts; re-read rather than guess at them here.
                  setRows(await api.categoriesAtBranch(branchId).catch(() => rows));
                }
                onChanged();
              }}
            />
          ) : (
            <>
          {/*
            Jira GRW-591 — Edit sits on the trailing edge of the sheet's own title, which is where a list
            that can be reordered has always kept it. It appears whenever there is a row to act on: with a
            single category there is nothing to order, but there is still a name to fix.
          */}
          <div className="svc-cat-title">
            <h3>{t('title')}</h3>
            {/*
              Jira GRW-592 — Select all lives up here, not as the first row of the list.

              As a row it was the first of twenty-six, so on the branch this was built for it scrolled off
              the top the moment the owner went looking for the fourth category to tick. The one control
              that acts on the WHOLE list cannot be a thing you scroll back up to find.
            */}
            {picking ? (
              <button
                type="button"
                ref={pickAllRef}
                className="svc-cat-editbtn"
                disabled={busy || shown.length === 0}
                onClick={() =>
                  setPicked((prev) => {
                    const next = new Set(prev);
                    for (const c of shown) (allPicked ? next.delete(c.id) : next.add(c.id));
                    return next;
                  })
                }
              >
                {allPicked ? t('clearPicked') : t('pickAllCats')}
              </button>
            ) : (
              rows.length > 0 && (
                <>
                  {/* Jira GRW-592 — the way into picking, beside Edit, where an owner looks for an action. */}
                  {!editing && (
                    <button
                      type="button"
                      ref={deleteRef}
                      className="svc-cat-editbtn is-danger"
                      disabled={busy}
                      onClick={() => {
                        setError(null);
                        setEditingId(null);
                        setPicked(new Set());
                        setMode('pick');
                      }}
                    >
                      {t('delete')}
                    </button>
                  )}
                  <button
                    type="button"
                    className="svc-cat-editbtn"
                    disabled={busy}
                    aria-pressed={editing}
                    onClick={() => (editing ? toRead() : (setError(null), setPicked(new Set()), setConfirming(false), setMode('edit')))}
                  >
                    {editing ? t('done') : t('edit')}
                  </button>
                </>
              )
            )}
          </div>
          {/*
            Jira GRW-441 — say what the order is FOR. One category is not an order, so the sentence waits.
            Jira GRW-591 — and the sentence about dragging is not shown in the state that cannot drag. The
            subtitle explaining what a category is goes when the filter arrives: by twelve of them the owner
            has worked out what a category is, and the line is in the way of the field that finds one.
          */}
          {(mode !== 'read' || !filterable) && (
            <p className="svc-cat-hint">
              {picking
                ? pickedRows.length > 0
                  ? t('pickedCount', { count: pickedRows.length, total: rows.length })
                  : t('pickHint')
                : editing
                  ? orderable
                    ? t('editHint')
                    : t('renameHint')
                  : t('hint')}
            </p>
          )}

          {/*
            Jira GRW-591 — past a dozen categories, finding one means reading all of them. The field is the
            answer, and it is above the scroll region rather than in it, so it stays put while the list moves.
          */}
          {filterable && (
            <div className="svc-cat-filter">
              <IconSearch />
              <input
                type="search"
                value={filter}
                placeholder={t('filterPlaceholder')}
                aria-label={t('filterPlaceholder')}
                onChange={(e) => {
                  setFilter(e.target.value);
                  // What a confirmation promised was counted against the list as it was.
                  setConfirming(false);
                }}
                onKeyDown={(e) => {
                  // Escape clears a search before it closes a sheet; useDialog listens on the document.
                  if (e.key === 'Escape' && filter !== '') {
                    keepFromDialog(e);
                    setFilter('');
                    setConfirming(false);
                  }
                }}
              />
            </div>
          )}

          <div className="modal-body">
            {error && (
              <div role="alert" className="field-error" style={{ marginBottom: 10 }}>
                {error}
              </div>
            )}

            {/*
              A filtered list is not an order: the rows between two of them are hidden, so "move down" would
              move a category past something the owner cannot see. The arrows go, and the sheet says why,
              rather than moving a row somewhere nobody asked for.
            */}
            {editing && searching && worthOrdering(rows) && (
              <p className="svc-cat-foot svc-cat-foot-top">{t('filteredNoOrder')}</p>
            )}

            {rows.length === 0 ? (
              <p className="svc-cat-meta">{t('none')}</p>
            ) : shown.length === 0 ? (
              <p className="svc-cat-meta">{t('noMatch', { term: filter.trim() })}</p>
            ) : null}

            {/*
              The add row is part of this list and is rendered whenever the list is — including when there are
              no categories, or none match, which are the two states where an owner most needs it. It is only
              withheld while rows are being picked off.
            */}
            {(shown.length > 0 || !picking) && (
              <ul className="svc-cat-list">
                {shown.map((row) => {
                  // The index into the WHOLE list, never the filtered one — it is what a move is sent as.
                  const i = rows.indexOf(row);
                  return editingId === row.id ? (
                    /* The rename takes over its own row: the field, Save, Cancel, and no other control. */
                    <li className="svc-cat-row" key={row.id}>
                      <div className="svc-cat-edit">
                        <input
                          ref={editRef}
                          type="text"
                          value={editingName}
                          maxLength={60}
                          aria-label={t('renameAria', { name: row.name })}
                          // Selected on open: a rename almost always replaces the name rather than appending to it.
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void rename(row);
                            if (e.key === 'Escape') {
                              keepFromDialog(e);
                              setEditingId(null);
                            }
                          }}
                        />
                        <button type="button" className="btn" disabled={busy} onClick={() => void rename(row)}>
                          {t('save')}
                        </button>
                        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setEditingId(null)}>
                          {t('cancel')}
                        </button>
                      </div>
                    </li>
                  ) : (
                    <CategoryRow
                      key={row.id}
                      row={row}
                      mode={mode}
                      orderable={orderable}
                      busy={busy}
                      atTop={i === 0}
                      atBottom={i === rows.length - 1}
                      dragging={dragFrom === i}
                      selected={picked.has(row.id)}
                      onToggle={() =>
                        setPicked((prev) => {
                          const next = new Set(prev);
                          next.has(row.id) ? next.delete(row.id) : next.add(row.id);
                          return next;
                        })
                      }
                      onOpen={() => setOpenId(row.id)}
                      onRename={() => {
                        setEditingId(row.id);
                        setEditingName(row.name);
                      }}
                      onMove={(by) => void move(i, by)}
                      onDragStart={() => setDragFrom(i)}
                      onDragEnd={() => setDragFrom(null)}
                      onDragOver={(e) => {
                        if (dragFrom !== null) e.preventDefault();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (dragFrom !== null) void moveTo(dragFrom, i);
                        setDragFrom(null);
                      }}
                    />
                  );
                })}

                {/*
                  Jira GRW-591 — adding is a row at the foot of the list, not a field standing open below it.
                  Jira GRW-592 — and not there at all while rows are being picked off: the one thing nobody
                  is doing on the way to a delete is making another category.
                  The field and its button were 110px of chrome under all 26 rows, which is where the owner
                  had to scroll to reach the thing they do most often. The footnote about empty categories
                  comes with it: it is advice about what you are doing, exactly when you are doing it.
                */}
                {!picking && (
                <li className="svc-cat-row" key="add">
                  {addOpen ? (
                    <div className="svc-cat-edit">
                      <input
                        ref={addRef}
                        type="text"
                        value={adding}
                        maxLength={60}
                        placeholder={t('addPlaceholder')}
                        aria-label={t('addPlaceholder')}
                        onChange={(e) => setAdding(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void add();
                          if (e.key === 'Escape') {
                            keepFromDialog(e);
                            closeAdd();
                          }
                        }}
                      />
                      <button type="button" className="btn" disabled={busy || !adding.trim()} onClick={() => void add()}>
                        {t('add')}
                      </button>
                      <button type="button" className="btn btn-ghost" disabled={busy} onClick={closeAdd}>
                        {t('cancel')}
                      </button>
                      <p className="svc-cat-foot">{t('emptyStayHidden')}</p>
                    </div>
                  ) : (
                    <button type="button" className="svc-cat-addrow" disabled={busy} onClick={() => setAddOpen(true)}>
                      <IconPlus />
                      <span>{t('addOpen')}</span>
                    </button>
                  )}
                </li>
                )}
              </ul>
            )}

            {/*
              Jira GRW-441 — Unsorted is NOT a category. It cannot be renamed, reordered or deleted; it is a
              view of the services whose `category_id` is null, which are hidden from the booking page with
              nothing on any screen saying so.

              Jira GRW-591 — and it is one row until it is asked for. It used to print every loose service
              by name under the list, which on the branch that found this was a second list as long as the
              first, below the first, with the thing it is warning about buried at the bottom of it.
            */}
            {loose.length > 0 && (
              <div className="svc-cat-unsorted">
                <button
                  type="button"
                  className="svc-cat-text svc-cat-unsorted-head"
                  aria-expanded={looseOpen}
                  onClick={() => setLooseOpen((on) => !on)}
                >
                  <span className="svc-cat-name">{t('unsorted')}</span>
                  <span className="svc-cat-meta">{t('unsortedCount', { count: loose.length })}</span>
                  <span className={`svc-cat-chevron ${looseOpen ? 'is-open' : ''}`} aria-hidden="true">
                    <IconChevronRight />
                  </span>
                </button>
                {looseOpen && (
                  <>
                    <ul className="svc-cat-unsorted-list">
                      {loose.map((s) => (
                        <li key={s.id}>{s.name}</li>
                      ))}
                    </ul>
                    <p className="svc-cat-foot">{t('unsortedHint')}</p>
                  </>
                )}
              </div>
            )}
          </div>

          {/*
            Jira GRW-591 — "Close", not "Done". Every write on this sheet has already happened by the time
            this is pressed, and with Edit's own Done on screen at the same time, two buttons saying the same
            word meant two different things one above the other.
          */}
          <div className="modal-actions svc-cat-sheet-actions">
            {/*
              Jira GRW-592 — the confirmation lives inside the sheet, not on a layer above it: a dialog over
              a dialog over the page is one more thing than anybody can follow their way back out of.

              What it promises is what the server actually does. Deleting a category does NOT delete the
              services in it — they stay on the list with no category, which hides them from clients until
              they are filed again. Saying "deleted for good" here would be a lie that costs an owner a
              menu they still have.
            */}
            {confirming ? (
              <div className="svc-cat-confirm-group" role="alertdialog" aria-labelledby="svc-cat-confirm-title" aria-describedby="svc-cat-confirm-detail">
                <p id="svc-cat-confirm-title" className="svc-cat-confirm-body">
                  {t('deleteCatsTitle', { count: pickedRows.length })}
                </p>
                <p id="svc-cat-confirm-detail" className="svc-cat-confirm-detail">
                  {releasing === 0 ? t('deleteCatsEmpty', { count: pickedRows.length }) : t('deleteCatsKeeps', { count: releasing, categories: pickedRows.length })}
                </p>
                <button type="button" className="btn btn-ghost btn-danger svc-cat-action" disabled={busy} onClick={() => void deletePicked()}>
                  {busy ? t('working') : t('deleteCatsAction', { count: pickedRows.length })}
                </button>
                <button
                  type="button"
                  ref={cancelConfirmRef}
                  className="btn btn-ghost svc-cat-action"
                  disabled={busy}
                  onClick={() => setConfirming(false)}
                >
                  {t('cancel')}
                </button>
              </div>
            ) : (
              <>
                {/*
                  Jira GRW-592 — the footer EXECUTES; the title line is where the modes are entered.

                  The destructive press stays down here on purpose: `.modal-fit > * { flex: none }` means
                  this bar is pinned however long the list is, so it is always reachable, and it is at the
                  thumb end rather than up among the controls an owner is scanning past.

                  Disabled until something is ticked, labelled with what it is waiting for — the convention
                  the delete card next door already uses.
                */}
                {picking && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-danger svc-cat-action"
                    disabled={busy || pickedRows.length === 0}
                    onClick={() => setConfirming(true)}
                  >
                    {pickedRows.length === 0 ? t('pickToDelete') : t('deleteCatsAction', { count: pickedRows.length })}
                  </button>
                )}
                <button type="button" className="btn btn-ghost svc-cat-action" disabled={busy} onClick={picking ? toRead : onClose}>
                  {picking ? t('cancel') : t('close')}
                </button>
              </>
            )}
          </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
