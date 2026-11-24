'use client';

import { useTranslations } from 'next-intl';
import { useNouns } from '../lib/use-nouns';
import { useEffect, useMemo, useState } from 'react';
import Link from '../../shared/AppLink';
import { useRouter } from 'next/navigation';
import { api, ApiError, formatMoney } from '../lib/api';
import type { MenuImportResult, Product, ProductCategory, ProductImportResult } from '../lib/api-types';
import { PageHeader } from '../components/PageHeader';
import { WriteOnly } from '../components/WriteOnly';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Pagination, PAGE_SIZE } from '../components/Pagination';
import { useAreas, useBusinessWritable, useRecipesOn, useSession, useWritable } from '../components/SessionProvider';
import { canSee, type MemberRole } from '../lib/nav-policy';
import { IconCart, IconCheck, IconChevronRight, IconClipboardCheck, IconEdit, IconGrid, IconPlus, IconMenu, IconPos, IconSearch, IconSort, IconTrendUp, IconUpload, IconWhatsApp } from '../components/icons';
import { MenuTable, sectionKey } from './MenuTable';
import { MenuKebab } from './MenuKebab';
import { MenuRows } from './MenuRows';
import { averagePct, groupedOrder, needsRecipe, recipeStates, type MenuTab, type RecipeInfo } from './menu-manager';
import { ProductPhoto } from '../components/ProductPhoto';
import { ShareOnWhatsAppButton, useShareSession, useShareTextOnWhatsApp } from '../components/ShareOnWhatsApp';
import { menuShareText } from './menu-share';
import { sharePhone } from '@growza-app/shared';
import { DateTime } from 'luxon';
import { productShareItem } from '../lib/share-on-whatsapp';
import { matchItems } from '../lib/service-match';
import { productMatchable } from '../lib/product-match';
import { ProductSheet } from './ProductSheet';
import { ImportProducts } from './ImportProducts';
import { ImportMenu } from './ImportMenu';
import { StockTake } from './StockTake';
import { BulkEditProductsModal } from './BulkEditProductsModal';
import { ALL_CATEGORIES, NO_CATEGORY, ProductCategoriesDropdown } from './DeskProductCategories';
import { SearchClear } from '../components/SearchClear';
import { extraSuggestions } from '../lib/service-suggest';
import { useServiceSuggestions } from '../lib/useServiceSuggestions';

/**
 * Owner, 2026-10-14 — the shelf, the way a stock screen is read.
 *
 * Phone & wide desk: horizontal KPI strip + Top sellers sales graph across the top, then a toolbar with Search,
 * multi-select Categories dropdown, Sort, and status chips. Wide desk (≥1101px) shows the sortable table on the left
 * and the product sheet drawn in place on the right.
 *
 * Nothing here names a kind of business: the same screen sells a clinic's consumables and a gym's protein.
 */
export type ShelfFilter = 'all' | 'inStock' | 'low' | 'out' | 'retired';
export const SHELF_FILTERS: readonly ShelfFilter[] = ['all', 'inStock', 'low', 'out', 'retired'];
export type ShelfSort = 'name' | 'stock' | 'sold' | 'price' | 'cost' | 'status';
export const SHELF_SORTS: readonly ShelfSort[] = ['name', 'stock', 'sold', 'price', 'cost', 'status'];

/**
 * The same screen for a business that keeps no count (a kitchen: `catalog.stock_counted` off).
 *
 * It is the MENU there, not the shelf — every dish with its price, its category and its photo, and nothing that
 * reads or changes a number nobody keeps. So three of the five filters, one of the six sorts, two of the four
 * figures and one of the seven columns are about a count and are left out; everything else is the same screen,
 * drawn by the same code. Left out rather than shown at nought, which is the rule the whole vertical follows.
 */
export const UNCOUNTED_FILTERS: readonly ShelfFilter[] = ['all', 'retired'];
export const UNCOUNTED_SORTS: readonly ShelfSort[] = ['name', 'sold', 'price', 'cost', 'status'];

/**
 * QA 2026-11-14 — whether this viewer is sent what a product cost. The API leaves `costMinor` out altogether for
 * whoever cannot see the sales (the front desk), so the key's absence IS the answer: nothing to compute here, and no
 * second rule to drift from the server's. An owner's product with no cost has the key, as null. An empty shelf shows
 * the field — there is nothing to hide yet, and an owner adding the first product needs it.
 */
export function shelfSeesCost(rows: readonly object[]): boolean {
  return rows.length === 0 || rows.some((r) => 'costMinor' in r);
}
export type ShelfSortDir = 'asc' | 'desc';
export const defaultSortDir = (sort: ShelfSort): ShelfSortDir =>
  sort === 'name' || sort === 'stock' || sort === 'status' ? 'asc' : 'desc';

/** The pill's colour: red at zero, amber at or under the owner's line, green otherwise. Retired products carry no pill. */
/** Sizes of this style that are low or out (QA 2026-10-23): a total of 79 can hide a size that has run out. */
export const sizesShort = (p: Partial<Pick<Product, 'sizesLow' | 'sizesOut'>>): number => (p.sizesLow ?? 0) + (p.sizesOut ?? 0);
export const stockTone = (p: Pick<Product, 'stock' | 'lowStockAt' | 'active'> & Partial<Pick<Product, 'sizesLow' | 'sizesOut'>>): 'ok' | 'low' | 'out' =>
  p.stock <= 0 ? 'out' : (p.lowStockAt > 0 && p.stock <= p.lowStockAt) || sizesShort(p) > 0 ? 'low' : 'ok';
/** The low pill's words: a style flagged for its sizes says how many sizes, not a comfortable-looking total. */
const lowWords = (p: Product, t: (k: 'lowStock' | 'sizesShort', v: Record<string, number>) => string): string =>
  p.lowStockAt > 0 && p.stock <= p.lowStockAt ? t('lowStock', { n: p.stock }) : t('sizesShort', { count: sizesShort(p) });

/** What the shelf is worth at the shelf price, counting only what is actually there. */
export const shelfWorthMinor = (rows: readonly Pick<Product, 'stock' | 'priceMinor' | 'active'>[]): number =>
  rows.reduce((sum, p) => sum + (p.active && p.stock > 0 ? p.stock * Number(p.priceMinor) : 0), 0);

export function matchesCategories(
  p: Pick<Product, 'categoryId'>,
  category: string | readonly string[] = ALL_CATEGORIES,
): boolean {
  if (Array.isArray(category)) {
    if (category.length === 0) return true;
    return category.some((c) => (c === NO_CATEGORY ? p.categoryId === null : p.categoryId === c));
  }
  if (category === ALL_CATEGORIES) return true;
  if (category === NO_CATEGORY) return p.categoryId === null;
  return p.categoryId === category;
}

/**
 * The category first, the chip second, then the search — the same spelling-tolerant matcher the till uses (GRW-375), from the second letter.
 * Jira GRW-574 — the search also finds a product by its SKU or barcode, whole or from the start.
 */
export function filterShelf(
  rows: readonly Product[],
  filter: ShelfFilter,
  search: string,
  category: string | readonly string[] = ALL_CATEGORIES,
): Product[] {
  const pool = rows.filter((p) => {
    if (!matchesCategories(p, category)) return false;
    if (filter === 'retired') return !p.active;
    if (!p.active) return false;
    const tone = stockTone(p);
    if (filter === 'inStock') return tone === 'ok';
    if (filter === 'low') return tone === 'low';
    if (filter === 'out') return tone === 'out';
    return true;
  });
  const q = search.trim();
  return q.length >= 2 ? matchItems(pool.map(productMatchable), q) : pool;
}

const statusRank = (p: Pick<Product, 'stock' | 'lowStockAt' | 'active'>): number => {
  const tone = stockTone(p);
  return tone === 'out' ? 0 : tone === 'low' ? 1 : 2;
};

/**
 * QA 2026-11-14 (F15) — "QA4 Cricket" listed ten products A–Z with the one asked for eighth: the search ranks best
 * first, and the shelf's default A–Z sort then threw that order away. While a search is typed and nobody has picked
 * a sort, the best match leads; a sort the owner picks still wins.
 */
export function searchKeepsBestFirst(search: string, sort: ShelfSort, dir: ShelfSortDir): boolean {
  return search.trim().length >= 2 && sort === 'name' && dir === defaultSortDir('name');
}

