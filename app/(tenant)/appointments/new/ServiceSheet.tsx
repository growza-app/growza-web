'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatMoney } from '../../lib/api';
import type { Service } from '../../lib/api-types';
import { asMinor, matchItems } from '../../lib/service-match';
import { servicePhotoUrl } from '../../lib/service-photos';
import { useNewVisitCopy } from '../../lib/use-copy';
import { useDialog } from '../../../shared/a11y/useDialog';
import { IconSearch } from '../../components/icons';

/**
 * "More…" — the whole menu, in the flow (owner, 2026-10-09: the tile used to leave for the full form).
 *
 * One box over the full list: the kind-of-service chips and the spelling-tolerant match the full form has, as rows
 * with the photo, the name and the price. A tap puts one on the bill and comes back to the tiles, where it now sits
 * among the top sellers with its count — the same feedback as tapping a tile. The box is focused because "More…"
 * was tapped: the person came here to look for something.
 */
export function ServiceSheet({ services, counts, onPick, onClose }: { services: Service[]; counts: Map<string, number>; onPick: (s: Service) => void; onClose: () => void }) {
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
  const kinds = useMemo(() => [...new Set(services.map((s) => s.categoryName).filter((c): c is string => Boolean(c)))], [services]);
  const shown = useMemo(() => {
    const pool = kind ? services.filter((s) => s.categoryName === kind) : services;
    const q = term.trim();
    return q ? matchItems(pool.map((s) => ({ item: s, text: [s.name], priceMinor: asMinor(s.priceMinor) })), q) : pool;
  }, [services, kind, term]);

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
        {kinds.length > 1 ? (
          <div className="pf-chips pf-menu-kinds" role="group" aria-label={nv.serviceKinds}>
            {['', ...kinds].map((k) => (
              <button key={k || 'all'} type="button" className={`pf-chip ${kind === k ? 'pf-chip-on' : ''}`} aria-pressed={kind === k} onClick={() => setKind(k)}>
                {k || nv.allServices}
              </button>
            ))}
          </div>
        ) : null}
        {shown.length === 0 ? (
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
