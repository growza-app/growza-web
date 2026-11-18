'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, type KitchenStations } from '../../lib/api';
import { useBranch } from '../../components/BranchProvider';
import { useWritable } from '../../components/SessionProvider';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { IconEdit, IconTrash } from '../../components/icons';
import { autoFocusField } from '../../../shared/a11y/soft-keyboard';

/**
 * Jira GRW-733 — a branch's kitchen stations and which station makes each menu category.
 *
 * Two short lists, one per question the owner is answering: "what stations does this kitchen have?" and "who makes
 * this?". The default station, Kitchen, is always there and cannot be renamed or removed: a category nobody gave a
 * station goes to it (BR-01). A branch with no named station prints one slip per order, as before (AC-03), so the
 * screen says that too.
 *
 * Every change answers with the whole branch, and the screen draws THAT, never its own guess; a refusal says why where
 * the change was made. A category's station saves the moment it is picked: one decision, walked away from.
 */
export function KitchenStationsSetup({ branches }: { branches: Array<{ id: string; name: string }> }) {
  const t = useTranslations('kitchenStations');
  const writable = useWritable();
  const branch = useBranch();
  const [location, setLocation] = useState<string | null>(branch.choice ?? branch.one ?? branches[0]?.id ?? null);
  const [data, setData] = useState<KitchenStations | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ where: string; message: string } | null>(null);
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);

  const load = useCallback(async () => {
    if (!location) return;
    setFailed(false);
    try {
      setData(await api.kitchenStations(location));
    } catch {
      setFailed(true);
    }
  }, [location]);
  useEffect(() => {
    setData(null);
    void load();
  }, [load]);

  /*
   * QA of the overnight stack (item 10) — one change at a time, held in a ref: `busy` is state, so a double tap on Add
   * reached `run` twice before the button re-drew as disabled, and the second answered a false "already used".
   */
  const inFlight = useRef(false);
  /** Run one change; draw what the server answers with, or say why not where it was asked. */
  const run = async (where: string, change: () => Promise<KitchenStations>): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      setData(await change());
      return true;
    } catch (e) {
      setError({ where, message: e instanceof ApiError ? e.message : t('saveFailed') });
      return false;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  const errorAt = (where: string) =>
    error?.where === where ? (
      <p className="field-error" role="alert">
        {error.message}
      </p>
    ) : null;

  const picker =
    branches.length > 1 ? (
      <label className="dt-field ks-branch">
        <span className="field-hint">{t('branch')}</span>
        <select value={location ?? ''} onChange={(e) => setLocation(e.target.value)}>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
    ) : null;

  if (!location || failed) {
    return (
      <div className="card">
        <div className="card-body">
          {picker}
          <p className="field-hint">{t('loadFailed')}</p>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="card" aria-busy="true">
        <div className="card-body">
          {picker}
          <p className="field-hint">{t('loading')}</p>
        </div>
      </div>
    );
  }

  const add = async () => {
    const name = newName.trim();
    if (!name) {
      setError({ where: 'add', message: t('nameNeeded') });
      return;
    }
    // Item 10 — the box is cleared only of the name that was sent: whatever was typed while it was saving stays.
    if (await run('add', () => api.addKitchenStation(location, name))) setNewName((now) => (now.trim() === name ? '' : now));
  };

  return (
    <div className="ks">
      <section className="card" aria-labelledby="ks-stations-title">
        <div className="card-body">
          {picker}
          <h2 id="ks-stations-title" className="ks-title">
            {t('stationsTitle')}
          </h2>
          <p className="field-hint">{data.stations.length === 0 ? t('introNone') : t('intro')}</p>
          <ul className="ks-list">
            <li className="ks-row">
              <span className="ks-name">
                {t('kitchen')}
                <span className="ks-default">{t('default')}</span>
              </span>
            </li>
            {data.stations.map((s) => (
              <li key={s.id} className="ks-row">
                {renaming?.id === s.id ? (
                  <form
                    className="ks-rename"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(`rename-${s.id}`, () => api.renameKitchenStation(s.id, renaming.name)).then((ok) => ok && setRenaming(null));
                    }}
                  >
                    <input
                      type="text"
                      aria-label={t('renameLabel', { name: s.name })}
                      value={renaming.name}
                      maxLength={30}
                      autoFocus={autoFocusField()}
                      onChange={(e) => setRenaming({ id: s.id, name: e.target.value })}
                    />
                    <button type="submit" className="btn" disabled={busy || !writable}>
                      {t('save')}
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={() => setRenaming(null)}>
                      {t('cancel')}
                    </button>
                  </form>
                ) : (
                  <>
                    <span className="ks-name">{s.name}</span>
                    <span className="ks-actions">
                      <button type="button" className="btn btn-ghost ks-icon" aria-label={t('renameLabel', { name: s.name })} disabled={busy || !writable} onClick={() => setRenaming({ id: s.id, name: s.name })}>
                        <IconEdit />
                      </button>
                      <button type="button" className="btn btn-ghost ks-icon" aria-label={t('removeLabel', { name: s.name })} disabled={busy || !writable} onClick={() => setRemoving(s)}>
                        <IconTrash />
                      </button>
                    </span>
                  </>
                )}
                {errorAt(`rename-${s.id}`)}
              </li>
            ))}
          </ul>
          <form
            className="ks-add"
            onSubmit={(e) => {
              e.preventDefault();
              void add();
            }}
          >
            <label className="dt-field">
              <span className="field-hint">{t('newStation')}</span>
              <input type="text" value={newName} maxLength={30} placeholder={t('newStationExample')} onChange={(e) => setNewName(e.target.value)} />
            </label>
            <button type="submit" className="btn" disabled={busy || !writable}>
              {t('add')}
            </button>
          </form>
          {errorAt('add')}
        </div>
      </section>

      <section className="card" aria-labelledby="ks-categories-title">
        <div className="card-body">
          <h2 id="ks-categories-title" className="ks-title">
            {t('categoriesTitle')}
          </h2>
          <p className="field-hint">{t('categoriesHint')}</p>
          {data.categories.length === 0 ? (
            <p className="field-hint">{t('noCategories')}</p>
          ) : (
            <ul className="ks-list">
              {data.categories.map((c) => (
                <li key={c.id} className="ks-row">
                  <label className="ks-category">
                    <span className="ks-name">{c.name}</span>
                    <select
                      aria-label={t('categoryStation', { name: c.name })}
                      value={c.stationId ?? ''}
                      disabled={busy || !writable}
                      onChange={(e) => void run(`cat-${c.id}`, () => api.setCategoryStation(location, c.id, e.target.value || null))}
                    >
                      <option value="">{t('kitchen')}</option>
                      {data.stations.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {errorAt(`cat-${c.id}`)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {removing ? (
        <ConfirmDialog
          title={t('removeTitle', { name: removing.name })}
          body={t('removeBody')}
          confirmLabel={t('remove')}
          cancelLabel={t('cancel')}
          tone="danger"
          busy={busy}
          error={error?.where === 'remove' ? error.message : undefined}
          onCancel={() => {
            setRemoving(null);
            setError(null);
          }}
          onConfirm={() => void run('remove', () => api.removeKitchenStation(removing.id)).then((ok) => ok && setRemoving(null))}
        />
      ) : null}
    </div>
  );
}
