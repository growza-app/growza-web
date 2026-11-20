'use client';

import { useTranslations } from 'next-intl';
import { Fragment, useState, type ReactNode } from 'react';
import { formatMoney } from '../lib/api';
import type { Product, ProductCategory } from '../lib/api-types';
import { IconChevronDown, IconEdit } from '../components/icons';
import { ProductPhoto } from '../components/ProductPhoto';
import { MenuKebab } from './MenuKebab';
import { ShareOnWhatsAppButton } from '../components/ShareOnWhatsApp';
import { productShareItem } from '../lib/share-on-whatsapp';
import { costsMoreThanPrice, FOOD_COST_AMBER_ABOVE, foodCostTone, pctText } from '../lib/food-cost';
import { groupBySection, sectionHue, type RecipeInfo } from './menu-manager';

/** The food-cost meter's full width: twice the target, so the target sits at its middle. */
const METER_MAX = FOOD_COST_AMBER_ABOVE * 2;

const NONE = '__none__';

/**
 * Owner, 2026-11-20 — a restaurant's Menu on a laptop, read the way a menu is: section by section, each dish's
 * name and price first, then whether it is on the menu, how it has sold, and its recipe, one tap away.
 *
 * The columns: Dish · Price · (Cost, when a dish has one) · Sold · Food cost (where recipes are on) · the row's actions.
 *
 * Owner, 2026-11-20 ("why is this not pro level") — a quiet table: no Status column (the tab says it), no picture
 * repeated on every row, the food cost as a number coloured only when it is too high, and the rarer actions in ⋮.
 * A section folds on its header; the fold is this screen's alone and lasts until the page is left.
 */
