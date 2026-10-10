'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatMoney } from '../lib/api';
import type { Offer, Service } from '../lib/api-types';
import { asMinor, matchItems } from '../lib/service-match';
import { servicePhotoUrl } from '../lib/service-photos';
import { useNewVisitCopy } from '../lib/use-copy';
import { useDialog } from '../../shared/a11y/useDialog';
import { IconSearch } from './icons';

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
  packageOnBillId = null,
  onPickPackage,
}: {
  services: Service[];
  counts: Map<string, number>;
  onPick: (s: Service) => void;
  onClose: () => void;
  /** The combos on offer. Omitted by Record payment, which does not sell them from here. */
  packages?: Offer[];
  /** The one already on the bill, so tapping it again takes it off. */
  packageOnBillId?: string | null;
  onPickPackage?: (o: Offer) => void;
}) {
  const t = useTranslations('payFlow');
  const nv = useNewVisitCopy();
  const ref = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLInputElement>(null);
  useDialog(ref, { onClose, initialFocus: 'container' });
  useEffect(() => {
    box.current?.focus({ preventScroll: true });
  }, []);

  const [term, setTerm] = useState('');
  const [kind, setKind] = useState('');
  /** The chip that lists combos rather than one kind of service. Not a category name anyone can type. */
  const PACKAGES = '\u0000packages';
  const offers = packages ?? [];
  const packageMode = kind === PACKAGES;
  const kinds = useMemo(() => [...new Set(services.map((s) => s.categoryName).filter((c): c is string => Boolean(c)))], [services]);
  const shown = useMemo(() => {
    if (packageMode) return [];
    const pool = kind ? services.filter((s) => s.categoryName === kind) : services;
    const q = term.trim();
    return q ? matchItems(pool.map((s) => ({ item: s, text: [s.name], priceMinor: asMinor(s.priceMinor) })), q) : pool;
  }, [services, kind, term, packageMode]);
  /* A combo is found by its own name or by any service in it: "haircut" should reach the cut-and-colour offer. */
  const shownPackages = useMemo(() => {
    if (!packageMode) return [];
    const q = term.trim();
    if (!q) return offers;
    const byId = new Map(services.map((x) => [x.id, x.name]));
    return matchItems(
      offers.map((o) => ({ item: o, text: [o.title, ...o.serviceIds.map((id) => byId.get(id) ?? '')], priceMinor: asMinor(o.comboPriceMinor) })),
      q,
    );
  }, [offers, packageMode, term, services]);

  // A tap on the dimmed area closes it, as every other sheet in the app does (`sheet-backdrop`).
  return (
    <div className="pf-keypad-scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="pf-keypad pf-client pf-menu" role="dialog" aria-modal="true" aria-label={t('allServices', { count: services.length })} tabIndex={-1}>
        <div className="pf-keypad-head">
          <span className="pf-keypad-title">{t('allServices', { count: services.length })}</span>
          <button type="button" className="pf-keypad-clear" onClick={onClose}>
            {nv.close}
          </button>
        </div>
        <div className="pf-client-box">
          <IconSearch />
          <input ref={box} type="search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder={t('searchServices')} aria-label={t('searchServices')} autoComplete="off" autoCorrect="off" spellCheck={false} />
        </div>
        {kinds.length + (offers.length > 0 ? 1 : 0) > 1 ? (
          <div className="pf-chips pf-menu-kinds" role="group" aria-label={nv.serviceKinds}>
            {['', ...kinds, ...(offers.length > 0 ? [PACKAGES] : [])].map((k) => (
              <button key={k || 'all'} type="button" className={`pf-chip ${kind === k ? 'pf-chip-on' : ''}`} aria-pressed={kind === k} onClick={() => setKind(k)}>
                {k === PACKAGES ? nv.packagesChip : k || nv.allServices}
              </button>
            ))}
          </div>
        ) : null}
        {packageMode ? (
          /* A combo reads like a service: its picture, its name, what it costs. Tapping the one already on
             the bill takes it off, which is the row's own toggle on the full form too. */
          <ul className="pf-client-matches pf-menu-list">
            {shownPackages.map((o) => {
              const first = services.find((x) => x.id === o.serviceIds[0]);
              const on = packageOnBillId === o.id;
              return (
                <li key={o.id}>
                  <button type="button" className={`pf-client-match pf-menu-row ${on ? 'pf-menu-row-on' : ''}`} onClick={() => onPickPackage?.(o)}>
                    {first ? <img className="pf-menu-photo" src={servicePhotoUrl(first)} alt="" loading="lazy" /> : <span className="pf-menu-photo" aria-hidden="true" />}
                    <span className="pf-client-match-name">{o.title}</span>
                    <span className="pf-client-match-sub">
                      {o.comboPriceMinor ? formatMoney(o.comboPriceMinor) : nv.comboServices(o.serviceIds.length)}
                    </span>
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
                    <img className="pf-menu-photo" src={servicePhotoUrl(s)} alt="" loading="lazy" />
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
    </div>
  );
}
