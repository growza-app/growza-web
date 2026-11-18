'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { api, ApiError, type DiningArea, type DiningTable } from '../../../lib/api';
import { useWritable } from '../../../components/SessionProvider';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { IconArrowDown, IconArrowUp, IconEdit, IconRupee, IconTrash } from '../../../components/icons';
import { changeWords } from '../../../lib/area-prices';
import { AreaPricesSheet } from './AreaPricesSheet';

/**
 * Jira GRW-719 — a branch's room, set out the way the owner thinks of it: areas top to bottom, tables in each.
 *
 * The common path is three taps: name an area, "Add 10 tables", done — the API numbers them T1…T10 from the first
 * number free at the branch, so nobody types table names one by one. Everything else (rename, seats, move to another
 * area, reorder, remove) is per row.
 *
 * Every change answers with the whole room, and the screen draws THAT — never its own guess — so a refusal leaves the
 * room exactly as the server holds it, with the reason in plain words where the change was made. Reorder is up/down on
 * every width: one control that works one-handed on a phone, rather than a drag that only a mouse does well.
 */

type Editing = { tableId: string; name: string; seats: string; areaId: string } | null;
type Removing = { kind: 'area'; area: DiningArea } | { kind: 'table'; table: DiningTable } | null;

const seatsOf = (typed: string): number | null => (typed.trim() === '' ? null : Number(typed));

