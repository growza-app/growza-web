'use client';

import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import type { Service } from '../../lib/api-types';
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
}: {
  /** In display order: most sold first. */
  services: Service[];
  countOf: (serviceId: string) => number;
  onMore: (s: Service) => void;
  onLess: (serviceId: string) => void;
  /** The bill is at its twelve-line limit: tiles not yet on it cannot be added. */
  full: boolean;
  money: (minor: number) => string;
}) {
  const t = useTranslations('payFlow');
  const [term, setTerm] = useState('');

  const shown = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return services;
    return services.filter((s) => s.name.toLowerCase().includes(q) || (s.categoryName ?? '').toLowerCase().includes(q));
  }, [services, term]);

  return (
    <section className="pf-wide-mid" aria-label={t('services')}>
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
      {shown.length === 0 ? (
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
