'use client';

import AppLink from '../../shared/AppLink';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { api, ApiError, formatMoney } from '../lib/api';
import type { DishCost, DishRecipe, Product, StockMaterial } from '../lib/api-types';
import { foodCostTone, pctText } from '../lib/food-cost';
import { parseAmount, recipeAmount, SMALL_UNIT, unitWord } from '../lib/kitchen-units';
import { useSession } from '../components/SessionProvider';
import { IconClose } from '../components/icons';

interface Draft {
  key: string;
  materialId: string;
  /** What is typed, in `typedIn`'s unit. */
  text: string;
  typedIn: 'big' | 'small';
}

let seq = 0;

/** Jira GRW-739 — ask for the dish's cost only where the API sent a cost on the recipe (it leaves `costMinor` out for everyone else). */
function readCost(r: DishRecipe, set: (c: DishCost | null) => void): void {
  if (!r.sizes.some((s) => s.lines.some((l) => l.costMinor !== undefined))) return;
  api.dishCost(r.productId).then(set, () => set(null));
}
const nextKey = () => `r${++seq}`;

/**
 * Jira GRW-737 — a dish's recipe, one size at a time (Half / Full): which raw materials it uses and how much of each. Every bill from now on
 * takes this out of stock (BR-02); past bills keep what they took. The owner and a manager change it; the cost line shows only to whoever
 * the API sends a cost to (it leaves `costMinor` out for the counter and the cook).
 *
 * Jira GRW-741 — the same editor opens from Inventory › Recipes (`inventory/RecipeSheet.tsx`), so it needs only the dish's id and branch.
 */
