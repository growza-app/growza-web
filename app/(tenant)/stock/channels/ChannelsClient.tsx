'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '../../lib/api';
import { localiseApiMessage } from '../../lib/api-messages';
import type { ByChannelPage, ChannelRow, SellersRange } from '../../lib/api-types';
import { formatMoney, intlLocale } from '../../lib/format';
import { useBranch } from '../../components/BranchProvider';
import { useSession } from '../../components/SessionProvider';

const RANGES: readonly SellersRange[] = ['last_3_months', 'last_7_days', 'this_month', 'last_month', 'this_year'];

/**
 * Jira GRW-634 — what was billed on the counter, on Flipkart and on Amazon, side by side.
 *
 * One card per channel (never a table that scrolls sideways): the amount, the orders and their average, how many came back, and how it
 * compares with the period before — or a plain line that there is nothing to compare, never a percentage out of nothing. A channel the shop
 * has used shows even when it sold nothing in these days (a true zero); one it never used is not there. The trend is bars with the same
 * numbers in a list beneath, so the chart is never the only way to read a figure.
 *
 * The line under the numbers says they are what was BILLED, not what was paid: marketplace fees are not taken off. It comes from the server's
 * own response, so it changes in one place, and it is on the screen in plain sight — it changes how every number above it should be read.
 */
export function ChannelsClient() {
  const t = useTranslations('products.channels');
  const locale = useLocale();
  const session = useSession();
  const branches = session?.branches ?? [];
  const branchContext = useBranch();
  const branch = branchContext.ready && branchContext.multi ? (branchContext.choice ?? '') : '';
  const ready = branchContext.ready || branches.length <= 1;
  const [range, setRange] = useState<SellersRange>('last_3_months');
  const [data, setData] = useState<ByChannelPage | null>(null);
  const [failed, setFailed] = useState(false);
  const seq = useRef(0);
  const money = (minor: string | number | null) => formatMoney(minor, 'INR', locale);

  const load = useCallback(async () => {
    if (!ready) return;
    const mine = ++seq.current;
    setFailed(false);
    try {
      const res = await api.byChannel({ range, location: branch || undefined });
      if (mine === seq.current) setData(res);
    } catch {
      if (mine === seq.current) setFailed(true);
    }
  }, [ready, range, branch]);
  useEffect(() => {
    setData(null);
    void load();
  }, [load]);

  const word = (c: string) =>
    c === 'counter'
      ? t('counter')
      : c === 'flipkart' || c === 'amazon' || c === 'swiggy' || c === 'zomato'
        ? t(c)
        : c.charAt(0).toUpperCase() + c.slice(1);

  return (
    <div className="srp srp-channels">
      <div className="srp-toolbar">
        <select className="input srp-select" aria-label={t('rangeLabel')} value={range} onChange={(e) => setRange(e.target.value as SellersRange)}>
          {RANGES.map((r) => (
            <option key={r} value={r}>
              {t(`range.${r}`)}
            </option>
          ))}
        </select>
      </div>

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
      ) : !data.anyOrders ? (
        <div className="srp-empty" role="status">
          <p className="srp-empty-title">{t('noSales')}</p>
          <p className="srp-hint">{t('noSalesHint')}</p>
        </div>
      ) : (
        <>
          <section className="srp-totals" aria-label={t('totalsLabel')}>
            <p className="srp-worth-label">{t('billed')}</p>
            <p className="srp-worth">{money(data.totals.billedMinor)}</p>
            <p className="srp-hint">{t('ordersLine', { orders: data.totals.orders })}</p>
            <Compare previous={data.totals.previousBilledMinor !== null} pct={data.totals.changePct} />
          </section>

          <ul className="srp-list">
            {data.channels.map((c) => (
              <Card key={c.channel} row={c} name={word(c.channel)} money={money} hasPrevious={data.previous.hasData} />
            ))}
          </ul>

          <Trend data={data} word={word} money={money} />

          <p className="ch-caveat" role="note">
            {localiseApiMessage(data.caveat, locale)}
          </p>
        </>
      )}
    </div>
  );
}

