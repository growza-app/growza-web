'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '../lib/api';
import type { CounterReportPage } from '../lib/api-types';
import { formatMoney, intlLocale } from '../lib/format';
import { useBranch } from '../components/BranchProvider';
import { useSession } from '../components/SessionProvider';
import { ReportDates } from './ReportDates';
import { type ChangedEnd, clampReportRange, defaultReportRange, todayInZone } from '../lib/report-dates';
import { bucketDays, type ChartBucket, namedTicks } from '../lib/report-buckets';

/**
 * Jira GRW-591 — the counter report: four questions, four cards, one line each to act on.
 *
 * Owner, 2026-10-27: *"most of the information is useless and ui is not good and it's for all verticals,
 * Not providing value to owner"*. What replaced it is not more tabs. Each card asks ONE question, answers
 * it with one figure and a chart that is only evidence, and ends in a sentence in the owner's own words —
 * "Biryani is 31% of everything you earn", not a share column he has to read a percentage out of.
 *
 * ## Why the sentences are built here and not sent
 *
 * The API sends `{ name, pct }`, `{ fromHour, toHour }`, `{ dow, valueMinor }` — numbers and keys, never
 * prose. `reports-i18n.test.ts` exists because an English sentence in a payload is a screen Hindi cannot
 * render; weekday and hour names come from `Intl` for the same reason, so neither language keeps a list
 * of seven day names that the other can drift from.
 *
 * ## Phone first
 *
 * Laid out at 344px (a folded Galaxy Z Fold, the narrowest screen in the device matrix) and widened from
 * there: one column of cards, bars sized by flex rather than by a fixed width, and no table anywhere — a
 * dish name, a count and an amount in a row is readable on a phone in a kitchen; four columns are not.
 */

/**
 * The periods this report offers. A counter business's unit is the WEEK, so that is what it opens on.
 *
 * Its own union rather than `ReportRangeKey`: that type also carries `today` (a day is not a period you
 * compare dishes across) and `custom` (which needs a date picker this screen does not have), and naming
 * them here is what makes `t('range.' + r)` type-check against the five keys that exist in the messages.
 */

/** Bars shorter than this are invisible; an hour that took something must never look like one that took nothing. */
const MIN_BAR_PCT = 4;

export function CounterReport() {
  const t = useTranslations('counterReport');
  const session = useSession();
  const branches = session?.branches ?? [];
  const branchContext = useBranch();
  const branch = branchContext.ready && branchContext.multi ? (branchContext.choice ?? '') : '';
  const ready = branchContext.ready || branches.length <= 1;
  // Today where the business is: an owner reading this abroad still gets their own day.
  const todayISO = useMemo(() => todayInZone(session?.timezone), [session?.timezone]);
  const [dates, setDates] = useState(() => defaultReportRange(todayISO));
  const [data, setData] = useState<CounterReportPage | null>(null);
  const [failed, setFailed] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!ready) return;
    const mine = ++seq.current;
    setFailed(false);
    try {
      const res = await api.counterReport({ range: 'custom', from: dates.fromISO, to: dates.toISO, location: branch || undefined });
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
        <CounterCards data={data} />
      )}
    </div>
  );
}

/**
 * The four cards themselves, from a payload — no fetching, no range, no session.
 *
 * Split out so the screen can be rendered in both languages from a fixture (`counter-report.test.ts`):
 * this app has no jsdom, so a component that can only show its figures after an effect has run is a
 * component no test can read.
 */
