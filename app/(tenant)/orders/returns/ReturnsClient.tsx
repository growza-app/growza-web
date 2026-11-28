'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '../../lib/api';
import type { ReturnsReportPage, SellersRange } from '../../lib/api-types';
import { formatMoney, intlLocale } from '../../lib/format';
import { returnReasonKey } from '../../lib/return-reasons';
import AppLink from '../../../shared/AppLink';
import { useBranch } from '../../components/BranchProvider';
import { useAreas, useSession } from '../../components/SessionProvider';
import { sellsOnMarketplaces } from '../../lib/order-channels';

const RANGES: readonly SellersRange[] = ['last_7_days', 'this_month', 'last_month', 'last_3_months', 'this_year'];

/**
 * Jira GRW-635 — what came back, and why.
 *
 * Customer returns grouped by the reason they were given, the most first, so "size didn't fit — 18" is one number at a glance. A parcel that came
 * back UNDELIVERED is its own card, never inside the customer returns: it is a courier problem, not a returns problem, and lumping the two would
 * hide one behind the other. A return with no reason (the counter does not ask) is "no reason given", counted and not dropped. The words are
 * plain: nothing here is called by the trade's short name for an undelivered parcel.
 */
export function ReturnsClient() {
  const ships = sellsOnMarketplaces(useAreas());
  const t = useTranslations('orders.returns');
  const tr = useTranslations('orders.returnReasons');
  const tm = useTranslations('orders.tiles.modes');
  const locale = useLocale();
  const session = useSession();
  const branches = session?.branches ?? [];
  const branchContext = useBranch();
  const branch = branchContext.ready && branchContext.multi ? (branchContext.choice ?? '') : '';
  const ready = branchContext.ready || branches.length <= 1;
  const [range, setRange] = useState<SellersRange>('last_7_days');
  const [data, setData] = useState<ReturnsReportPage | null>(null);
  const [failed, setFailed] = useState(false);
  const seq = useRef(0);
  const count = (n: number) => new Intl.NumberFormat(intlLocale(locale)).format(n);
  const money = (minor: string | number) => formatMoney(minor, 'INR', locale);
  const modeName = (mode: string | null) => (mode && tm.has(mode as 'cash') ? tm(mode as 'cash') : t('modeOther'));
  const when = new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: session?.timezone ?? 'Asia/Kolkata' });
  const day = new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'short', timeZone: session?.timezone ?? 'Asia/Kolkata' });

  const load = useCallback(async () => {
    if (!ready) return;
    const mine = ++seq.current;
    setFailed(false);
    try {
      const res = await api.returnsReport({ range, location: branch || undefined });
      if (mine === seq.current) setData(res);
    } catch {
      if (mine === seq.current) setFailed(true);
    }
  }, [ready, range, branch]);
  useEffect(() => {
    setData(null);
    void load();
  }, [load]);

  return (
    <div className="srp srp-returns">
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
      ) : !data.anyReturns ? (
        <div className="srp-empty" role="status">
          <p className="srp-empty-title">{t('nothing')}</p>
          <p className="srp-hint">{t('nothingHint')}</p>
        </div>
      ) : (
        <>
          {/*
            Owner, 2026-11-28 — "what items returned and the refund amount". The money given back first, then each return:
            which items, how many, how much, how it was given back and from which bill. The counts by reason, who gave it
            back and the undelivered parcels are drawn only when they say something (a reason was given, more than one
            person, a parcel came back): "No reason given 2" and "0 undelivered" were noise on every shop's screen.
          */}
          <section className="srp-totals" aria-label={t('customerTitle')}>
            <p className="srp-worth-label">{t('givenBack')}</p>
            <p className="srp-worth">{money(data.refundMinor ?? '0')}</p>
            <p className="srp-hint">
              {t('returnsCount', { count: data.customer.returns })} · {t('unitsCount', { count: data.customer.units })}
            </p>
            {(data.byMode ?? []).length > 0 ? (
              <p className="srp-hint">{(data.byMode ?? []).map((m) => `${modeName(m.mode)} ${money(m.refundMinor)}`).join(' · ')}</p>
            ) : null}
          </section>

          {(data.recent ?? []).length > 0 ? (
            <section aria-label={t('listTitle')}>
              <p className="srp-worth-label">{t('listTitle')}</p>
              <ul className="srp-list ret-list">
                {(data.recent ?? []).map((r) => (
                  <li key={r.id} className="srp-card ret-row">
                    <div className="srp-head">
                      <h2 className="srp-name">
                        {r.items.length > 0 ? r.items.map((i) => (i.qty > 1 ? `${i.name} × ${count(i.qty)}` : i.name)).join(', ') : t('noItems')}
                      </h2>
                      <p className="srp-value">{money(r.refundMinor)}</p>
                    </div>
                    <p className="srp-hint">
                      {[when.format(new Date(r.returnedAt)), Number(r.refundMinor) > 0 ? modeName(r.refundMode) : null, r.kind === 'undelivered' ? t('undeliveredShort') : null].filter(Boolean).join(' · ')}
                    </p>
                    <p className="srp-hint">
                      {r.saleId ? (
                        <AppLink className="ret-bill" href={`/orders/${r.saleId}`}>
                          {t('fromBill', { code: r.code ?? '', date: r.soldAt ? day.format(new Date(r.soldAt)) : '' })}
                        </AppLink>
                      ) : null}
                      {r.customerName ? ` · ${r.customerName}` : ''}
                      {r.by ? ` · ${t('byShort', { name: r.by })}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {data.byReason.some((b) => b.reason !== 'not_said') ? (
            <section aria-label={t('whyTitle')}>
              <p className="srp-worth-label">{t('whyTitle')}</p>
              <ul className="srp-list">
                {data.byReason.map((b) => (
                  <li key={b.reason} className="srp-card">
                    <div className="srp-head">
                      <h2 className="srp-name">{tr(returnReasonKey(b.reason))}</h2>
                      <p className="srp-value">{count(b.returns)}</p>
                    </div>
                    <p className="srp-hint">{t('unitsCount', { count: b.units })}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/*
            Owner, 2026-11-14 (returns QA, loophole 2) — who gave money back, the most money first. With one person it is
            the same figure as the total above, so it is drawn from two people up.
          */}
          {(data.byPerson ?? []).length > 1 ? (
            <section aria-label={t('byTitle')}>
              <p className="srp-worth-label">{t('byTitle')}</p>
              <ul className="srp-list">
                {(data.byPerson ?? []).map((p) => (
                  <li key={`${p.name ?? ''}-${p.role ?? ''}`} className="srp-card">
                    <div className="srp-head">
                      <h2 className="srp-name">{p.name || (p.role ? t(`byRole.${p.role}` as 'byRole.owner') : t('byNone'))}</h2>
                      <p className="srp-value">{formatMoney(p.refundMinor, 'INR', locale)}</p>
                    </div>
                    <p className="srp-hint">{t('returnsCount', { count: p.returns })}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* Owner, 2026-10-24 — only a parcel comes back undelivered; and the card is drawn only when one did. */}
          {ships && data.undelivered.returns > 0 ? (
            <section className="srp-totals" aria-label={t('undeliveredTitle')}>
              <p className="srp-worth-label">{t('undeliveredTitle')}</p>
              <p className="srp-worth">{t('returnsCount', { count: data.undelivered.returns })}</p>
              <p className="srp-hint">{t('unitsCount', { count: data.undelivered.units })}</p>
              <p className="srp-hint">{t('undeliveredNote')}</p>
            </section>
          ) : null}
        </>
      )}
      {/* The Refunds screen is the marketplaces' record; a shop that sells only at its counter has none. */}
      {ships ? (
        <div className="srp-links">
          <AppLink className="btn btn-ghost srp-export" href="/orders/refunds">
            {t('toRefunds')}
          </AppLink>
        </div>
      ) : null}
    </div>
  );
}
