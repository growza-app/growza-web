'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { api, formatMoney } from '../lib/api';
import { useLabel } from '../components/LabelsProvider';
import { IconChevronRight } from '../components/icons';
import { pickNoun } from '../lib/nouns';
import { toImportItems, type Draft } from './import-drafts';
import { firstProblem, matchesFilter, reviewCounts, reviewGroups, reviewRows, type ReviewFilter } from './import-review';

/**
 * Jira GRW-592 — review by exception.
 *
 * A price list is mostly right, and 189 editable rows is 189 things to read for the three that are not. So a
 * row is a line of text — name, then "10 min · ₹30" — and only opens into fields when it has something wrong
 * or the owner taps it. Problems are counted, filterable, and one tap from the button that is waiting on them.
 */
export function ImportReview({
  drafts,
  setDrafts,
  onBack,
  onImported,
  backLabel,
  lookup,
  branchId,
}: {
  branchId: string;

  drafts: Draft[];
  setDrafts: (fn: (prev: Draft[]) => Draft[]) => void;
  onBack: () => void;
  onImported: () => void;
  backLabel?: string;
  lookup: (name: string) => Draft['existing'];
}) {
  const t = useTranslations('services.review');
  const tp = useTranslations('services');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ReviewFilter>('all');
  /** The row the owner opened. Rows with a problem are open without being asked. */
  const [editing, setEditing] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const rowRefs = useRef(new Map<number, HTMLLIElement>());
  // The vertical's word in English; the generic one in other languages until vertical labels are translated (GRW-315 Story 5).
  const serviceWord = pickNoun(useLocale(), useLabel('service', tp('cols.name')), tp('cols.name'));

  const update = (i: number, patch: Partial<Draft>) =>
    setDrafts((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));

  const rows = reviewRows(drafts);
  const counts = reviewCounts(rows);
  const active = drafts.filter((d) => !d.skip);
  const blocked = counts.fix;
  // A filter whose rows have all been fixed would show an empty list; go back to the whole one instead.
  const shownFilter: ReviewFilter = filter !== 'all' && counts[filter] === 0 ? 'all' : filter;
  const groups = reviewGroups(rows.filter((r) => matchesFilter(r, shownFilter)));

  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.importServices(branchId, toImportItems(drafts));
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('importFailed'));
    } finally {
      setBusy(false);
    }
  };

  /** The button waiting on problems takes you to the first one rather than only saying there are some. */
  const goToProblem = () => {
    const at = firstProblem(rows);
    if (at < 0) return;
    setFilter('fix');
    setEditing(at);
    window.setTimeout(() => rowRefs.current.get(at)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 0);
  };

  const chips: Array<{ key: ReviewFilter; label: string }> = [
    { key: 'all', label: t('filterAll') },
    { key: 'fix', label: t('filterFix') },
    { key: 'existing', label: t('filterExisting') },
    { key: 'skipped', label: t('filterSkipped') },
  ];

  return (
    <>
      <div className="rv-chips" role="group" aria-label={t('filterLabel')}>
        {chips
          .filter((c) => c.key === 'all' || counts[c.key] > 0)
          .map((c) => (
            <button
              key={c.key}
              type="button"
              className={`rv-chip ${c.key === 'fix' ? 'is-fix' : ''}`}
              aria-pressed={shownFilter === c.key}
              onClick={() => setFilter(c.key)}
            >
              {c.label} <b>{counts[c.key]}</b>
            </button>
          ))}
      </div>

      <div className="rv-list">
        {groups.map((g) => {
          const shut = shownFilter === 'all' && collapsed.has(g.name);
          return (
            <section key={g.name} className="rv-group">
              <button
                type="button"
                className="rv-group-head"
                aria-expanded={!shut}
                onClick={() =>
                  setCollapsed((prev) => {
                    const next = new Set(prev);
                    if (next.has(g.name)) next.delete(g.name);
                    else next.add(g.name);
                    return next;
                  })
                }
              >
                <span className={`rv-chevron ${shut ? '' : 'is-open'}`} aria-hidden="true">
                  <IconChevronRight />
                </span>
                <span className="rv-group-name">{g.name || t('groupNone')}</span>
                <span className="rv-group-count">{g.rows.length}</span>
              </button>

              {!shut && (
                <ul className="rv-rows">
                  {g.rows.map(({ index: i, draft: d, issue }) => {
                    const open = !d.skip && (editing === i || issue !== null);
                    const minutes = d.existing ? String(d.existing.durationMin) : d.durationMin;
                    const meta = [
                      minutes.trim() ? t('minShort', { n: minutes }) : null,
                      d.price.trim() ? `₹${d.price}` : t('noPrice'),
                    ]
                      .filter(Boolean)
                      .join(' · ');
                    return (
                      <li
                        key={i}
                        ref={(el) => {
                          if (el) rowRefs.current.set(i, el);
                          else rowRefs.current.delete(i);
                        }}
                        className={`rv-row ${d.skip ? 'is-skipped' : ''} ${issue ? 'is-bad' : ''} ${open ? 'is-open' : ''}`}
                      >
                        <div className="rv-line">
                          <button
                            type="button"
                            className="rv-summary"
                            aria-expanded={open}
                            disabled={d.skip}
                            onClick={() => setEditing(editing === i ? null : i)}
                          >
                            <span className="rv-main">
                              <span className="rv-name">{d.name.trim() || t('unnamed')}</span>
                              <span className="rv-meta">{meta}</span>
                              {d.existing ? (
                                <span className="chip chip-reminder rv-flag">
                                  {t(d.existing.active ? 'haveIt' : 'retiredBack', { price: formatMoney(d.existing.priceMinor, d.existing.currency) })}
                                </span>
                              ) : issue ? (
                                <span className="import-issue rv-flag">{tp(`problems.${issue}`)}</span>
                              ) : null}
                            </span>
                            {!d.skip && (
                              <span className={`rv-chevron ${open ? 'is-open' : ''}`} aria-hidden="true">
                                <IconChevronRight />
                              </span>
                            )}
                          </button>
                          {d.skip && (
                            <button type="button" className="btn btn-ghost rv-include" onClick={() => update(i, { skip: false })}>
                              {t('include')}
                            </button>
                          )}
                        </div>

                        {open && (
                          <div className="rv-edit">
                            <label className="field rv-field-name">
                              <span className="field-label">{serviceWord}</span>
                              <input
                                type="text"
                                value={d.name}
                                aria-label={t('rowName', { n: i + 1 })}
                                onChange={(e) => update(i, { name: e.target.value, existing: lookup(e.target.value) })}
                              />
                            </label>
                            {/* A duplicate row is a re-price and nothing else — the import sends the existing
                                service's own duration, so a number typed here would be silently thrown away. */}
                            <label className="field">
                              <span className="field-label">{tp('cols.duration')}</span>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={minutes}
                                readOnly={!!d.existing}
                                title={d.existing ? t('repriceOnly') : undefined}
                                aria-label={t('rowMinutes', { n: i + 1 })}
                                onChange={(e) => update(i, { durationMin: e.target.value })}
                              />
                            </label>
                            <label className="field">
                              <span className="field-label">{tp('cols.price')} (₹)</span>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={d.price}
                                aria-label={t('rowPrice', { n: i + 1 })}
                                onChange={(e) => update(i, { price: e.target.value })}
                              />
                            </label>
                            <button type="button" className="btn btn-ghost rv-skip" onClick={() => update(i, { skip: true })}>
                              {t('skip')}
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {error && (
        <div role="alert" className="field-error" style={{ marginTop: 12 }}>
          {error}
        </div>
      )}
      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={onBack}>
          {backLabel ?? t('back')}
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy || active.length === 0}
          onClick={blocked > 0 ? goToProblem : apply}
        >
          {busy ? t('importing') : blocked > 0 ? t('fixFirst', { count: blocked }) : t('importN', { count: active.length })}
        </button>
      </div>
    </>
  );
}
