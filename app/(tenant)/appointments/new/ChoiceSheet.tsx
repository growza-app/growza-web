'use client';

import { useTranslations } from 'next-intl';
import { useMemo, useRef, useState } from 'react';
import type { AddonGroup, Product, TillSize } from '../../lib/api-types';
import { formatMoney } from '../../lib/api';
import { hasSizes, sizeLabel, sizePriceMinor, sizedName } from '../../lib/till-sizes';
import { useDialog } from '../../../shared/a11y/useDialog';
import { useScrimDismiss } from '../../../shared/a11y/scrim-dismiss';
import { IconMinus, IconPlus } from '../../components/icons';

/**
 * Jira GRW-712 — a dish's choices, asked before the line goes on the bill: its portion (Regular / Large — its sizes) and its add-on groups
 * (Extras, pick up to 2; Spice, pick one). One sheet, top to bottom, Add in thumb reach at the foot with the line's price on it.
 *
 * Add stays disabled while a required group is empty, and that group says "Pick one" (AC-02). A group's max is held at the tap: a third
 * Extra cannot be ticked when two is the most (AC-04). A ₹0 choice shows no price. The server checks all of it again — this is a courtesy.
 */

export interface DishChoice {
  size?: TillSize;
  addons: string[];
  name: string;
  /** One unit: the size's price (or the dish's) plus the chosen add-ons. */
  unitMinor: number;
}

export function choiceName(product: Product, size: TillSize | undefined, chosen: Array<{ name: string }>): string {
  const base = size ? sizedName(product, size) : product.name;
  return chosen.length > 0 ? `${base} + ${chosen.map((c) => c.name).join(', ')}` : base;
}

/** What a group still needs, or null when it is satisfied. */
export function groupNeeds(g: AddonGroup, picked: number): 'pickOne' | 'pickAtLeast' | null {
  if (picked >= g.minPicks) return null;
  return g.minPicks === 1 ? 'pickOne' : 'pickAtLeast';
}

export function ChoiceSheet({
  product,
  groups,
  onAdd,
  onClose,
}: {
  product: Product;
  /** The groups this dish offers, in its order. */
  groups: AddonGroup[];
  onAdd: (choice: DishChoice, qty: number) => void;
  onClose: () => void;
}) {
  const t = useTranslations('payFlow.choices');
  const ref = useRef<HTMLDivElement>(null);
  useDialog(ref, { onClose, initialFocus: 'container' });
  const scrimDismiss = useScrimDismiss(onClose);
  const sizes = hasSizes(product) ? (product.sizes ?? []) : [];
  const [sizeId, setSizeId] = useState<string | null>(sizes.length === 1 ? sizes[0]!.id : null);
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [qty, setQty] = useState(1);
  const lastAdd = useRef(0);

  const size = sizes.find((s) => s.id === sizeId);
  const chosen = useMemo(
    () => groups.flatMap((g) => g.options.filter((o) => (picked[g.id] ?? []).includes(o.id))),
    [groups, picked],
  );
  const unitMinor = (size ? sizePriceMinor(product, size) : Number(product.priceMinor ?? 0)) + chosen.reduce((n, o) => n + o.priceMinor, 0);
  const missingSize = sizes.length > 0 && !size;
  const unmet = groups.filter((g) => groupNeeds(g, (picked[g.id] ?? []).length) !== null);
  const ready = !missingSize && unmet.length === 0;

  const toggle = (g: AddonGroup, optionId: string) => {
    setPicked((prev) => {
      const mine = prev[g.id] ?? [];
      if (mine.includes(optionId)) return { ...prev, [g.id]: mine.filter((x) => x !== optionId) };
      if (g.pick === 'one') return { ...prev, [g.id]: [optionId] };
      if (mine.length >= g.maxPicks) return prev;
      return { ...prev, [g.id]: [...mine, optionId] };
    });
  };

  const add = () => {
    // A double tap at a busy counter adds one line, not two.
    const now = Date.now();
    if (!ready || now - lastAdd.current < 400) return;
    lastAdd.current = now;
    onAdd({ size, addons: chosen.map((o) => o.id), name: choiceName(product, size, chosen), unitMinor }, qty);
  };

  const money = (minor: number) => formatMoney(String(minor));

  return (
    <div className="pf-keypad-scrim" {...scrimDismiss}>
      <div ref={ref} className="pf-keypad dc-sheet" role="dialog" aria-modal="true" aria-label={product.name} tabIndex={-1}>
        <div className="pf-keypad-head">
          <span className="pf-keypad-title">{product.name}</span>
          <button type="button" className="pf-keypad-clear" onClick={onClose}>
            {t('close')}
          </button>
        </div>

        {sizes.length > 0 ? (
          <fieldset className="dc-group">
            <legend className="dc-group-name">
              {t('portion')}
              {missingSize ? <span className="dc-need">{t('pickOne')}</span> : null}
            </legend>
            <div className="dc-options">
              {sizes.map((s) => (
                <button key={s.id} type="button" className={`dc-option${sizeId === s.id ? ' is-on' : ''}`} aria-pressed={sizeId === s.id} onClick={() => setSizeId(s.id)}>
                  <span className="dc-option-name">{sizeLabel(s)}</span>
                  <span className="dc-option-price">{money(sizePriceMinor(product, s))}</span>
                </button>
              ))}
            </div>
          </fieldset>
        ) : null}

        {groups.map((g) => {
          const mine = picked[g.id] ?? [];
          const need = groupNeeds(g, mine.length);
          const atMax = g.pick === 'many' && mine.length >= g.maxPicks;
          return (
            <fieldset key={g.id} className="dc-group">
              <legend className="dc-group-name">
                {g.name}
                <span className="dc-rule">
                  {g.pick === 'one' ? (g.required ? t('ruleOne') : t('ruleOneOptional')) : t('ruleMany', { max: g.maxPicks })}
                </span>
                {need ? <span className="dc-need">{need === 'pickOne' ? t('pickOne') : t('pickAtLeast', { min: g.minPicks })}</span> : null}
              </legend>
              <div className="dc-options">
                {g.options.map((o) => {
                  const on = mine.includes(o.id);
                  return (
                    <button
                      key={o.id}
                      type="button"
                      className={`dc-option${on ? ' is-on' : ''}`}
                      aria-pressed={on}
                      disabled={!on && atMax}
                      onClick={() => toggle(g, o.id)}
                    >
                      <span className="dc-option-name">{o.name}</span>
                      {o.priceMinor > 0 ? <span className="dc-option-price">+{money(o.priceMinor)}</span> : null}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          );
        })}

        <div className="dc-foot">
          <div className="dc-qty" role="group" aria-label={t('qty')}>
            <button type="button" className="btn btn-ghost" aria-label={t('less')} disabled={qty <= 1} onClick={() => setQty((q) => Math.max(1, q - 1))}>
              <IconMinus />
            </button>
            <span className="dc-qty-n" aria-live="polite">
              {qty}
            </span>
            <button type="button" className="btn btn-ghost" aria-label={t('more')} disabled={qty >= 99} onClick={() => setQty((q) => Math.min(99, q + 1))}>
              <IconPlus />
            </button>
          </div>
          <button type="button" className="btn dc-add" disabled={!ready} onClick={add}>
            {t('add', { amount: money(unitMinor * qty) })}
          </button>
        </div>
      </div>
    </div>
  );
}
