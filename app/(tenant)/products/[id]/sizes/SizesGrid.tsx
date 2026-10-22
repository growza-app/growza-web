'use client';

import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { api, ApiError } from '../../../lib/api';
import type { ProductSizes } from '../../../lib/api-types';
import { codeHolder } from '../../../lib/product-match';
import { autoFocusField } from '../../../../shared/a11y/soft-keyboard';
import { IconArrowDown, IconArrowLeft, IconArrowRight, IconArrowUp, IconCheck, IconClose, IconPlus } from '../../../components/icons';
import { useWritable } from '../../../components/SessionProvider';
import {
  addSecondAxis,
  addValues,
  anyStocked,
  cellKey,
  cellLabel,
  cleanCount,
  cleanPrice,
  DEFAULT_AXIS_NAMES,
  initialState,
  isDirty,
  layout,
  lockedValues,
  MAX_VALUES,
  moveValue,
  norm,
  problems,
  removeSecondAxis,
  removeValue as dropValue,
  rowKey,
  secondOptionBlocked,
  setPriceText,
  toRequest,
  willRetire,
  type Baseline,
  type GridState,
} from './grid-model';

/**
 * Jira GRW-598 — the sizes grid: type the sizes once, fill a grid of counts, save once.
 *
 * Phone first. The options and their sizes are two small cards; the grid scrolls INSIDE its own box with the size
 * column pinned, so the page never scrolls sideways; Save is a bar under the thumb. All the rules (what a blank
 * means, what is sent, what is retired) live in `grid-model.ts` and are tested there — this file only draws them.
 */
