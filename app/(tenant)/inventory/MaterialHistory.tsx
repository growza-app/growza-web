'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { MaterialMovement, MaterialUnit } from '../lib/api-types';
import { formatDate } from '../lib/format';
import { shownAmount, unitWord } from '../lib/kitchen-units';
import { useSession } from '../components/SessionProvider';

/**
 * Jira GRW-738 — an item's recent history on its sheet: what moved it, by how much, who, and why. A sale names its dish; a stock in its
 * supplier and bill; wastage its reason. The cook reads this too — the API sends no cost to anyone who cannot see the money.
 */
export function MaterialHistory({ materialId, unit }: { materialId: string; unit: MaterialUnit }) {
  const t = useTranslations('kitchenStock.history');
  const locale = useLocale();
  const timezone = useSession()?.timezone;
  const [rows, setRows] = useState<MaterialMovement[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    api
      .materialMovements(materialId)
      .then((r) => live && setRows(r.movements))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [materialId]);

  const what = (m: MaterialMovement): string => {
    if (m.kind === 'wasted' && m.reason) return `${t('kind.wasted')} · ${t(`reason.${m.reason}`)}`;
    if (m.kind === 'used' && m.dish) return `${t('kind.used')} · ${m.dish}`;
    if ((m.kind === 'received' || m.kind === 'corrected') && (m.supplier || m.billNo)) {
      return `${t(`kind.${m.kind}`)} · ${[m.supplier, m.billNo].filter(Boolean).join(' · ')}`;
    }
    return t(`kind.${m.kind}`);
  };

  return (
    <section className="ks-history" aria-labelledby={`ks-history-${materialId}`}>
      <h3 id={`ks-history-${materialId}`} className="prd-field-label">
        {t('title')}
      </h3>
      {failed ? (
        <p className="ks-hint">{t('loadFailed')}</p>
      ) : rows === null ? (
        <p className="ks-hint">{t('loading')}</p>
      ) : rows.length === 0 ? (
        <p className="ks-hint">{t('empty')}</p>
      ) : (
        <ul className="ks-history-list">
          {rows.map((m, i) => (
            <li key={`${m.createdAt}-${i}`} className="ks-history-row">
              <span className="ks-name">
                <span>{what(m)}</span>
                <span className="ks-meta">
                  {formatDate(m.createdAt, timezone, locale)}
                  {m.by ? ` · ${t('by', { name: m.by })}` : ''}
                  {m.note ? ` · ${m.note}` : ''}
                </span>
              </span>
              <span className={`ks-amount ${m.qty < 0 ? 'is-out' : 'is-in'}`}>
                {m.qty > 0 ? '+' : '−'}
                {shownAmount(Math.abs(m.qty), unit)} {unitWord(unit)}
                <span className="ks-meta">{t('after', { amount: shownAmount(m.stockAfter, unit), unit: unitWord(unit) })}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
