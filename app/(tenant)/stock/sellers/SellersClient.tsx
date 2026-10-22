'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { api, ApiError } from '../../lib/api';
import type { BestSellersPage, DeadStockPage, ProductCategory, SellersRange } from '../../lib/api-types';
import { formatMoney, intlLocale } from '../../lib/format';
import AppLink from '../../../shared/AppLink';
import { Pagination } from '../../components/Pagination';
import { useBranch } from '../../components/BranchProvider';
import { useAreas, useSession } from '../../components/SessionProvider';

const PAGE_SIZE = 20;
const RANGES: readonly SellersRange[] = ['last_3_months', 'last_7_days', 'this_month', 'last_month', 'this_year'];
type View = 'best' | 'dead';

/**
 * Jira GRW-632 — which sizes sell, and which sit.
 *
 * One screen, two views behind a chip row (not two menu items). Each is one page of rows read from the server, with the totals the server
 * worked out over every row the filters let through. A best seller reads "Shirt · size 30 — 48 sold"; a size that sits reads "11 on the
 * shelf — not sold since November". Last year's window sits beside this one where the shop has data for it, and is SAID to be absent where
 * it has not: never a zero, never a percentage. A size with no cost price is not valued at zero, it is counted and said.
 *
 * Laid out at 344px: a column of cards, no table, no chart that is the only way to read a number.
 */
