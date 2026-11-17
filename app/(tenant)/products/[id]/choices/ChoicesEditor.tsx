'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { api, ApiError, formatMoney, type AddonGroup, type AddonGroupInput } from '../../../lib/api';

/**
 * Jira GRW-712 — which add-on groups this item offers (ticked, in the order ticked), and the groups themselves: a name, pick one or many,
 * required or not, and the priced choices (₹0 allowed). A group is the business's, so editing it here changes it on every item that offers it,
 * and a bill already paid keeps its own copy of what it sold (BR-01).
 */
type Draft = { id: string | null; name: string; pick: 'one' | 'many'; required: boolean; maxPicks: string; options: Array<{ name: string; price: string }> };
const blank = (): Draft => ({ id: null, name: '', pick: 'one', required: false, maxPicks: '2', options: [{ name: '', price: '0' }] });
const toDraft = (g: AddonGroup): Draft => ({
  id: g.id,
  name: g.name,
  pick: g.pick,
  required: g.required,
  maxPicks: String(g.maxPicks),
  options: g.options.map((o) => ({ name: o.name, price: String(o.priceMinor / 100) })),
});

export function ChoicesEditor({ productId, initialGroups, initialChosen }: { productId: string; initialGroups: AddonGroup[]; initialChosen: string[] }) {
  const t = useTranslations('products.choices');
  const [groups, setGroups] = useState(initialGroups);
  const [chosen, setChosen] = useState(initialChosen);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const run = async (job: () => Promise<void>, said?: string) => {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      await job();
      if (said) setSaved(said);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('failed'));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string) =>
    run(async () => {
      const next = chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id];
      setChosen((await api.setProductAddonGroups(productId, next)).groupIds);
    }, t('itemSaved'));

  const saveDraft = (d: Draft) =>
    run(async () => {
      const body: AddonGroupInput = {
        name: d.name,
        pick: d.pick,
        required: d.required,
        ...(d.pick === 'many' ? { maxPicks: Number(d.maxPicks) } : {}),
        options: d.options.filter((o) => o.name.trim() !== '').map((o) => ({ name: o.name, priceMinor: Math.round(Number(o.price || 0) * 100) })),
      };
      const out = await api.saveAddonGroup(d.id, body);
      setGroups(out.groups);
      setDraft(null);
    }, t('groupSaved'));

  return (
    <div className="dc-editor">
      <section className="card">
        <div className="card-body">
          <h2 className="mr-title">{t('offersTitle')}</h2>
          <p className="field-hint">{t('offersHint')}</p>
          {groups.length === 0 ? <p className="field-hint">{t('noGroups')}</p> : null}
          <ul className="dc-group-list">
            {groups.map((g) => (
              <li key={g.id} className="dc-group-row">
                <label className="dc-check">
                  <input type="checkbox" checked={chosen.includes(g.id)} disabled={busy} onChange={() => void toggle(g.id)} />
                  <span>
                    <strong>{g.name}</strong>
                    <span className="field-hint dc-group-sum">
                      {g.pick === 'one' ? (g.required ? t('ruleOne') : t('ruleOneOptional')) : t('ruleMany', { max: g.maxPicks })} ·{' '}
                      {g.options.map((o) => (o.priceMinor > 0 ? `${o.name} +${formatMoney(String(o.priceMinor))}` : o.name)).join(', ')}
                    </span>
                  </span>
                </label>
                <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setDraft(toDraft(g))}>
                  {t('edit')}
                </button>
              </li>
            ))}
          </ul>
          {draft === null ? (
            <button type="button" className="btn" disabled={busy} onClick={() => setDraft(blank())}>
              {t('newGroup')}
            </button>
          ) : null}
        </div>
      </section>

      {draft ? (
        <form
          className="card dc-draft"
          onSubmit={(e) => {
            e.preventDefault();
            void saveDraft(draft);
          }}
        >
          <div className="card-body">
            <h2 className="mr-title">{draft.id ? t('editTitle') : t('newTitle')}</h2>
            <label className="dt-field">
              <span className="field-label">{t('groupName')}</span>
              <input type="text" value={draft.name} maxLength={60} placeholder={t('groupNameHint')} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </label>
            <div className="dc-options" role="radiogroup" aria-label={t('pickLabel')}>
              {(['one', 'many'] as const).map((p) => (
                <button key={p} type="button" role="radio" aria-checked={draft.pick === p} className={`dc-option${draft.pick === p ? ' is-on' : ''}`} onClick={() => setDraft({ ...draft, pick: p })}>
                  {t(p === 'one' ? 'pickOne' : 'pickMany')}
                </button>
              ))}
            </div>
            <label className="dc-check">
              <input type="checkbox" checked={draft.required} onChange={(e) => setDraft({ ...draft, required: e.target.checked })} />
              <span>{t('required')}</span>
            </label>
            {draft.pick === 'many' ? (
              <label className="dt-field">
                <span className="field-label">{t('maxPicks')}</span>
                <input type="number" inputMode="numeric" min={1} max={30} value={draft.maxPicks} onChange={(e) => setDraft({ ...draft, maxPicks: e.target.value })} />
              </label>
            ) : null}
            <p className="field-label">{t('optionsLabel')}</p>
            <ul className="dc-option-rows">
              {draft.options.map((o, i) => (
                <li key={i} className="dc-option-row">
                  <input
                    type="text"
                    aria-label={t('optionName', { n: i + 1 })}
                    placeholder={t('optionNameHint')}
                    value={o.name}
                    maxLength={60}
                    onChange={(e) => setDraft({ ...draft, options: draft.options.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })}
                  />
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    aria-label={t('optionPrice', { n: i + 1 })}
                    value={o.price}
                    onChange={(e) => setDraft({ ...draft, options: draft.options.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)) })}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost"
                    aria-label={t('removeOption', { n: i + 1 })}
                    disabled={draft.options.length === 1}
                    onClick={() => setDraft({ ...draft, options: draft.options.filter((_, j) => j !== i) })}
                  >
                    {t('remove')}
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="btn btn-ghost" disabled={draft.options.length >= 30} onClick={() => setDraft({ ...draft, options: [...draft.options, { name: '', price: '0' }] })}>
              {t('addOption')}
            </button>
            <div className="dt-actions">
              <button type="submit" className="btn" disabled={busy || draft.name.trim() === ''}>
                {t('save')}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setDraft(null)}>
                {t('cancel')}
              </button>
              {draft.id ? (
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const out = await api.removeAddonGroup(draft.id!);
                      setGroups(out.groups);
                      setChosen((c) => c.filter((x) => x !== draft.id));
                      setDraft(null);
                    }, t('groupRemoved'))
                  }
                >
                  {t('removeGroup')}
                </button>
              ) : null}
            </div>
            {draft.id ? <p className="field-hint">{t('removeGroupHint')}</p> : null}
          </div>
        </form>
      ) : null}

      {error ? (
        <p className="al-error" role="alert">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="field-hint" role="status">
          {saved}
        </p>
      ) : null}
    </div>
  );
}
