'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import AppLink from '../../shared/AppLink';
import { api } from '../lib/api';
import type { DiaryReportPage } from '../lib/api-types';
import { formatMoney, intlLocale } from '../lib/format';
import { segmentRangeValues } from '../lib/segment-range';
import { useNoProvider } from '../lib/use-no-provider';
import { useLabel } from '../components/LabelsProvider';
import { useBranch } from '../components/BranchProvider';
import { useSession } from '../components/SessionProvider';
import { ReportDates } from './ReportDates';
import { type ChangedEnd, clampReportRange, defaultReportRange, todayInZone } from '../lib/report-dates';
import { bucketDays, type ChartBucket, namedTicks } from '../lib/report-buckets';
import { useLabelBudget } from '../lib/use-label-budget';

/**
 * Jira GRW-591 — the diary report: four questions, four cards, one line each to act on.
 *
 * The counter report's mirror (`CounterReport.tsx`), and deliberately the same shape: an owner who runs a
 * salon and a kitchen should not have to learn two screens. What differs is the questions, because that
 * is the whole decision — a kitchen asks which dishes earn and when the rush is, a salon asks who on the
 * floor earns it, what people come in for, and who has not come back.
 *
 * ## The fourth card is the one worth money
 *
 * The recency bands are here and not on the counter report, because a salon client fifty days away is a
 * problem one message fixes and a restaurant guest fifty days away is a Tuesday. The band WORDS come from
 * the `customers` message group — the same ones the Clients list prints — so a client cannot be "Slipping
 * away" on one screen and something else on the other. The names beside them are the few worth a message
 * now, and "Message them" goes to What to do, which already has the sheet that sends it; a second way to
 * send the same message is a second thing to keep right.
 *
 * ## Sentences are built here, never sent
 *
 * The API gives `{ name, pct }`, `{ key: 'unassigned' }`, `{ days }`. Weekday names come from `Intl`.
 * `reports-i18n.test.ts` exists because an English sentence in a payload is a screen Hindi cannot render.
 */


/** Bars shorter than this are invisible; a day that took something must never look like one that took nothing. */
const MIN_BAR_PCT = 4;

export function DiaryReport() {
  const t = useTranslations('diaryReport');
  const session = useSession();
  const branches = session?.branches ?? [];
  const branchContext = useBranch();
  const branch = branchContext.ready && branchContext.multi ? (branchContext.choice ?? '') : '';
  const ready = branchContext.ready || branches.length <= 1;
  // Today where the business is: an owner reading this abroad still gets their own day.
  const todayISO = useMemo(() => todayInZone(session?.timezone), [session?.timezone]);
  const [dates, setDates] = useState(() => defaultReportRange(todayISO));
  const [data, setData] = useState<DiaryReportPage | null>(null);
  const [failed, setFailed] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!ready) return;
    const mine = ++seq.current;
    setFailed(false);
    try {
      const res = await api.diaryReport({ range: 'custom', from: dates.fromISO, to: dates.toISO, location: branch || undefined });
      // A reply from a range the owner has already moved on from must not overwrite the one they are reading.
      if (mine === seq.current) setData(res);
    } catch {
      if (mine === seq.current) setFailed(true);
    }
  }, [ready, dates.fromISO, dates.toISO, branch]);
  useEffect(() => {
    setData(null);
    void load();
  }, [load]);

  /*
   * A half-typed date is not a period. A native date field reports an empty value until every part of it is
   * filled, so applying each keystroke would send the report back to its default week between two digits —
   * the Sales filter refuses an incomplete pair the same way.
   */
  const changeDates = (fromISO: string, toISO: string, changed: ChangedEnd) => {
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    if (!iso.test(fromISO) || !iso.test(toISO)) return;
    setDates(clampReportRange(fromISO, toISO, todayISO, changed));
  };

  return (
    <div className="cr">
      <div className="cr-toolbar">
        <ReportDates
          from={dates.fromISO}
          to={dates.toISO}
          today={todayISO}
          labels={{ group: t('rangeLabel'), from: t('from'), to: t('to') }}
          onChange={changeDates}
        />
      </div>

      {failed ? (
        <div className="ord-state" role="alert">
          <p>{t('loadError')}</p>
          <button type="button" className="btn" onClick={() => void load()}>
            {t('retry')}
          </button>
        </div>
      ) : data === null ? (
        <div className="cr-card cr-skeleton" aria-busy="true" />
      ) : (
        <DiaryCards data={data} />
      )}
    </div>
  );
}

