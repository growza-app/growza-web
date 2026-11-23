'use client';

import { useTranslations } from 'next-intl';
import { useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../../../lib/api';
import type { ProductSizes } from '../../../lib/api-types';
import { IconCheck, IconPlus, IconTrash } from '../../../components/icons';
import { useWritable } from '../../../components/SessionProvider';
import { autoFocusField } from '../../../../shared/a11y/soft-keyboard';
import {
  addPreset,
  firstProblem,
  MAX_PORTION_NAME,
  MAX_PORTIONS,
  newRowId,
  PORTION_PRESETS,
  portionsChanged,
  portionsFrom,
  portionsRequest,
  type PortionRow,
} from './portions-model';

/**
 * A dish's portions: one list of names and prices, for a business that does not count what it sells (owner, 2026-11-23:
 * "anyone who doesn't have much technical knowledge can do it").
 *
 * No option name, no paste box, no grid, no reordering. An empty dish asks one question and offers three big buttons; a
 * dish with portions shows a row each — name, ₹ price, a bin — and "Add another size". Every price is required, so
 * nothing on the till depends on a rule the owner cannot see. The rules live in `portions-model.ts`.
 */
export function PortionsList({ sizes }: { sizes: ProductSizes }) {
  const t = useTranslations('products.sizes');
  const writable = useWritable();
  const [current, setCurrent] = useState<ProductSizes>(sizes);
  const loaded = useMemo(() => portionsFrom(current), [current]);
  const [rows, setRows] = useState<PortionRow[]>(loaded);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; id?: string } | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const focusId = useRef<string | null>(null);

  const changed = portionsChanged(rows, loaded);

  const edit = (next: PortionRow[]) => {
    setRows(next);
    setError(null);
    setJustSaved(false);
  };
  const setField = (id: string, field: 'name' | 'price', value: string) =>
    edit(rows.map((r) => (r.id === id ? { ...r, [field]: field === 'price' ? value.replace(/[^\d.]/g, '').slice(0, 10) : value.slice(0, MAX_PORTION_NAME) } : r)));
  const addOwn = () => {
    const id = newRowId();
    focusId.current = id;
    edit([...rows, { id, name: '', price: '', saved: false, typed: true }]);
  };
  const addSet = (names: readonly string[]) => {
    const next = addPreset(rows, names);
    focusId.current = next.find((r) => !r.saved && r.price === '')?.id ?? null;
    edit(next);
  };

  const fail = (text: string, id?: string) => {
    setError({ text, id });
    // The field is marked either way; the caret only moves there where no on-screen keyboard would rise over the message.
    if (id && autoFocusField()) document.getElementById(id)?.focus();
  };

  const save = async () => {
    if (busy || !changed) return;
    const p = firstProblem(rows);
    if (p) {
      if (p.kind === 'none') return fail(t('portionNeedOne'));
      if (p.kind === 'name') return fail(t('portionNeedName'), `prt-${p.id}-name`);
      if (p.kind === 'tooLong') return fail(t('portionTooLong'), `prt-${p.id}-name`);
      if (p.kind === 'twice') return fail(t('portionTwice', { name: p.name }), `prt-${p.id}-name`);
      return fail(t('portionNeedPrice', { name: p.name }), `prt-${p.id}-price`);
    }
    setBusy(true);
    setError(null);
    try {
      const saved = await api.saveSizeGrid(current.product.id, portionsRequest(rows, current));
      setCurrent(saved);
      setRows(portionsFrom(saved));
      setJustSaved(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.field === 'version') {
        const latest = (err.body as { current?: ProductSizes } | undefined)?.current;
        if (latest) {
          setCurrent(latest);
          setRows(portionsFrom(latest));
          setError({ text: t('changedUnder') });
        } else {
          window.location.reload();
        }
      } else if (err instanceof ApiError && err.status < 500) {
        setError({ text: err.message });
      } else {
        setError({ text: t('saveFailed') });
      }
    } finally {
      setBusy(false);
    }
  };

  /** The row just added takes the caret — on a keyboard, never on a phone (`autoFocusField`), where it would cover the list. */
  const focusAdded = (id: string) => (el: HTMLInputElement | null) => {
    if (el && focusId.current === id) {
      focusId.current = null;
      if (autoFocusField()) el.focus();
    }
  };

  return (
    <div className="prt-page">
      {rows.length === 0 ? (
        <section className="prt-card prt-start" aria-labelledby="prt-ask">
          <p id="prt-ask" className="prt-ask">
            {t('portionsAsk')}
          </p>
          <button type="button" className="btn btn-ghost prt-big" disabled={!writable} onClick={() => addSet(PORTION_PRESETS.halfFull)}>
            <IconPlus aria-hidden="true" />
            {t('portionsHalfFull')}
          </button>
          <button type="button" className="btn btn-ghost prt-big" disabled={!writable} onClick={() => addSet(PORTION_PRESETS.cups)}>
            <IconPlus aria-hidden="true" />
            {t('portionsCups')}
          </button>
          <button type="button" className="btn btn-ghost prt-big prt-own" disabled={!writable} onClick={addOwn}>
            <IconPlus aria-hidden="true" />
            {t('portionsOwn')}
          </button>
        </section>
      ) : (
        <section className="prt-card" aria-label={t('portionsTitle')}>
          <ul className="prt-list">
            {rows.map((r, i) => {
              const nameId = `prt-${r.id}-name`;
              const priceId = `prt-${r.id}-price`;
              return (
                <li key={r.id} className="prt-row">
                  {!r.typed ? (
                    <span className="prt-name" id={nameId}>
                      {r.name}
                    </span>
                  ) : (
                    <input
                      id={nameId}
                      ref={r.name === '' ? focusAdded(r.id) : undefined}
                      className="prt-name-input"
                      type="text"
                      value={r.name}
                      maxLength={MAX_PORTION_NAME}
                      placeholder={t('portionNamePlaceholder')}
                      aria-label={t('portionNameLabel', { n: i + 1 })}
                      aria-invalid={error?.id === nameId || undefined}
                      disabled={!writable}
                      onChange={(e) => setField(r.id, 'name', e.target.value)}
                    />
                  )}
                  <span className="prt-price">
                    <span className="prt-rupee" aria-hidden="true">
                      ₹
                    </span>
                    <input
                      id={priceId}
                      ref={r.name !== '' ? focusAdded(r.id) : undefined}
                      className="prt-price-input"
                      type="text"
                      inputMode="decimal"
                      value={r.price}
                      placeholder="0"
                      aria-label={t('portionPriceLabel', { name: r.name || t('portionNameLabel', { n: i + 1 }) })}
                      aria-invalid={error?.id === priceId || undefined}
                      disabled={!writable}
                      onChange={(e) => setField(r.id, 'price', e.target.value)}
                    />
                  </span>
                  {writable ? (
                    <button type="button" className="prt-remove" aria-label={t('portionRemove', { name: r.name || t('portionNameLabel', { n: i + 1 }) })} onClick={() => edit(rows.filter((x) => x.id !== r.id))}>
                      <IconTrash aria-hidden="true" />
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {writable && rows.length < MAX_PORTIONS ? (
            <button type="button" className="prt-add" onClick={addOwn}>
              <IconPlus aria-hidden="true" />
              {t('portionsAdd')}
            </button>
          ) : null}
        </section>
      )}

      {error ? (
        <p className="szg-error" role="alert">
          {error.text}
        </p>
      ) : null}

      {writable && (rows.length > 0 || loaded.length > 0) ? (
        <div className="settings-savebar settings-savebar-pinned szg-savebar">
          <span className="szg-savebar-meta">{changed ? t('unsavedChanges') : justSaved ? t('allSaved') : t('portionsCount', { count: rows.length })}</span>
          <button type="button" className={`btn szg-save ${justSaved && !changed ? 'is-saved' : ''}`} disabled={busy || !changed} aria-live="polite" onClick={() => void save()}>
            {busy ? (
              t('saving')
            ) : justSaved && !changed ? (
              <>
                <IconCheck aria-hidden="true" /> {t('saved')}
              </>
            ) : (
              t('save')
            )}
          </button>
        </div>
      ) : null}
    </div>
  );
}
