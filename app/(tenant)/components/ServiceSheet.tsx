'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { formatMoney } from '../lib/api';
import type { Offer, Product, Service } from '../lib/api-types';
import { asMinor, matchItems } from '../lib/service-match';
import { productByCode, productMatchable } from '../lib/product-match';
import { ServicePhoto } from './ServicePhoto';
import { ProductPhoto } from './ProductPhoto';
import { useNewVisitCopy } from '../lib/use-copy';
import { useAreas } from './SessionProvider';
import { useDialog } from '../../shared/a11y/useDialog';
import { IconInfo, IconSearch } from './icons';
import { PackageSheet } from './PackageSheet';
import { MENU_SORTS, sortMenu, type MenuSort } from '../lib/menu-sort';

/**
 * "More…" — the whole menu, in the flow (owner, 2026-10-09: the tile used to leave for the full form).
 *
 * One box over the full list: the kind-of-service chips and the spelling-tolerant match the full form has, as rows
 * with the photo, the name and the price. A tap puts one on the bill and comes back to the tiles, where it now sits
 * among the top sellers with its count — the same feedback as tapping a tile. The box is focused because "More…"
 * was tapped: the person came here to look for something.
 *
 * Owner, 2026-10-10 — New booking's Services row opens this same sheet. It is the search a desk already knows
 * from the till, and the receptionist who rings a visit up is the one who booked it an hour earlier. Two
 * differences, both carried as optional props so Record payment renders exactly what it did:
 *
 *   `packages`  New booking sells combos, which the till's "More…" never listed. They arrive as one more chip
 *               beside the kinds, and as rows that read like services.
 *   `keepOpen`  New booking's caller does not close on a pick, because this sheet IS its menu and a visit is
 *               often two or three services; the till's "More…" closes, because its tiles are the main path.
 *               Nothing here decides that — the caller's `onPick` does — but the count on each row is what
 *               makes staying open legible, so it is worth saying out loud.
 */
