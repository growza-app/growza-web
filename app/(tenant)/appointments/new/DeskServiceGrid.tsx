'use client';

import { useTranslations } from 'next-intl';
import { useNewVisitCopy } from '../../lib/use-copy';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Offer, Product, Service } from '../../lib/api-types';
import { asMinor, matchItems } from '../../lib/service-match';
import { productPhotoUrl, servicePhotoUrl } from '../../lib/service-photos';
import { IconInfo, IconMinus, IconPlus, IconSearch } from '../../components/icons';
import { PackageSheet } from '../../components/PackageSheet';
import { MENU_SORTS, sortMenu, type MenuSort } from '../../lib/menu-sort';

/**
 * Jira GRW-572 — the middle panel of the wide till: the whole menu as tiles, with a search box above it.
 *
 * The phone's ① shows eight tiles and a search bar that opens a sheet, because a phone has room for eight. A
 * laptop has room for the menu, so every service is a tile here, in the same order the phone ranks them
 * (most sold first), and the box filters them as the desk types. The tiles are the phone's `.pf-tile`: the
 * same photo, name, price and − n +, so what the owner learnt on the phone is what the receptionist sees.
 *
 * This file has a text field on purpose. `PayFlow` has none, so a phone's keyboard never comes up by itself;
 * a desk has a keyboard already, and typing three letters beats scrolling fifty tiles.
 */