export function SellersClient({ timezone }: { timezone: string }) {
  const t = useTranslations('products.sellers');
  const locale = useLocale();
  const session = useSession();
  const branches = session?.branches ?? [];
  const branchContext = useBranch();
  const branch = branchContext.ready && branchContext.multi ? (branchContext.choice ?? '') : '';
  const ready = branchContext.ready || branches.length <= 1;

  const [view, setView] = useState<View>('best');
  // A kitchen keeps no count, so there is no unsold stock to list: Top sellers is the whole screen there.
  const counted = useAreas().stock;
  const [range, setRange] = useState<SellersRange>('last_3_months');
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [page, setPage] = useState(1);
  // The branch (and view and range) the page number and category were chosen under: a change starts them over in the SAME render, so there is one read.
  const [scope, setScope] = useState(`${branch}|${view}|${range}`);
  const scopeNow = `${branch}|${view}|${range}`;
  const stale = scope !== scopeNow;
  const livePage = stale ? 1 : page;
  const liveCategory = stale && scope.split('|')[0] !== branch ? '' : categoryId;
  const [best, setBest] = useState<BestSellersPage | null>(null);
  const [dead, setDead] = useState<DeadStockPage | null>(null);
  const [failed, setFailed] = useState(false);
  const seq = useRef(0);

  const money = (minor: string | number | null) => formatMoney(minor, 'INR', locale);
  const count = (n: number) => new Intl.NumberFormat(intlLocale(locale)).format(n);

  const load = useCallback(async () => {
    if (!ready) return;
    const mine = ++seq.current;
    setFailed(false);
    const q = { range, location: branch || undefined, categoryId: liveCategory || undefined, page: livePage, pageSize: PAGE_SIZE };
    try {
      if (view === 'best') {
        const res = await api.bestSellers(q);
        if (mine !== seq.current) return;
        if (res.rows.length === 0 && res.totals.sizes > 0 && livePage > 1) setPage(Math.max(1, Math.ceil(res.totals.sizes / PAGE_SIZE)));
        else setBest(res);
      } else {
        const res = await api.deadStock(q);
        if (mine !== seq.current) return;
        if (res.rows.length === 0 && res.totals.sizes > 0 && livePage > 1) setPage(Math.max(1, Math.ceil(res.totals.sizes / PAGE_SIZE)));
        else setDead(res);
      }
    } catch (e) {
      if (mine !== seq.current) return;
      // A category removed meanwhile is the server's plain sentence, not a fault: drop the filter and read again.
      if (e instanceof ApiError && e.field === 'categoryId') setCategoryId('');
      else setFailed(true);
    }
  }, [ready, view, range, branch, liveCategory, livePage]);
  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (scope === scopeNow) return;
    const [was] = scope.split('|');
    setScope(scopeNow);
    setPage(1);
    setBest(null);
    setDead(null);
    if (was !== branch) {
      setCategoryId('');
      setCategories([]);
    }
  }, [scope, scopeNow, branch]);

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

  const data = view === 'best' ? best : dead;
  const total = view === 'best' ? (best?.totals.sizes ?? 0) : (dead?.totals.sizes ?? 0);
  const filtered = liveCategory !== '';
  const nameOf = (name: string, size: string | null) => (size ? t('sizeOf', { name, size }) : name);
  const since = (iso: string | null): string => {
    if (!iso) return t('neverSold');
    const d = new Date(iso);
    const year = (x: Date) => new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: timezone }).format(x);
    // The day, not only the month: "since October" is no help on a "last 7 days" view that is itself in October.
    return t('notSoldSince', {
      when: new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'long', ...(year(d) === year(new Date()) ? {} : { year: 'numeric' }), timeZone: timezone }).format(d),
    });
  };

  return (
    <div className="srp srp-sellers">
      <div className="srp-toolbar">
        {/* "Unsold stock" is what is still ON the shelf and did not sell — a count, so a kitchen has only Top sellers. */}
        <div className="pf-chips" role="group" aria-label={t('viewGroup')}>
          {(counted ? (['best', 'dead'] as const) : (['best'] as const)).map((v) => (
            <button key={v} type="button" className={`pf-chip ${view === v ? 'pf-chip-on' : ''}`} aria-pressed={view === v} onClick={() => setView(v)}>
              {v === 'best' ? t('viewBest') : t('viewDead')}
            </button>
          ))}
        </div>

        <select className="input srp-select" aria-label={t('rangeLabel')} value={range} onChange={(e) => setRange(e.target.value as SellersRange)}>
          {RANGES.map((r) => (
            <option key={r} value={r}>
              {t(`range.${r}`)}
            </option>
          ))}
        </select>

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
      </div>

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
      ) : view === 'best' && best ? (
        best.totals.sizes === 0 ? (
          <EmptyLine text={t('noSales')} hint={filtered ? null : t('noSalesHint')} />
        ) : (
          <>
            <section className="srp-totals" aria-label={t('totalsLabel')}>
              <p className="srp-worth-label">{t(`range.${range}`)}</p>
              <p className="srp-worth">{t('sold', { units: best.totals.units })}</p>
              <p className="srp-hint">{t('bestTotals', { sizes: best.totals.sizes, value: money(best.totals.valueMinor) })}</p>
              {!best.lastYear.hasData ? <p className="srp-hint">{t('noLastYear')}</p> : null}
            </section>
            <ul className="srp-list">
              {best.rows.map((r) => (
                <li key={r.id} className="srp-card">
                  <div className="srp-head">
                    <h2 className="srp-name">{nameOf(r.name, r.sizeLabel)}</h2>
                    <p className="srp-value">{t('sold', { units: r.units })}</p>
                  </div>
                  <p className="srp-hint">
                    {money(r.valueMinor)}
                    {best.lastYear.hasData && r.lastYearUnits !== null ? ` · ${t('lastYear', { units: count(r.lastYearUnits) })}` : ''}
                  </p>
                </li>
              ))}
            </ul>
            <Pagination page={livePage} total={best.totals.sizes} pageSize={PAGE_SIZE} noun={t('nounSizes')} onChange={setPage} />
          </>
        )
      ) : view === 'dead' && dead ? (
        dead.totals.sizes === 0 ? (
          <EmptyLine text={t('nothingSits')} hint={filtered ? null : t('nothingSitsHint')} />
        ) : (
          <>
            <section className="srp-totals" aria-label={t('totalsLabel')}>
              <p className="srp-worth-label">{t('sitsNote')}</p>
              <p className="srp-worth">{dead.totals.sizesWithoutCost >= dead.totals.sizes ? t('noCost') : money(dead.totals.valueMinor)}</p>
              <p className="srp-hint">{t('deadTotals', { sizes: dead.totals.sizes, units: count(dead.totals.units) })}</p>
              {dead.totals.sizesWithoutCost > 0 ? <p className="srp-warn">{t('withoutCost', { count: dead.totals.sizesWithoutCost })}</p> : null}
            </section>
            <ul className="srp-list">
              {dead.rows.map((r) => (
                <li key={r.id} className="srp-card">
                  <div className="srp-head">
                    <h2 className="srp-name">{nameOf(r.name, r.sizeLabel)}</h2>
                    <p className="srp-value">{r.valueMinor === null ? t('noCost') : money(r.valueMinor)}</p>
                  </div>
                  <p className="srp-hint">{`${t('onShelf', { units: count(r.stock) })} · ${since(r.lastSoldAt)}`}</p>
                </li>
              ))}
            </ul>
            <Pagination page={livePage} total={dead.totals.sizes} pageSize={PAGE_SIZE} noun={t('nounSizes')} onChange={setPage} />
          </>
        )
      ) : null}

      <div className="srp-links">
        <AppLink className="btn btn-ghost srp-export" href="/stock/order">
          {t('toOrder')}
        </AppLink>
        <AppLink className="btn btn-ghost srp-export" href="/stock/report">
          {t('toReport')}
        </AppLink>
      </div>
    </div>
  );
}

function EmptyLine({ text, hint }: { text: string; hint: string | null }) {
  return (
    <div className="srp-empty" role="status">
      <p className="srp-empty-title">{text}</p>
      {hint ? <p className="srp-hint">{hint}</p> : null}
    </div>
  );
}
