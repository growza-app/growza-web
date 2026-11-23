'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useDialog } from '../../../../shared/a11y/useDialog';
import { api, ApiError, formatMoney, type DiningArea, type Product } from '../../../lib/api';
import { areaUnitMinor } from '../../../lib/area-prices';
import { IconClose, IconTrash } from '../../../components/icons';

/**
 * Jira GRW-734 — an area's prices: a change on the whole menu (+10% in the AC Hall), and a fixed price for chosen dishes.
 *
 * One sheet per area, opened from its card in Settings › Tables. It shows what the change does to a real dish before it
 * is saved ("Paneer Tikka ₹240 → ₹264"), because a percentage is the one figure nobody should work out in their head.
 * A dish with sizes is priced per size, so it takes the % and is not offered a fixed price. Saving replaces the area's
 * prices with what the sheet shows; bills already sent keep the price their rounds went at (BR-01).
 */
const QUICK = [5, 10, 15, 20];

/** "10", "-5", "12.5" → a number with at most one decimal, in range; else the reason. */
function readPct(typed: string): { pct: number | null } | { problem: 'range' | 'decimals' } {
  const t = typed.trim().replace('−', '-').replace(/^\+/, '');
  if (t === '' || t === '0') return { pct: null };
  if (!/^-?\d+(\.\d)?$/.test(t)) return { problem: 'decimals' };
  const n = Number(t);
  if (n < -50 || n > 100) return { problem: 'range' };
  return { pct: n };
}

