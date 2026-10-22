'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { api, ApiError } from '../../lib/api';
import type { ProductCategory, StockReportPage, StockReportStyle } from '../../lib/api-types';
import { formatMoney, intlLocale } from '../../lib/format';
import AppLink from '../../../shared/AppLink';
import { Pagination } from '../../components/Pagination';
import { SearchClear } from '../../components/SearchClear';
import { useBranch } from '../../components/BranchProvider';
import { useSession } from '../../components/SessionProvider';

const PAGE_SIZE = 20;
type StockFilter = 'all' | 'missing_cost' | 'zero_or_neg';
type StockView = 'cards' | 'table';

/**
 * Jira GRW-631 — the shelf, size by size, with what it is worth at cost.
 *
 * One card per style (the biggest value first), its sizes as small count pairs under the name — a style with thirty sizes is
 * one card, never thirty rows. The totals sit above them and are the server's, over every style the filters let through, so they
 * do not change as the pages turn. A size with no cost price is SHOWN, and said to be left out of the worth ("12 sizes have no cost
 * price"): the screen never invents a cost and never hides a count. A count below zero is shown as it is. The file is the server's
 * own answer to the same question, so the screen and the file cannot disagree.
 *
 * Laid out at 344px: a column, the totals first, the filters, then the cards; the Export button is a thumb tall.
 */
