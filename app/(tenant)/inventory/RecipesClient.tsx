'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import AppLink from '../../shared/AppLink';
import { api, formatMoney } from '../lib/api';
import type { RecipeCostDish } from '../lib/api-types';
import { foodCostTone, pctText } from '../lib/food-cost';
import { useMayOpen } from '../components/SessionProvider';
import { RecipeSheet } from './RecipeSheet';

type Size = RecipeCostDish['sizes'][number];

/** The size that says the most: the highest food cost (amber or red is what the owner is looking for). */
const worst = (sizes: readonly Size[]): Size | null =>
  sizes.reduce<Size | null>((top, s) => (typeof s.foodCostPct === 'number' && (top === null || (top.foodCostPct ?? -1) < s.foodCostPct) ? s : top), null);

/**
 * Jira GRW-741 FR-05 — Inventory › Recipes: every dish on the branch's menu, the ones with no recipe FIRST (their stock is not being counted),
 * then the rest by name. Whoever sees the money reads what each dish costs today and its food cost — amber above 35%, red above 45% (owner,
 * 2026-11-18); the counter reads which dishes have a recipe and nothing about cost (the API sends none). Tapping a dish opens its recipe in
 * the dish sheet's own editor. Laid out at 344px: one row per dish, the size detail on a line under the name.
 */
export function RecipesClient({ branchId }: { branchId: string }) {
  const t = useTranslations('kitchenStock.recipes');
  const tk = useTranslations('kitchenStock');
  const locale = useLocale();
  const mayOpen = useMayOpen();
  const [dishes, setDishes] = useState<RecipeCostDish[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<RecipeCostDish | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      setDishes((await api.recipeCosts(branchId)).dishes);
    } catch {
      setFailed(true);
    }
  }, [branchId]);
  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = dishes ?? [];
    return q ? all.filter((d) => d.name.toLowerCase().includes(q) || (d.category ?? '').toLowerCase().includes(q)) : all;
  }, [dishes, query]);

  if (failed) {
    return (
      <div role="alert" className="ks-state ks-state-error">
        <p>{t('loadFailed')}</p>
        <button type="button" className="btn btn-ghost" onClick={() => void load()}>
          {tk('retry')}
        </button>
      </div>
    );
  }
  if (dishes === null) {
    return (
      <ul className="ks-list" aria-busy="true" aria-label={t('loading')}>
        {[0, 1, 2, 3, 4].map((i) => (
          <li key={i} className="ks-row ks-skel" aria-hidden="true" />
        ))}
      </ul>
    );
  }
  if (dishes.length === 0) {
    return (
      <div className="ks-state ks-empty">
        <strong>{t('noMenu')}</strong>
        {mayOpen('/stock') ? (
          <AppLink className="btn btn-ghost" href="/stock">
            {t('openMenu')}
          </AppLink>
        ) : null}
      </div>
    );
  }

  const gaps = dishes.filter((d) => d.noRecipe).length;
  const seesCost = dishes.some((d) => d.sizes.some((s) => s.costMinor !== undefined));
  const money = (minor: number) => formatMoney(minor, 'INR', locale);

  return (
    <div className="ks-body">
      {gaps > 0 ? <p className="srp-warn inv-gaps">{t('gaps', { count: gaps })}</p> : <p className="ks-hint">{t('allDone')}</p>}
      {seesCost && gaps === dishes.length ? <p className="ks-hint">{t('emptyCost')}</p> : seesCost ? <p className="ks-hint">{t('pctHint')}</p> : null}
      <input className="prd-input ks-search" type="search" placeholder={t('search')} aria-label={t('search')} value={query} onChange={(e) => setQuery(e.target.value)} />
      {shown.length === 0 ? (
        <p className="ks-state">{t('noMatch')}</p>
      ) : (
        <ul className="ks-list">
          {shown.map((d) => {
            const missing = d.sizes.filter((s) => s.noRecipe);
            const whole = missing.length === d.sizes.length;
            const top = seesCost ? worst(d.sizes) : null;
            const sized = d.sizes.length > 1;
            // One line under the name: the sizes with no recipe, or each size's cost and % (a dish with one size says it once, on the right).
            const detail = whole
              ? null
              : missing.length > 0
                ? t('someSizes', { sizes: missing.map((s) => s.label).join(', ') })
                : seesCost && sized
                  ? d.sizes.map((s) => `${s.label} ${typeof s.costMinor === 'number' ? `${money(s.costMinor)} · ${pctText(s.foodCostPct)}` : t('noPrice')}`).join(' · ')
                  : null;
            const one = d.sizes[0];
            const costLine = seesCost && !sized && one && !one.noRecipe ? (typeof one.costMinor === 'number' ? t('cost', { cost: money(one.costMinor) }) : t('noPrice')) : null;
            return (
              <li key={d.productId}>
                <button type="button" className="ks-row ks-row-btn inv-dish" onClick={() => setOpen(d)}>
                  <span className="ks-name">
                    {d.name}
                    {d.category ? <span className="ks-meta">{d.category}</span> : null}
                    {detail ? <span className="ks-meta">{detail}</span> : null}
                    {costLine ? <span className="ks-meta">{costLine}</span> : null}
                  </span>
                  {whole || missing.length > 0 ? (
                    <span className="inv-no-recipe">{t('noRecipe')}</span>
                  ) : top ? (
                    <span className={`fc-pct is-${foodCostTone(top.foodCostPct)}`}>{pctText(top.foodCostPct)}</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {open ? (
        <RecipeSheet
          dish={open}
          branchId={branchId}
          onClose={() => {
            setOpen(null);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}