export function AreaPricesSheet({
  area,
  branchId,
  onSaved,
  onClose,
}: {
  area: DiningArea;
  branchId: string;
  onSaved: (areas: DiningArea[]) => void;
  onClose: () => void;
}) {
  const t = useTranslations('areaPrices');
  const ref = useRef<HTMLDivElement>(null);
  useDialog(ref, { onClose, initialFocus: 'container' });
  const money = (minor: number) => formatMoney(String(minor));
  const [menu, setMenu] = useState<Product[] | null>(null);
  const [menuFailed, setMenuFailed] = useState(false);
  const bp = area.pricing?.changeBp ?? null;
  const [pctTyped, setPctTyped] = useState(bp ? String(bp / 100) : '');
  const [fixed, setFixed] = useState<Array<{ productId: string; rupees: string }>>(
    Object.entries(area.pricing?.fixed ?? {}).map(([productId, minor]) => ({ productId, rupees: String(minor / 100) })),
  );
  const [adding, setAdding] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let gone = false;
    api
      .products(branchId)
      .then((rows) => !gone && setMenu(rows.filter((p) => p.active)))
      .catch(() => !gone && setMenuFailed(true));
    return () => {
      gone = true;
    };
  }, [branchId]);

  const pct = readPct(pctTyped);
  const byId = useMemo(() => new Map((menu ?? []).map((p) => [p.id, p])), [menu]);
  // A dish with sizes takes the %; one already fixed is not offered twice.
  const fixable = (menu ?? []).filter((p) => (p.optionAxes?.length ?? 0) === 0 && !fixed.some((f) => f.productId === p.id));
  const sample = (menu ?? []).find((p) => !fixed.some((f) => f.productId === p.id) && Number(p.priceMinor) > 0);
  const fixedProblem = fixed.find((f) => !/^\d+$/.test(f.rupees.trim()) || Number(f.rupees) < 1);

  const save = async () => {
    if ('problem' in pct || fixedProblem) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api.setAreaPrices(area.id, {
        changePct: pct.pct,
        prices: fixed.map((f) => ({ productId: f.productId, priceMinor: Number(f.rupees) * 100 })),
      });
      onSaved(res.areas);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={saving ? undefined : onClose}>
      <div ref={ref} className="modal modal-fit ap-sheet" role="dialog" aria-modal="true" aria-label={t('title', { area: area.name })} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="ap-head">
          <h3>{t('title', { area: area.name })}</h3>
          <button type="button" className="btn btn-ghost ap-icon" aria-label={t('close')} onClick={onClose}>
            <IconClose />
          </button>
        </div>
        <div className="modal-body ap-body">
          <p className="field-hint">{t('intro')}</p>

          <fieldset className="ap-group">
            <legend className="ap-label">{t('changeLabel')}</legend>
            <div className="ap-quick">
              <button type="button" className={'pct' in pct && pct.pct === null ? 'is-on' : ''} aria-pressed={'pct' in pct && pct.pct === null} onClick={() => setPctTyped('')}>
                {t('menuPrice')}
              </button>
              {QUICK.map((q) => (
                <button key={q} type="button" className={pctTyped === String(q) ? 'is-on' : ''} aria-pressed={pctTyped === String(q)} onClick={() => setPctTyped(String(q))}>
                  +{q}%
                </button>
              ))}
            </div>
            <label className="ap-field">
              <span className="field-hint">{t('typeChange')}</span>
              <span className="ap-input">
                <input type="text" inputMode="decimal" autoComplete="off" value={pctTyped} onChange={(e) => setPctTyped(e.target.value.replace(/[^0-9.+\-−]/g, ''))} />
                <span aria-hidden="true">%</span>
              </span>
            </label>
            <p className={`ap-preview${'problem' in pct ? ' is-bad' : ''}`} role="status">
              {'problem' in pct
                ? pct.problem === 'range'
                  ? t('outOfRange')
                  : t('oneDecimal')
                : pct.pct === null
                  ? t('noChange')
                  : sample
                    ? t('example', { dish: sample.name, from: money(Number(sample.priceMinor)), to: money(areaUnitMinor(Number(sample.priceMinor), Math.round(pct.pct * 100))) })
                    : t('rounded')}
            </p>
          </fieldset>

          <fieldset className="ap-group">
            <legend className="ap-label">{t('fixedLabel')}</legend>
            <p className="field-hint">{t('fixedHint')}</p>
            {fixed.length > 0 ? (
              <ul className="ap-list">
                {fixed.map((f, i) => {
                  const dish = byId.get(f.productId);
                  return (
                    <li key={f.productId} className="ap-row">
                      <span className="ap-dish">
                        <span>{dish?.name ?? t('dishGone')}</span>
                        {dish ? <span className="field-hint">{t('menuIs', { price: money(Number(dish.priceMinor)) })}</span> : null}
                      </span>
                      <span className="ap-input ap-input-price">
                        <span aria-hidden="true">₹</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          aria-label={t('priceFor', { dish: dish?.name ?? '' })}
                          value={f.rupees}
                          onChange={(e) => setFixed((all) => all.map((x, j) => (j === i ? { ...x, rupees: e.target.value.replace(/[^0-9]/g, '') } : x)))}
                        />
                      </span>
                      <button type="button" className="btn btn-ghost btn-danger ap-icon" aria-label={t('removeFixed', { dish: dish?.name ?? '' })} onClick={() => setFixed((all) => all.filter((_, j) => j !== i))}>
                        <IconTrash />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {menuFailed ? <p className="field-hint">{t('menuFailed')}</p> : null}
            {menu && fixable.length > 0 ? (
              <label className="ap-field">
                <span className="field-hint">{t('addDish')}</span>
                <select
                  value={adding}
                  onChange={(e) => {
                    const p = byId.get(e.target.value);
                    setAdding('');
                    if (!p) return;
                    // Starts at what the % would make it, so the owner only types when they want something else.
                    const start = areaUnitMinor(Number(p.priceMinor), 'pct' in pct && pct.pct !== null ? Math.round(pct.pct * 100) : null);
                    setFixed((all) => [...all, { productId: p.id, rupees: String(Math.max(1, Math.round(start / 100))) }]);
                  }}
                >
                  <option value="">{t('pickDish')}</option>
                  {fixable.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {money(Number(p.priceMinor))}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {fixedProblem ? <p className="ap-preview is-bad">{t('wholeRupees')}</p> : null}
          </fieldset>

          <p className="field-hint">{t('sentStay')}</p>
          {error ? (
            <p className="al-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" disabled={saving} onClick={onClose}>
            {t('cancel')}
          </button>
          <button type="button" className="btn" disabled={saving || 'problem' in pct || Boolean(fixedProblem)} onClick={save}>
            {saving ? t('saving') : t('save')}
          </button>
        </div>
      </div>
    </div>
  );
}
