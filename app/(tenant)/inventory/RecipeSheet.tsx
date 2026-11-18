'use client';

import { useTranslations } from 'next-intl';
import { useRef } from 'react';
import { useDialog } from '../../shared/a11y/useDialog';
import { RecipePanel } from '../products/RecipePanel';

/**
 * Jira GRW-741 AC-03 — a dish tapped on Inventory › Recipes opens the SAME recipe editor as the dish sheet's Recipe tab (`RecipePanel`), in a
 * sheet of its own: what it uses, size by size, and what it costs. Nothing about the dish but its recipe changes here; the Menu screen is where
 * a dish is named and priced.
 */
export function RecipeSheet({ dish, branchId, onClose }: { dish: { productId: string; name: string }; branchId: string; onClose: () => void }) {
  const t = useTranslations('kitchenStock.recipes');
  const sheetRef = useRef<HTMLDivElement>(null);
  useDialog(sheetRef, { onClose });
  const title = t('sheetTitle', { name: dish.name });
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div ref={sheetRef} className="modal sheet prd-sheet ks-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <button type="button" className="sheet-head-cancel" onClick={onClose}>
            {t('close')}
          </button>
          <span className="sheet-head-title">{title}</span>
          <span className="prd-head-spacer" aria-hidden="true" />
        </div>
        <RecipePanel product={{ id: dish.productId, locationId: branchId }} />
      </div>
    </div>
  );
}