export function RecipePanel({ product }: { product: Pick<Product, 'id' | 'locationId'> }) {
  const t = useTranslations('recipe');
  const session = useSession();
  const grid = session?.areas?.pages;
  const mayChange = session?.role === 'owner' || (grid ? grid.services === 'manage' : session?.role === 'manager');

  const [recipe, setRecipe] = useState<DishRecipe | null>(null);
  const [materials, setMaterials] = useState<StockMaterial[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [sizeIdx, setSizeIdx] = useState(0);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Jira GRW-739 — the cost per size from the API: today's average cost over the price BEFORE GST, read again after every save.
  const [dishCost, setDishCost] = useState<DishCost | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([api.recipe(product.id), api.kitchenStock(product.locationId)])
      .then(([r, list]) => {
        if (!live) return;
        setRecipe(r);
        setMaterials(list.materials);
        readCost(r, setDishCost);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [product.id, product.locationId]);

  const size = recipe?.sizes[sizeIdx] ?? null;
  const byId = useMemo(() => new Map((materials ?? []).map((m) => [m.id, m])), [materials]);

  // A new size picked (or the recipe first loaded): the editable rows start from what is saved. Not on a save — the rows typed are what was
  // saved, and re-reading them would also clear the "Saved" the button has just said.
  const loaded = recipe !== null;
  useEffect(() => {
    if (!size) return;
    setDrafts(
      size.lines
        .filter((l) => !l.archived)
        .map((l) => {
          const shown = recipeAmount(l.qty, l.unit);
          return { key: nextKey(), materialId: l.materialId, text: shown.text, typedIn: shown.unit === unitWord(l.unit) ? 'big' : 'small' };
        }),
    );
    setSaved(false);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on WHICH size, not on the object a save replaces
  }, [sizeIdx, loaded]);

  if (failed) return <div role="alert" className="sheet-body sheet-foot sheet-foot-error">{t('loadFailed')}</div>;
  if (!recipe || !materials || !size) return <div className="sheet-body sheet-foot">{t('loading')}</div>;

  const costs = size.lines.map((l) => l.costMinor);
  const seesCost = size.lines.length > 0 && costs.every((c) => c !== undefined);
  const cost = seesCost && costs.every((c) => c !== null) ? costs.reduce<number>((n, c) => n + (c ?? 0), 0) : null;
  // The API's figure when it has answered for this size (it knows the GST rate); the lines' own sum until then.
  const sized = dishCost?.sizes.find((s) => s.variantId === size.variantId) ?? null;
  const costNow = sized ? sized.costMinor : cost;
  const pct = sized ? sized.foodCostPct : cost !== null && size.priceMinor > 0 ? Math.round((cost / size.priceMinor) * 1000) / 10 : null;
  const netDiffers = sized !== null && sized.netPriceMinor !== sized.priceMinor;

  const save = async () => {
    const lines: Array<{ materialId: string; qty: number }> = [];
    for (const d of drafts) {
      const m = byId.get(d.materialId);
      if (!m) continue;
      const qty = parseAmount(d.text, m.unit, d.typedIn);
      if (qty === null) {
        setError(`${m.name}: ${t('badQty')}`);
        return;
      }
      lines.push({ materialId: m.id, qty });
    }
    setBusy(true);
    setError(null);
    try {
      const next = await api.saveRecipe(product.id, size.variantId, lines);
      setRecipe(next);
      setSaved(true);
      readCost(next, setDishCost);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const unused = materials.filter((m) => !drafts.some((d) => d.materialId === m.id));

  return (
    <div className="sheet-body rc-panel">
      {recipe.sizes.length > 1 ? (
        <div className={`prd-seg prd-seg-${Math.min(recipe.sizes.length, 3)}`} role="tablist" aria-label={t('sizes')}>
          {recipe.sizes.map((s, i) => (
            <button key={s.variantId ?? 'one'} type="button" role="tab" aria-selected={i === sizeIdx} className={i === sizeIdx ? 'is-on' : ''} onClick={() => setSizeIdx(i)}>
              {s.label}
            </button>
          ))}
        </div>
      ) : null}

      {size.needsFixing ? <p className="rc-warn">{t('needsFixing')}</p> : null}

      {materials.length === 0 ? (
        <div className="ks-state">
          <span>{t('noItems')}</span>
          <AppLink className="btn btn-ghost" href="/inventory">
            {t('openStock')}
          </AppLink>
        </div>
      ) : (
        <>
          {drafts.length === 0 ? <p className="ks-hint">{t('none')}</p> : null}
          <ul className="rc-lines">
            {drafts.map((d) => {
              const m = byId.get(d.materialId);
              if (!m) return null;
              const small = SMALL_UNIT[m.unit].unit;
              return (
                <li key={d.key} className="rc-line">
                  <span className="rc-name">{m.name}</span>
                  <span className="ks-qty-field">
                    <input
                      className="prd-input ks-qty-input"
                      inputMode={d.typedIn === 'small' ? 'numeric' : 'decimal'}
                      aria-label={`${m.name} · ${t('qty')}`}
                      value={d.text}
                      disabled={!mayChange}
                      onChange={(e) => setDrafts((all) => all.map((x) => (x.key === d.key ? { ...x, text: e.target.value } : x)))}
                    />
                    {small && mayChange ? (
                      <select
                        className="rc-unit"
                        aria-label={`${m.name} · ${t('unit')}`}
                        value={d.typedIn}
                        onChange={(e) => setDrafts((all) => all.map((x) => (x.key === d.key ? { ...x, typedIn: e.target.value as Draft['typedIn'] } : x)))}
                      >
                        <option value="small">{small}</option>
                        <option value="big">{unitWord(m.unit)}</option>
                      </select>
                    ) : (
                      <span className="ks-unit">{d.typedIn === 'small' ? small : unitWord(m.unit)}</span>
                    )}
                  </span>
                  {mayChange ? (
                    <button
                      type="button"
                      className="rc-remove"
                      aria-label={t('remove', { name: m.name })}
                      onClick={() => setDrafts((all) => all.filter((x) => x.key !== d.key))}
                    >
                      <IconClose />
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {mayChange && unused.length > 0 ? (
            <select
              className="prd-input rc-add"
              aria-label={t('add')}
              value=""
              onChange={(e) => {
                const m = byId.get(e.target.value);
                if (m) setDrafts((all) => [...all, { key: nextKey(), materialId: m.id, text: '', typedIn: SMALL_UNIT[m.unit].unit ? 'small' : 'big' }]);
              }}
            >
              <option value="">+ {t('add')}</option>
              {unused.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          ) : null}
          {seesCost ? (
            // Jira GRW-739 — amber above 35%, red above 45% (owner, 2026-11-18); a ₹0 dish shows "—", never a colour.
            <p className={`rc-cost ${costNow === null ? '' : `is-${foodCostTone(pct)}`}`}>
              {costNow === null
                ? t('noCost')
                : t(netDiffers ? 'costsNet' : 'costs', { cost: formatMoney(costNow), pct: pctText(pct), price: formatMoney(netDiffers ? sized!.netPriceMinor : size.priceMinor) })}
            </p>
          ) : null}
          {error ? (
            <div role="alert" className="sheet-foot sheet-foot-error">
              {error}
            </div>
          ) : null}
          {mayChange ? (
            <button type="button" className={`btn rc-save ${saved ? 'is-saved' : ''}`} disabled={busy} aria-live="polite" onClick={() => void save()}>
              {busy ? t('saving') : saved ? t('saved') : t('save')}
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
