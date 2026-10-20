'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { api, ApiError } from '../../lib/api';
import type { ProductCategory, ReorderPage, ReorderRow, ReorderRule } from '../../lib/api-types';
import { intlLocale } from '../../lib/format';
import AppLink from '../../../shared/AppLink';
import { Pagination } from '../../components/Pagination';
import { useBranch } from '../../components/BranchProvider';
import { useSession, useWritable } from '../../components/SessionProvider';

const PAGE_SIZE = 20;
/** A row's own state: what is typed, and whether it has reached the server. */
type Edit = { text: string; status: 'saving' | 'saved' | 'failed' | 'invalid'; message?: string };

/**
 * Jira GRW-633 — what to order before the season, as a worklist.
 *
 * One row per size: the suggestion as a number the owner can type over, and the two numbers it came from in small text beneath ("Sold 48
 * in the same days last year, 11 on the shelf"). Where the shop sold nothing in those days the row says there is nothing to compare and
 * the field is empty — no number is invented. What the owner types is saved as they leave the field and is what the file carries; a
 * number that has not reached the server says so, with a retry, and is never silently reverted. A size that sold out last year is marked,
 * since its sales understate what was wanted. The days a category's order has to cover are the owner's (lead time and days to cover),
 * set under "How far ahead".
 *
 * Laid out at 344px: two lines a row, the number field 44px, and a bottom bar with the total and Export.
 */
