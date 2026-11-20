'use client';

import { useTranslations } from 'next-intl';
import { Fragment, useState, type ReactNode } from 'react';
import { formatMoney } from '../lib/api';
import type { Product, ProductCategory } from '../lib/api-types';
import { ProductPhoto } from '../components/ProductPhoto';
import { IconArrowRight, IconCheck, IconChevronDown } from '../components/icons';
import { useAnchoredPanel } from '../lib/useAnchoredPanel';
import { costsMoreThanPrice, foodCostTone, pctText } from '../lib/food-cost';
import { groupBySection, type RecipeInfo } from './menu-manager';

const NONE = '__none__';

/**
 * Owner, 2026-11-20 — a restaurant's Menu on a laptop, read the way a menu is: section by section, each dish's
 * name and price first, then whether it is on the menu, how it has sold, and its recipe, one tap away.
 *
 * The columns: Dish · Status · Price · (Cost, for whoever is sent one) · Sold · Recipe (where recipes are on) · ⋮.
 * A section folds on its header; the fold is this screen's alone and lasts until the page is left.
 */
export function MenuTable({
  rows,
  categories,
  sectionCounts,
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
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const closeMenu = () => setMenuFor(null);
  const panel = useAnchoredPanel(menuFor !== null, closeMenu);
  const groups = groupBySection(rows, categories);
  const cols = 4 + (seesCost ? 1 : 0) + (recipes ? 1 : 0) + 1; // a hidden column still counts: colSpan past the last is harmless
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
          return (
            <tbody key={key} className="mnu-group">
              <tr className="mnu-group-row">
                <th colSpan={cols} scope="colgroup">
                  <button type="button" className={`mnu-group-btn ${open ? 'is-open' : ''}`} aria-expanded={open} onClick={() => toggle(key)}>
                    <IconChevronDown />
                    <span className="mnu-group-name">{g.name ?? t('categories.none')}</span>
                    <span className="mnu-group-count">{tm('sectionCount', { count })}</span>
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
                            <ProductPhoto className="mnu-photo" product={p} />
                            <span className="mnu-dish-name">{p.name}</span>
                          </button>
                        </td>
                        <td className="mnu-c-narrow">
                          <span className={`mnu-status ${p.active ? 'is-on' : 'is-off'}`}>{p.active ? t('strip.onMenu') : t('strip.offMenu')}</span>
                        </td>
                        <td className="mnu-num mnu-price">{formatMoney(p.priceMinor)}</td>
                        {seesCost ? (
                          <td className="mnu-num mnu-muted">
                            {p.costMinor != null ? formatMoney(p.costMinor) : '—'}
                            {marginPct != null && marginPct >= 0 ? <span className="mnu-sub">{t('form.margin', { pct: marginPct })}</span> : null}
                          </td>
                        ) : null}
                        <td className="mnu-num mnu-muted mnu-c-narrow">{p.sold > 0 ? t('sold', { n: p.sold }) : '—'}</td>
                        {state ? (
                          <td onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              className={`mnu-recipe is-${state}`}
                              disabled={!writable}
                              onClick={() => onOpen(p, 'recipe')}
                              aria-label={tm(`recipeAria.${state}`, { name: p.name })}
                            >
                              {state === 'done' ? <IconCheck /> : null}
                              <span>{tm(`recipe.${state}`)}</span>
                              {state === 'done' ? null : <IconArrowRight />}
                            </button>
                            {/* What Inventory's Recipes tab showed (Jira GRW-741): the food cost, and "check the price" when it costs more than it sells for. */}
                            {info && info.pct !== null && state !== 'none' ? (
                              <span className={`fc-pct mnu-pct is-${foodCostTone(info.pct)}`}>{pctText(info.pct)}</span>
                            ) : null}
                            {info && costsMoreThanPrice(info.pct) ? <span className="mnu-over">{tm('overPrice')}</span> : null}
                          </td>
                        ) : null}
                        <td className="mnu-act" onClick={(e) => e.stopPropagation()}>
                          {writable ? (
                            <div className="dropdown-anchor" ref={menuFor === p.id ? panel.anchorRef : undefined}>
                              <button
                                type="button"
                                className="kebab-btn"
                                aria-label={tm('actionsAria', { name: p.name })}
                                aria-expanded={menuFor === p.id}
                                onClick={() => setMenuFor(menuFor === p.id ? null : p.id)}
                              >
                                ⋮
                              </button>
                              {menuFor === p.id ? (
                                <div className="dropdown-panel dropdown-panel-sm dropdown-panel-right" ref={panel.panelRef} style={panel.style}>
                                  <button
                                    type="button"
                                    className="dropdown-item dropdown-item-plain"
                                    onClick={() => {
                                      closeMenu();
                                      onOpen(p);
                                    }}
                                  >
                                    {tm('edit')}
                                  </button>
                                  {recipes ? (
                                    <button
                                      type="button"
                                      className="dropdown-item dropdown-item-plain"
                                      onClick={() => {
                                        closeMenu();
                                        onOpen(p, 'recipe');
                                      }}
                                    >
                                      {tm('openRecipe')}
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    className="dropdown-item dropdown-item-plain"
                                    onClick={() => {
                                      closeMenu();
                                      onToggleActive(p);
                                    }}
                                  >
                                    {p.active ? tm('takeOff') : tm('putBack')}
                                  </button>
                                  <button
                                    type="button"
                                    className="dropdown-item dropdown-item-plain dropdown-item-danger"
                                    onClick={() => {
                                      closeMenu();
                                      onDelete(p);
                                    }}
                                  >
                                    {t('delete')}
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
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
