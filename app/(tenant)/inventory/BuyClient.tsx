'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { StockMaterial } from '../lib/api-types';
import { useSession } from '../components/SessionProvider';
import { BuyList } from './BuyList';
import { StockInSheet } from './StockInSheet';
import { PurchasesSheet } from './PurchasesSheet';

type Sheet = { kind: 'stockIn'; id: string | null } | { kind: 'purchases' } | null;

/**
 * Jira GRW-741 FR-03 — Inventory › Buy: what to buy (Jira GRW-739's list, grouped by supplier, to share on WhatsApp), and for whoever records
 * what comes in — the owner and a manager — Stock in and the past stock ins. The cook and the counter read the list with no price in it (the
 * API leaves every price out), and are offered neither button. Moved here from the Stock tab's filter and buttons; nothing in them changed.
 */
export function BuyClient({ branchId }: { branchId: string }) {
  const t = useTranslations('kitchenStock');
  const session = useSession();
  const grid = session?.areas?.pages;
  const mayChange = session?.role === 'owner' || (grid ? grid.services === 'manage' : session?.role === 'manager');

  const [materials, setMaterials] = useState<StockMaterial[] | null>(null);
  const [sheet, setSheetNow] = useState<Sheet>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // The list re-reads after a stock in: what was bought may have taken an item off it.
  const [round, setRound] = useState(0);
  const setSheet = (next: Sheet) => {
    if (next) setNotice(null);
    setSheetNow(next);
  };

  // Stock in picks from the branch's items; only whoever may record one needs them.
  const loadItems = useCallback(async () => {
    if (!mayChange) return;
    try {
      setMaterials((await api.kitchenStock(branchId)).materials);
    } catch {
      setMaterials([]);
    }
  }, [branchId, mayChange]);
  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const done = (text: string) => {
    setSheet(null);
    setNotice(text);
    setRound((n) => n + 1);
    void loadItems();
  };

  return (
    <div className="ks-body">
      {mayChange ? (
        <div className="ks-actions ks-actions-2" role="group" aria-label={t('actions.label')}>
          <button type="button" className="btn ks-action" disabled={materials === null} onClick={() => setSheet({ kind: 'stockIn', id: null })}>
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 4v11m0 0-4-4m4 4 4-4M5 19h14" />
            </svg>
            {t('actions.stockIn')}
          </button>
          <button type="button" className="btn btn-ghost ks-action" onClick={() => setSheet({ kind: 'purchases' })}>
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 4h10v16l-2.5-1.5L12 20l-2.5-1.5L7 20zM10 9h4M10 13h4" />
            </svg>
            {t('actions.pastStockIn')}
          </button>
        </div>
      ) : null}
      {notice ? (
        <p className="ks-notice" role="status">
          {notice}
        </p>
      ) : null}
      {mayChange && materials !== null && materials.length === 0 ? <p className="ks-hint">{t('buyTab.emptyItems')}</p> : null}

      <h2 className="inv-section-title">{t('buyTab.toBuyTitle')}</h2>
      <BuyList key={round} branchId={branchId} />

      {sheet?.kind === 'stockIn' && materials ? (
        <StockInSheet branchId={branchId} materials={materials} purchaseId={sheet.id} onClose={() => setSheet(null)} onDone={done} />
      ) : null}
      {sheet?.kind === 'purchases' ? (
        <PurchasesSheet
          branchId={branchId}
          onClose={() => setSheet(null)}
          onOpen={(id) => setSheet({ kind: 'stockIn', id })}
          onNew={() => setSheet({ kind: 'stockIn', id: null })}
        />
      ) : null}
    </div>
  );
}
