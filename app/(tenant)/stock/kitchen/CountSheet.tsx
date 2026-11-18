'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDialog } from '../../../shared/a11y/useDialog';
import { api, ApiError, formatMoney } from '../../lib/api';
import type { FinishedCount, StockCount } from '../../lib/api-types';
import { amount, parseAmount, unitWord } from '../../lib/kitchen-units';

/** How long after the last key a figure is saved. Short enough that a phone put down loses nothing. */
const SAVE_AFTER_MS = 800;

/**
 * Jira GRW-738 — a count of the kitchen: one list, a number per item, kept on the server as it is typed (a phone that sleeps loses
 * nothing; the cook and the manager can share one count). The owner or a manager finishes it: Finish shows the differences first, and
 * only what is still unexplained after the sales since each figure was typed (BR-06) is written as such.
 */
export function CountSheet({
  branchId,
  mayFinish,
  onClose,
  onFinished,
}: {
  branchId: string;
  mayFinish: boolean;
  onClose: () => void;
  onFinished: (text: string) => void;
}) {
  const t = useTranslations('kitchenStock.count');
  const tk = useTranslations('kitchenStock');
  const locale = useLocale();
  const [count, setCount] = useState<StockCount | null>(null);
  const [failed, setFailed] = useState(false);
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const sheetRef = useRef<HTMLDivElement>(null);
  useDialog(sheetRef, { onClose: busy ? undefined : onClose });
  // What is in each field NOW, for a save that comes back after the cook typed on: only a figure still as it was sent stops being dirty.
  const typedNow = useRef<Record<string, string>>({});
  typedNow.current = typed;
  const countNow = useRef<StockCount | null>(null);
  countNow.current = count;

  const adopt = useCallback((c: StockCount) => {
    setCount(c);
    setTyped((prev) => {
      const next: Record<string, string> = {};
      for (const l of c.lines) next[l.materialId] = prev[l.materialId] ?? (l.counted === null ? '' : amount(l.counted));
      return next;
    });
  }, []);

  const start = useCallback(async () => {
    setFailed(false);
    try {
      adopt((await api.startCount(branchId)).count);
    } catch {
      setFailed(true);
    }
  }, [branchId, adopt]);
  useEffect(() => {
    void start();
  }, [start]);

  const alreadyFinished = useCallback(
    (err: unknown): string | null => {
      if (!(err instanceof ApiError) || err.code !== 'already_finished') return null;
      const name = (err.body as { finishedBy?: string | null } | undefined)?.finishedBy;
      return name ? t('alreadyFinished', { name }) : t('alreadyFinishedNoName');
    },
    [t],
  );

  /** Send what changed. A figure that is not a quantity yet ("1.") waits; an emptied one clears the item. */
  const flush = useCallback(async (): Promise<boolean> => {
    if (!count || dirty.size === 0) return true;
    const entries: Array<{ materialId: string; qty: number | null }> = [];
    const sent = new Map<string, string>();
    const unitOf = new Map(count.lines.map((l) => [l.materialId, l.unit]));
    for (const id of dirty) {
      const text = typed[id]?.trim() ?? '';
      sent.set(id, text);
      if (text === '') entries.push({ materialId: id, qty: null });
      else {
        const qty = parseAmount(text, unitOf.get(id)!, 'big', true);
        if (qty !== null) entries.push({ materialId: id, qty });
      }
    }
    if (entries.length === 0) return true;
    setSaving(true);
    try {
      const fresh = (await api.saveCount(count.id, entries)).count;
      countNow.current = fresh;
      setCount(fresh);
      setDirty((d) => {
        const left = new Set(d);
        for (const e of entries) if ((typedNow.current[e.materialId]?.trim() ?? '') === sent.get(e.materialId)) left.delete(e.materialId);
        return left;
      });
      return true;
    } catch (err) {
      setError(alreadyFinished(err) ?? (err instanceof ApiError ? err.message : tk('saveFailed')));
      return false;
    } finally {
      setSaving(false);
    }
  }, [count, dirty, typed, tk, alreadyFinished]);

  useEffect(() => {
    if (dirty.size === 0) return;
    const timer = window.setTimeout(() => void flush(), SAVE_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [dirty, typed, flush]);

  const review = async () => {
    setError(null);
    const bad = count?.lines.find((l) => {
      const text = (typed[l.materialId] ?? '').trim();
      return text !== '' && parseAmount(text, l.unit, 'big', true) === null;
    });
    if (bad) {
      setError(`${bad.name}: ${tk('badQty')}`);
      return;
    }
    if (!(await flush())) return;
    if (!countNow.current?.lines.some((l) => l.counted !== null)) {
      setError(t('nothingTyped'));
      return;
    }
    setReviewing(true);
  };

  const finish = async () => {
    if (!count) return;
    setBusy(true);
    setError(null);
    try {
      const done: FinishedCount = (await api.finishCount(count.id)).finished;
      const skipped = done.skipped.length > 0 ? ` ${t('skipped', { names: done.skipped.join(', ') })}` : '';
      onFinished(`${t('finished', { n: done.changed.length })}${skipped}`);
    } catch (err) {
      setError(alreadyFinished(err) ?? (err instanceof ApiError ? err.message : tk('saveFailed')));
    } finally {
      setBusy(false);
    }
  };

  const lines = count?.lines ?? [];
  const q = query.trim().toLowerCase();
  const shown = q ? lines.filter((l) => l.name.toLowerCase().includes(q)) : lines;
  const countedN = lines.filter((l) => (typed[l.materialId] ?? '').trim() !== '').length;
  const changes = lines.filter((l) => l.counted !== null && l.difference !== 0);
  const title = reviewing ? t('reviewTitle') : t('title');

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <div ref={sheetRef} className="modal sheet prd-sheet ks-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <button type="button" className="sheet-head-cancel" disabled={busy} onClick={reviewing ? () => setReviewing(false) : onClose}>
            {reviewing ? t('back') : tk('close')}
          </button>
          <span className="sheet-head-title">{title}</span>
          <span className="prd-head-spacer" aria-hidden="true" />
        </div>
        <div className="sheet-body prd-form-body">
          {failed ? (
            <div role="alert" className="ks-state ks-state-error">
              <p>{t('loadFailed')}</p>
              <button type="button" className="btn btn-ghost" onClick={() => void start()}>
                {tk('retry')}
              </button>
            </div>
          ) : count === null ? (
            <ul className="ks-list" aria-busy="true" aria-label={tk('loading')}>
              {[0, 1, 2, 3].map((i) => (
                <li key={i} className="ks-row ks-skel" aria-hidden="true" />
              ))}
            </ul>
          ) : reviewing ? (
            <>
              <p className="ks-hint">{t('afterSales')}</p>
              {changes.length === 0 ? (
                <p className="ks-state">{t('noDiff')}</p>
              ) : (
                <ul className="ks-list">
                  {changes.map((l) => (
                    <li key={l.materialId} className="ks-row">
                      <span className="ks-name">
                        {l.name}
                        <span className="ks-meta">
                          {t('fromTo', { from: amount(l.stock), to: amount(l.after!), unit: unitWord(l.unit) })}
                          {typeof l.differenceMinor === 'number' ? ` · ${t('worth', { money: formatMoney(Math.abs(l.differenceMinor), 'INR', locale) })}` : ''}
                        </span>
                      </span>
                      <span className={`ks-amount ${l.difference! < 0 ? 'is-below' : ''}`}>
                        {l.difference! > 0 ? '+' : '−'}
                        {amount(Math.abs(l.difference!))} {unitWord(l.unit)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {count.skipped.length > 0 ? <p className="ks-skipped">{t('skipped', { names: count.skipped.join(', ') })}</p> : null}
              <p className="ks-hint">{t('unexplainedHint')}</p>
            </>
          ) : (
            <>
              <p className="ks-hint">{t('hint')}</p>
              <input
                className="prd-input ks-search"
                type="search"
                placeholder={tk('search')}
                aria-label={tk('search')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <p className="ks-notice" role="status">
                {t('progress', { n: countedN, total: lines.length })} · {saving ? t('saving') : dirty.size > 0 ? t('notSaved') : t('saved')}
              </p>
              {lines.length === 0 ? (
                <p className="ks-state">{t('noItems')}</p>
              ) : (
                <ul className="ks-opening-list ks-count-list">
                  {shown.map((l) => (
                    <li key={l.materialId} className="ks-opening-row">
                      <label htmlFor={`ks-count-${l.materialId}`} className="ks-name">
                        {l.name}
                        <span className="ks-meta">{t('shows', { amount: amount(l.stock), unit: unitWord(l.unit) })}</span>
                      </label>
                      <span className="ks-qty-field">
                        <input
                          id={`ks-count-${l.materialId}`}
                          className="prd-input ks-qty-input"
                          inputMode="decimal"
                          placeholder="—"
                          value={typed[l.materialId] ?? ''}
                          onChange={(e) => {
                            const v = e.target.value;
                            setTyped((x) => ({ ...x, [l.materialId]: v }));
                            setDirty((d) => new Set(d).add(l.materialId));
                          }}
                          onBlur={() => void flush()}
                        />
                        <span className="ks-unit">{unitWord(l.unit)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {!mayFinish ? <p className="ks-hint">{t('cookNote')}</p> : null}
            </>
          )}
          {error ? (
            <div role="alert" className="sheet-foot sheet-foot-error">
              {error}
            </div>
          ) : null}
        </div>
        {count ? (
          <div className="prd-sheet-footer">
            {reviewing ? (
              <>
                <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setReviewing(false)}>
                  {t('back')}
                </button>
                <button type="button" className="btn prd-footer-save" disabled={busy} onClick={() => void finish()}>
                  {busy ? t('finishing') : t('finish')}
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void flush().then((ok) => ok && onClose())}>
                  {t('later')}
                </button>
                {mayFinish ? (
                  <button type="button" className="btn prd-footer-save" disabled={busy || saving} onClick={() => void review()}>
                    {t('review')}
                  </button>
                ) : (
                  <button type="button" className="btn prd-footer-save" disabled={busy || saving} onClick={() => void flush().then((ok) => ok && onClose())}>
                    {t('done')}
                  </button>
                )}
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
