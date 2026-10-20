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

  const filtered = q !== '' || liveCategory !== '';
  return (
    <div className="srp">
      {data ? <Totals data={data} money={money} count={count} /> : null}

      <AppLink className="btn srp-export" href="/stock/sellers">
        {t('toSellers')}
      </AppLink>

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

      {failed ? (
        <div className="ord-state" role="alert">
          <p>{t('loadError')}</p>
          <button type="button" className="btn" onClick={() => void load()}>
            {t('retry')}
          </button>
        </div>
      ) : data === null ? (
        <ul className="srp-list" aria-busy="true" aria-label={t('loading')}>
          {[0, 1, 2].map((i) => (
            <li key={i} className="srp-card srp-skeleton" />
          ))}
        </ul>
      ) : data.totals.styles === 0 || data.neverCounted ? (
        <div className="srp-empty" role="status">
          <p className="srp-empty-title">{data.totals.styles === 0 ? (filtered ? t('noMatch') : t('nothing')) : t('neverCounted')}</p>
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
          <ul className="srp-list">
            {data.styles.map((s) => (
              <StyleCard key={s.id} style={s} showBranch={branches.length > 1 && !branch} money={money} count={count} />
            ))}
          </ul>
          <Pagination page={livePage} total={data.totals.styles} pageSize={PAGE_SIZE} noun={t('nounStyles')} onChange={setPage} />
          <div className="srp-bar">
            {exportError ? (
              <p className="srp-error" role="alert">
                {exportError}
              </p>
            ) : null}
            <button type="button" className="btn srp-export" disabled={exporting} onClick={() => void exportFile()}>
              {exporting ? t('exporting') : t('export')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Totals({ data, money, count }: { data: StockReportPage; money: (m: string | number | null) => string; count: (n: number) => string }) {
  const t = useTranslations('products.stockReport');
  const { totals } = data;
  if (data.neverCounted || totals.styles === 0) return null;
  return (
    <section className="srp-totals" aria-label={t('totalsLabel')}>
      <p className="srp-worth-label">{t('worth')}</p>
      <p className="srp-worth">{totals.sizesWithCost === 0 ? t('noCost') : money(totals.valueMinor)}</p>
      <p className="srp-hint">{t('totalsLine', { styles: totals.styles, sizes: totals.sizes, units: count(totals.units) })}</p>
      {totals.sizesWithoutCost > 0 ? <p className="srp-warn">{t('withoutCost', { count: totals.sizesWithoutCost })}</p> : null}
      {totals.negativeSizes > 0 ? <p className="srp-warn">{t('negative', { count: totals.negativeSizes })}</p> : null}
    </section>
  );
}

function StyleCard({ style, showBranch, money, count }: { style: StockReportStyle; showBranch: boolean; money: (m: string | number | null) => string; count: (n: number) => string }) {
  const t = useTranslations('products.stockReport');
  return (
    <li className="srp-card">
      <div className="srp-head">
        <h2 className="srp-name">{style.name}</h2>
        <p className="srp-value">{style.valueMinor === null ? t('noCost') : money(style.valueMinor)}</p>
      </div>
      <p className="srp-hint">
        {showBranch ? `${style.branchName} · ` : ''}
        {t('units', { count: style.units, units: count(style.units) })}
      </p>
      {style.sizes.length > 1 || style.sizes[0]?.label !== style.name ? (
        <ul className="srp-sizes" aria-label={t('sizesLabel', { name: style.name })}>
          {style.sizes.map((z) => (
            <li key={z.id} className={`srp-size ${z.stock < 0 ? 'srp-size-negative' : z.stock === 0 ? 'srp-size-zero' : ''}`}>
              <span className="srp-size-label">{z.label}</span>
              <span className="srp-size-count">{count(z.stock)}</span>
              {z.costMinor === null && z.stock !== 0 ? <span className="srp-size-flag">{t('noCostShort')}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