export function DeskServiceGrid({
  services,
  countOf,
  onMore,
  onLess,
  full,
  money,
  packages = [],
  packageCountOf = () => 0,
  onLessPackage,
  onPickPackage,
  products = [],
  productCountOf = () => 0,
  onMoreProduct,
  onLessProduct,
}: {
  /** In display order: most sold first. */
  services: Service[];
  countOf: (serviceId: string) => number;
  onMore: (s: Service) => void;
  onLess: (serviceId: string) => void;
  /** The bill is at its twelve-line limit: tiles not yet on it cannot be added. */
  full: boolean;
  money: (minor: number) => string;
  /** Jira GRW-572 — the branch's priced combos whose services are all on this menu; a second tab when there are any. */
  packages?: Offer[];
  /** Owner, 2026-10-15 — how many times a package is on the bill, and one fewer; absent on the one-page form. */
  packageCountOf?: (offerId: string) => number;
  onLessPackage?: (offerId: string) => void;
  onPickPackage?: (o: Offer) => void;
  /** Owner, 2026-10-14 — the branch's shelf (migration 0115): the third tab, the same tiles with a stock line. */
  products?: Product[];
  productCountOf?: (productId: string) => number;
  onMoreProduct?: (p: Product) => void;
  onLessProduct?: (productId: string) => void;
}) {
  const t = useTranslations('payFlow');
  const nv = useNewVisitCopy();
  const [term, setTerm] = useState('');
  const [tab, setTab] = useState<'services' | 'packages' | 'products'>('services');
  /** Owner, 2026-10-14 — a category chip row under the search, as the phone's sheet has: '' is All. */
  const [kind, setKind] = useState('');
  /** Owner, 2026-10-15 — sort beside the search, and the shelf hides what is out of stock unless asked. */
  const [sort, setSort] = useState<MenuSort>('name');
  const [inStockOnly, setInStockOnly] = useState(true);
  const [viewing, setViewing] = useState<Offer | null>(null);
  const kindRow = useRef<HTMLDivElement>(null);
  // The chosen chip stays in view, and a wheel over the row moves it sideways (a laptop has no sideways wheel).
  useEffect(() => {
    kindRow.current?.querySelector('.pf-chip-on')?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' });
  }, [kind]);
  // A native listener, not React's: React's wheel is passive, so the page would scroll along with the row.
  useEffect(() => {
    const row = kindRow.current;
    if (!row) return;
    const wheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || row.scrollWidth <= row.clientWidth) return;
      e.preventDefault();
      row.scrollLeft += e.deltaY;
    };
    row.addEventListener('wheel', wheel, { passive: false });
    return () => row.removeEventListener('wheel', wheel);
  }, [services.length]);
  const kinds = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of services) if (s.categoryName) counts.set(s.categoryName, (counts.get(s.categoryName) ?? 0) + 1);
    // Catalogue order: the first service of each category decides where its chip sits.
    return [...counts.entries()].map(([name, n]) => ({ name, n }));
  }, [services]);
  const byId = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);
  /*
   * The same matcher every other search in the app uses (lib/service-match.ts): spelling tolerance, words in any
   * order, and a typed number finds what SELLS at that price — "300" is Haircut, "6000" is the Pre-Bridal Package.
   * A plain substring test on the name was what shipped first, and the owner's first try was an amount.
   */
  const shownPackages = useMemo(() => {
    const q = term.trim();
    if (!q)
      return sortMenu(
        packages,
        sort,
        (o) => o.title,
        (o) => asMinor(o.comboPriceMinor),
      );
    return matchItems(
      packages.map((o) => ({ item: o, text: [o.title, ...o.serviceIds.map((id) => byId.get(id)?.name ?? '')], priceMinor: asMinor(o.comboPriceMinor) })),
      q,
    );
  }, [packages, term, byId, sort]);

  const shownProducts = useMemo(() => {
    const pool = inStockOnly ? products.filter((p) => p.stock > 0 || productCountOf(p.id) > 0) : products;
    const q = term.trim();
    if (!q)
      return sortMenu(
        pool,
        sort,
        (p) => p.name,
        (p) => asMinor(p.priceMinor),
      );
    return matchItems(
      pool.map((p) => ({ item: p, text: [p.name, p.categoryName ?? ''], priceMinor: asMinor(p.priceMinor) })),
      q,
    );
  }, [products, term, sort, inStockOnly, productCountOf]);

  const shown = useMemo(() => {
    const pool = kind ? services.filter((s) => s.categoryName === kind) : services;
    const q = term.trim();
    if (!q)
      return sortMenu(
        pool,
        sort,
        (s) => s.name,
        (s) => asMinor(s.priceMinor),
      );
    return matchItems(
      pool.map((s) => ({ item: s, text: [s.name, s.categoryName ?? ''], priceMinor: asMinor(s.priceMinor) })),
      q,
    );
  }, [services, term, kind, sort]);

  return (
    <section className="pf-wide-mid" aria-label={t('services')}>
      {/*
        Owner, 2026-10-14 — three tabs, always: what a till sells. Products is the one that is not here yet; it is
        shown greyed so the shape the owner will learn is the shape that is there now, and so nobody looks for it
        in a menu. A bill holds services, a package and (later) products together: the tabs only change the grid.
      */}
      <div className="pf-chips pf-wide-menu-tabs" role="tablist" aria-label={t('services')}>
        <button type="button" role="tab" aria-selected={tab === 'services'} className={`pf-chip ${tab === 'services' ? 'pf-chip-on' : ''}`} onClick={() => setTab('services')}>
          {t('services')}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'packages'} className={`pf-chip ${tab === 'packages' ? 'pf-chip-on' : ''}`} onClick={() => setTab('packages')}>
          {t('desk.packages', { n: packages.length })}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'products'} className={`pf-chip ${tab === 'products' ? 'pf-chip-on' : ''}`} onClick={() => setTab('products')}>
          {t('desk.products')}
          <span className="pf-wide-kind-n">{products.length}</span>
        </button>
      </div>
      <div className="pf-wide-tools">
        <label className="pf-wide-search">
          <IconSearch />
          <input
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={t('desk.search', { count: services.length })}
            aria-label={t('desk.search', { count: services.length })}
            autoComplete="off"
          />
        </label>
        <label className="pf-sort">
          <span className="pf-sort-l">{t('sort.label')}</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as MenuSort)} aria-label={t('sort.label')}>
            {MENU_SORTS.map((k) => (
              <option key={k} value={k}>
                {t(`sort.${k}`)}
              </option>
            ))}
          </select>
        </label>
        {tab === 'products' ? (
          <button type="button" className={`pf-chip pf-filter-chip ${inStockOnly ? 'pf-chip-on' : ''}`} aria-pressed={inStockOnly} onClick={() => setInStockOnly((v) => !v)}>
            {t('inStockOnly')}
          </button>
        ) : null}
      </div>
      {tab === 'services' && kinds.length > 1 ? (
        <div className="pf-chips pf-wide-kinds" role="group" aria-label={nv.serviceKinds} ref={kindRow}>
          <button type="button" className={`pf-chip ${kind === '' ? 'pf-chip-on' : ''}`} aria-pressed={kind === ''} onClick={() => setKind('')}>
            {nv.allServices}
            <span className="pf-wide-kind-n">{services.length}</span>
          </button>
          {kinds.map((k) => (
            <button key={k.name} type="button" className={`pf-chip ${kind === k.name ? 'pf-chip-on' : ''}`} aria-pressed={kind === k.name} onClick={() => setKind(k.name)}>
              {k.name}
              <span className="pf-wide-kind-n">{k.n}</span>
            </button>
          ))}
        </div>
      ) : null}
      {tab === 'products' ? (
        shownProducts.length === 0 ? (
          <p className="pf-wide-empty">{products.length === 0 ? t('desk.noProducts') : t('desk.noMatch')}</p>
        ) : (
          /* A product reads like a service: its picture, its name, its price — and how many are left instead of minutes. */
          <div className="pf-tiles pf-wide-tiles">
            {shownProducts.map((p) => {
              const count = productCountOf(p.id);
              const price = Number(p.priceMinor ?? 0);
              return (
                <div key={p.id} className={`pf-tile ${count > 0 ? 'pf-tile-on' : ''}`}>
                  <button
                    type="button"
                    className="pf-tile-tap"
                    aria-label={t('tileA11y', { name: p.name, price: money(price) })}
                    aria-pressed={count > 0}
                    onClick={() => onMoreProduct?.(p)}
                    disabled={full && count === 0}
                  >
                    <img className="pf-tile-photo" src={productPhotoUrl(p)} alt="" loading="lazy" />
                    <span className="pf-tile-name">{p.name}</span>
                    <span className="pf-tile-price">
                      {money(price)}
                      <span className={`pf-tile-mins ${p.stock <= 0 ? 'pf-tile-out' : ''}`}>{p.stock <= 0 ? t('outOfStock') : t('left', { n: p.stock })}</span>
                    </span>
                  </button>
                  {count > 0 ? (
                    <span className="pf-tile-qty" role="group" aria-label={t('onBill', { count })}>
                      <button type="button" className="pf-qty-btn" aria-label={t('oneLess', { name: p.name })} onClick={() => onLessProduct?.(p.id)}>
                        <IconMinus />
                      </button>
                      <span className="pf-qty-n" aria-live="polite">
                        {count}
                      </span>
                      <button type="button" className="pf-qty-btn" aria-label={t('oneMore', { name: p.name })} onClick={() => onMoreProduct?.(p)} aria-disabled={full || undefined}>
                        <IconPlus />
                      </button>
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        )
      ) : tab === 'packages' ? (
        shownPackages.length === 0 ? (
          <p className="pf-wide-empty">{packages.length === 0 ? t('desk.noPackages') : t('desk.noMatch')}</p>
        ) : (
          /* A package reads like a service: the first leg's picture, the name, the package price, and what is in it. */
          <div className="pf-tiles pf-wide-tiles">
            {shownPackages.map((o) => {
              const pkgCount = packageCountOf(o.id);
              const on = pkgCount > 0;
              const first = byId.get(o.serviceIds[0] ?? '');
              const names = o.serviceIds
                .map((id) => byId.get(id)?.name)
                .filter(Boolean)
                .join(', ');
              return (
                <div key={o.id} className={`pf-tile ${on ? 'pf-tile-on' : ''}`}>
                  <button
                    type="button"
                    className="pf-tile-tap"
                    aria-label={t('tileA11y', { name: o.title, price: money(Number(o.comboPriceMinor ?? 0)) })}
                    aria-pressed={on}
                    onClick={() => onPickPackage?.(o)}
                  >
                    {first ? <img className="pf-tile-photo" src={servicePhotoUrl(first)} alt="" loading="lazy" /> : <span className="pf-tile-photo" aria-hidden="true" />}
                    <span className="pf-tile-name">{o.title}</span>
                    <span className="pf-tile-price">
                      {money(Number(o.comboPriceMinor ?? 0))}
                      <span className="pf-tile-mins">{names}</span>
                    </span>
                  </button>
                  <button type="button" className="pf-tile-info" aria-label={t('pkg.view', { name: o.title })} onClick={() => setViewing(o)}>
                    <IconInfo />
                  </button>
                  {pkgCount > 0 && onLessPackage ? (
                    <span className="pf-tile-qty" role="group" aria-label={t('onBill', { count: pkgCount })}>
                      <button type="button" className="pf-qty-btn" aria-label={t('oneLess', { name: o.title })} onClick={() => onLessPackage(o.id)}>
                        <IconMinus />
                      </button>
                      <span className="pf-qty-n" aria-live="polite">
                        {pkgCount}
                      </span>
                      <button type="button" className="pf-qty-btn" aria-label={t('oneMore', { name: o.title })} onClick={() => onPickPackage?.(o)}>
                        <IconPlus />
                      </button>
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        )
      ) : shown.length === 0 ? (
        <p className="pf-wide-empty">{t('desk.noMatch')}</p>
      ) : (
        <div className="pf-tiles pf-wide-tiles">
          {shown.map((s) => {
            const count = countOf(s.id);
            const price = Number(s.priceMinor ?? 0);
            return (
              <div key={s.id} className={`pf-tile ${count > 0 ? 'pf-tile-on' : ''}`}>
                <button
                  type="button"
                  className="pf-tile-tap"
                  aria-label={t('tileA11y', { name: s.name, price: money(price) })}
                  aria-pressed={count > 0}
                  onClick={() => onMore(s)}
                  disabled={full && count === 0}
                >
                  <img className="pf-tile-photo" src={servicePhotoUrl(s)} alt="" loading="lazy" />
                  <span className="pf-tile-name">{s.name}</span>
                  <span className="pf-tile-price">
                    {money(price)}
                    {s.durationMin ? <span className="pf-tile-mins">{t('desk.mins', { n: s.durationMin })}</span> : null}
                  </span>
                </button>
                {count > 0 ? (
                  <span className="pf-tile-qty" role="group" aria-label={t('onBill', { count })}>
                    <button type="button" className="pf-qty-btn" aria-label={t('oneLess', { name: s.name })} onClick={() => onLess(s.id)}>
                      <IconMinus />
                    </button>
                    <span className="pf-qty-n" aria-live="polite">
                      {count}
                    </span>
                    <button type="button" className="pf-qty-btn" aria-label={t('oneMore', { name: s.name })} onClick={() => onMore(s)} aria-disabled={full || undefined}>
                      <IconPlus />
                    </button>
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
      {viewing ? <PackageSheet offer={viewing} services={services} countOf={packageCountOf} onPick={(o) => onPickPackage?.(o)} onLess={onLessPackage} onClose={() => setViewing(null)} /> : null}
    </section>
  );
}