export function MenuTable({
  rows,
  categories,
  sectionCounts,
  sectionFoodCost,
  maxSold,
  head,
  recipes,
  seesCost,
  writable,
  isOn,
  onOpen,
  onToggleActive,
  onDelete,
}: {
  /** This page's dishes, already sorted and in section order. */
  rows: readonly Product[];
  categories: readonly Pick<ProductCategory, 'id' | 'name'>[];
  /** How many dishes each section has across every page (key: section id, or `__none__`). */
  sectionCounts: ReadonlyMap<string, number>;
  /** Each section's average food cost across every page (same keys); absent or null where no dish has one. */
  sectionFoodCost: ReadonlyMap<string, number | null>;
  /** The best seller's count among the dishes shown, so each Sold bar reads against it. */
  maxSold: number;
  /** The column headers (the sortable ones are drawn by the list, which owns the sort). */
  head: ReactNode;
  /** Each dish's recipe state; null where recipes are off, which draws no Recipe column. */
  recipes: ReadonlyMap<string, RecipeInfo> | null;
  seesCost: boolean;
  writable: boolean;
  isOn: (p: Product) => boolean;
  onOpen: (p: Product, part?: 'recipe') => void;
  onToggleActive: (p: Product) => void;
  onDelete: (p: Product) => void;
}) {
  const t = useTranslations('products');
  const tm = useTranslations('products.menu');
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  const groups = groupBySection(rows, categories);
  const cols = 3 + (seesCost ? 1 : 0) + (recipes ? 1 : 0) + 1; // a hidden column still counts: colSpan past the last is harmless
  const toggle = (key: string) =>
    setFolded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="table-scroll mnu-table-wrap">
      <table className="mnu-table">
        <thead>{head}</thead>
        {groups.map((g) => {
          const key = g.id ?? NONE;
          const open = !folded.has(key);
          const count = sectionCounts.get(key) ?? g.rows.length;
          const hue = sectionHue(g.id, categories);
          const avg = recipes ? (sectionFoodCost.get(key) ?? null) : null;
          return (
            <tbody key={key} className="mnu-group" data-hue={hue ?? undefined}>
              <tr className="mnu-group-row">
                <th colSpan={cols} scope="colgroup">
                  <button type="button" className={`mnu-group-btn ${open ? 'is-open' : ''}`} aria-expanded={open} onClick={() => toggle(key)}>
                    <IconChevronDown />
                    <span className="mnu-group-name">{g.name ?? t('categories.none')}</span>
                    <span className="mnu-group-count">{tm('sectionCount', { count })}</span>
                    {avg !== null ? (
                      <span className={`mnu-group-avg is-${foodCostTone(avg)}`}>{tm('sectionAvg', { pct: pctText(avg) })}</span>
                    ) : null}
                  </button>
                </th>
              </tr>
              {open
                ? g.rows.map((p) => {
                    const info = recipes ? (recipes.get(p.id) ?? { state: 'none' as const, pct: null }) : null;
                    const state = info?.state ?? null;
                    const priceNum = Number(p.priceMinor);
                    const costNum = p.costMinor != null ? Number(p.costMinor) : null;
                    const marginPct = costNum != null && priceNum > 0 ? Math.round(((priceNum - costNum) / priceNum) * 100) : null;
                    return (
                      <tr
                        key={p.id}
                        className={`mnu-tr ${isOn(p) ? 'is-on' : ''} ${p.active ? '' : 'is-off'}`}
                        aria-current={isOn(p) ? 'true' : undefined}
                        onClick={() => (writable ? onOpen(p) : undefined)}
                      >
                        <td>
                          {/* The row opens on a click anywhere; the name is a real button so a keyboard reaches it. */}
                          <button
                            type="button"
                            className="mnu-dish"
                            disabled={!writable}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (writable) onOpen(p);
                            }}
                          >
                            {/* The section's colour on a small tile (the dish's own photo, where it has one). */}
                            <ProductPhoto className="mnu-photo" product={p} />
                            <span className="mnu-dish-text">
                              <span className="mnu-dish-name">{p.name}</span>
                              {/* The tab already says which dishes are on the menu; a taken-off one says so under its name. */}
                              {p.active ? null : <span className="mnu-sub">{tm('tabs.retired')}</span>}
                            </span>
                          </button>
                        </td>
                        <td className="mnu-num mnu-price">{formatMoney(p.priceMinor)}</td>
                        {seesCost ? (
                          <td className="mnu-num mnu-muted">
                            {p.costMinor != null ? formatMoney(p.costMinor) : '—'}
                            {marginPct != null && marginPct >= 0 ? <span className="mnu-sub">{t('form.margin', { pct: marginPct })}</span> : null}
                          </td>
                        ) : null}
                        <td className="mnu-num mnu-muted mnu-c-narrow">
                          {/* How it sells against the best seller here: a short bar, then the count. */}
                          {p.sold > 0 ? (
                            <span className="mnu-sold">
                              <span className="mnu-bar" aria-hidden="true">
                                <span style={{ width: `${Math.max(6, Math.round((p.sold / Math.max(1, maxSold)) * 100))}%` }} />
                              </span>
                              {t('sold', { n: p.sold })}
                            </span>
                          ) : (
                            <span className="mnu-sold-none">{tm('notSoldYet')}</span>
                          )}
                        </td>
                        {state && info ? (
                          <td className="mnu-num mnu-fc-cell" onClick={(e) => e.stopPropagation()}>
                            {/* Food cost: the number alone, coloured only when it is too high. Where a recipe is missing
                                or unfinished, the cell is the way to it instead. */}
                            {state === 'none' ? (
                              <button type="button" className="mnu-fc-link" disabled={!writable} onClick={() => onOpen(p, 'recipe')} aria-label={tm('recipeAria.none', { name: p.name })}>
                                {tm('recipe.none')}
                              </button>
                            ) : (
                              <span className="mnu-fc-wrap">
                              {info.pct !== null ? (
                                /* Against the target: the tick is the 35% line, the bar how far this dish's cost reaches. */
                                <span className={`mnu-meter is-${foodCostTone(info.pct)}`} aria-hidden="true">
                                  <span style={{ width: `${Math.min(100, Math.max(4, (info.pct / METER_MAX) * 100))}%` }} />
                                </span>
                              ) : null}
                              <button
                                type="button"
                                className={`mnu-fc is-${foodCostTone(info.pct)}`}
                                disabled={!writable}
                                onClick={() => onOpen(p, 'recipe')}
                                aria-label={`${tm(`recipeAria.${state}`, { name: p.name })}${info.pct !== null ? ` · ${pctText(info.pct)}` : ''}`}
                              >
                                {pctText(info.pct)}
                              </button>
                              </span>
                            )}
                            {state === 'partial' ? <span className="mnu-sub mnu-fc-note">{tm('recipe.partial')}</span> : null}
                            {costsMoreThanPrice(info.pct) ? <span className="mnu-over">{tm('overPrice')}</span> : null}
                          </td>
                        ) : null}
                        <td className="mnu-act" onClick={(e) => e.stopPropagation()}>
                          <div className="mnu-act-row">
                            {writable ? (
                              /* Edit is the row's own click; the pencil shows on the row a pointer is over. */
                              <button type="button" className="mnu-icon-btn mnu-edit" aria-label={tm('editAria', { name: p.name })} title={tm('edit')} onClick={() => onOpen(p)}>
                                <IconEdit />
                              </button>
                            ) : null}
                            {/* Jira GRW-671 — the share stays in sight, not in the ⋮ ("a share hidden in a menu is never
                                found"); grey like the other icons, so it no longer outshouts the dish. */}
                            {(() => {
                              const shareItem = productShareItem(p, { counted: false });
                              return shareItem ? (
                                <ShareOnWhatsAppButton className="mnu-share" item={shareItem} branchId={p.locationId} bookable={false} photoUrl={p.imageUrl} />
                              ) : null;
                            })()}
                            {writable ? (
                              <MenuKebab
                                label={tm('actionsAria', { name: p.name })}
                                items={[
                                  { label: tm('edit'), onSelect: () => onOpen(p) },
                                  ...(state ? [{ label: tm('openRecipe'), onSelect: () => onOpen(p, 'recipe') }] : []),
                                  { label: p.active ? tm('takeOff') : tm('putBack'), onSelect: () => onToggleActive(p) },
                                  { label: t('delete'), onSelect: () => onDelete(p), danger: true },
                                ]}
                              />
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                : (
                  <Fragment />
                )}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}

/** The section key `sectionCounts` uses for a dish (its section's id, or the no-section key). */
export const sectionKey = (p: Pick<Product, 'categoryId'>, known: ReadonlySet<string>): string =>
  p.categoryId && known.has(p.categoryId) ? p.categoryId : NONE;