export function sortShelf(rows: readonly Product[], sort: ShelfSort, dir: ShelfSortDir = defaultSortDir(sort)): Product[] {
  const sign = dir === 'asc' ? 1 : -1;
  const byName = (a: Product, b: Product) => a.name.localeCompare(b.name);
  return [...rows].sort((a, b) => {
    if (sort === 'name') return sign * byName(a, b);
    if (sort === 'price') return sign * (Number(a.priceMinor) - Number(b.priceMinor)) || byName(a, b);
    if (sort === 'cost') {
      if (a.costMinor == null && b.costMinor == null) return byName(a, b);
      if (a.costMinor == null) return 1;
      if (b.costMinor == null) return -1;
      return sign * (Number(a.costMinor) - Number(b.costMinor)) || byName(a, b);
    }
    if (sort === 'stock') return sign * (a.stock - b.stock) || byName(a, b);
    if (sort === 'sold') return sign * (a.sold - b.sold) || byName(a, b);
    if (a.active !== b.active) return a.active ? -1 : 1;
    return sign * (statusRank(a) - statusRank(b)) || a.stock - b.stock || byName(a, b);
  });
}

function SortableTh({
  col,
  label,
  sort,
  dir,
  onSort,
  numeric,
  className,
}: {
  col: ShelfSort;
  label: string;
  sort: ShelfSort;
  dir: ShelfSortDir;
  onSort: (col: ShelfSort) => void;
  numeric?: boolean;
  className?: string;
}) {
  const active = sort === col;
  return (
    <th
      className={`${numeric ? 'th-sortable prd-td-num' : 'th-sortable'}${className ? ` ${className}` : ''}`}
      aria-sort={active ? (dir === 'desc' ? 'descending' : 'ascending') : 'none'}
    >
      <button type="button" onClick={() => onSort(col)}>
        {label}
        <span className={`th-arrow ${active ? 'is-on' : ''}`} aria-hidden="true">
          {active ? (dir === 'desc' ? '↓' : '↑') : <IconSort />}
        </span>
      </button>
    </th>
  );
}

