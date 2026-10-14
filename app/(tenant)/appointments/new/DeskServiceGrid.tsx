'use client';

import { useTranslations } from 'next-intl';
import { useNewVisitCopy } from '../../lib/use-copy';
import { useMemo, useState } from 'react';
import type { Offer, Service } from '../../lib/api-types';
import { asMinor, matchItems } from '../../lib/service-match';
import { servicePhotoUrl } from '../../lib/service-photos';
import { IconMinus, IconPlus, IconSearch } from '../../components/icons';

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
  packageOnBillId = null,
  onPickPackage,
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
  packageOnBillId?: string | null;
  onPickPackage?: (o: Offer) => void;
}) {
  const t = useTranslations('payFlow');
  const nv = useNewVisitCopy();
  const [term, setTerm] = useState('');
  const [tab, setTab] = useState<'services' | 'packages'>('services');
  /** Owner, 2026-10-14 — a category chip row under the search, as the phone's sheet has: '' is All. */
  const [kind, setKind] = useState('');
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
    if (!q) return packages;
    return matchItems(
      packages.map((o) => ({ item: o, text: [o.title, ...o.serviceIds.map((id) => byId.get(id)?.name ?? '')], priceMinor: asMinor(o.comboPriceMinor) })),
      q,
    );
  }, [packages, term, byId]);

  const shown = useMemo(() => {
    const pool = kind ? services.filter((s) => s.categoryName === kind) : services;
    const q = term.trim();
    if (!q) return pool;
    return matchItems(
      pool.map((s) => ({ item: s, text: [s.name, s.categoryName ?? ''], priceMinor: asMinor(s.priceMinor) })),
      q,
    );
  }, [services, term, kind]);

  return (
    <section className="pf-wide-mid" aria-label={t('services')}>
      {packages.length > 0 ? (
        <div className="pf-chips pf-wide-tabs" role="tablist" aria-label={t('services')}>
          <button type="button" role="tab" aria-selected={tab === 'services'} className={`pf-chip ${tab === 'services' ? 'pf-chip-on' : ''}`} onClick={() => setTab('services')}>
            {t('services')}
          </button>
          <button type="button" role="tab" aria-selected={tab === 'packages'} className={`pf-chip ${tab === 'packages' ? 'pf-chip-on' : ''}`} onClick={() => setTab('packages')}>
            {t('desk.packages', { n: packages.length })}
          </button>
        </div>
      ) : null}
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
      {tab === 'services' && kinds.length > 1 ? (
        <div className="pf-chips pf-wide-kinds" role="group" aria-label={nv.serviceKinds}>
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
      {tab === 'packages' ? (
        shownPackages.length === 0 ? (
          <p className="pf-wide-empty">{t('desk.noMatch')}</p>
        ) : (
          /* A package reads like a service: the first leg's picture, the name, the package price, and what is in it. */
          <div className="pf-tiles pf-wide-tiles">
            {shownPackages.map((o) => {
              const on = packageOnBillId === o.id;
              const first = byId.get(o.serviceIds[0] ?? '');
              const names = o.serviceIds.map((id) => byId.get(id)?.name).filter(Boolean).join(', ');
              return (
                <div key={o.id} className={`pf-tile ${on ? 'pf-tile-on' : ''}`}>
                  <button type="button" className="pf-tile-tap" aria-pressed={on} onClick={() => onPickPackage?.(o)}>
                    {first ? <img className="pf-tile-photo" src={servicePhotoUrl(first)} alt="" loading="lazy" /> : <span className="pf-tile-photo" aria-hidden="true" />}
                    <span className="pf-tile-name">{o.title}</span>
                    <span className="pf-tile-price">
                      {money(Number(o.comboPriceMinor ?? 0))}
                      <span className="pf-tile-mins">{names}</span>
                    </span>
                  </button>
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
    </section>
  );
}
