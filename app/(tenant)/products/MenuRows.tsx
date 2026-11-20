'use client';

import { useTranslations } from 'next-intl';
import { formatMoney } from '../lib/api';
import type { Product, ProductCategory } from '../lib/api-types';
import { ProductPhoto } from '../components/ProductPhoto';
import { costsMoreThanPrice, foodCostTone, pctText } from '../lib/food-cost';
import { groupBySection, sectionHue, type RecipeInfo } from './menu-manager';

const NONE = '__none__';

/**
 * Owner, 2026-11-21 ("go ahead with the phone pass") — a phone's Menu in the laptop table's look, as rows: section by
 * section under a bar in the section's colour, each dish a solid tile with its drawing, its name, its price and how it
 * sold, and its food cost as the same green / amber / red pill. Eight dishes to a screen where the cards showed one and
 * a half. A tap on the row opens the dish.
 * Owner, 2026-11-21 ("whatsapp link not required") — the row's WhatsApp share is gone on a phone; the dish's sheet
 * still has it.
 */
export function MenuRows({
  rows,
  categories,
  sectionCounts,
  sectionFoodCost,
  recipes,
  writable,
  isOn,
  onOpen,
}: {
  rows: readonly Product[];
  categories: readonly Pick<ProductCategory, 'id' | 'name'>[];
  sectionCounts: ReadonlyMap<string, number>;
  sectionFoodCost: ReadonlyMap<string, number | null>;
  /** Null where recipes are off: no food cost and no "Add recipe". */
  recipes: ReadonlyMap<string, RecipeInfo> | null;
  writable: boolean;
  isOn: (p: Product) => boolean;
  onOpen: (p: Product, part?: 'recipe') => void;
}) {
  const t = useTranslations('products');
  const tm = useTranslations('products.menu');
  return (
    <div className="mnu-rows">
      {groupBySection(rows, categories).map((g) => {
        const key = g.id ?? NONE;
        const hue = sectionHue(g.id, categories);
        const avg = recipes ? (sectionFoodCost.get(key) ?? null) : null;
        return (
          <section key={key} className="mnu-rows-group" data-hue={hue ?? undefined} aria-label={g.name ?? t('categories.none')}>
            <h3 className="mnu-rows-head">
              <span className="mnu-rows-name">{g.name ?? t('categories.none')}</span>
              <span className="mnu-rows-count">{tm('sectionCount', { count: sectionCounts.get(key) ?? g.rows.length })}</span>
              {avg !== null ? <span className={`mnu-rows-avg is-${foodCostTone(avg)}`}>{tm('sectionAvg', { pct: pctText(avg) })}</span> : null}
            </h3>
            <ul className="mnu-rows-list">
              {g.rows.map((p) => {
                const info = recipes ? (recipes.get(p.id) ?? { state: 'none' as const, pct: null }) : null;
                return (
                  <li key={p.id} className={`mnu-row ${isOn(p) ? 'is-on' : ''} ${p.active ? '' : 'is-off'}`}>
                    <button
                      type="button"
                      className="mnu-row-btn"
                      disabled={!writable}
                      aria-current={isOn(p) ? 'true' : undefined}
                      onClick={() => onOpen(p)}
                    >
                      <ProductPhoto className="mnu-row-photo" product={p} />
                      <span className="mnu-row-text">
                        <span className="mnu-row-name">{p.name}</span>
                        <span className="mnu-row-sub">
                          <span className="mnu-row-price">{formatMoney(p.priceMinor)}</span>
                          <span className="mnu-row-sold">{p.active ? (p.sold > 0 ? t('sold', { n: p.sold }) : tm('notSoldYet')) : tm('tabs.retired')}</span>
                        </span>
                        {info && costsMoreThanPrice(info.pct) ? <span className="mnu-over">{tm('overPrice')}</span> : null}
                      </span>
                      {info && p.active ? (
                        info.state === 'none' ? (
                          <span className="mnu-row-add">{tm('recipe.none')}</span>
                        ) : (
                          <span className={`mnu-fc is-${foodCostTone(info.pct)}`}>{pctText(info.pct)}</span>
                        )
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