function Compare({ previous, pct }: { previous: boolean; pct: number | null }) {
  const t = useTranslations('products.channels');
  if (!previous) return <p className="srp-hint">{t('noPrevious')}</p>;
  if (pct === null) return <p className="srp-hint">{t('nothingBefore')}</p>;
  return <p className="srp-hint">{pct === 0 ? t('same') : pct > 0 ? t('up', { pct }) : t('down', { pct: Math.abs(pct) })}</p>;
}

function Card({ row, name, money, hasPrevious }: { row: ChannelRow; name: string; money: (m: string | number | null) => string; hasPrevious: boolean }) {
  const t = useTranslations('products.channels');
  return (
    <li className="srp-card">
      <div className="srp-head">
        <h2 className="srp-name">{name}</h2>
        <p className="srp-value">{money(row.billedMinor)}</p>
      </div>
      <p className="srp-hint">
        {t('ordersLine', { orders: row.orders })}
        {row.averageMinor !== null ? ` · ${t('average', { amount: money(row.averageMinor) })}` : ''}
      </p>
      {row.returnedOrders > 0 ? <p className="srp-warn">{t('cameBack', { count: row.returnedOrders })}</p> : null}
      {row.refundedMinor && row.refundedMinor !== '0' ? <p className="srp-hint">{t('refunded', { amount: money(row.refundedMinor), count: row.refundedCount ?? 0 })}</p> : null}
      {row.cancelledOrders > 0 ? <p className="srp-hint">{t('cancelled', { count: row.cancelledOrders })}</p> : null}
      {/* One line at the top says there is no period before to compare with; it is not repeated on every card. */}
      {hasPrevious ? <Compare previous={row.previous !== null} pct={row.changePct} /> : null}
    </li>
  );
}

/** The same numbers twice: bars to see the shape, and a list to read each one. */
function Trend({ data, word, money }: { data: ByChannelPage; word: (c: string) => string; money: (m: string | number | null) => string }) {
  const t = useTranslations('products.channels');
  const locale = useLocale();
  const intl = intlLocale(locale);
  // The bucket's own calendar day, read from the ISO text (its offset is the shop's), so no browser timezone moves it a day.
  const at = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  const bucketWord = (startISO: string, endISO: string): string => {
    const days = Math.round((at(endISO).getTime() - at(startISO).getTime()) / 86_400_000);
    if (days <= 1) return new Intl.DateTimeFormat(intl, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(at(startISO));
    if (days <= 8) return t('weekOf', { date: new Intl.DateTimeFormat(intl, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(at(startISO)) });
    return new Intl.DateTimeFormat(intl, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(at(startISO));
  };
  const totals = data.trend.map((b) => Object.values(b.billedMinor).reduce((a, v) => a + Number(v), 0));
  const max = Math.max(1, ...totals);
  if (data.trend.length === 0) return null;
  return (
    <section className="srp-totals" aria-label={t('trendTitle')}>
      <h2 className="srp-name">{t('trendTitle')}</h2>
      <svg className="ch-bars" viewBox={`0 0 ${data.trend.length * 12} 48`} preserveAspectRatio="none" role="img" aria-label={t('trendTitle')}>
        {totals.map((v, i) => (
          <rect key={data.trend[i]!.startISO} x={i * 12 + 2} y={46 - (v / max) * 44} width={8} height={Math.max(v > 0 ? 1 : 0, (v / max) * 44)} rx={1} fill="currentColor" />
        ))}
      </svg>
      <ul className="ch-trend">
        {data.trend.map((b, i) => (
          <li key={b.startISO}>
            <span className="srp-hint">{bucketWord(b.startISO, b.endExclusiveISO)}</span>
            <span className="ch-trend-sum">{money(totals[i]!)}</span>
            <span className="sr-only">
              {Object.entries(b.billedMinor)
                .map(([c, v]) => `${word(c)} ${money(v)}`)
                .join(', ')}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