export function StockReportClient() {
  const t = useTranslations('products.stockReport');
  const locale = useLocale();
  const session = useSession();
  const branches = session?.branches ?? [];
  // The header's branch picker is the one choice of branch; an owner's "all branches" reads the whole shop.
  const branchContext = useBranch();
  const branch = branchContext.ready && branchContext.multi ? (branchContext.choice ?? '') : '';
  const ready = branchContext.ready || branches.length <= 1;
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [typed, setTyped] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [view, setView] = useState<StockView>('cards');
  // The branch the page number and the category were chosen under: a change of branch starts them over in the SAME render, so there is one read.
  const [scope, setScope] = useState(branch);
  const stale = scope !== branch;
  const livePage = stale ? 1 : page;
  const liveCategory = stale ? '' : categoryId;
  const [data, setData] = useState<StockReportPage | null>(null);
  const [failed, setFailed] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const seq = useRef(0);
  const exportBusy = useRef(false);

  const money = (minor: string | number | null) => formatMoney(minor, 'INR', locale);
  const count = (n: number) => new Intl.NumberFormat(intlLocale(locale)).format(n);

  const load = useCallback(async () => {
    if (!ready) return;
    const mine = ++seq.current;
    setFailed(false);
    try {
      const res = await api.stockReport({ location: branch || undefined, categoryId: liveCategory || undefined, q, page: livePage, pageSize: PAGE_SIZE });
      if (mine !== seq.current) return;
      // A page that emptied under the person (a filter narrowed it) steps back rather than showing nothing.
      if (res.styles.length === 0 && res.totals.styles > 0 && livePage > 1) setPage(Math.max(1, Math.ceil(res.totals.styles / PAGE_SIZE)));
      else setData(res);
    } catch (e) {
      // A category that was removed meanwhile is the server's plain sentence, not a fault: drop the filter and read again.
      if (mine !== seq.current) return;
      if (e instanceof ApiError && e.field === 'categoryId') setCategoryId('');
      else setFailed(true);
    }
  }, [ready, branch, liveCategory, q, livePage]);
  useEffect(() => {
    void load();
  }, [load]);

  // Typing searches after a short pause, on the server; the first page of the new search.
  useEffect(() => {
    const id = setTimeout(() => {
      if (typed.trim() !== q) {
        setQ(typed.trim());
        setPage(1);
      }
    }, 300);
    return () => clearTimeout(id);
  }, [typed, q]);

  // Categories belong to a branch: they are offered when exactly one branch is in view (the only one, or the one chosen).
  useEffect(() => {
    if (scope === branch) return;
    setScope(branch);
    setPage(1);
    setCategoryId('');
    setCategories([]);
    setData(null);
  }, [scope, branch]);
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

  const exportFile = async () => {
    if (exportBusy.current) return;
    exportBusy.current = true;
    setExporting(true);
    setExportError(null);
    try {
      const csv = await api.stockReportCsv({ location: branch || undefined, categoryId: liveCategory || undefined, q });
      const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'stock-on-the-shelf.csv';
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

  const pageStyles = data?.styles ?? [];
  const missingCostStyles = pageStyles.filter((s) => s.valueMinor === null || s.sizesWithoutCost > 0);
  const zeroOrNegStyles = pageStyles.filter((s) => s.sizes.some((z) => z.stock <= 0));
  const visibleStyles =
    stockFilter === 'missing_cost' ? missingCostStyles : stockFilter === 'zero_or_neg' ? zeroOrNegStyles : pageStyles;

  const filtered = q !== '' || liveCategory !== '' || stockFilter !== 'all';
  const showBranch = branches.length > 1 && !branch;

  return (
    <div className="srp srp-stock">
      {data ? <Totals data={data} money={money} count={count} /> : null}

      <div className="srp-toolbar">
        <div className="srp-toolbar-main">
          <label className="search-wrap srp-search">
            <input
              type="search"
              className="search-input search-input-bare"
              placeholder={t('searchPlaceholder')}
              aria-label={t('searchLabel')}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            <SearchClear value={typed} onClear={() => setTyped('')} />
          </label>

          {categories.length > 0 ? (
            <select
              className="input srp-select"
              aria-label={t('categoryLabel')}
              value={categoryId}
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

          <div className="srp-filter-pills" role="group" aria-label={t('filterGroup')}>
            <button
              type="button"
              className={`srp-filter-pill${stockFilter === 'all' ? ' is-active' : ''}`}
              aria-pressed={stockFilter === 'all'}
              onClick={() => setStockFilter('all')}
            >
              {t('filterAll', { count: pageStyles.length })}
            </button>
            <button
              type="button"
              className={`srp-filter-pill${stockFilter === 'missing_cost' ? ' is-active' : ''}`}
              aria-pressed={stockFilter === 'missing_cost'}
              onClick={() => setStockFilter('missing_cost')}
            >
              {t('filterMissingCost', { count: missingCostStyles.length })}
            </button>
            <button
              type="button"
              className={`srp-filter-pill${stockFilter === 'zero_or_neg' ? ' is-active' : ''}`}
              aria-pressed={stockFilter === 'zero_or_neg'}
              onClick={() => setStockFilter('zero_or_neg')}
            >
              {t('filterZeroOrNeg', { count: zeroOrNegStyles.length })}
            </button>
          </div>
        </div>

        <div className="srp-toolbar-actions">
          <div className="srp-view-toggle" role="group" aria-label={t('viewGroup')}>
            <button
              type="button"
              className={`srp-view-btn${view === 'cards' ? ' is-active' : ''}`}
              aria-pressed={view === 'cards'}
              onClick={() => setView('cards')}
            >
              {t('viewCards')}
            </button>
            <button
              type="button"
              className={`srp-view-btn${view === 'table' ? ' is-active' : ''}`}
              aria-pressed={view === 'table'}
              onClick={() => setView('table')}
            >
              {t('viewTable')}
            </button>
          </div>

          <button type="button" className="btn btn-ghost srp-export" disabled={exporting} onClick={() => void exportFile()}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>{exporting ? t('exporting') : t('export')}</span>
          </button>
        </div>
      </div>

      {exportError ? (
        <p className="srp-error" role="alert">
          {exportError}
        </p>
      ) : null}

      {failed ? (
        <div className="ord-state" role="alert">
          <p>{t('loadError')}</p>
          <button type="button" className="btn" onClick={() => void load()}>
            {t('retry')}
          </button>
        </div>
      ) : data === null ? (
        <ul className="srp-list" aria-busy="true" aria-label={t('loading')}>
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="srp-card srp-skeleton" />
          ))}
        </ul>
      ) : data.totals.styles === 0 || data.neverCounted || visibleStyles.length === 0 ? (
        <div className="srp-empty" role="status">
          <p className="srp-empty-title">
            {data.totals.styles === 0 || visibleStyles.length === 0 ? (filtered ? t('noMatch') : t('nothing')) : t('neverCounted')}
          </p>
          {!filtered ? (
            <>
              <p className="srp-hint">{data.totals.styles === 0 ? t('nothingHint') : t('neverCountedHint')}</p>
              <AppLink className="btn" href="/stock">
                {t('goToStock')}
              </AppLink>
            </>
          ) : null}
        </div>
      ) : (
        <>
          {view === 'table' ? (
            <div className="srp-table-card">
              <table className="srp-table">
                <thead>
                  <tr>
                    <th scope="col">{t('colStyle')}</th>
                    {showBranch ? <th scope="col">{t('colBranch')}</th> : null}
                    <th scope="col" className="is-num">{t('colUnits')}</th>
                    <th scope="col" className="is-num">{t('colWorth')}</th>
                    <th scope="col">{t('colSizes')}</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleStyles.map((s) => (
                    <tr key={s.id}>
                      <td className="srp-td-name">
                        <strong>{s.name}</strong>
                      </td>
                      {showBranch ? (
                        <td className="srp-td-branch">
                          <span className="srp-branch-pill">{s.branchName}</span>
                        </td>
                      ) : null}
                      <td className="is-num">
                        <span className="srp-units-pill">{t('units', { count: s.units, units: count(s.units) })}</span>
                      </td>
                      <td className="is-num">
                        <span className={`srp-value${s.valueMinor === null ? ' is-no-cost' : ''}`}>
                          {s.valueMinor === null ? t('noCost') : money(s.valueMinor)}
                        </span>
                      </td>
                      <td className="srp-td-sizes">
                        <SizeList style={s} count={count} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <ul className="srp-list">
              {visibleStyles.map((s) => (
                <StyleCard key={s.id} style={s} showBranch={showBranch} money={money} count={count} />
              ))}
            </ul>
          )}
          <Pagination page={livePage} total={data.totals.styles} pageSize={PAGE_SIZE} noun={t('nounStyles')} onChange={setPage} />
        </>
      )}

      <div className="srp-links">
        <AppLink className="btn btn-ghost srp-export" href="/stock/sellers">
          {t('toSellers')}
        </AppLink>
        <AppLink className="btn btn-ghost srp-export" href="/stock/order">
          {t('toOrder')}
        </AppLink>
        <AppLink className="btn btn-ghost srp-export" href="/stock/channels">
          {t('toChannels')}
        </AppLink>
      </div>
    </div>
  );
}

function Totals({ data, money, count }: { data: StockReportPage; money: (m: string | number | null) => string; count: (n: number) => string }) {
  const t = useTranslations('products.stockReport');
  const { totals } = data;
  if (data.neverCounted || totals.styles === 0) return null;
  const hasGaps = totals.sizesWithoutCost > 0 || totals.negativeSizes > 0;
  return (
    <section className="srp-totals srp-kpi-grid" aria-label={t('totalsLabel')}>
      <div className="srp-kpi-card is-primary">
        <p className="srp-worth-label">{t('worth')}</p>
        <p className="srp-worth">{totals.sizesWithCost === 0 ? t('noCost') : money(totals.valueMinor)}</p>
        <p className="srp-hint">{t('totalsLine', { styles: totals.styles, sizes: totals.sizes, units: count(totals.units) })}</p>
      </div>

      <div className="srp-kpi-card">
        <p className="srp-worth-label">{t('kpiUnitsLabel')}</p>
        <p className="srp-kpi-num">{count(totals.units)}</p>
        <p className="srp-hint">{t('kpiUnitsSub', { sizes: totals.sizes })}</p>
      </div>

      <div className="srp-kpi-card">
        <p className="srp-worth-label">{t('kpiStylesLabel')}</p>
        <p className="srp-kpi-num">{count(totals.styles)}</p>
        <p className="srp-hint">{t('kpiStylesSub', { withCost: totals.sizesWithCost, total: totals.sizes })}</p>
      </div>

      <div className={`srp-kpi-card${hasGaps ? ' is-warn' : ' is-ok'}`}>
        <p className="srp-worth-label">{t('kpiHealthLabel')}</p>
        {hasGaps ? (
          <>
            <p className="srp-kpi-num">{count(totals.sizesWithoutCost + totals.negativeSizes)}</p>
            <div className="srp-kpi-warns">
              {totals.sizesWithoutCost > 0 ? <p className="srp-warn">{t('withoutCost', { count: totals.sizesWithoutCost })}</p> : null}
              {totals.negativeSizes > 0 ? <p className="srp-warn srp-warn-danger">{t('negative', { count: totals.negativeSizes })}</p> : null}
            </div>
          </>
        ) : (
          <>
            <p className="srp-kpi-num is-ok">{t('allCosted')}</p>
            <p className="srp-hint">{t('allCostedSub')}</p>
          </>
        )}
      </div>
    </section>
  );
}

function SizeList({ style, count }: { style: StockReportStyle; count: (n: number) => string }) {
  const t = useTranslations('products.stockReport');
  return (
    <ul className="srp-sizes" aria-label={t('sizesLabel', { name: style.name })}>
      {style.sizes.map((z) => (
        <li key={z.id} className={`srp-size ${z.stock < 0 ? 'srp-size-negative' : z.stock === 0 ? 'srp-size-zero' : ''}`}>
          <span className="srp-size-label">{z.label}</span>
          <span className="srp-size-count">{count(z.stock)}</span>
          {z.costMinor === null && z.stock !== 0 ? <span className="srp-size-flag">{t('noCostShort')}</span> : null}
        </li>
      ))}
    </ul>
  );
}

function StyleCard({ style, showBranch, money, count }: { style: StockReportStyle; showBranch: boolean; money: (m: string | number | null) => string; count: (n: number) => string }) {
  const t = useTranslations('products.stockReport');
  return (
    <li className="srp-card">
      <div className="srp-head">
        <div className="srp-title-stack">
          <h2 className="srp-name">{style.name}</h2>
          <div className="srp-meta-row">
            {showBranch ? <span className="srp-branch-pill">{style.branchName}</span> : null}
            <span className="srp-units-pill">{t('units', { count: style.units, units: count(style.units) })}</span>
          </div>
        </div>
        <p className={`srp-value${style.valueMinor === null ? ' is-no-cost' : ''}`}>
          {style.valueMinor === null ? t('noCost') : money(style.valueMinor)}
        </p>
      </div>
      {style.sizes.length > 1 || style.sizes[0]?.label !== style.name ? <SizeList style={style} count={count} /> : null}
    </li>
  );
}
