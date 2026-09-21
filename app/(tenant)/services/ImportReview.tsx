'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { api, formatMoney } from '../lib/api';
import { useLabel } from '../components/LabelsProvider';
import { pickNoun } from '../lib/nouns';
import { problem, toImportItems, type Draft } from './import-drafts';

/**
 * The one review table every bulk route ends in (design boards 3a–3d).
 *
 * Rows that cannot be saved are flagged and fixed here rather than dropped, and
 * the write is a single transaction — the import never half-succeeds.
 */
export function ImportReview({
  drafts,
  setDrafts,
  onBack,
  onImported,
  backLabel,
  lookup,
}: {
  drafts: Draft[];
  setDrafts: (fn: (prev: Draft[]) => Draft[]) => void;
  onBack: () => void;
  onImported: () => void;
  backLabel?: string;
  /** Re-checks a hand-edited name against the existing catalogue. */
  lookup: (name: string) => Draft['existing'];
}) {
  const t = useTranslations('services.review');
  const tp = useTranslations('services');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The vertical's word in English; the generic one in other languages until vertical labels are translated (GRW-315 Story 5).
  const serviceWord = pickNoun(useLocale(), useLabel('service', tp('cols.name')), tp('cols.name'));

  const update = (i: number, patch: Partial<Draft>) =>
    setDrafts((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));

  const active = drafts.filter((d) => !d.skip);
  const blocked = active.filter((d) => problem(d) !== null).length;
  const toCreate = active.filter((d) => !d.existing).length;
  const toReprice = active.filter((d) => d.existing).length;

  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.importServices(toImportItems(drafts));
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('importFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p className="confirm-body">
        {t('toAdd', { count: toCreate })}
        {toReprice > 0 && t('alreadyInList', { count: toReprice })}
        {blocked > 0 && t('needFix', { count: blocked })}
      </p>
      <div className="import-review">
        {/* Plain words over the design's own. The board says "Takes", but an owner
            reading this may not be a confident reader, and "Minutes" says both what
            the column is and what unit it wants without being decoded. The mapping
            step upstream uses the same word for the same reason. */}
        <div className="import-row import-head" aria-hidden="true">
          <span className="ih-pad">{serviceWord}</span>
          <span className="ih-pad">{tp('cols.duration')}</span>
          <span>{tp('cols.price')}</span>
          <span>{tp('cols.status')}</span>
          <span />
        </div>
        {drafts.map((d, i) => {
          const issue = d.skip ? null : problem(d);
          return (
            <div key={i} className={`import-row ${d.skip ? 'is-skipped' : ''} ${issue ? 'is-bad' : ''}`}>
              <input
                type="text"
                value={d.name}
                aria-label={t('rowName', { n: i + 1 })}
                onChange={(e) => update(i, { name: e.target.value, existing: lookup(e.target.value) })}
              />
              {/* A duplicate row is a re-price and nothing else — the import sends
                  the existing service's own duration. Leaving this editable let the
                  owner type a number that was silently thrown away. */}
              <input
                type="text"
                value={d.existing ? String(d.existing.durationMin) : d.durationMin}
                readOnly={!!d.existing}
                title={d.existing ? t('repriceOnly') : undefined}
                aria-label={t('rowMinutes', { n: i + 1 })}
                onChange={(e) => update(i, { durationMin: e.target.value })}
              />
              {/* The rupee sits outside the box, so the owner types a bare
                  number and never wonders whether the symbol belongs in it. */}
              <span className="import-money">
                <span className="import-money-sym" aria-hidden="true">
                  ₹
                </span>
                <input
                  type="text"
                  value={d.price}
                  aria-label={t('rowPrice', { n: i + 1 })}
                  onChange={(e) => update(i, { price: e.target.value })}
                />
              </span>
              <span className="import-note">
                {d.existing ? (
                  <span className="chip chip-reminder">
                    {t(d.existing.active ? 'haveIt' : 'retiredBack', { price: formatMoney(d.existing.priceMinor, d.existing.currency) })}
                  </span>
                ) : issue ? (
                  <span className="import-issue">{tp(`problems.${issue}`)}</span>
                ) : (
                  <span className="muted">{t('new')}</span>
                )}
              </span>
              <button type="button" className="btn btn-ghost" onClick={() => update(i, { skip: !d.skip })}>
                {d.skip ? t('include') : t('skip')}
              </button>
            </div>
          );
        })}
      </div>
      {error && <div role="alert" className="field-error" style={{ marginTop: 12 }}>{error}</div>}
      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={onBack}>
          {backLabel ?? t('back')}
        </button>
        <button type="button" className="btn" disabled={busy || blocked > 0 || active.length === 0} onClick={apply}>
          {busy ? t('importing') : blocked > 0 ? t('fixFirst', { count: blocked }) : t('importN', { count: active.length })}
        </button>
      </div>
    </>
  );
}