export function CounterCards({ data }: { data: CounterReportPage }) {
  const t = useTranslations('counterReport');
  const locale = useLocale();
  const money = useCallback((minor: string | number | null) => formatMoney(minor, 'INR', locale), [locale]);

  /*
   * Weekday and hour names from Intl against a fixed reference week, never a list in the message files:
   * 1 Jan 2024 was a Monday, so `Date.UTC(2024, 0, dow)` is that weekday for dow 1–7. Formatted in UTC so
   * the reference date cannot slide a day in a western zone.
   */
  const dayName = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(intlLocale(locale), { weekday: 'long', timeZone: 'UTC' });
    return (dow: number) => fmt.format(new Date(Date.UTC(2024, 0, dow)));
  }, [locale]);
  const dayLetter = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(intlLocale(locale), { weekday: 'short', timeZone: 'UTC' });
    return (dow: number) => fmt.format(new Date(Date.UTC(2024, 0, dow)));
  }, [locale]);
  const hourName = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(intlLocale(locale), { hour: 'numeric', timeZone: 'UTC' });
    // Hour 24 is midnight at the END of the day: an evening rush of 21:00–24:00 must not read "9 pm – 12 am".
    return (hour: number) => fmt.format(new Date(Date.UTC(2024, 0, 1, hour % 24)));
  }, [locale]);

  if (!data.anySales) {
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

  const { takings, earners, busy, changed } = data;
  // `|| 1` is the divisor's floor, not the bar's: a period whose every figure is zero must not divide by it.
  /*
   * Owner, 2026-11-02 — a month is drawn as weeks and a year as months. One column per day was right while
   * the longest period on offer was a week; asked for the whole of October it was 33 columns 6px wide under
   * a weekday printed on top of the next one.
   */
  const { unit: barUnit, buckets: bars } = useMemo(() => bucketDays(takings.byDay), [takings.byDay]);
  const barNamed = useMemo(() => namedTicks(bars.length), [bars.length]);
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
  const dayPeak = Math.max(...bars.map((b) => b.valueMinor), 1);
  const hourPeak = Math.max(...busy.byHour.map((h) => Number(h.valueMinor)), 1);
  const topValue = Math.max(...earners.rows.map((r) => Number(r.valueMinor)), 1);
  const difference = takings.differenceMinor === null ? null : Number(takings.differenceMinor);
  const moreOthers = earners.distinct - earners.rows.length;

  return (
    <>
      <section className="cr-card cr-took" aria-labelledby="cr-took-h">
        <h2 className="cr-label" id="cr-took-h">
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
          {t('took.bills', { n: takings.bills })}
          {takings.averageBillMinor === null
            ? null
            : ` · ${t('took.average', { amount: money(takings.averageBillMinor) })}`}
        </p>
        <ul className="cr-bars cr-bars-day">
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
      </section>

      <section className="cr-card" aria-labelledby="cr-earn-h">
        <h2 className="cr-title" id="cr-earn-h">
          {t('earners.title')}
        </h2>
        <ul className="cr-rows">
          {earners.rows.map((row) => (
            <li key={row.id} className="cr-row">
              <span className="cr-row-line">
                <span className="cr-row-name">{row.name}</span>
                <span className="cr-row-qty">{row.qty}</span>
                <span className="cr-row-money">{money(row.valueMinor)}</span>
              </span>
              <span className="cr-row-track">
                <span
                  className="cr-row-fill"
                  style={{ width: `${Math.max(MIN_BAR_PCT, (Number(row.valueMinor) / topValue) * 100)}%` }}
                />
              </span>
            </li>
          ))}
        </ul>
        {moreOthers > 0 ? <p className="cr-sub">{t('earners.others', { n: moreOthers })}</p> : null}
        {earners.leader ? (
          <p className="cr-say cr-say-warn">
            {t('earners.leader', { name: earners.leader.name, pct: earners.leader.sharePct })}
          </p>
        ) : null}
        {/*
          Jira GRW-591, found on the salon's own data: a book of fifty services and ten visits in a week
          leaves forty-five "barely booked", and naming five of them in alphabetical order said nothing —
          the five shown were arbitrary, because every one sat at zero. Past what it can honestly name,
          the card gives the count against the menu instead, which is the fact worth having: your menu is
          bigger than your week.
        */}
        {earners.slowTotal === 0 ? null : (
          <p className="cr-aside">
            {earners.slowTotal > earners.slow.length
              ? t('earners.slowCount', { n: earners.slowTotal, menu: earners.menuTotal })
              : t('earners.slow', { names: earners.slow.map((s) => s.name).join(', ') })}
          </p>
        )}
      </section>

      <section className="cr-card" aria-labelledby="cr-busy-h">
        <h2 className="cr-title" id="cr-busy-h">
          {t('busy.title')}
        </h2>
        {busy.peak === null ? (
          <p className="cr-aside">{t('busy.notEnough')}</p>
        ) : (
          <>
            <ul className="cr-bars cr-bars-hour">
              {busy.byHour.map((h, i, all) => {
                const inPeak = h.hour >= busy.peak!.fromHour && h.hour < busy.peak!.toHour;
                /*
                 * A kitchen trades fourteen hours and a phone is 344px wide: "11 am" under every column
                 * needs 34px and has 24. Turning them on their side put them through the top of the card,
                 * so only every third hour is named, with the ends always named so the axis has a range.
                 * The column itself is still there for every hour — it is the LABEL that thins out.
                 */
                const named = i === 0 || i === all.length - 1 || h.hour % 3 === 0;
                return (
                  <li key={h.hour} className="cr-bar-col">
                    <span className="cr-bar-slot">
                      <span
                        className={`cr-bar ${inPeak ? 'is-peak' : ''}`}
                        style={{ height: `${Math.max(MIN_BAR_PCT, (Number(h.valueMinor) / hourPeak) * 100)}%` }}
                      />
                    </span>
                    <span className="cr-bar-tick">{named ? hourName(h.hour) : ''}</span>
                    <span className="sr-only">{hourName(h.hour)} {money(h.valueMinor)}</span>
                  </li>
                );
              })}
            </ul>
            <p className="cr-say">
              {t('busy.peak', { from: hourName(busy.peak.fromHour), to: hourName(busy.peak.toHour) })}
            </p>
          </>
        )}
        {busy.quietestDay ? (
          <p className="cr-aside">
            {t('busy.quietest', { day: dayName(busy.quietestDay.dow), amount: money(busy.quietestDay.valueMinor) })}
          </p>
        ) : null}
      </section>

      <section className="cr-card" aria-labelledby="cr-chg-h">
        <h2 className="cr-title" id="cr-chg-h">
          {t('changed.title')}
        </h2>
        {!data.previous.hasData ? (
          <p className="cr-aside">{t('changed.noPrior')}</p>
        ) : changed.up.length === 0 && changed.down.length === 0 ? (
          <p className="cr-aside">{t('changed.steady')}</p>
        ) : (
          <ul className="cr-moves">
            {changed.up.map((m) => (
              <li key={m.id} className="cr-move is-up">
                <span className="cr-move-name">{m.name}</span>
                <span className="cr-move-delta">{t('changed.up', { n: m.deltaQty })}</span>
              </li>
            ))}
            {changed.down.map((m) => (
              <li key={m.id} className="cr-move is-down">
                <span className="cr-move-name">{m.name}</span>
                <span className="cr-move-delta">{t('changed.down', { n: -m.deltaQty })}</span>
              </li>
            ))}
          </ul>
        )}
        {takings.previousAverageBillMinor !== null && takings.averageBillMinor !== null ? (
          <p
            className={`cr-move-bill ${takings.averageBillMinor >= takings.previousAverageBillMinor ? 'is-up' : 'is-down'}`}
          >
            <span className="cr-move-name">{t('changed.averageBill')}</span>
            <span className="cr-move-delta">
              {money(takings.previousAverageBillMinor)} → {money(takings.averageBillMinor)}
            </span>
          </p>
        ) : null}
      </section>
    </>
  );
}
