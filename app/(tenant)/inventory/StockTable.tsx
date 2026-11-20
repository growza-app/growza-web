'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { formatMoney } from '../lib/api';
import type { StockMaterial } from '../lib/api-types';
import { shownAmount, unitWord } from '../lib/kitchen-units';
import { IconChevronDown, IconChevronRight } from '../components/icons';

export interface StockGroup {
  key: string;
  title: string;
  items: StockMaterial[];
  low: boolean;
}

/**
 * Owner, 2026-11-20 ("redesign the inventory page, we are wasting too much space") — a laptop reads the kitchen's
 * items as a table, the way the Menu reads its dishes: one line an item, grouped (Running low first, then each
 * group A–Z), and what an owner checks at a glance in its own column — how much is left, the level it is flagged
 * at, what a unit costs on average, and how many dishes use it. A tap anywhere on a row opens the item, as the
 * phone's row does. A group folds on its header.
 */
export function StockTable({ groups, onOpen }: { groups: readonly StockGroup[]; onOpen: (m: StockMaterial) => void }) {
  const t = useTranslations('kitchenStock');
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  // The cost column only for whoever is sent a cost (the API leaves `avgCost` out for the counter and the cook).
  const seesCost = groups.some((g) => g.items.some((m) => 'avgCost' in m));
  const cols = 4 + (seesCost ? 1 : 0) + 1;
  const toggle = (key: string) =>
    setFolded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="ks-table-wrap">
      <table className="ks-table">
        <thead>
          <tr>
            <th scope="col">{t('table.item')}</th>
            <th scope="col" className="ks-num">
              {t('table.inStock')}
            </th>
            <th scope="col" className="ks-num">
              {t('table.lowAt')}
            </th>
            {seesCost ? (
              <th scope="col" className="ks-num">
                {t('table.avgCost')}
              </th>
            ) : null}
            <th scope="col" className="ks-num">
              {t('table.usedIn')}
            </th>
            <th scope="col" className="ks-go" aria-label={t('table.open')} />
          </tr>
        </thead>
        {groups.map((g) => {
          const open = !folded.has(g.key);
          return (
            <tbody key={g.key}>
              {g.title ? (
                <tr className={`ks-trow-group ${g.low ? 'is-low' : ''}`}>
                  <th colSpan={cols} scope="colgroup">
                    <button type="button" className={`ks-group-btn ${open ? 'is-open' : ''}`} aria-expanded={open} onClick={() => toggle(g.key)}>
                      <IconChevronDown />
                      <span>{g.title}</span>
                      <span className="ks-group-count">{g.items.length}</span>
                    </button>
                  </th>
                </tr>
              ) : null}
              {open
                ? g.items.map((m) => {
                    const tone = m.stock < 0 ? 'below' : m.low ? 'low' : '';
                    return (
                      <tr key={m.id} className={`ks-trow ${tone ? `is-${tone}` : ''}`} onClick={() => onOpen(m)}>
                        <td>
                          {/* A real button, so a keyboard reaches the row; the row itself takes a click anywhere. */}
                          <button
                            type="button"
                            className="ks-item"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpen(m);
                            }}
                          >
                            <span className="ks-item-name">{m.name}</span>
                            {g.low && m.category ? <span className="ks-item-meta">{m.category}</span> : null}
                          </button>
                          {m.stock < 0 ? (
                            <span className="ks-item-warn">{t('overUsed', { amount: shownAmount(-m.stock, m.unit), unit: unitWord(m.unit) })}</span>
                          ) : null}
                        </td>
                        <td className={`ks-num ks-left ${tone ? `is-${tone}` : ''}`}>
                          {m.stock < 0 ? t('noneLeft') : `${shownAmount(m.stock, m.unit)} ${unitWord(m.unit)}`}
                          {tone === 'low' ? <span className="ks-low-tag">{t('lowTag')}</span> : null}
                        </td>
                        <td className="ks-num ks-muted">{m.lowStockAt > 0 ? `${shownAmount(m.lowStockAt, m.unit)} ${unitWord(m.unit)}` : '—'}</td>
                        {seesCost ? (
                          <td className="ks-num ks-muted">
                            {typeof m.avgCost === 'number' ? `${formatMoney(m.avgCost)} / ${t(`perUnit.${m.unit}`)}` : '—'}
                          </td>
                        ) : null}
                        <td className="ks-num ks-muted">{m.usedIn > 0 ? t('table.dishes', { n: m.usedIn }) : '—'}</td>
                        <td className="ks-go">
                          <IconChevronRight />
                        </td>
                      </tr>
                    );
                  })
                : null}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}
