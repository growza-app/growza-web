'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { api, ApiError } from '../../lib/api';
import type { RefundsReportPage, SellersRange } from '../../lib/api-types';
import { formatMoney, intlLocale } from '../../lib/format';
import AppLink from '../../../shared/AppLink';
import { Pagination } from '../../components/Pagination';
import { useBranch } from '../../components/BranchProvider';
import { useSession } from '../../components/SessionProvider';

const RANGES: readonly SellersRange[] = ['last_3_months', 'last_7_days', 'this_month', 'last_month', 'this_year'];
const PAGE_SIZE = 20;

/**
 * Jira GRW-637 — what was refunded on online orders, one row per refund, so the month's statement can be matched against it.
 *
 * "Flipkart refunded ₹450 on 12 May", the item and the order beneath, and the marketplace's own reference — the thing its statement carries. A total
 * on top, and per channel. These are RECORDS of what the marketplace (or the shop) did: this screen never refunds anything and is not called a
 * settlement, because it is not one. Server-paged; the file is the server's own, the same rows with the same total.
 */
export function RefundsClient() {
  const t = useTranslations('orders.refunds');
  const locale = useLocale();
  const session = useSession();
  const branches = session?.branches ?? [];
  const branchContext = useBranch();
  const branch = branchContext.ready && branchContext.multi ? (branchContext.choice ?? '') : '';
  const ready = branchContext.ready || branches.length <= 1;
  const [range, setRange] = useState<SellersRange>('last_3_months');
  const [channel, setChannel] = useState('');
  const [page, setPage] = useState(1);
  // The branch, range and channel the page number was chosen under: a change starts it over in the SAME render, so there is one read.
  const [scope, setScope] = useState(`${branch}|${range}|${channel}`);
  const scopeNow = `${branch}|${range}|${channel}`;
  const stale = scope !== scopeNow;
  const livePage = stale ? 1 : page;
  const [data, setData] = useState<RefundsReportPage | null>(null);
  const [failed, setFailed] = useState(false);
  // The channels there are, from the last read that was NOT narrowed to one: the chips are built from this, so tapping one never removes the others
  // (or itself) while the next read is on its way.
  const [channelList, setChannelList] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const seq = useRef(0);
  const exportBusy = useRef(false);
  const money = (minor: string | number | null) => formatMoney(minor, 'INR', locale);
  const day = (iso: string) => new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'short', timeZone: session?.timezone ?? 'Asia/Kolkata' }).format(new Date(iso));
  const word = (c: string) => (c === 'flipkart' ? t('flipkart') : c === 'amazon' ? t('amazon') : c.charAt(0).toUpperCase() + c.slice(1));

  const load = useCallback(async () => {
    if (!ready) return;
    const mine = ++seq.current;
    setFailed(false);
    try {
      const res = await api.refundsReport({ range, channel: channel || undefined, location: branch || undefined, page: livePage, pageSize: PAGE_SIZE });
      if (mine !== seq.current) return;
      if (res.rows.length === 0 && res.totals.count > 0 && livePage > 1) setPage(Math.max(1, Math.ceil(res.totals.count / PAGE_SIZE)));
      else {
        setData(res);
        if (channel === '') setChannelList(res.totals.byChannel.map((c) => c.channel));
      }
    } catch {
      if (mine === seq.current) setFailed(true);
    }
  }, [ready, range, channel, branch, livePage]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (scope === scopeNow) return;
    setScope(scopeNow);
    setPage(1);
    setData(null);
  }, [scope, scopeNow]);

  const exportFile = async () => {
    if (exportBusy.current) return;
    exportBusy.current = true;
    setExporting(true);
    setExportError(null);
    try {
      const csv = await api.refundsCsv({ range, channel: channel || undefined, location: branch || undefined });
      const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'refunds.csv';
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

  const channels = channelList.includes(channel) || channel === '' ? channelList : [...channelList, channel];
  return (
    <div className="srp">
      <select className="input srp-select" aria-label={t('rangeLabel')} value={range} onChange={(e) => setRange(e.target.value as SellersRange)}>
        {RANGES.map((r) => (
          <option key={r} value={r}>
            {t(`range.${r}`)}
          </option>
        ))}
      </select>
      {channels.length > 1 ? (
        <div className="pf-chips sls-ret-why" role="group" aria-label={t('channelLabel')}>
          {['', ...channels].map((c) => (
            <button key={c || 'all'} type="button" className={`pf-chip ${channel === c ? 'pf-chip-on' : ''}`} aria-pressed={channel === c} onClick={() => setChannel(c)}>
              {c === '' ? t('allChannels') : word(c)}
            </button>
          ))}
        </div>
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
      ) : data.totals.count === 0 ? (
        <div className="srp-empty" role="status">
          <p className="srp-empty-title">{channel ? t('nothingOnChannel', { channel: word(channel) }) : t('nothing')}</p>
          <p className="srp-hint">{t('nothingHint')}</p>
        </div>
      ) : (
        <>
          <section className="srp-totals" aria-label={t('totalsLabel')}>
            <p className="srp-worth-label">{t('total')}</p>
            <p className="srp-worth">{money(data.totals.amountMinor)}</p>
            <p className="srp-hint">{t('countLine', { count: data.totals.count })}</p>
          </section>
          <ul className="srp-list">
            {data.rows.map((r) => (
              <li key={r.id} className="srp-card">
                <div className="srp-head">
                  <h2 className="srp-name">
                    {r.refundedBy === 'marketplace' ? t('marketplaceRefunded', { channel: word(r.channel), date: day(r.refundedAt) }) : t('shopRefunded', { date: day(r.refundedAt) })}
                  </h2>
                  <p className="srp-value">{money(r.amountMinor)}</p>
                </div>
                <p className="srp-hint">{r.lineName}</p>
                <p className="srp-hint">
                  <AppLink href={`/orders/${r.saleId}`}>{r.orderRef ? t('orderRef', { ref: r.orderRef }) : t('openOrder')}</AppLink>
                  {' · '}
                  {t('reference', { ref: r.externalRef })}
                </p>
              </li>
            ))}
          </ul>
          <Pagination page={livePage} total={data.totals.count} pageSize={PAGE_SIZE} noun={t('nounRefunds')} onChange={setPage} />
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
      <p className="ch-caveat" role="note">
        {t('recordNote')}
      </p>
      <AppLink className="btn srp-export" href="/orders/returns">
        {t('toReturns')}
      </AppLink>
    </div>
  );
}