/**
 * The cards themselves, from a payload — no fetching, no range, no session.
 *
 * Split out so the screen can be rendered in both languages from a fixture (`diary-report.test.ts`): this
 * app has no jsdom, so a component that can only show its figures after an effect has run is one no test
 * can read.
 */
export function DiaryCards({ data }: { data: DiaryReportPage }) {
  const t = useTranslations('diaryReport');
  const barsRef = useRef<HTMLUListElement>(null);
  const tc = useTranslations('customers');
  const locale = useLocale();
  /*
   * "No Stylist" / "कोई स्टाफ़ नहीं" — built from `common.noProvider` and the business's own word for a
   * provider, never a string of this screen's own. One meaning keeps one word (`no-stylist-i18n.test.ts`),
   * and a second copy here would be a fifth wording for a clinic to disagree with.
   */
  const noProvider = useNoProvider();
  // The business's own word for what it books — "services", "treatments", "jobs" (ctx.labels).
  const serviceWord = useLabel('services', 'services').toLowerCase();
  const money = useCallback((minor: string | number | null) => formatMoney(minor, 'INR', locale), [locale]);

  // 1 Jan 2024 was a Monday, so `Date.UTC(2024, 0, dow)` is that weekday for dow 1–7. Formatted in UTC so
  // the reference date cannot slide a day in a western zone.
  const dayLetter = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(intlLocale(locale), { weekday: 'short', timeZone: 'UTC' });
    return (dow: number) => fmt.format(new Date(Date.UTC(2024, 0, dow)));
  }, [locale]);

  if (!data.anyVisits) {
    return (
      <div className="cr-card">
        <div className="empty">
          <p>
            <strong>{t('nothingTitle')}</strong>
          </p>
          <p className="muted">{t('nothingBody')}</p>
        </div>
      </div>
    );
  }

  const { takings, people, services, back } = data;
  // `|| 1` is the divisor's floor, not the bar's: a period whose every figure is zero must not divide by it.
  /*
   * Owner, 2026-11-02 — a month is drawn as weeks and a year as months. One column per day was right while
   * the longest period on offer was a week; asked for the whole of October it was 33 columns 6px wide under
   * a weekday printed on top of the next one.
   */
  const { unit: barUnit, buckets: bars } = useMemo(() => bucketDays(takings.byDay), [takings.byDay]);
  const barLabel = useMemo(() => {
    const l = intlLocale(locale);
    const dayNum = new Intl.DateTimeFormat(l, { day: 'numeric', timeZone: 'UTC' });
    const dayMonth = new Intl.DateTimeFormat(l, { day: 'numeric', month: 'short', timeZone: 'UTC' });
    const monthOnly = new Intl.DateTimeFormat(l, { month: 'short', timeZone: 'UTC' });
    const at = (b: ChartBucket) => new Date(`${b.startISO}T00:00:00Z`);
    return {
      /* Printed under the column, on the ones there is room for. A weekday still names a week of days, which
         is what an owner reads every morning; past that it is the date, which does not repeat. */
      tick: (b: ChartBucket) =>
        barUnit === 'month'
          ? monthOnly.format(at(b))
          : barUnit === 'week'
            ? dayMonth.format(at(b))
            : bars.length <= 7
              ? dayLetter(b.dow)
              : dayNum.format(at(b)),
      /* Heard for EVERY column, named or not: thinning the axis must not take the figures off the screen
         for somebody listening to it. */
      full: (b: ChartBucket) => dayMonth.format(at(b)),
    };
  }, [locale, barUnit, bars.length, dayLetter]);
  /* The widest label this axis would print, measured rather than guessed at: it decides how many fit. */
  const widestTick = useMemo(
    () => bars.map((b) => barLabel.tick(b)).reduce((a, b) => (b.length > a.length ? b : a), ''),
    [bars, barLabel],
  );
  const labelBudget = useLabelBudget(barsRef, widestTick, bars.length);
  const barNamed = useMemo(() => namedTicks(bars.length, labelBudget), [bars.length, labelBudget]);
  const dayPeak = Math.max(...bars.map((b) => b.valueMinor), 1);
  const peoplePeak = Math.max(...(people?.rows ?? []).map((r) => Number(r.valueMinor)), 1);
  const servicePeak = Math.max(...services.rows.map((r) => Number(r.valueMinor)), 1);
  const difference = takings.differenceMinor === null ? null : Number(takings.differenceMinor);
  // The one row the API names itself; everything else is the business's own word for it.
  const nameOf = (row: { name: string; key?: 'unassigned' }) => (row.key === 'unassigned' ? noProvider : row.name);

  return (
    <>
      <section className="cr-card cr-took" aria-labelledby="dr-took-h">
        <h2 className="cr-label" id="dr-took-h">
          {t('took.label')}
        </h2>
        <p className="cr-hero">{money(takings.totalMinor)}</p>
        <p className={`cr-delta ${difference === null || difference === 0 ? '' : difference > 0 ? 'is-up' : 'is-down'}`}>
          {difference === null
            ? t('took.noPrior')
            : difference === 0
              ? t('took.same')
              : difference > 0
                ? t('took.more', { amount: money(difference) })
                : t('took.less', { amount: money(-difference) })}
        </p>
        <p className="cr-sub">
          {t('took.visits', { n: takings.visits })}
          {takings.averageVisitMinor === null ? null : ` · ${t('took.average', { amount: money(takings.averageVisitMinor) })}`}
        </p>
        <ul className="cr-bars cr-bars-day" ref={barsRef}>
          {bars.map((b, i) => (
            <li key={b.startISO} className="cr-bar-col">
              <span className="cr-bar-slot">
                <span
                  className="cr-bar"
                  style={{ height: `${b.valueMinor === 0 ? 0 : Math.max(MIN_BAR_PCT, (b.valueMinor / dayPeak) * 100)}%` }}
                />
              </span>
              <span className="cr-bar-tick">{barNamed(i) ? barLabel.tick(b) : ''}</span>
              <span className="sr-only">
                {barLabel.full(b)} {money(b.valueMinor)}
              </span>
            </li>
          ))}
        </ul>
        {/*
          QA 2026-10-27 (L1) — the two cards below count SERVICES; the headline also counts what was sold
          off the shelf and over the counter. Their shares are of the service money, so they still add up
          to 100 — and this line is what stops the difference being invisible. Without it a ₹3,000 shampoo
          sale moved every stylist's share down and nothing on screen said why.
        */}
        {Number(takings.otherMinor) > 0 ? (
          <p className="cr-aside">{t('took.fromTheShelf', { amount: money(takings.otherMinor), service: serviceWord })}</p>
        ) : null}
        {/*
          The number this product exists to push down, so it sits on the money card and not in a tab —
          and priced, since QA L5: counting the misses without saying what they cost is the one thing
          that stops the owner seeing them fall in money. Unpriced only when the bookings carried no
          quote at all.
        */}
        {takings.noShows > 0 ? (
          <p className="cr-say cr-say-warn">
            {Number(takings.noShowMinor) > 0
              ? t('took.noShowsWorth', { n: takings.noShows, amount: money(takings.noShowMinor) })
              : t('took.noShows', { n: takings.noShows })}
          </p>
        ) : null}
      </section>

      {people ? (
        <section className="cr-card" aria-labelledby="dr-people-h">
          <h2 className="cr-title" id="dr-people-h">
            {t('people.title')}
          </h2>
          <ul className="cr-rows">
            {people.rows.map((row) => (
              <li key={row.id} className="cr-row">
                <span className="cr-row-line">
                  <span className="cr-row-name">{nameOf(row)}</span>
                  <span className="cr-row-qty">{row.count}</span>
                  <span className="cr-row-money">{money(row.valueMinor)}</span>
                </span>
                <span className="cr-row-track">
                  <span
                    className="cr-row-fill"
                    style={{ width: `${Math.max(MIN_BAR_PCT, (Number(row.valueMinor) / peoplePeak) * 100)}%` }}
                  />
                </span>
              </li>
            ))}
          </ul>
          {people.distinct > people.rows.length ? (
            <p className="cr-sub">{t('people.others', { n: people.distinct - people.rows.length })}</p>
          ) : null}
          {people.leader ? (
            <p className="cr-say">{t('people.leader', { name: nameOf(people.leader), pct: people.leader.sharePct })}</p>
          ) : (
            <p className="cr-aside">{t('people.nothing')}</p>
          )}
        </section>
      ) : null}

      <section className="cr-card" aria-labelledby="dr-serv-h">
        <h2 className="cr-title" id="dr-serv-h">
          {t('services.title')}
        </h2>
        <ul className="cr-rows">
          {services.rows.map((row) => (
            <li key={row.id} className="cr-row">
              <span className="cr-row-line">
                <span className="cr-row-name">{row.name}</span>
                <span className="cr-row-money">{money(row.valueMinor)}</span>
              </span>
              <span className="cr-row-track">
                <span
                  className="cr-row-fill"
                  style={{ width: `${Math.max(MIN_BAR_PCT, (Number(row.valueMinor) / servicePeak) * 100)}%` }}
                />
              </span>
            </li>
          ))}
        </ul>
        {services.leader ? (
          <p className="cr-say cr-say-warn">{t('services.leader', { name: services.leader.name, pct: services.leader.sharePct })}</p>
        ) : (
          <p className="cr-aside">{t('services.nothing')}</p>
        )}
        {/*
          Jira GRW-591, found on the salon's own data: a book of fifty services and ten visits in a week
          leaves forty-five "barely booked", and naming five of them in alphabetical order said nothing —
          the five shown were arbitrary, because every one sat at zero. Past what it can honestly name,
          the card gives the count against the menu instead, which is the fact worth having: your menu is
          bigger than your week.
        */}
        {services.slowTotal === 0 ? null : (
          <p className="cr-aside">
            {services.slowTotal > services.slow.length
              ? t('services.slowCount', { n: services.slowTotal, menu: services.menuTotal })
              : t('services.slow', { names: services.slow.map((s) => s.name).join(', ') })}
          </p>
        )}
      </section>

      <section className="cr-card" aria-labelledby="dr-back-h">
        <h2 className="cr-title" id="dr-back-h">
          {t('back.title')}
        </h2>
        <ul className="dr-bands">
          {back.segments.map((seg) => (
            <li key={seg.key} className={`dr-band is-${seg.key}`}>
              <span className="dr-band-count">{seg.count}</span>
              {/* The Clients list's own words, so a client cannot be in two bands by two names. */}
              <span className="dr-band-label">{tc(`segments.${seg.key}.label`)}</span>
              <span className="dr-band-range">{tc(`segments.${seg.key}.range`, segmentRangeValues(seg.key, seg.range))}</span>
            </li>
          ))}
        </ul>
        {back.worthACallTotal === 0 ? (
          <p className="cr-aside">{t('back.nobody')}</p>
        ) : (
          <>
            <p className="cr-say">{t('back.worthACall', { n: back.worthACallTotal })}</p>
            <ul className="dr-calls">
              {back.worthACall.map((c) => (
                <li key={c.customerId} className="dr-call">
                  <span className="cr-row-name">{c.name}</span>
                  <span className="dr-call-meta">
                    {t('back.lastIn', { days: c.lastVisitDays })} · {t('back.worth', { amount: money(c.avgTicketMinor) })}
                  </span>
                </li>
              ))}
            </ul>
            {/* What to do already owns the sheet that sends the message; a second one is a second thing to keep right. */}
            <AppLink className="btn btn-ghost dr-message" href="/reports?tab=todo">
              {t('back.message')}
            </AppLink>
          </>
        )}
      </section>
    </>
  );
}