export function OrderClient() {
  const t = useTranslations('products.reorder');
  const locale = useLocale();
  const session = useSession();
  const writable = useWritable();
  const branches = session?.branches ?? [];
  const branchContext = useBranch();
  const branch = branchContext.ready && branchContext.multi ? (branchContext.choice ?? '') : '';
  const ready = branchContext.ready || branches.length <= 1;

  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [page, setPage] = useState(1);
  // The branch the page number and the category were chosen under: a change of branch starts them over in the SAME render, so there is one read.
  const [scope, setScope] = useState(branch);
  const stale = scope !== branch;
  const livePage = stale ? 1 : page;
  const liveCategory = stale ? '' : categoryId;
  const [data, setData] = useState<ReorderPage | null>(null);
  const [failed, setFailed] = useState(false);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const seq = useRef(0);
  const exportBusy = useRef(false);

  const count = (n: number) => new Intl.NumberFormat(intlLocale(locale)).format(n);
  const day = (iso: string) => new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));

  const load = useCallback(async () => {
    if (!ready) return;
    const mine = ++seq.current;
    setFailed(false);
    try {
      const res = await api.reorder({ location: branch || undefined, categoryId: liveCategory || undefined, page: livePage, pageSize: PAGE_SIZE });
      if (mine !== seq.current) return;
      if (res.rows.length === 0 && res.totals.sizes > 0 && livePage > 1) setPage(Math.max(1, Math.ceil(res.totals.sizes / PAGE_SIZE)));
      else setData(res);
    } catch (e) {
      if (mine !== seq.current) return;
      if (e instanceof ApiError && e.field === 'categoryId') setCategoryId('');
      else setFailed(true);
    }
  }, [ready, branch, liveCategory, livePage]);
  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (scope === branch) return;
    setScope(branch);
    setPage(1);
    setCategoryId('');
    setCategories([]);
    setData(null);
  }, [scope, branch]);

  // Categories belong to a branch: they are offered when exactly one branch is in view (the only one, or the one chosen).
  const oneBranch = branch || (branches.length === 1 ? (branches[0]?.id ?? '') : '');
  useEffect(() => {
    if (!oneBranch) {
      setCategories([]);
      return;
    }
    let live = true;
    api
      .productCategories(oneBranch)
      .then((rows) => live && setCategories(rows))
      .catch(() => live && setCategories([]));
    return () => {
      live = false;
    };
  }, [oneBranch]);

  const shown = (r: ReorderRow): string => edits[r.id]?.text ?? (r.order === null ? '' : String(r.order));

  /** Keep what the owner typed: a number is saved, an empty field clears theirs and brings the suggestion back. */
  const save = async (r: ReorderRow, text: string) => {
    const trimmed = text.trim();
    const had = r.override;
    if (trimmed !== '' && !/^\d{1,7}$/.test(trimmed)) {
      setEdits((e) => ({ ...e, [r.id]: { text, status: 'invalid', message: t('wholeNumber') } }));
      return;
    }
    const typed = trimmed === '' ? null : Number(trimmed);
    // What is kept: nothing when the field is empty or says what the suggestion already says; a number only when it differs from it.
    const qty = typed === null || typed === r.suggested ? null : typed;
    // Nothing changes when there was no number of the owner's and there is none to keep, or it is the number already kept.
    if (qty === had) {
      setEdits((e) => {
        const { [r.id]: _gone, ...rest } = e;
        return rest;
      });
      return;
    }
    setEdits((e) => ({ ...e, [r.id]: { text, status: 'saving' } }));
    try {
      await api.setReorderOverride({ keyId: r.id, season: r.season, qty });
      setData((d) => {
        if (!d) return d;
        const rows = d.rows.map((x) => (x.id === r.id ? { ...x, override: qty, order: qty ?? x.suggested } : x));
        const before = r.order ?? 0;
        const after = qty ?? r.suggested ?? 0;
        const edited = d.totals.edited + (qty !== null ? 1 : 0) - (had !== null ? 1 : 0);
        return { ...d, rows, totals: { ...d.totals, toOrder: d.totals.toOrder - before + after, edited } };
      });
      setEdits((e) => ({ ...e, [r.id]: { text: qty === null ? (r.suggested === null ? '' : String(r.suggested)) : String(qty), status: 'saved' } }));
    } catch (e) {
      setEdits((cur) => ({ ...cur, [r.id]: { text, status: 'failed', message: e instanceof ApiError && e.status < 500 ? e.message : t('saveFailed') } }));
    }
  };

  const exportFile = async () => {
    if (exportBusy.current) return;
    exportBusy.current = true;
    setExporting(true);
    setExportError(null);
    try {
      const csv = await api.reorderCsv({ location: branch || undefined, categoryId: liveCategory || undefined });
      const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'what-to-order.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(e instanceof ApiError && e.status < 500 ? e.message : t('exportFailed'));
    } finally {
      exportBusy.current = false;
      setExporting(false);
    }
  };

  const nameOf = (r: ReorderRow) => (r.sizeLabel ? t('sizeOf', { name: r.name, size: r.sizeLabel }) : r.name);
  const reason = (r: ReorderRow): string =>
    r.soldLastYear === null ? t('noBasis', { stock: count(r.stock) }) : t('basis', { sold: count(r.soldLastYear), from: day(r.lastYearFrom), to: day(r.lastYearTo), stock: count(r.stock) });

  return (
    <div className="srp ro">
      {oneBranch ? (
        <button type="button" className="btn btn-ghost srp-export" aria-expanded={settingsOpen} onClick={() => setSettingsOpen((o) => !o)}>
          {t('howFarAhead')}
        </button>
      ) : null}
      {settingsOpen && oneBranch ? <Rules branchId={oneBranch} writable={writable} onChanged={() => void load()} /> : null}

      {categories.length > 0 ? (
        <select
          className="input srp-select"
          aria-label={t('categoryLabel')}
          value={liveCategory}
          onChange={(e) => {
            setCategoryId(e.target.value);
            setPage(1);
          }}
        >
          <option value="">{t('allCategories')}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      ) : null}

      {failed ? (
        <div className="ord-state" role="alert">
          <p>{t('loadError')}</p>
          <button type="button" className="btn" onClick={() => void load()}>
            {t('retry')}
          </button>
        </div>
      ) : data === null || stale ? (
        <ul className="srp-list" aria-busy="true" aria-label={t('loading')}>
          {[0, 1, 2].map((i) => (
            <li key={i} className="srp-card srp-skeleton" />
          ))}
        </ul>
      ) : data.totals.sizes === 0 ? (
        <div className="srp-empty" role="status">
          <p className="srp-empty-title">{t('nothing')}</p>
          <p className="srp-hint">{t('nothingHint')}</p>
        </div>
      ) : (
        <>
          <p className="srp-hint">{t('model')}</p>
          {data.totals.withoutBasis > 0 ? <p className="srp-warn">{t('withoutBasis', { count: data.totals.withoutBasis })}</p> : null}
          <ul className="srp-list">
            {data.rows.map((r) => {
              const edit = edits[r.id];
              return (
                <li key={r.id} className="srp-card ro-row">
                  <div className="ro-main">
                    <h2 className="srp-name">{nameOf(r)}</h2>
                    <p className="srp-hint">{reason(r)}</p>
                    {r.soldOutLastYear ? <p className="srp-warn">{t('soldOut')}</p> : null}
                    {r.override !== null && r.suggested !== null && r.override !== r.suggested ? <p className="srp-hint">{t('suggestedWas', { n: count(r.suggested) })}</p> : null}
                    {edit?.status === 'failed' || edit?.status === 'invalid' ? (
                      <p className="srp-error" role="alert">
                        {edit.message}
                        {edit.status === 'failed' ? (
                          <>
                            {' '}
                            <button type="button" className="ro-retry" onClick={() => void save(r, edit.text)}>
                              {t('retry')}
                            </button>
                          </>
                        ) : null}
                      </p>
                    ) : null}
                  </div>
                  <label className="ro-field">
                    <span className="ro-label">{t('orderLabel')}</span>
                    <input
                      className="input ro-input"
                      inputMode="numeric"
                      autoComplete="off"
                      value={shown(r)}
                      placeholder={r.suggested === null ? '' : String(r.suggested)}
                      disabled={!writable}
                      aria-label={t('orderFor', { name: nameOf(r) })}
                      aria-invalid={edit?.status === 'invalid' || edit?.status === 'failed'}
                      onChange={(e) => setEdits((cur) => ({ ...cur, [r.id]: { text: e.target.value.replace(/[^\d]/g, ''), status: 'saving' } }))}
                      onBlur={(e) => void save(r, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                      }}
                    />
                    <span className="ro-state" aria-live="polite">
                      {edit?.status === 'saved' ? t('saved') : edit?.status === 'saving' ? t('unsaved') : ''}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <Pagination page={livePage} total={data.totals.sizes} pageSize={PAGE_SIZE} noun={t('nounSizes')} onChange={setPage} />
          <div className="srp-bar ro-bar">
            {exportError ? (
              <p className="srp-error" role="alert">
                {exportError}
              </p>
            ) : null}
            <p className="ro-total" role="status">
              {t('total', { units: count(data.totals.toOrder), sizes: data.totals.sizes })}
            </p>
            <button type="button" className="btn btn-primary srp-export" disabled={exporting} onClick={() => void exportFile()}>
              {exporting ? t('exporting') : t('export')}
            </button>
          </div>
        </>
      )}
      <AppLink className="btn srp-export" href="/stock/sellers">
        {t('toSellers')}
      </AppLink>
    </div>
  );
}

/** How long an order takes to land, and how long it has to last, per category. Both are the owner's; unset means the platform's. */
function Rules({ branchId, writable, onChanged }: { branchId: string; writable: boolean; onChanged: () => void }) {
  const t = useTranslations('products.reorder');
  const [rules, setRules] = useState<{ defaults: { leadDays: number; coverDays: number }; rules: ReorderRule[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    setFailed(false);
    api
      .reorderRules(branchId)
      .then(setRules)
      .catch(() => setFailed(true));
  }, [branchId]);
  useEffect(() => {
    setRules(null);
    load();
  }, [load]);
  if (failed)
    return (
      <div className="ord-state" role="alert">
        <p>{t('loadError')}</p>
        <button type="button" className="btn" onClick={load}>
          {t('retry')}
        </button>
      </div>
    );
  if (!rules) return <p className="srp-hint">{t('loading')}</p>;
  if (rules.rules.length === 0) return <p className="srp-hint">{t('noCategories', { lead: rules.defaults.leadDays, cover: rules.defaults.coverDays })}</p>;
  return (
    <section className="srp-totals" aria-label={t('howFarAhead')}>
      <p className="srp-hint">{t('rulesHint', { lead: rules.defaults.leadDays, cover: rules.defaults.coverDays })}</p>
      {rules.rules.map((r) => (
        <RuleRow
          key={r.categoryId}
          rule={r}
          writable={writable}
          onSaved={(next) => setRules((cur) => (cur ? { ...cur, rules: cur.rules.map((x) => (x.categoryId === next.categoryId ? next : x)) } : cur))}
          onChanged={onChanged}
        />
      ))}
    </section>
  );
}

function RuleRow({ rule, writable, onSaved, onChanged }: { rule: ReorderRule; writable: boolean; onSaved: (r: ReorderRule) => void; onChanged: () => void }) {
  const t = useTranslations('products.reorder');
  const [lead, setLead] = useState(String(rule.effectiveLeadDays));
  const [cover, setCover] = useState(String(rule.effectiveCoverDays));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const run = async (leadDays: number | null, coverDays: number | null) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const next = await api.setReorderRule({ categoryId: rule.categoryId, leadDays, coverDays });
      onSaved(next);
      setLead(String(next.effectiveLeadDays));
      setCover(String(next.effectiveCoverDays));
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError && e.status < 500 ? e.message : t('saveFailed'));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  const valid = /^\d{1,3}$/.test(lead) && /^\d{1,3}$/.test(cover) && Number(cover) >= 1;
  return (
    <div className="ro-rule">
      <h3 className="ro-rule-name">{rule.name}</h3>
      <div className="ro-rule-fields">
        <label className="ro-field">
          <span className="ro-label">{t('leadLabel')}</span>
          <input className="input ro-input" inputMode="numeric" value={lead} disabled={!writable || busy} onChange={(e) => setLead(e.target.value.replace(/[^\d]/g, ''))} />
        </label>
        <label className="ro-field">
          <span className="ro-label">{t('coverLabel')}</span>
          <input className="input ro-input" inputMode="numeric" value={cover} disabled={!writable || busy} onChange={(e) => setCover(e.target.value.replace(/[^\d]/g, ''))} />
        </label>
      </div>
      {error ? (
        <p className="srp-error" role="alert">
          {error}
        </p>
      ) : null}
      {writable ? (
        <div className="ro-rule-actions">
          <button type="button" className="btn" disabled={busy || !valid} onClick={() => void run(Number(lead), Number(cover))}>
            {t('saveRule')}
          </button>
          {rule.leadDays !== null ? (
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void run(null, null)}>
              {t('useDefaults')}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