export function ProductsList({
  products,
  categories: initialCategories,
  branchId,
  initialFilter = 'all',
  heading,
  shownBranchName,
  initialMenuTab = 'all',
}: {
  products: Product[];
  categories: ProductCategory[];
  branchId: string;
  initialFilter?: ShelfFilter;
  /** Jira GRW-610 — the screen's own name when it is opened under another address (a shop's Stock); absent is "Products". */
  heading?: string;
  /**
   * QA 2026-10-23 — the shelf is one branch's (a product belongs to ONE branch, Jira GRW-376), so "All branches" cannot be one list. When the
   * header says all, the screen says which branch's shelf it is showing instead of letting "All branches" stand over one branch's stock.
   */
  shownBranchName?: string | null;
  /** Owner, 2026-11-20 — a link can open the Menu on a tab (`/stock?show=noRecipe`: the dishes still needing a recipe). */
  initialMenuTab?: MenuTab;
}) {
  const t = useTranslations('products');
  const tm = useTranslations('products.menu');
  const tc = useTranslations('common');
  const tShare = useTranslations('share');
  const router = useRouter();
  const session = useSession();
  const writable = useWritable();
  // Jira GRW-76 — the till is not this screen's page: it opens for a role that holds Orders and Stock Change, and a business that may write.
  const areas = useAreas();
  // Is there a count behind this catalogue at all? False for a kitchen, whose dishes are cooked when they are ordered.
  const counted = areas.stock;
  // Restaurant QA 2026-10-24 — the column and the sheet name one of what is sold in the business's word: Dish, Product.
  const nouns = useNouns();
  const tillOpen = useBusinessWritable() && canSee('/products/sell', session?.role as MemberRole | null | undefined, undefined, true, areas);
  const canStockTake =
    session?.role === null || session?.role === undefined || session?.role === 'owner' || session?.role === 'manager';
  const [rows, setRows] = useState(products);
  const [categories, setCategories] = useState(initialCategories);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  // Owner, 2026-11-20 — a kitchen's Menu has three tabs (On the menu · Needs a recipe · Taken off); a shop's shelf keeps its chips.
  const recipesOn = useRecipesOn() && !counted;
  const [menuTab, setMenuTab] = useState<MenuTab>(
    counted ? 'all' : (initialMenuTab === 'noRecipe' && !recipesOn) || (initialMenuTab === 'noCost' && !shelfSeesCost(products)) ? 'all' : initialMenuTab,
  );
  const [filter, setFilter] = useState<ShelfFilter>(counted ? initialFilter : menuTab === 'retired' ? 'retired' : 'all');
  const [sort, setSort] = useState<ShelfSort>('name');
  const [sortDir, setSortDir] = useState<ShelfSortDir>('asc');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  // Owner, 2026-11-20 — a laptop opens a menu as a table, read section by section; the cards are one tap away.
  const [menuView, setMenuView] = useState<'cards' | 'table'>('table');
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  /** Which part of the dish's sheet to open on: its recipe when the Recipe button opened it. */
  const [editingPart, setEditingPart] = useState<'recipe' | undefined>(undefined);
  const openDish = (p: Product | 'new', part?: 'recipe') => {
    setEditingPart(part);
    setEditing(p);
  };
  /** Each dish's recipe state (Jira GRW-741's list), read again whenever a sheet opens or closes — a recipe saves on its own. */
  const [recipes, setRecipes] = useState<ReadonlyMap<string, RecipeInfo> | null>(null);
  const editingKey = editing === null ? null : editing === 'new' ? 'new' : editing.id;
  useEffect(() => {
    if (!recipesOn) return;
    let gone = false;
    api
      .recipeCosts(branchId)
      .then((r) => {
        if (!gone) setRecipes(recipeStates(r.dishes));
      })
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, [recipesOn, branchId, editingKey]);
  const [notice, setNotice] = useState<{ text: string; undo?: () => void } | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [stockTakeOpen, setStockTakeOpen] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importNote, setImportNote] = useState<string | null>(null);
  // Jira GRW-715 — a kitchen's Import is its whole menu from a file (Petpooja's, or ours); the column-by-column import stays for prices.
  const [menuOpen, setMenuOpen] = useState(false);
  const openImport = () => (counted ? setImportOpen(true) : setMenuOpen(true));
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<ProductCategory | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [desk, setDesk] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1101px)');
    const read = () => setDesk(mq.matches);
    read();
    mq.addEventListener('change', read);
    return () => mq.removeEventListener('change', read);
  }, []);

  useEffect(() => {
    if (!desk || !editing || editing === 'new') return;
    const activeEl = document.querySelector<HTMLElement>('.prd-menu-card.is-on, .prd-row-on');
    activeEl?.scrollIntoView({ block: 'nearest' });
  }, [desk, editing]);

  const live = useMemo(() => rows.filter((p) => p.active), [rows]);
  const seesCost = useMemo(() => shelfSeesCost(rows), [rows]);
  const liveCategories = useMemo(
    () => categories.map((c) => ({ ...c, count: live.filter((p) => p.categoryId === c.id).length })),
    [categories, live],
  );
  const inCategory = useMemo(() => filterShelf(rows, 'all', '', selectedCategories), [rows, selectedCategories]);
  const lowCount = useMemo(() => inCategory.filter((p) => stockTone(p) === 'low').length, [inCategory]);
  const outCount = useMemo(() => inCategory.filter((p) => p.stock <= 0).length, [inCategory]);
  const worth = useMemo(() => shelfWorthMinor(inCategory), [inCategory]);
  const shown = useMemo(() => {
    const all = filterShelf(rows, filter, search, selectedCategories);
    const found =
      !counted && menuTab === 'noRecipe'
        ? all.filter((p) => needsRecipe(p, recipes))
        : !counted && menuTab === 'noCost'
          ? all.filter((p) => p.costMinor == null)
          : all;
    return searchKeepsBestFirst(search, sort, sortDir) ? found : sortShelf(found, sort, sortDir);
  }, [rows, filter, search, selectedCategories, sort, sortDir, counted, menuTab, recipes]);
  // The Menu's table reads section by section, so its pages are slices of the grouped order (the sort holds inside a section).
  // The laptop's table and the phone's rows (owner, 2026-11-21) both read section by section; the laptop's Cards view does not.
  const groupedTable = !counted && (desk === true ? menuView === 'table' : true);
  const ordered = useMemo(() => (groupedTable ? groupedOrder(shown, categories) : shown), [groupedTable, shown, categories]);
  const sectionCounts = useMemo(() => {
    const known = new Set(categories.map((c) => c.id));
    const m = new Map<string, number>();
    for (const p of shown) m.set(sectionKey(p, known), (m.get(sectionKey(p, known)) ?? 0) + 1);
    return m;
  }, [shown, categories]);
  // Owner, 2026-11-20 — each section's average food cost, and the best seller's count, over every page of what is shown.
  const sectionFoodCost = useMemo(() => {
    const known = new Set(categories.map((c) => c.id));
    const pcts = new Map<string, (number | null)[]>();
    for (const p of shown) {
      const k = sectionKey(p, known);
      const list = pcts.get(k) ?? [];
      list.push(recipes?.get(p.id)?.pct ?? null);
      pcts.set(k, list);
    }
    return new Map([...pcts].map(([k, v]) => [k, averagePct(v)] as const));
  }, [shown, categories, recipes]);
  const maxSold = useMemo(() => shown.reduce((m, p) => Math.max(m, p.sold), 0), [shown]);
  const noCostCount = useMemo(
    () => (seesCost ? live.filter((p) => p.costMinor == null && matchesCategories(p, selectedCategories)).length : 0),
    [live, seesCost, selectedCategories],
  );
  const needRecipeCount = useMemo(
    () => (recipes ? rows.filter((p) => needsRecipe(p, recipes) && matchesCategories(p, selectedCategories)).length : 0),
    [rows, recipes, selectedCategories],
  );
  const remote = useServiceSuggestions(search, branchId);
  const inFilterScope = useMemo(
    () => filterShelf(rows, filter, '', selectedCategories),
    [rows, filter, selectedCategories],
  );
  const byIdInScope = useMemo(() => new Map(inFilterScope.map((p) => [p.id, p])), [inFilterScope]);
  const alsoTry = useMemo(
    () => extraSuggestions(shown, remote, search, (id) => byIdInScope.get(id)),
    [shown, remote, search, byIdInScope],
  );
  const counts: Record<ShelfFilter, number> = {
    all: inCategory.length,
    inStock: inCategory.filter((p) => stockTone(p) === 'ok').length,
    low: lowCount,
    out: outCount,
    retired: rows.filter((p) => !p.active && matchesCategories(p, selectedCategories)).length,
  };
  const noneCount = live.filter((p) => p.categoryId === null).length;
  const effectivePageSize = !counted ? 24 : PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(shown.length / effectivePageSize));
  const pageRows = ordered.slice((Math.min(page, pageCount) - 1) * effectivePageSize, Math.min(page, pageCount) * effectivePageSize);
  // QA of the overnight stack (item 12) — no top seller until something has sold: a new menu said "Top seller: Butter Naan · 0 sold".
  const topSeller = useMemo(() => {
    const selling = live.filter((p) => p.sold > 0);
    return (
      [...selling].filter((p) => !/roti|bread|steam rice/i.test(p.name)).sort((a, b) => b.sold - a.sold)[0] ??
      [...selling].sort((a, b) => b.sold - a.sold)[0] ??
      null
    );
  }, [live]);
  const totalSold = useMemo(
    () => rows.reduce((sum, p) => sum + (p.sold ?? 0), 0),
    [rows],
  );
  const pick = (f: () => void) => {
    f();
    setPage(1);
  };
  const toggleCategory = (id: string) =>
    pick(() =>
      setSelectedCategories((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])),
    );
  const clearCategories = () => pick(() => setSelectedCategories([]));
  const pickColumnSort = (col: ShelfSort) =>
    pick(() => {
      if (sort === col) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
      else {
        setSort(col);
        setSortDir(defaultSortDir(col));
      }
    });

  useEffect(() => {
    if (savedId && (!editing || editing === 'new' || editing.id !== savedId)) setSavedId(null);
  }, [editing, savedId]);
  const refreshCategories = () =>
    api
      .productCategories(branchId)
      .then(setCategories)
      .catch(() => {});
  const saved = (p: Product) => {
    setRows((prev) => {
      const at = prev.findIndex((x) => x.id === p.id);
      const next = at >= 0 ? prev.map((x) => (x.id === p.id ? p : x)) : [...prev, p];
      return [...next].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
    });
    setSavedId(editing === 'new' ? p.id : null);
    setEditing((cur) => (cur && cur !== 'new' && cur.id === p.id ? p : cur === 'new' ? p : cur));
    void refreshCategories();
    router.refresh();
  };
  /**
   * Owner, 2026-10-18 — a file landed: read the shelf again (a hundred products arrived at once) and say what happened.
   * The dialog stays open on its own report; closing it is the owner's.
   */
  const imported = async (result: ProductImportResult) => {
    setImportNote(t('import.done', { created: result.created, updated: result.updated, stockAdded: result.stockAdded }));
    try {
      setRows(await api.productsAll(branchId));
    } catch {
      router.refresh();
    }
    void refreshCategories();
  };
  const fail = (err: unknown) => setError(err instanceof ApiError && err.status < 500 ? err.message : tc('actionFailed'));
  const menuImported = async (result: MenuImportResult) => {
    setImportNote(t('menuImport.doneBody', { created: result.created, already: result.alreadyOnMenu }));
    try {
      setRows(await api.productsAll(branchId));
    } catch {
      router.refresh();
    }
    void refreshCategories();
  };
  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteProduct(deleting.id);
      setRows((prev) => prev.filter((x) => x.id !== deleting.id));
      setDeleting(null);
      setEditing(null);
      void refreshCategories();
      router.refresh();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };
  /**
   * Owner, 2026-11-20 — take a dish off the menu (or put it back) from its row, without opening it. Not a delete: the
   * dish keeps its bills and its recipe, and the line that says so carries an Undo.
   */
  const toggleActive = async (p: Product, undoing = false) => {
    setNotice(null);
    try {
      const updated = await api.updateProduct(p.id, { active: !p.active });
      saved(updated);
      if (!undoing) {
        setNotice({
          // Develop QA 2026-11-21, finding 7 — "and its recipe" only when it has one.
          text: updated.active
            ? tm('putBackDone', { name: updated.name })
            : (recipes?.get(p.id)?.state ?? 'none') !== 'none'
              ? tm('takenOffDone', { name: updated.name })
              : tm('takenOffNoRecipe', { name: updated.name }),
          undo: () => void toggleActive(updated, true),
        });
      }
    } catch (err) {
      setNotice({ text: err instanceof ApiError && err.status < 500 ? err.message : tc('actionFailed') });
    }
  };
  const pickTab = (tab: MenuTab) =>
    pick(() => {
      setMenuTab(tab);
      setFilter(tab === 'retired' ? 'retired' : 'all');
    });
  const addCategory = async (name: string) => {
    const c = await api.createProductCategory(branchId, name);
    setCategories((prev) => [...prev, c]);
  };
  const renameCategory = async (c: ProductCategory, name: string) => {
    const updated = await api.renameProductCategory(branchId, c.id, name);
    setCategories((prev) => prev.map((x) => (x.id === updated.id ? { ...x, name: updated.name } : x)));
    setRows((prev) => prev.map((p) => (p.categoryId === updated.id ? { ...p, categoryName: updated.name } : p)));
    router.refresh();
  };
  const removeCategory = async (deleteProducts = false) => {
    if (!deletingCategory) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteProductCategory(branchId, deletingCategory.id, { deleteProducts });
      setCategories((prev) => prev.filter((c) => c.id !== deletingCategory.id));
      if (deleteProducts) {
        setRows((prev) => prev.filter((p) => p.categoryId !== deletingCategory.id));
      } else {
        setRows((prev) => prev.map((p) => (p.categoryId === deletingCategory.id ? { ...p, categoryId: null, categoryName: null } : p)));
      }
      setSelectedCategories((prev) => prev.filter((id) => id !== deletingCategory.id));
      setDeletingCategory(null);
      router.refresh();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const stockTakeSaved = (updated: Product[]) => {
    setRows((prev) => {
      const byId = new Map(updated.map((p) => [p.id, p]));
      const seen = new Set(prev.map((x) => x.id));
      const next = [...prev.map((x) => byId.get(x.id) ?? x), ...updated.filter((p) => !seen.has(p.id))];
      return next.sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
    });
    setEditing((cur) => {
      if (!cur || cur === 'new') return cur;
      return updated.find((p) => p.id === cur.id) ?? cur;
    });
    router.refresh();
  };

  // Jira GRW-737 — a kitchen's Menu has a second half, its raw materials: the two tabs sit under the heading (drawn only where they apply).
  const header = (
    <>
    <PageHeader
      title={heading ?? t('title')}
      subtitle={!counted ? t('uncountedSubtitle') : heading !== undefined ? t('stockSubtitle') : t('subtitle')}
      subtitleAsInfo
      actions={
        <>
          {/*
            Not in the header on a phone: with Sell, Count stock, Add and the avatar it made the header three rows at
            344px. It is a destination, not an action, and the same report is a link on Home's money card and in
            Reports — the call made for Returns on the Orders header (QA 2026-10-28).
          */}
          {heading !== undefined && canStockTake && counted ? (
            <Link className="btn btn-ghost desktop-only" href="/stock/report">
              {t('stockReport.open')}
            </Link>
          ) : null}
          {/* Owner's review 2026-11-13 — the reorder list was reachable only from Home, Reports and the two reports; the shelf is where you notice you are short. */}
          {heading !== undefined && canStockTake && counted ? (
            <Link className="btn btn-ghost desktop-only" href="/stock/order">
              {t('reorder.title')}
            </Link>
          ) : null}
          {/* The till is Bookings' and Stock's, not this screen's page: drawn when the role may open it, and the business may write. */}
          {live.length > 0 && tillOpen ? (
            <Link className={`btn btn-ghost ${counted ? 'desktop-only' : ''}`} href="/products/sell?from=products">
              <IconCart /> {t(counted ? 'sell' : 'sellUncounted')}
            </Link>
          ) : null}
        <WriteOnly>
          {live.length > 0 && canStockTake && counted ? (
            <button
              type="button"
              className="btn btn-ghost desktop-only"
              onClick={() => {
                setEditing((cur) => (cur === 'new' ? null : cur));
                setStockTakeOpen(true);
              }}
            >
              {t('stockTake.open')}
            </button>
          ) : null}
          <button type="button" className="btn" onClick={() => openDish('new')}>
            <IconPlus /> {t(counted ? 'add' : 'addUncounted')}
          </button>
        </WriteOnly>
        </>
      }
    />
    </>
  );
  /*
   * A kitchen's two figures. "Stock value" is a count times a price and "Running low" and "Out of stock" are a
   * count outright, so all three are left out; what is left is what a menu actually tells you — how many dishes
   * are on it and how many have been taken off.
   */
  const uncountedStrip = (
    <div className="prd-strip prd-strip-2 mnu-strip" role="list">
      <div role="listitem" className="prd-stat-cell">
        <button
          type="button"
          className={`prd-stat prd-stat-tap prd-stat-products mnu-stat ${menuTab === 'all' ? 'is-on' : ''}`}
          aria-pressed={menuTab === 'all'}
          onClick={() => pickTab('all')}
        >
          <span className="mnu-stat-icon" aria-hidden="true">
            <IconPos />
          </span>
          <span className="prd-stat-l">{t('strip.onMenu')}</span>
          <span className="prd-stat-n">{live.filter((p) => matchesCategories(p, selectedCategories)).length}</span>
          <span className="prd-stat-sub">{t('activeOnPos')}</span>
        </button>
      </div>
      <div className="prd-stat prd-stat-cats mnu-stat" role="listitem">
        <span className="mnu-stat-icon" aria-hidden="true">
          <IconGrid />
        </span>
        <span className="prd-stat-l">{t('menuSections')}</span>
        <span className="prd-stat-n">{liveCategories.length}</span>
        <span className="prd-stat-sub">
          {liveCategories
            .slice(0, 3)
            .map((c) => c.name)
            .join(' · ') || t('allDishes')}
        </span>
      </div>
      <div className="prd-stat prd-stat-worth mnu-stat" role="listitem">
        <span className="mnu-stat-icon" aria-hidden="true">
          <IconTrendUp />
        </span>
        <span className="prd-stat-l">{topSeller ? t('topSeller') : t('cols.sold')}</span>
        <span className={`prd-stat-n${topSeller ? ' prd-stat-name' : ''}`}>{topSeller ? topSeller.name : totalSold}</span>
        <span className="prd-stat-sub">
          {topSeller ? `${t('sold', { n: topSeller.sold })} · ${formatMoney(topSeller.priceMinor)}` : t('soldAcrossMenu', { sold: t('sold', { n: totalSold }) })}
        </span>
      </div>
    </div>
  );
  /** Owner, 2026-11-20 — the Menu's tabs: what is on it, what still needs a recipe (where recipes are on), what was taken off. */
  const menuTabs = (
    <div className="mnu-tabs" role="tablist" aria-label={tm('tabsAria')}>
      {(['all', ...(recipesOn ? (['noRecipe'] as const) : []), ...(seesCost ? (['noCost'] as const) : []), 'retired'] as const).map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={menuTab === tab}
          className={`mnu-tab ${menuTab === tab ? 'is-on' : ''} ${(tab === 'noRecipe' && needRecipeCount > 0) || (tab === 'noCost' && noCostCount > 0) ? 'is-warn' : ''}`}
          onClick={() => pickTab(tab)}
        >
          <span className="mnu-tab-long">{tm(`tabs.${tab}`)}</span>
          {/* A 344px phone has room for the three tabs only in shorter words. */}
          <span className="mnu-tab-short" aria-hidden="true">
            {tm(`tabsShort.${tab}`)}
          </span>
          <span className="mnu-tab-n">{tab === 'all' ? live.filter((p) => matchesCategories(p, selectedCategories)).length : tab === 'noRecipe' ? needRecipeCount : tab === 'noCost' ? noCostCount : counts.retired}</span>
        </button>
      ))}
    </div>
  );
  const anyFilter = search.trim().length > 0 || selectedCategories.length > 0 || menuTab !== 'all';
  const clearFilters = anyFilter ? (
    <button
      type="button"
      className="mnu-clear"
      onClick={() =>
        pick(() => {
          setSearch('');
          setSelectedCategories([]);
          setMenuTab('all');
          setFilter('all');
        })
      }
    >
      {tm('clearFilters')}
    </button>
  ) : null;
  const noticeLine = notice ? (
    <div className="banner mnu-notice" role="status">
      <span>{notice.text}</span>
      {notice.undo ? (
        <button
          type="button"
          className="mnu-undo"
          onClick={() => {
            const undo = notice.undo;
            setNotice(null);
            undo?.();
          }}
        >
          {tm('undo')}
        </button>
      ) : null}
    </div>
  ) : null;
  /*
   * Owner's review 2026-11-13 — on a phone the header has no room for the two reports (see the header comment), so
   * they sit under the four figures instead: the stock report and the reorder list, a 44px row each. Desktop keeps
   * them in the header, where there is room; the row is phone-only so the same door is never drawn twice.
   */
  /*
   * Owner's review 2026-11-13 (A) — a phone's header is one row (Back, Stock, the branch, Add, avatar): Sell and
   * Count stock come down here as tiles beside the two reports, so the header no longer wraps to a second row
   * with an empty left half. Each tile is gated exactly as its header button is; the row is drawn when any apply.
   */
  const phoneSell = counted && live.length > 0 && tillOpen;
  const phoneCount = counted && live.length > 0 && canStockTake && writable;
  const phoneReports = heading !== undefined && canStockTake && counted;
  const reportLinks =
    phoneSell || phoneCount || phoneReports ? (
      <nav className="prd-report-links mobile-only" aria-label={t('title')}>
        {phoneSell ? (
          <Link className="prd-report-link prd-report-act" href="/products/sell?from=products">
            <IconCart />
            <span>{t('sell')}</span>
          </Link>
        ) : null}
        {phoneCount ? (
          <button
            type="button"
            className="prd-report-link prd-report-act"
            onClick={() => {
              setEditing((cur) => (cur === 'new' ? null : cur));
              setStockTakeOpen(true);
            }}
          >
            <IconClipboardCheck />
            <span>{t('stockTake.open')}</span>
          </button>
        ) : null}
        {phoneReports ? (
          <Link className="prd-report-link" href="/stock/report">
            <span>{t('stockReport.open')}</span>
            <IconChevronRight />
          </Link>
        ) : null}
        {phoneReports ? (
          <Link className="prd-report-link" href="/stock/order">
            <span>{t('reorder.title')}</span>
            <IconChevronRight />
          </Link>
        ) : null}
      </nav>
    ) : null;
  /*
   * Owner's review 2026-11-13 — on a phone the four tiles cost 119px and said what the chips say a row below
   * (Running low / Out of stock are the Low / Out chips); the two figures that were only here are one line now.
   */
  const shelfLine = <p className="prd-shelf-line">{t('shelfLine', { count: inCategory.length, worth: formatMoney(worth) })}</p>;
  const strip = !counted ? (
    uncountedStrip
  ) : (
    <div className="prd-strip prd-strip-4" role="list">
      <div className="prd-stat prd-stat-products" role="listitem">
        <span className="prd-stat-n">{inCategory.length}</span>
        <span className="prd-stat-l">{t('strip.products')}</span>
      </div>
      <div className="prd-stat prd-stat-worth" role="listitem">
        <span className="prd-stat-n">{formatMoney(worth)}</span>
        <span className="prd-stat-l">{t('strip.worth')}</span>
      </div>
      {/* The listitem is the wrapper: a role on the button itself would strip its button role for a screen reader. */}
      <div role="listitem" className="prd-stat-cell">
        <button
          type="button"
          className={`prd-stat prd-stat-tap prd-stat-low-card ${lowCount > 0 ? 'prd-stat-low' : ''} ${filter === 'low' ? 'is-on' : ''}`}
          aria-pressed={filter === 'low'}
          onClick={() => pick(() => setFilter((cur) => (cur === 'low' || lowCount === 0 ? 'all' : 'low')))}
        >
          <span className="prd-stat-n">{lowCount}</span>
          <span className="prd-stat-l">{t('strip.low')}</span>
        </button>
      </div>
      <div role="listitem" className="prd-stat-cell">
        <button
          type="button"
          className={`prd-stat prd-stat-tap prd-stat-out-card ${outCount > 0 ? 'prd-stat-out' : ''} ${filter === 'out' ? 'is-on' : ''}`}
          aria-pressed={filter === 'out'}
          onClick={() => pick(() => setFilter((cur) => (cur === 'out' || outCount === 0 ? 'all' : 'out')))}
        >
          <span className="prd-stat-n">{outCount}</span>
          <span className="prd-stat-l">{t('strip.out')}</span>
        </button>
      </div>
    </div>
  );
  const searchBox = (
    <label className="search-wrap prd-search">
      <IconSearch />
      <input
        type="search"
        className="search-input search-input-bare"
        placeholder={t(counted ? 'searchPlaceholder' : 'searchUncounted')}
        value={search}
        onChange={(e) => pick(() => setSearch(e.target.value))}
      />
      <SearchClear value={search} onClear={() => pick(() => setSearch(''))} onVoice={(val) => pick(() => setSearch(val))} />
    </label>
  );
  /**
   * Owner, 2026-11-21 — the whole menu as one WhatsApp message (`menu-share.ts`): what is on the menu now, in the
   * sections the Categories filter shows. Built inside the tap, so WhatsApp's tab is not a blocked pop-up.
   */
  const shareSession = useShareSession();
  const shareText = useShareTextOnWhatsApp();
  const menuText = () => {
    const branch = shareSession.branches.find((b) => b.id === branchId);
    const tz = shareSession.timezone;
    return menuShareText(
      live.filter((p) => matchesCategories(p, selectedCategories)),
      categories,
      {
        businessName: shareSession.businessName,
        branchName: shareSession.branches.length > 1 ? (branch?.name ?? null) : null,
        phone: branch?.phone ?? shareSession.businessPhone,
        dateText: DateTime.now().setZone(tz).setLocale(shareSession.lang === 'hi' ? 'hi' : 'en-IN').toFormat('d LLL yyyy'),
      },
      {
        title: (business) => tm('share.title', { business }),
        order: (phone) => tm('share.order', { phone }),
        asOf: (date) => tm('share.asOf', { date }),
        half: tm('share.half'),
        full: tm('share.full'),
        other: t('categories.none'),
      },
    );
  };
  const shareMenu = () => {
    const text = menuText();
    const branch = shareSession.branches.find((b) => b.id === branchId);
    // Develop QA 2026-11-21, L3 — a menu with no number to order on asks first.
    if (text) void shareText.share(text, { reachable: sharePhone(branch?.phone ?? shareSession.businessPhone) != null });
  };
  const hasMenuToShare = !counted && live.some((p) => matchesCategories(p, selectedCategories));
  const alsoTryRow =
    alsoTry.length > 0 ? (
      <div className="also-try">
        <span className="also-try-label">{tc('alsoTry')}</span>
        <div className="also-try-chips">
          {alsoTry.map((p) => (
            <button key={p.id} type="button" className="also-try-chip" onClick={() => pick(() => setSearch(p.name))}>
              {p.name}
            </button>
          ))}
        </div>
      </div>
    ) : null;
  const categoriesDropdown =
    liveCategories.length > 0 || noneCount > 0 || writable ? (
      <ProductCategoriesDropdown
        fixedMenu={desk === false && counted}
        selected={selectedCategories}
        categories={liveCategories}
        noneCount={noneCount}
        onToggle={toggleCategory}
        onClear={clearCategories}
        onAdd={writable ? addCategory : undefined}
        onRename={writable ? renameCategory : undefined}
        onDelete={writable ? (c) => setDeletingCategory(c) : undefined}
      />
    ) : null;
  const chips = (
    <div className="prd-chips" role="group" aria-label={t('filters.label')}>
      {(counted ? SHELF_FILTERS : UNCOUNTED_FILTERS).map((f) => (
        <button
          key={f}
          type="button"
          className={`prd-chip ${filter === f ? 'prd-chip-on' : ''} ${f === 'low' && counts.low > 0 ? 'prd-chip-warn' : ''}`}
          aria-pressed={filter === f}
          onClick={() => pick(() => setFilter(f))}
        >
          {t(`filters.${f}`)} <span className="prd-chip-n">{counts[f]}</span>
        </button>
      ))}
    </div>
  );
  const sortReversed = sortDir !== defaultSortDir(sort);
  const sortBox = (
    <label className="prd-sort">
      <span className="prd-sort-l">{t('sort.label')}</span>
      <select
        value={sortReversed ? `${sort}:${sortDir}` : sort}
        onChange={(e) => {
          const next = e.target.value as ShelfSort;
          pick(() => {
            setSort(next);
            setSortDir(defaultSortDir(next));
          });
        }}
      >
        {sortReversed ? (
          <option value={`${sort}:${sortDir}`} disabled>
            {sort === 'sold' ? t('sort.sold') : t(`cols.${sort === 'name' ? 'product' : sort}`, { product: nouns.Product })} ({sortDir === 'desc' ? '↓' : '↑'})
          </option>
        ) : null}
        {(counted ? SHELF_SORTS : UNCOUNTED_SORTS).filter((s) => seesCost || s !== 'cost').map((s) => (
          <option key={s} value={s}>
            {t(`sort.${s}`)}
          </option>
        ))}
      </select>
    </label>
  );
  const isOn = (p: Product) => Boolean(editing && editing !== 'new' && editing.id === p.id);
  const pill = (p: Product) => {
    const tone = stockTone(p);
    // A kitchen's dish is either on the menu or off it; "out of stock" and "running low" are a count.
    if (!counted) return <span className={`prd-pill prd-pill-${p.active ? 'ok' : 'off'}`}>{p.active ? t('strip.onMenu') : t('strip.offMenu')}</span>;
    return p.active ? (
      <span className={`prd-pill prd-pill-${tone}`}>{tone === 'out' ? t('outOfStock') : tone === 'low' ? lowWords(p, t) : t('inStock')}</span>
    ) : (
      <span className="prd-pill prd-pill-off">{t('retired')}</span>
    );
  };
  const nothing = (
    <div className="empty">
      {search.trim().length >= 2 ? t('noMatch', { q: search.trim() }) : !counted && menuTab === 'noRecipe' ? tm('noneNeedRecipe') : !counted && menuTab === 'noCost' ? tm('noneNeedCost') : !counted && filter === 'all' ? t('filters.none.uncounted') : t(`filters.none.${filter}`)}
    </div>
  );
  const list =
    shown.length === 0 ? (
      nothing
    ) : (
      <ul className="prd-list">
        {pageRows.map((p) => {
          const tone = stockTone(p);
          return (
            <li key={p.id} className={`prd-row ${p.active ? '' : 'prd-row-retired'}`}>
              <button
                type="button"
                className={`prd-row-tap ${isOn(p) ? 'is-on' : ''}`}
                aria-current={isOn(p) ? 'true' : undefined}
                onClick={() => (writable ? openDish(p) : undefined)}
                disabled={!writable}
              >
                <ProductPhoto className="prd-photo" product={p} />
                <span className="prd-name">
                  {p.name}
                  {p.categoryName ? <span className="prd-name-cat">{p.categoryName}</span> : null}
                </span>
                <span className="prd-price">{formatMoney(p.priceMinor)}</span>
                <span className="prd-meta">
                  {/* No count to show for a kitchen; a dish taken off the menu still says so, because that is not a count. */}
                  {!counted ? (
                    p.active ? null : (
                      <span className="prd-pill prd-pill-off">{t('strip.offMenu')}</span>
                    )
                  ) : p.active ? (
                    <span className={`prd-pill prd-pill-${tone}`}>{tone === 'out' ? t('outOfStock') : tone === 'low' ? lowWords(p, t) : t('stock', { n: p.stock })}</span>
                  ) : (
                    <span className="prd-pill prd-pill-off">{t('stock', { n: Math.max(0, p.stock) })}</span>
                  )}
                  <span className="prd-sold">{t('sold', { n: p.sold })}</span>
                </span>
              </button>
              {/* Owner's review 2026-11-13 — the WhatsApp share (Jira GRW-671) moved into the product's sheet: the owner's
                  own stock list carried a green button on every row and lost its right column to it. */}
            </li>
          );
        })}
      </ul>
    );
  // A column of dashes says nothing: the SKU column shows only when something listed here has one (a kitchen's menu rarely does).
  const showSku = shown.some((p) => Boolean(p.sku));
  const table =
    shown.length === 0 ? (
      nothing
    ) : (
      <div className="table-scroll">
        <table className="prd-table">
          <thead>
            <tr>
              <SortableTh col="name" label={t('cols.product', { product: nouns.Product })} sort={sort} dir={sortDir} onSort={pickColumnSort} />
              <th>{t('cols.category')}</th>
              {showSku ? <th>{t('cols.sku')}</th> : null}
              <SortableTh col="price" label={t('cols.price')} sort={sort} dir={sortDir} onSort={pickColumnSort} numeric />
              {seesCost ? <SortableTh col="cost" label={t('cols.cost')} sort={sort} dir={sortDir} onSort={pickColumnSort} numeric /> : null}
              {/* Where there is no count, the same column carries what IS there: how many have sold. One header, one cell. */}
              {counted ? (
                <SortableTh col="stock" label={t('cols.stock')} sort={sort} dir={sortDir} onSort={pickColumnSort} numeric />
              ) : (
                <SortableTh col="sold" label={t('cols.sold')} sort={sort} dir={sortDir} onSort={pickColumnSort} numeric />
              )}
              <SortableTh col="status" label={t('cols.status')} sort={sort} dir={sortDir} onSort={pickColumnSort} />
              {/* Jira GRW-671 — the share column has no title of its own; the button names itself. */}
              <th className="prd-td-share" aria-label={tShare('button')} />
            </tr>
          </thead>
          <tbody>
            {pageRows.map((p) => {
              const priceNum = Number(p.priceMinor);
              const costNum = p.costMinor != null ? Number(p.costMinor) : null;
              const marginPct =
                costNum != null && priceNum > 0 ? Math.round(((priceNum - costNum) / priceNum) * 100) : null;
              const shareItem = productShareItem(p, { counted });
              return (
                <tr
                  key={p.id}
                  className={`prd-tr ${isOn(p) ? 'is-on' : ''} ${p.active ? '' : 'prd-row-retired'}`}
                  aria-current={isOn(p) ? 'true' : undefined}
                  onClick={() => (writable ? openDish(p) : undefined)}
                >
                  <td>
                    {/* The row opens on a click anywhere; the name is a real button so a keyboard or a screen reader reaches it. */}
                    <button
                      type="button"
                      className="prd-cell-name prd-cell-tap"
                      disabled={!writable}
                      aria-current={isOn(p) ? 'true' : undefined}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (writable) openDish(p);
                      }}
                    >
                      <ProductPhoto className="prd-photo" product={p} />
                      <span className="prd-name">
                        {p.name}
                        {p.barcode ? <span className="prd-name-cat">{p.barcode}</span> : null}
                      </span>
                    </button>
                  </td>
                  <td>
                    {p.categoryName ? (
                      <span className="prd-pill prd-pill-cat">{p.categoryName}</span>
                    ) : (
                      <span className="prd-td-muted">{t('categories.none')}</span>
                    )}
                  </td>
                  {showSku ? (
                    <td>
                      {p.sku ? (
                        <span className="prd-sku-badge">{p.sku}</span>
                      ) : (
                        <span className="prd-td-muted">—</span>
                      )}
                    </td>
                  ) : null}
                  <td className="prd-td-num">{formatMoney(p.priceMinor)}</td>
                  {seesCost ? (
                    <td className="prd-td-num prd-td-muted">
                      {p.costMinor != null ? formatMoney(p.costMinor) : '—'}
                      {marginPct != null && marginPct >= 0 ? (
                        <span className="prd-td-sold">{t('form.margin', { pct: marginPct })}</span>
                      ) : null}
                    </td>
                  ) : null}
                  {counted ? (
                    <td className="prd-td-num">
                      <span className={`prd-td-stock prd-td-stock-${stockTone(p)}`}>{Math.max(0, p.stock)}</span>
                      <span className="prd-td-sold">{t('sold', { n: p.sold })}</span>
                    </td>
                  ) : (
                    <td className="prd-td-num prd-td-muted">
                      <span className="prd-td-sold">{t('sold', { n: p.sold })}</span>
                    </td>
                  )}
                  <td>{pill(p)}</td>
                  <td className="prd-td-share" onClick={(e) => e.stopPropagation()}>
                    {shareItem ? <ShareOnWhatsAppButton item={shareItem} branchId={p.locationId} bookable={false} photoUrl={p.imageUrl} /> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  // A column of dashes says nothing: a kitchen's dish is made, not bought, so its cost is the recipe's (the % beside it); the
  // typed-in cost column shows only when some dish here has one.
  const menuCostCol = seesCost && shown.some((p) => p.costMinor != null);
  const menuTable =
    shown.length === 0 ? (
      nothing
    ) : (
      <MenuTable
        rows={pageRows}
        categories={categories}
        sectionCounts={sectionCounts}
        sectionFoodCost={sectionFoodCost}
        maxSold={maxSold}
        recipes={recipesOn ? (recipes ?? new Map()) : null}
        seesCost={menuCostCol}
        writable={writable}
        isOn={isOn}
        onOpen={(p, part) => openDish(p, part)}
        onToggleActive={(p) => void toggleActive(p)}
        onDelete={(p) => setDeleting(p)}
        head={
          <tr>
            <SortableTh col="name" label={t('cols.product', { product: nouns.Product })} sort={sort} dir={sortDir} onSort={pickColumnSort} />
            <SortableTh col="price" label={t('cols.price')} sort={sort} dir={sortDir} onSort={pickColumnSort} numeric />
            {menuCostCol ? <SortableTh col="cost" label={t('cols.cost')} sort={sort} dir={sortDir} onSort={pickColumnSort} numeric /> : null}
            <SortableTh col="sold" label={t('cols.sold')} sort={sort} dir={sortDir} onSort={pickColumnSort} numeric className="mnu-c-narrow" />
            {recipesOn ? <th className="prd-td-num mnu-fc-th">{tm('foodCostCol')}</th> : null}
            <th className="mnu-act" aria-label={tm('actionsCol')} />
          </tr>
        }
      />
    );
  /*
   * Owner, 2026-10-18 — under the list, not in the header: Sell, Count stock and Add already fill a 344px header
   * (a fourth button pushed the avatar and the Add button off the screen), and loading a file is a set-up job, not a
   * daily one. An empty shelf puts the same button where the owner is looking.
   */
  const importRow =
    canStockTake && writable ? (
      <div className="prd-import-row">
        <p>{t(counted ? 'import.footer' : 'import.footerUncounted')}</p>
        <button type="button" className="btn btn-ghost" onClick={openImport}>
          <IconUpload /> {t('import.open')}
        </button>
      </div>
    ) : null;
  const pages = shown.length > effectivePageSize ? <Pagination page={Math.min(page, pageCount)} total={shown.length} pageSize={effectivePageSize} noun={t(counted ? 'noun' : 'nounUncounted')} onChange={setPage} /> : null;
  const menuRows =
    shown.length === 0 ? (
      nothing
    ) : (
      <MenuRows
        rows={pageRows}
        categories={categories}
        sectionCounts={sectionCounts}
        sectionFoodCost={sectionFoodCost}
        recipes={recipesOn ? (recipes ?? new Map()) : null}
        writable={writable}
        isOn={isOn}
        onOpen={(p, part) => openDish(p, part)}
      />
    );
  const menuCards =
    shown.length === 0 ? (
      nothing
    ) : (
      <div className="prd-menu-grid">
        {pageRows.map((p) => {
          const isBestSeller = topSeller !== null && topSeller.id === p.id && p.sold > 0;
          const shareItem = productShareItem(p, { counted });
          return (
            // Jira GRW-671 — the card is a button, and a button cannot hold one: the share sits over it, in a wrapper.
            <div key={p.id} className="prd-menu-card-wrap">
            <button
              type="button"
              className={`prd-menu-card ${isOn(p) ? 'is-on' : ''} ${p.active ? '' : 'is-retired'}`}
              aria-current={isOn(p) ? 'true' : undefined}
              disabled={!writable}
              onClick={() => (writable ? openDish(p) : undefined)}
            >
              <div className="prd-menu-card-media">
                <ProductPhoto className="prd-menu-card-photo" product={p} />
                {p.categoryName ? <span className="prd-menu-card-cat">{p.categoryName}</span> : null}
                <span className={`prd-menu-card-status ${p.active ? 'is-ok' : 'is-off'}`}>
                  {p.active ? t('strip.onMenu') : t('strip.offMenu')}
                </span>
              </div>
              <div className="prd-menu-card-body">
                <div className="prd-menu-card-title-row">
                  <span className="prd-menu-card-name">{p.name}</span>
                  {isBestSeller ? <span className="prd-menu-card-bestseller">{t('bestseller')}</span> : null}
                </div>
                <div className="prd-menu-card-foot">
                  <span className="prd-menu-card-price">{formatMoney(p.priceMinor)}</span>
                  <span className="prd-menu-card-sold">{t('sold', { n: p.sold })}</span>
                </div>
                {recipesOn && recipes && p.active ? (
                  <span className={`mnu-card-recipe is-${recipes.get(p.id)?.state ?? 'none'}`}>
                    {(recipes.get(p.id)?.state ?? 'none') === 'done' ? <IconCheck /> : null}
                    {tm(`recipe.${recipes.get(p.id)?.state ?? 'none'}`)}
                  </span>
                ) : null}
              </div>
            </button>
            {shareItem ? <ShareOnWhatsAppButton item={shareItem} branchId={p.locationId} bookable={false} photoUrl={p.imageUrl} /> : null}
            </div>
          );
        })}
      </div>
    );
  const sheet = (inline: boolean) =>
    editing ? (
      <ProductSheet
        key={`${editing === 'new' ? 'new' : editing.id}:${editingPart ?? ''}`}
        product={editing === 'new' ? null : editing}
        initialPart={editingPart}
        branchId={branchId}
        categories={liveCategories}
        onSaved={saved}
        onDelete={(p) => setDeleting(p)}
        onClose={() => setEditing(null)}
        inline={inline}
        initialSaved={editing !== 'new' && savedId === editing.id}
        seesCost={seesCost}
      />
    ) : null;
  const note = (
    <>
      {/* Owner's review 2026-11-13 — on a counted shelf the header names the branch (branch-routes), so no banner. */}
      {shownBranchName && !counted ? <div className="banner banner-info prd-branch-note">{t('shownBranch', { branch: shownBranchName })}</div> : null}
      {noticeLine}
      {importNote ? (
        <div className="banner" role="status">
          {importNote}
        </div>
      ) : null}
    </>
  );
  const dialogs = (
    <>
      {shareText.dialog}
      {bulkEditOpen && canStockTake && writable ? (
        <BulkEditProductsModal
          branchId={branchId}
          counted={counted}
          products={rows}
          categories={liveCategories}
          onProductsChange={(next) => {
            setRows(next);
            void refreshCategories();
            router.refresh();
          }}
          onCategoriesChange={(next) => {
            setCategories(next);
            router.refresh();
          }}
          onClose={() => setBulkEditOpen(false)}
        />
      ) : null}
      {menuOpen ? (
        <ImportMenu
          branchId={branchId}
          branchName={session?.branches?.find((b) => b.id === branchId)?.name ?? shownBranchName ?? null}
          onClose={() => setMenuOpen(false)}
          onImported={(r) => void menuImported(r)}
          onPricesFromFile={() => {
            setMenuOpen(false);
            setImportOpen(true);
          }}
        />
      ) : null}
      {importOpen ? <ImportProducts shelf={rows} categories={categories} branchId={branchId} onClose={() => setImportOpen(false)} onImported={(r) => void imported(r)} /> : null}
      {deleting ? (
        <ConfirmDialog
          title={`${t('delete')} ${nouns.product.toLowerCase()}`}
          body={t('deleteAsk', { name: deleting.name })}
          confirmLabel={t('deletePermanently', { action: t('delete') })}
          tone="danger"
          busy={busy}
          error={error}
          onConfirm={() => void remove()}
          onCancel={() => {
            setDeleting(null);
            setError(null);
          }}
        >
          <div className="prd-delete-preview">
            <ProductPhoto className="prd-delete-preview-photo" product={deleting} />
            <div className="prd-delete-preview-info">
              <strong>{deleting.name}</strong>
              <span>
                {[deleting.categoryName, formatMoney(deleting.priceMinor), t('sold', { n: deleting.sold })]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </div>
          </div>
          {deleting.active ? (
            <div className="prd-delete-alt">
              <span>{t('hideInsteadHint')}</span>
              <button
                type="button"
                className="btn btn-ghost prd-delete-alt-btn"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    const updated = await api.updateProduct(deleting.id, { active: false });
                    saved(updated);
                    setDeleting(null);
                  } catch (err) {
                    fail(err);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {t('retireInstead', { action: t('retire') })}
              </button>
            </div>
          ) : null}
        </ConfirmDialog>
      ) : null}
      {deletingCategory ? (
        <ConfirmDialog
          title={t('categories.delete')}
          body={
            deletingCategory.count > 0
              ? t('categories.deleteWithProductsAsk', { name: deletingCategory.name, n: deletingCategory.count })
              : t('categories.deleteAsk', { name: deletingCategory.name, n: 0 })
          }
          confirmLabel={
            deletingCategory.count > 0
              ? t('categories.deleteWithProducts', { name: deletingCategory.name, n: deletingCategory.count })
              : t('categories.delete')
          }
          tone="danger"
          busy={busy}
          error={error}
          onConfirm={() => void removeCategory(deletingCategory.count > 0)}
          onCancel={() => {
            setDeletingCategory(null);
            setError(null);
          }}
        >
          {deletingCategory.count > 0 ? (
            <div className="prd-delete-alt">
              <button
                type="button"
                className="btn btn-ghost prd-delete-alt-btn"
                disabled={busy}
                onClick={() => void removeCategory(false)}
              >
                {t('categories.keepProductsUnassigned', { n: deletingCategory.count })}
              </button>
            </div>
          ) : null}
        </ConfirmDialog>
      ) : null}
    </>
  );

  if (stockTakeOpen) {
    return (
      <StockTake
        key={branchId}
        branchId={branchId}
        initialProducts={rows}
        categories={liveCategories}
        initialCategories={selectedCategories}
        initialSearch={search}
        onSaved={stockTakeSaved}
        onCancel={() => setStockTakeOpen(false)}
      />
    );
  }

  if (desk === null) {
    return (
      <>
        {header}
        <div className="page-body" aria-busy="true" />
      </>
    );
  }

  if (desk && rows.length > 0) {
    return (
      <>
        {header}
        <div className="page-body prd-desk">
          {note}
          {strip}
          {reportLinks}
          <div className={`pf-wide-grid prd-desk-grid ${editing ? 'has-sheet' : 'is-full'}`}>
            <section className="pf-wide-mid prd-desk-mid" aria-label={t('title')}>
              {!counted ? (
                /* Owner, 2026-11-20 — the Menu in one card: its tabs, one row of tools, the dishes, the pages. */
                <div className="mnu-work">
                  {/* Owner, 2026-11-20 ("they are wasting a lot of space") — the count and Clear filters share the tabs' row. */}
                  <div className="mnu-head">
                    {menuTabs}
                    <div className="mnu-result-row">
                      {/* The count is the tab's and the pages' to say; it shows here only for a search, which the tab's count does not follow. */}
                      {search.trim().length > 0 ? <span className="mnu-result">{tm('result', { count: shown.length })}</span> : null}
                      {clearFilters}
                    </div>
                  </div>
                  <div className="prd-desk-tools mnu-tools">
                    {searchBox}
                    {categoriesDropdown}
                    {sortBox}
                    <div className="prd-view-seg" role="group" aria-label={t('menuViewAria')}>
                      <button
                        type="button"
                        className={`prd-view-btn ${menuView === 'table' ? 'is-on' : ''}`}
                        aria-pressed={menuView === 'table'}
                        aria-label={t('viewTable')}
                        title={t('viewTable')}
                        onClick={() => pick(() => setMenuView('table'))}
                      >
                        <IconMenu />
                      </button>
                      <button
                        type="button"
                        className={`prd-view-btn ${menuView === 'cards' ? 'is-on' : ''}`}
                        aria-pressed={menuView === 'cards'}
                        aria-label={t('viewCards')}
                        title={t('viewCards')}
                        onClick={() => pick(() => setMenuView('cards'))}
                      >
                        <IconGrid />
                      </button>
                    </div>
                    {/* Set-up jobs, not daily ones: in one ⋮ as words, where two unlabelled icons (a pencil and an upload arrow) said nothing. */}
                    <MenuKebab
                      className="mnu-tool-kebab"
                      label={tm('moreTools')}
                      items={[
                        ...(hasMenuToShare ? [{ label: tm('share.button'), onSelect: shareMenu }] : []),
                        ...(canStockTake && writable
                          ? [
                              { label: t('bulkTable.open'), onSelect: () => setBulkEditOpen(true) },
                              { label: t('import.open'), onSelect: openImport },
                            ]
                          : []),
                      ]}
                    />
                  </div>
                  {alsoTryRow}
                  {menuView === 'cards' ? (
                    <div className="prd-menu-cards-wrap mnu-cards">{menuCards}</div>
                  ) : (
                    menuTable
                  )}
                  {pages}
                </div>
              ) : (
                <>
                  <div className="prd-desk-tools">
                    {searchBox}
                    {categoriesDropdown}
                    {sortBox}
                    {canStockTake && writable ? (
                      <button type="button" className="btn btn-ghost prd-bulk-edit-btn" onClick={() => setBulkEditOpen(true)}>
                        {t('bulkTable.open')}
                      </button>
                    ) : null}
                    {canStockTake && writable ? (
                      <button type="button" className="btn btn-ghost prd-import-btn" onClick={openImport}>
                        <IconUpload /> {t('import.open')}
                      </button>
                    ) : null}
                  </div>
                  {chips}
                  {alsoTryRow}
                  <div className="card prd-desk-card">
                    {table}
                    {pages}
                  </div>
                </>
              )}
            </section>
            {editing ? (
              <aside className="pf-wide-right prd-desk-right" aria-label={editing === 'new' ? t('form.titleAdd', { product: nouns.product }) : t('form.titleEdit', { product: nouns.product })}>
                {sheet(true)}
              </aside>
            ) : null}
          </div>
        </div>
        {/*
          QA 2026-11-17 — the dialogs sit at the SAME place in both layouts (fourth child, after the phone's sheet slot):
          inside the desk's page-body they were a different element from the phone's, so crossing 1101px (an iPad turned)
          rebuilt every open dialog and threw away a menu file's review, or the fixes typed into a product import's.
        */}
        {null}
        {dialogs}
      </>
    );
  }

  return (
    <>
      {header}
      {/* `prd-shelf` on a counted shelf: 96-products.css hides the header's ⓘ beside it on a phone (review 2026-11-13: a client flag flashed it). */}
      <div className={`page-body prd-page ${counted ? 'prd-shelf' : ''}`}>
        {note}
        {rows.length === 0 ? (
          <div className="empty prd-empty">
            <p>{t('empty')}</p>
            <p className="prd-empty-hint">{t('emptyHint')}</p>
            {canStockTake && writable ? (
              <button type="button" className="btn btn-ghost" onClick={openImport}>
                {t('import.open')}
              </button>
            ) : null}
          </div>
        ) : (
          <>
            {counted ? shelfLine : strip}
            {reportLinks}
            {!counted ? menuTabs : null}
            <div className="prd-tools">
              {hasMenuToShare ? (
                <div className="mnu-search-row">
                  {searchBox}
                  <button type="button" className="mnu-share-menu" aria-label={tm('share.button')} title={tm('share.button')} onClick={shareMenu}>
                    <IconWhatsApp />
                  </button>
                </div>
              ) : (
                searchBox
              )}
              {counted ? (
                /*
                 * Owner's review 2026-11-13 — one scroller instead of a selects row AND a chips row: the four
                 * status chips first (the filter people reach for), then Categories, the sort and Bulk edit.
                 * The Categories menu is fixed to the viewport so the scroller cannot clip it.
                 */
                <div className="prd-chips prd-filter-row" role="group" aria-label={t('filters.label')}>
                  {SHELF_FILTERS.map((f) => (
                    <button
                      key={f}
                      type="button"
                      className={`prd-chip ${filter === f ? 'prd-chip-on' : ''} ${f === 'low' && counts.low > 0 ? 'prd-chip-warn' : ''}`}
                      aria-pressed={filter === f}
                      onClick={() => pick(() => setFilter(f))}
                    >
                      {t(`filters.${f}`)} <span className="prd-chip-n">{counts[f]}</span>
                    </button>
                  ))}
                  {categoriesDropdown}
                  {sortBox}
                  {canStockTake && writable ? (
                    <button type="button" className="prd-chip prd-chip-edit" onClick={() => setBulkEditOpen(true)}>
                      <IconEdit /> {t('bulkTable.open')}
                    </button>
                  ) : null}
                </div>
              ) : categoriesDropdown ? (
                <div className="prd-selects">
                  {categoriesDropdown}
                  {sortBox}
                  {canStockTake && writable ? (
                    <button type="button" className="btn btn-ghost prd-bulk-edit-btn" onClick={() => setBulkEditOpen(true)} aria-label={t('bulkTable.open')}>
                      <span className="prd-bulk-edit-icon" aria-hidden="true">
                        <IconEdit />
                      </span>
                      <span className="prd-bulk-edit-word">{t('bulkTable.open')}</span>
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="prd-selects">
                  {sortBox}
                  {canStockTake && writable ? (
                    <button type="button" className="btn btn-ghost prd-bulk-edit-btn" onClick={() => setBulkEditOpen(true)} aria-label={t('bulkTable.open')}>
                      <span className="prd-bulk-edit-icon" aria-hidden="true">
                        <IconEdit />
                      </span>
                      <span className="prd-bulk-edit-word">{t('bulkTable.open')}</span>
                    </button>
                  ) : null}
                </div>
              )}
            </div>
            {alsoTryRow}
            {!counted ? menuRows : list}
            {pages}
            {importRow}
          </>
        )}
      </div>
      {sheet(false)}
      {dialogs}
    </>
  );
}