export function RoomSetup({ branchId, branchName, initial }: { branchId: string; branchName: string; initial: DiningArea[] | null }) {
  const t = useTranslations('settingsTables');
  const tp = useTranslations('areaPrices');
  const writable = useWritable();
  const [areas, setAreas] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ where: string; message: string } | null>(null);
  const [newArea, setNewArea] = useState('');
  const [quick, setQuick] = useState<Record<string, { count: string; seats: string; one: string }>>({});
  const [editing, setEditing] = useState<Editing>(null);
  const [renaming, setRenaming] = useState<{ areaId: string; name: string } | null>(null);
  const [removing, setRemoving] = useState<Removing>(null);
  // Jira GRW-734 — the area whose prices are being set.
  const [pricing, setPricing] = useState<DiningArea | null>(null);

  if (!areas) {
    return (
      <div className="card">
        <div className="card-body">
          <p className="field-hint">{t('roomLoadFailed')}</p>
        </div>
      </div>
    );
  }

  /** Run one change; draw the room the server answers with, or say why not where it was asked. */
  const run = async (where: string, change: () => Promise<{ areas: DiningArea[] }>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      setAreas((await change()).areas);
      return true;
    } catch (e) {
      setError({ where, message: e instanceof ApiError ? e.message : t('saveFailed') });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const quickOf = (areaId: string) => quick[areaId] ?? { count: '10', seats: '4', one: '' };
  const setQuickOf = (areaId: string, patch: Partial<{ count: string; seats: string; one: string }>) =>
    setQuick((q) => ({ ...q, [areaId]: { ...quickOf(areaId), ...patch } }));

  /** Swap two neighbours and send the whole order — areas, and every area's tables — as one change. */
  const move = (areaIndex: number, tableIndex: number | null, by: -1 | 1) => {
    const order = areas.map((a) => ({ id: a.id, tables: a.tables.map((x) => x.id) }));
    if (tableIndex === null) {
      const to = areaIndex + by;
      if (to < 0 || to >= order.length) return;
      [order[areaIndex], order[to]] = [order[to]!, order[areaIndex]!];
    } else {
      const list = order[areaIndex]!.tables;
      const to = tableIndex + by;
      if (to < 0 || to >= list.length) return;
      [list[tableIndex], list[to]] = [list[to]!, list[tableIndex]!];
    }
    void run(tableIndex === null ? 'areas' : areas[areaIndex]!.id, () =>
      api.reorderDiningTables(branchId, order.map((a) => a.id), Object.fromEntries(order.map((a) => [a.id, a.tables]))),
    );
  };

  const errorAt = (where: string) =>
    error?.where === where ? (
      <p className="al-error" role="alert">
        {error.message}
      </p>
    ) : null;

  const disabled = busy || !writable;
  const totalTables = areas.reduce((n, a) => n + a.tables.length, 0);

  return (
    <div className="dt-room">
      <p className="field-hint dt-room-intro">{t('roomIntro', { branch: branchName, tables: totalTables })}</p>

      {areas.length === 0 ? (
        <div className="card dt-empty">
          <div className="card-body">
            <h2 className="al-row-title">{t('emptyTitle')}</h2>
            <p className="field-hint">{t('emptyHint')}</p>
          </div>
        </div>
      ) : null}

      {areas.map((area, ai) => {
        const q = quickOf(area.id);
        return (
          <section className="card dt-area" key={area.id} aria-labelledby={`dt-area-${area.id}`}>
            <div className="card-body">
              <div className="dt-area-head">
                {renaming?.areaId === area.id ? (
                  <form
                    className="dt-inline-form"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (await run(area.id, () => api.renameDiningArea(area.id, renaming.name))) setRenaming(null);
                    }}
                  >
                    <input type="text" aria-label={t('areaName')} value={renaming.name} maxLength={40} onChange={(e) => setRenaming({ areaId: area.id, name: e.target.value })} />
                    <button type="submit" className="btn" disabled={disabled}>{t('save')}</button>
                    <button type="button" className="btn btn-ghost" onClick={() => setRenaming(null)}>{t('cancel')}</button>
                  </form>
                ) : (
                  <h2 id={`dt-area-${area.id}`} className="dt-area-name">
                    <span>{area.name}</span>
                    <span className="dt-table-sub">{t('tablesCount', { n: area.tables.length })}</span>
                  </h2>
                )}
                {renaming?.areaId === area.id ? null : (
                <div className="dt-actions dt-actions-tight">
                  <button type="button" className="btn btn-ghost dt-icon" aria-label={t('moveUp', { name: area.name })} disabled={disabled || ai === 0} onClick={() => move(ai, null, -1)}><IconArrowUp /></button>
                  <button type="button" className="btn btn-ghost dt-icon" aria-label={t('moveDown', { name: area.name })} disabled={disabled || ai === areas.length - 1} onClick={() => move(ai, null, 1)}><IconArrowDown /></button>
                  <button type="button" className="btn btn-ghost dt-icon" aria-label={t('renameName', { name: area.name })} disabled={disabled} onClick={() => setRenaming({ areaId: area.id, name: area.name })}><IconEdit /></button>
                  <button type="button" className="btn btn-ghost btn-danger dt-icon" aria-label={t('removeName', { name: area.name })} disabled={disabled} onClick={() => setRemoving({ kind: 'area', area })}><IconTrash /></button>
                </div>
                )}
              </div>
              {errorAt(area.id)}

              {/* Jira GRW-734 — what this area charges: the menu, or its own prices. */}
              <div className="ap-summary">
                <span className="ap-summary-words">
                  {area.pricing?.changeBp || Object.keys(area.pricing?.fixed ?? {}).length > 0
                    ? [
                        area.pricing?.changeBp ? tp('onMenu', { change: changeWords(area.pricing.changeBp) }) : null,
                        Object.keys(area.pricing?.fixed ?? {}).length > 0 ? tp('fixedCount', { n: Object.keys(area.pricing!.fixed).length }) : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')
                    : tp('menuPrices')}
                </span>
                <button type="button" className="btn btn-ghost ap-open" disabled={disabled} onClick={() => setPricing(area)}>
                  <IconRupee />
                  <span>{tp('set')}</span>
                </button>
              </div>

              <ul className="dt-tables">
                {area.tables.map((table, ti) =>
                  editing?.tableId === table.id ? (
                    <li className="dt-table" key={table.id}>
                      <form
                        className="dt-edit"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          const seats = seatsOf(editing.seats);
                          const ok = await run(table.id, () =>
                            api.updateDiningTable(table.id, {
                              ...(editing.name.trim() !== table.name ? { name: editing.name } : {}),
                              ...(seats !== table.seats ? { seats } : {}),
                              ...(editing.areaId !== area.id ? { areaId: editing.areaId } : {}),
                            }),
                          );
                          if (ok) setEditing(null);
                        }}
                      >
                        <label className="dt-field">
                          <span className="field-hint">{t('tableName')}</span>
                          <input type="text" value={editing.name} maxLength={20} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                        </label>
                        <label className="dt-field dt-field-short">
                          <span className="field-hint">{t('seats')}</span>
                          <input type="number" inputMode="numeric" min={1} max={50} value={editing.seats} onChange={(e) => setEditing({ ...editing, seats: e.target.value })} />
                        </label>
                        {areas.length > 1 ? (
                          <label className="dt-field">
                            <span className="field-hint">{t('area')}</span>
                            <select value={editing.areaId} onChange={(e) => setEditing({ ...editing, areaId: e.target.value })}>
                              {areas.map((a) => (
                                <option key={a.id} value={a.id}>{a.name}</option>
                              ))}
                            </select>
                          </label>
                        ) : null}
                        <div className="dt-actions">
                          <button type="submit" className="btn" disabled={disabled}>{t('save')}</button>
                          <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>{t('cancel')}</button>
                        </div>
                      </form>
                      {errorAt(table.id)}
                    </li>
                  ) : (
                    <li className="dt-table" key={table.id}>
                      <div className="dt-table-row">
                        <span className="dt-table-name">
                          <span>{table.name}</span>
                          {table.seats || table.openBill ? (
                            <span className="dt-table-sub">
                              {table.seats ? t('seatsCount', { n: table.seats }) : null}
                              {table.openBill ? <span className="dt-busy">{t('openBill')}</span> : null}
                            </span>
                          ) : null}
                        </span>
                        <span className="dt-actions dt-actions-tight">
                          <button type="button" className="btn btn-ghost dt-icon" aria-label={t('moveUp', { name: table.name })} disabled={disabled || ti === 0} onClick={() => move(ai, ti, -1)}><IconArrowUp /></button>
                          <button type="button" className="btn btn-ghost dt-icon" aria-label={t('moveDown', { name: table.name })} disabled={disabled || ti === area.tables.length - 1} onClick={() => move(ai, ti, 1)}><IconArrowDown /></button>
                          <button
                            type="button"
                            className="btn btn-ghost dt-icon"
                            aria-label={t('editName', { name: table.name })}
                            disabled={disabled}
                            onClick={() => setEditing({ tableId: table.id, name: table.name, seats: table.seats ? String(table.seats) : '', areaId: area.id })}
                          >
                            <IconEdit />
                          </button>
                          <button type="button" className="btn btn-ghost btn-danger dt-icon" aria-label={t('removeName', { name: table.name })} disabled={disabled} onClick={() => setRemoving({ kind: 'table', table })}><IconTrash /></button>
                        </span>
                      </div>
                      {errorAt(table.id)}
                    </li>
                  ),
                )}
              </ul>

              <form
                className="dt-add"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(`${area.id}-add`, () => api.addDiningTables(area.id, { count: Number(q.count), seats: seatsOf(q.seats) }));
                }}
              >
                <span className="dt-add-words">{t('addTablesA')}</span>
                <input type="number" inputMode="numeric" aria-label={t('howMany')} min={1} max={50} className="dt-num" value={q.count} onChange={(e) => setQuickOf(area.id, { count: e.target.value })} />
                <span className="dt-add-words">{t('addTablesB')}</span>
                <input type="number" inputMode="numeric" aria-label={t('seats')} min={1} max={50} className="dt-num" value={q.seats} onChange={(e) => setQuickOf(area.id, { seats: e.target.value })} />
                <span className="dt-add-words">{t('addTablesC')}</span>
                <button type="submit" className="btn" disabled={disabled}>{t('add')}</button>
              </form>
              <form
                className="dt-add"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await run(`${area.id}-add`, () => api.addDiningTables(area.id, { name: q.one, seats: seatsOf(q.seats) }))) setQuickOf(area.id, { one: '' });
                }}
              >
                <input type="text" aria-label={t('oneTableName')} placeholder={t('oneTablePlaceholder')} maxLength={20} value={q.one} onChange={(e) => setQuickOf(area.id, { one: e.target.value })} />
                <button type="submit" className="btn btn-ghost" disabled={disabled || q.one.trim() === ''}>{t('addOne')}</button>
              </form>
              {errorAt(`${area.id}-add`)}
            </div>
          </section>
        );
      })}
      {errorAt('areas')}

      <form
        className="card dt-new-area"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run('new-area', () => api.addDiningArea(branchId, newArea))) setNewArea('');
        }}
      >
        <div className="card-body dt-add">
          <input type="text" aria-label={t('areaName')} placeholder={t('areaPlaceholder')} maxLength={40} value={newArea} onChange={(e) => setNewArea(e.target.value)} />
          <button type="submit" className="btn" disabled={disabled || newArea.trim() === ''}>{t('addArea')}</button>
        </div>
        {errorAt('new-area')}
      </form>

      {pricing ? (
        <AreaPricesSheet
          area={pricing}
          branchId={branchId}
          onClose={() => setPricing(null)}
          onSaved={(next) => {
            setAreas(next);
            setPricing(null);
          }}
        />
      ) : null}

      {removing ? (
        <ConfirmDialog
          title={removing.kind === 'area' ? t('removeAreaTitle', { name: removing.area.name }) : t('removeTableTitle', { name: removing.table.name })}
          body={removing.kind === 'area' ? t('removeAreaBody') : t('removeTableBody')}
          confirmLabel={t('remove')}
          cancelLabel={t('cancel')}
          tone="danger"
          busy={busy}
          error={error?.where === 'remove' ? error.message : undefined}
          onCancel={() => {
            setRemoving(null);
            setError(null);
          }}
          onConfirm={async () => {
            const ok = await run('remove', () =>
              removing.kind === 'area' ? api.removeDiningArea(removing.area.id) : api.removeDiningTable(removing.table.id),
            );
            if (ok) setRemoving(null);
          }}
        />
      ) : null}
    </div>
  );
}