export function ServiceSheet({
  services,
  counts,
  onPick,
  onClose,
  packages,
  packageCountOf = () => 0,
  onLessPackage,
  onPickPackage,
  products,
  productCounts,
  onPickProduct,
  initialKind,
  initialTerm = '',
  productsOnly = false,
}: {
  services: Service[];
  counts: Map<string, number>;
  onPick: (s: Service) => void;
  onClose: () => void;
  /** The combos on offer. Omitted by Record payment, which does not sell them from here. */
  packages?: Offer[];
  /** Owner, 2026-10-15 — how many times a package is on the bill, and one fewer; absent on the one-page form. */
  packageCountOf?: (offerId: string) => number;
  onLessPackage?: (offerId: string) => void;
  onPickPackage?: (o: Offer) => void;
  /** Owner, 2026-10-14 — the branch's shelf, as one more chip: rows that read like services, with how many are left. */
  products?: Product[];
  productCounts?: Map<string, number>;
  onPickProduct?: (p: Product) => void;
  initialKind?: 'products';
  /** A scanned code that matched nothing, so the box opens with it and the cashier can edit it into a name. */
  initialTerm?: string;
  productsOnly?: boolean;
}) {
  const t = useTranslations('payFlow');
  // A kitchen keeps no count, so a dish's row is its name and its price (`catalog.stock_counted` off).
  const counted = useAreas().stock;
  const nv = useNewVisitCopy();
  const ref = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLInputElement>(null);
  useDialog(ref, { onClose, initialFocus: 'container' });
  useEffect(() => {
    box.current?.focus({ preventScroll: true });
  }, []);

  /** The chip that lists combos rather than one kind of service. Not a category name anyone can type. */
  const PACKAGES = '\u0000packages';
  const PRODUCTS = '\u0000products';
  const [term, setTerm] = useState(initialTerm);
  const [kind, setKind] = useState(productsOnly || initialKind === 'products' ? PRODUCTS : '');
  const offers = packages ?? [];
  const shelf = products ?? [];
  const packageMode = kind === PACKAGES;
  const productMode = kind === PRODUCTS;
  /** Owner, 2026-10-15 — sort under the search; the shelf hides what is out of stock unless asked. */
  const [sort, setSort] = useState<MenuSort>('menu');
  /*
   * Jira GRW-643 — OFF where nothing is counted. A kitchen keeps no stock (`catalog.stock_counted`),
   * so every dish reads as 0 left; on by default, this filtered the whole menu away and the sheet
   * answered "No dish by that name." to every search, including the name of a dish listed behind it.
   * There is no "in stock" to filter by when nothing is counted, which is why the chip is gone too.
   */
  const [inStockOnly, setInStockOnly] = useState(counted);
  const [viewing, setViewing] = useState<Offer | null>(null);
  const kinds = useMemo(() => [...new Set(services.map((s) => s.categoryName).filter((c): c is string => Boolean(c)))], [services]);
  const shownProducts = useMemo(() => {
    if (!productMode) return [];
    const pool = inStockOnly && counted ? shelf.filter((p) => p.stock > 0 || (productCounts?.get(p.id) ?? 0) > 0) : shelf;
    const q = term.trim();
    return q
      ? matchItems(pool.map(productMatchable), q)
      : sortMenu(
          pool,
          sort,
          (p) => p.name,
          (p) => asMinor(p.priceMinor),
        );
  }, [shelf, productMode, term, sort, inStockOnly, counted, productCounts]);
  /** Jira GRW-574 — under Products, Enter on exactly one product's barcode or SKU picks it, as the desk till does. */
  const onSearchKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing || !productMode || !onPickProduct) return;
    const hit = productByCode(shelf, e.currentTarget.value);
    if (!hit) return;
    e.preventDefault();
    onPickProduct(hit);
    setTerm('');
  };
  const shown = useMemo(() => {
    if (packageMode || productMode) return [];
    const pool = kind ? services.filter((s) => s.categoryName === kind) : services;
    const q = term.trim();
    return q
      ? matchItems(
          pool.map((s) => ({ item: s, text: [s.name], priceMinor: asMinor(s.priceMinor) })),
          q,
        )
      : sortMenu(
          pool,
          sort,
          (s) => s.name,
          (s) => asMinor(s.priceMinor),
        );
  }, [services, kind, term, packageMode, productMode, sort]);
  /* A combo is found by its own name or by any service in it: "haircut" should reach the cut-and-colour offer. */
  const shownPackages = useMemo(() => {
    if (!packageMode) return [];
    const q = term.trim();
    if (!q)
      return sortMenu(
        offers,
        sort,
        (o) => o.title,
        (o) => asMinor(o.comboPriceMinor),
      );
    const byId = new Map(services.map((x) => [x.id, x.name]));
    return matchItems(
      offers.map((o) => ({ item: o, text: [o.title, ...o.serviceIds.map((id) => byId.get(id) ?? '')], priceMinor: asMinor(o.comboPriceMinor) })),
      q,
    );
  }, [offers, packageMode, term, services, sort]);

  // A tap on the dimmed area closes it, as every other sheet in the app does (`sheet-backdrop`).
  const sheetTitle = productsOnly ? t(counted ? 'desk.products' : 'desk.menu') : t('allServices', { count: services.length });
  const searchLabel = productsOnly
    ? t(counted ? 'desk.searchProducts' : 'desk.searchDishes', { count: shelf.length })
    : t('searchServices');
  return (
    <div className="pf-keypad-scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="pf-keypad pf-client pf-menu" role="dialog" aria-modal="true" aria-label={sheetTitle} tabIndex={-1}>
        <div className="pf-keypad-head">
          <span className="pf-keypad-title">{sheetTitle}</span>
          <button type="button" className="pf-keypad-clear" onClick={onClose}>
            {nv.close}
          </button>
        </div>
        <div className="pf-menu-search-row">
          <div className="pf-client-box">
            <IconSearch />
            <input
              ref={box}
              type="search"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={onSearchKey}
              placeholder={searchLabel}
              aria-label={searchLabel}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
          <div className="pf-menu-tools">
            <label className="pf-sort">
              <select value={sort} onChange={(e) => setSort(e.target.value as MenuSort)} aria-label={t('sort.label')}>
                {MENU_SORTS.map((k) => (
                  <option key={k} value={k}>
                    {t(`sort.${k}`)}
                  </option>
                ))}
              </select>
            </label>
            {productMode && counted ? (
              <button type="button" className={`pf-chip pf-filter-chip ${inStockOnly ? 'pf-chip-on' : ''}`} aria-pressed={inStockOnly} onClick={() => setInStockOnly((v) => !v)}>
                {t('inStockOnly')}
              </button>
            ) : null}
          </div>
        </div>
        {/*
          One chip is no choice, which is why a single category draws none — but a salon with its services
          uncategorised and combos on sale is exactly one chip plus Packages, and that arithmetic hid the only
          door to the combos (review, 2026-10-11). Packages earns the row on its own.
        */}
        {!productsOnly && (kinds.length > 1 || offers.length > 0 || shelf.length > 0 || initialKind === 'products') ? (
          <div className="pf-chips pf-menu-kinds" role="group" aria-label={nv.serviceKinds}>
            {['', ...kinds, ...(offers.length > 0 ? [PACKAGES] : []), ...(shelf.length > 0 || initialKind === 'products' ? [PRODUCTS] : [])].map((k) => (
              <button key={k || 'all'} type="button" className={`pf-chip ${kind === k ? 'pf-chip-on' : ''}`} aria-pressed={kind === k} onClick={() => setKind(k)}>
                {k === PACKAGES ? nv.packagesChip : k === PRODUCTS ? t('productsChip') : k || nv.allServices}
              </button>
            ))}
          </div>
        ) : null}
        {productMode ? (
          shownProducts.length === 0 ? (
            <p className="pf-client-note">{shelf.length === 0 ? t(counted ? 'desk.noProducts' : 'desk.noDishes') : t(counted ? 'desk.noProductMatch' : 'desk.noDishMatch')}</p>
          ) : (
            /* A product reads like a service: its picture, its name, its price, and how many are left — the count
               only where there is one, so a kitchen's dish reads as its name and its price. */
            <ul className="pf-client-matches pf-menu-list">
              {shownProducts.map((p) => {
                const n = productCounts?.get(p.id) ?? 0;
                return (
                  <li key={p.id}>
                    <button type="button" className={`pf-client-match pf-menu-row ${n > 0 ? 'pf-menu-row-on' : ''}`} onClick={() => onPickProduct?.(p)}>
                      <ProductPhoto className="pf-menu-photo" product={p} />
                      <span className="pf-client-match-name">{p.name}</span>
                      <span className="pf-client-match-sub">
                        {formatMoney(p.priceMinor)}
                        {counted ? <> · {p.stock <= 0 ? t('outOfStock') : t('left', { n: p.stock })}</> : null}
                      </span>
                      {n > 0 ? (
                        <span className="pf-menu-count" aria-label={t('onBill', { count: n })}>
                          {n}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )
        ) : packageMode ? (
          /* A combo reads like a service: its picture, its name, what it costs. Tapping the one already on
             the bill takes it off, which is the row's own toggle on the full form too. */
          <ul className="pf-client-matches pf-menu-list">
            {shownPackages.map((o) => {
              const first = services.find((x) => x.id === o.serviceIds[0]);
              const pkgCount = packageCountOf(o.id);
              const on = pkgCount > 0;
              return (
                <li key={o.id}>
                  <button type="button" className={`pf-client-match pf-menu-row ${on ? 'pf-menu-row-on' : ''}`} onClick={() => onPickPackage?.(o)}>
                    {first ? <ServicePhoto className="pf-menu-photo" service={first} /> : <span className="pf-menu-photo" aria-hidden="true" />}
                    <span className="pf-client-match-name">{o.title}</span>
                    <span className="pf-client-match-sub">{o.comboPriceMinor ? formatMoney(o.comboPriceMinor) : nv.comboServices(o.serviceIds.length)}</span>
                  </button>
                  <button type="button" className="pf-menu-info" aria-label={t('pkg.view', { name: o.title })} onClick={() => setViewing(o)}>
                    <IconInfo />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : shown.length === 0 ? (
          <p className="pf-client-note">{nv.noServiceMatch}</p>
        ) : (
          <ul className="pf-client-matches pf-menu-list">
            {shown.map((s) => {
              const n = counts.get(s.id) ?? 0;
              return (
                <li key={s.id}>
                  <button type="button" className={`pf-client-match pf-menu-row ${n > 0 ? 'pf-menu-row-on' : ''}`} onClick={() => onPick(s)}>
                    <ServicePhoto className="pf-menu-photo" service={s} />
                    <span className="pf-client-match-name">{s.name}</span>
                    <span className="pf-client-match-sub">{formatMoney(s.priceMinor)}</span>
                    {n > 0 ? (
                      <span className="pf-menu-count" aria-label={t('onBill', { count: n })}>
                        {n}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {viewing ? <PackageSheet offer={viewing} services={services} countOf={packageCountOf} onPick={(o) => onPickPackage?.(o)} onLess={onLessPackage} onClose={() => setViewing(null)} /> : null}
    </div>
  );
}