export function SizesGrid({ sizes }: { sizes: ProductSizes }) {
  const t = useTranslations('products.sizes');
  const writable = useWritable();
  const initial = useMemo(() => initialState(sizes), [sizes]);
  const [state, setState] = useState<GridState>(initial.state);
  const [baseline, setBaseline] = useState<Baseline>(initial.baseline);
  const [drafts, setDrafts] = useState<[string, string]>(['', '']);
  const [note, setNote] = useState<string | null>(null);
  const [arrange, setArrange] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [marked, setMarked] = useState<Set<string>>(new Set());

  const { rows, columns } = layout(state);
  const dirty = isDirty(state, baseline);
  const retiring = willRetire(state, baseline);
  const locked: [Set<string>, Set<string>] = [lockedValues(baseline, 0), lockedValues(baseline, 1)];
  const secondLocked = baseline.sizes.some((s) => s.option2 !== null);
  const offSale = new Set(baseline.sizes.filter((s) => !s.active).map((s) => cellKey(s.option1, s.option2)));
  const names: [string, string] = [state.axes[0]?.name || DEFAULT_AXIS_NAMES[0], state.axes[1]?.name || DEFAULT_AXIS_NAMES[1]];

  const edit = (change: (s: GridState) => GridState) => {
    setState((s) => change(s));
    setJustSaved(false);
    setError(null);
    setMarked(new Set());
  };
  const setAxis = (i: 0 | 1, patch: Partial<GridState['axes'][number]>) => edit((s) => ({ ...s, axes: s.axes.map((a, at) => (at === i ? { ...a, ...patch } : a)) }));

  const add = (i: 0 | 1) => {
    const axis = state.axes[i];
    if (!axis || drafts[i].trim() === '') return;
    const r = addValues(axis.values, drafts[i]);
    setAxis(i, { values: r.values });
    setDrafts((d) => (i === 0 ? ['', d[1]] : [d[0], '']));
    setNote([r.repeats > 0 ? t('repeats', { count: r.repeats }) : '', r.tooMany ? t('tooMany', { max: MAX_VALUES }) : ''].filter(Boolean).join(' ') || null);
  };

  const removeValue = (i: 0 | 1, value: string) => edit((s) => dropValue(s, i, value));
  const addSecond = () => edit(addSecondAxis);
  const removeSecond = () => edit(removeSecondAxis);

  const setCount = (key: string, text: string) => edit((s) => ({ ...s, counts: { ...s.counts, [key]: cleanCount(text) } }));
  const setPrice = (row: string, text: string) => edit((s) => setPriceText(s, baseline, row, cleanPrice(text)));

  const refuse = (message: string, keys: string[] = []) => {
    setError(message);
    setMarked(new Set(keys));
  };

  const save = async () => {
    if (busy || !dirty) return;
    const bad = problems(state);
    if (bad[0]) {
      refuse(t(bad[0].issue === 'count' ? 'badCount' : 'badPrice', { name: bad[0].label }), bad.map((b) => b.key));
      return;
    }
    if (rows.length === 0) return refuse(t('needValues'));
    if (!anyStocked(state, baseline)) return refuse(t('needOneCount'));
    setBusy(true);
    setError(null);
    try {
      const saved = await api.saveSizeGrid(sizes.product.id, toRequest(state, baseline));
      const next = initialState(saved);
      setState(next.state);
      setBaseline(next.baseline);
      setJustSaved(true);
      setNote(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.field === 'version') {
        // Someone else changed the sizes: show what is there now, keep nothing half-applied, and say so.
        const current = (err.body as { current?: ProductSizes } | undefined)?.current;
        if (current) {
          const next = initialState(current);
          setState(next.state);
          setBaseline(next.baseline);
          setError(t('changedUnder'));
        } else {
          // No copy of what is there now to show: reload, so the next save is made from the sizes as they are.
          window.location.reload();
        }
      } else if (err instanceof ApiError && err.status < 500) {
        const holder = codeHolder(err);
        const cell = (err.body as { cell?: string } | undefined)?.cell;
        setError(holder ? t('codeTaken', { name: cell ?? '', holder: holder.name }) : cell ? `${cell}: ${err.message}` : err.message);
      } else {
        setError(t('saveFailed'));
      }
    } finally {
      setBusy(false);
    }
  };

  const optionCard = (i: 0 | 1) => {
    const axis = state.axes[i];
    if (!axis) return null;
    const id = `szg-add-${i}`;
    return (
      <section className="szg-card" aria-labelledby={`szg-opt-${i}`}>
        <div className="szg-name-row">
          <label id={`szg-opt-${i}`} className="szg-label" htmlFor={`szg-name-${i}`}>
            {t('optionNameLabel')}
          </label>
          <input
            id={`szg-name-${i}`}
            type="text"
            value={axis.name}
            maxLength={30}
            placeholder={t(i === 0 ? 'optionNamePlaceholder' : 'secondNamePlaceholder')}
            disabled={!writable}
            onChange={(e) => setAxis(i, { name: e.target.value })}
          />
        </div>
        <label className="szg-label" htmlFor={id}>
          {t('addValuesLabel', { name: names[i] })}
        </label>
        <div className="szg-add">
          <input
            id={id}
            type="text"
            value={drafts[i]}
            inputMode="text"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder={t('addValuesPlaceholder')}
            autoFocus={autoFocusField(i === 0 && sizes.variants.length === 0 && rows.length === 0)}
            disabled={!writable}
            onChange={(e) => setDrafts((d) => (i === 0 ? [e.target.value, d[1]] : [d[0], e.target.value]))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add(i);
              }
            }}
          />
          <button type="button" className="btn szg-add-btn" disabled={!writable || drafts[i].trim() === ''} onClick={() => add(i)}>
            <IconPlus aria-hidden="true" />
            {t('addValuesButton')}
          </button>
        </div>
        {i === 1 ? (
          secondLocked ? (
            <p className="szg-hint">{t('removeSecondLocked')}</p>
          ) : (
            <button type="button" className="btn btn-ghost szg-remove-option" disabled={!writable} onClick={removeSecond}>
              {t('removeSecond')}
            </button>
          )
        ) : null}
      </section>
    );
  };

  const moveIcons = (i: 0 | 1, at: number, value: string, vertical: boolean) => {
    const values = state.axes[i]!.values;
    const [back, forth] = vertical ? ([IconArrowUp, IconArrowDown] as const) : ([IconArrowLeft, IconArrowRight] as const);
    const Back = back;
    const Forth = forth;
    const go = (by: -1 | 1) => setAxis(i, { values: moveValue(values, at, by) });
    return (
      <span className="szg-arrange">
        <button type="button" className="szg-icon" disabled={at === 0} aria-label={t(vertical ? 'moveUp' : 'moveLeft', { name: value })} onClick={() => go(-1)}>
          <Back aria-hidden="true" />
        </button>
        <button type="button" className="szg-icon" disabled={at === values.length - 1} aria-label={t(vertical ? 'moveDown' : 'moveRight', { name: value })} onClick={() => go(1)}>
          <Forth aria-hidden="true" />
        </button>
        {locked[i].has(norm(value)) ? null : (
          <button type="button" className="szg-icon" aria-label={t('removeValue', { name: value })} onClick={() => removeValue(i, value)}>
            <IconClose aria-hidden="true" />
          </button>
        )}
      </span>
    );
  };

  return (
    <div className="szg-page">
      {optionCard(0)}
      {state.axes.length > 1 ? (
        optionCard(1)
      ) : secondOptionBlocked(state, baseline) ? (
        <p className="szg-hint">{t('secondBlocked')}</p>
      ) : (
        <button type="button" className="btn btn-ghost szg-add-option" disabled={!writable || rows.length === 0} onClick={addSecond}>
          <IconPlus aria-hidden="true" />
          {t('addSecond')}
        </button>
      )}
      {note ? (
        <p className="szg-note" role="status">
          {note}
        </p>
      ) : null}

      <section className="szg-card szg-grid-card" aria-labelledby="szg-grid-title">
        <div className="szg-grid-head">
          <h2 id="szg-grid-title" className="szg-title">
            {t('gridTitle')}
          </h2>
          {rows.length > 0 ? (
            <button type="button" className="btn btn-ghost szg-arrange-toggle" aria-pressed={arrange} onClick={() => setArrange((a) => !a)}>
              {arrange ? t('arrangeDone') : t('arrange')}
            </button>
          ) : null}
        </div>
        {rows.length === 0 ? (
          <p className="szg-empty">{t('noValues')}</p>
        ) : (
          <>
            <p className="szg-hint">{t('gridHint')}</p>
            <div className="szg-scroll" role="region" aria-label={t('gridTitle')} tabIndex={0}>
              <table className="szg-table">
                <thead>
                  <tr>
                    <th scope="col" className="szg-corner">
                      {names[0]}
                    </th>
                    {columns.map((col, at) => (
                      <th key={col ?? 'count'} scope="col">
                        <span className="szg-colhead">{col ?? t('countHead')}</span>
                        {arrange && col !== null ? moveIcons(1, at, col, false) : null}
                      </th>
                    ))}
                    <th scope="col">{t('priceHead')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, at) => (
                    <tr key={row}>
                      <th scope="row" className="szg-rowhead">
                        <span className="szg-rowname">{row}</span>
                        {arrange ? moveIcons(0, at, row, true) : null}
                      </th>
                      {columns.map((col) => {
                        const key = cellKey(row, col);
                        const bad = marked.has(key);
                        return (
                          <td key={key}>
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              className={`szg-input ${offSale.has(key) ? 'is-off' : ''}`}
                              value={state.counts[key] ?? ''}
                              aria-label={t('countOf', { name: cellLabel(row, col) })}
                              aria-invalid={bad || undefined}
                              title={offSale.has(key) ? t('offSale') : undefined}
                              disabled={!writable}
                              onChange={(e) => setCount(key, e.target.value)}
                            />
                          </td>
                        );
                      })}
                      <td>
                        <input
                          type="text"
                          inputMode="decimal"
                          className="szg-input szg-price"
                          value={state.prices[rowKey(row)] ?? ''}
                          placeholder={state.priceEdited[rowKey(row)] || state.prices[rowKey(row)] ? undefined : mixedOrSame(baseline, row, t('priceMixed'), t('pricePlaceholder'))}
                          aria-label={t('priceLabel', { name: row })}
                          aria-invalid={marked.has(rowKey(row)) || undefined}
                          disabled={!writable}
                          onChange={(e) => setPrice(rowKey(row), e.target.value)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {retiring.length > 0 ? (
        <p className="szg-note szg-note-warn" role="status">
          {t('retiring', { count: retiring.length })}
        </p>
      ) : null}
      {error ? (
        <p className="szg-error" role="alert">
          {error}
        </p>
      ) : null}

      {writable ? (
        <div className="settings-savebar settings-savebar-pinned szg-savebar">
          <button type="button" className={`btn szg-save ${justSaved && !dirty ? 'is-saved' : ''}`} disabled={busy || !dirty} aria-live="polite" onClick={() => void save()}>
            {busy ? (
              t('saving')
            ) : justSaved && !dirty ? (
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

/** A row whose sizes carry different prices says so; one with none says the product's price is used. */
function mixedOrSame(baseline: Baseline, row: string, mixed: string, same: string): string {
  const prices = new Set(baseline.sizes.filter((s) => rowKey(s.option1) === rowKey(row)).map((s) => s.priceMinor ?? ''));
  return prices.size > 1 ? mixed : same;
}
