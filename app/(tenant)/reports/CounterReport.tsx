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
import { useLabelBudget } from '../lib/use-label-budget';
import { usePhoneLayout } from '../components/home/use-phone-layout';

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
  const [openHours, setOpenHours] = useState<OpenHours | null>(null);
  const seq = useRef(0);

  /*
   * Owner, 14 Nov 2026 — "show only open hours". The branch's opening hours, from Settings. Best effort: a role
   * that may not read Settings, or a branch with no hours yet, gets the chart from first sale to last as before.
   */
  useEffect(() => {
    if (!ready) return;
    let live = true;
    api
      .settings(branch || undefined)
      .then((st) => {
        if (live) setOpenHours(openingWindow(st.workingHours));
      })
      .catch(() => {
        if (live) setOpenHours(null);
      });
    return () => {
      live = false;
    };
  }, [ready, branch]);

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
        <CounterCards data={data} openHours={openHours} />
      )}
    </div>
  );
}

/** The hours a branch is open, as whole clock hours: from the earliest opening to the latest closing in the week. */
export type OpenHours = { fromHour: number; toHour: number };

/**
 * One window for the week, so the chart's columns do not change with the day. `toHour` is exclusive and rounds
 * up (a 22:30 close keeps the 10 pm column). A row that closes after midnight, or no rows, gives no window, and
 * the chart falls back to the hours that sold.
 */
export function openingWindow(rows: ReadonlyArray<{ startTime: string; endTime: string }> | undefined): OpenHours | null {
  if (!rows || rows.length === 0) return null;
  const mins = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  };
  let from = 24 * 60;
  let to = 0;
  for (const r of rows) {
    const a = mins(r.startTime);
    const b = mins(r.endTime) === 0 ? 24 * 60 : mins(r.endTime);
    if (b <= a) return null;
    from = Math.min(from, a);
    to = Math.max(to, b);
  }
  return { fromHour: Math.floor(from / 60), toHour: Math.ceil(to / 60) };
}

/**
 * The four cards themselves, from a payload — no fetching, no range, no session.
 *
 * Split out so the screen can be rendered in both languages from a fixture (`counter-report.test.ts`):
 * this app has no jsdom, so a component that can only show its figures after an effect has run is a
 * component no test can read.
 */
export function CounterCards({ data, openHours = null }: { data: CounterReportPage; openHours?: OpenHours | null }) {
  /*
   * Owner, 14 Nov 2026 — "revert all changes for mobile". Everything this card gained that day (each day's amount,
   * every open hour as a column, the busiest hour's figure, the closed-hours line) is the laptop's; a phone draws
   * the card exactly as develop did. False on the server, so a fixture renders the laptop's card.
   */
  const phone = usePhoneLayout();
  const t = useTranslations('counterReport');
  const barsRef = useRef<HTMLUListElement>(null);
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
    return (hour: number) => {
      const raw = fmt.format(new Date(Date.UTC(2024, 0, 1, hour % 24)));
      return locale === 'hi' ? raw.replace(/\bam\b/i, 'सुबह').replace(/\bpm\b/i, 'शाम') : raw;
    };
  }, [locale]);

  const { takings, earners, busy, changed, strategy } = data;
  const channelLabel = useCallback(
    (ch: string) =>
      ch === 'counter'
        ? t('mix.channelCounter')
        : ch === 'swiggy'
          ? t('mix.channelSwiggy')
          : ch === 'zomato'
            ? t('mix.channelZomato')
            : ch === 'flipkart'
              ? t('mix.channelFlipkart')
              : ch === 'amazon'
                ? t('mix.channelAmazon')
                : ch,
    [t],
  );
  const modeLabel = useCallback(
    (mode: string) =>
      mode === 'upi'
        ? t('mix.modeUpi')
        : mode === 'cash'
          ? t('mix.modeCash')
          : mode === 'card'
            ? t('mix.modeCard')
            : mode === 'other'
              ? t('mix.modeOther')
              : t('mix.modeNotRecorded'),
    [t],
  );
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

  const dayPeak = Math.max(...bars.map((b) => b.valueMinor), 1);
  /*
   * Jira GRW-679 (UX-11) — which day was the best, when there was one. The seven bars were all one pale green with
   * no figure anywhere on them, so the chart said "some days were bigger" and not how big. The tallest is drawn in the
   * accent (as the busiest hours already are, below) and carries its amount; the rest are told from it by height.
   * No peak when nothing was taken: seven empty columns have no best day.
   */
  /* A week's bars each carry their figure; a month's thirty would collide, so there only the best day does. */
  const everyFigure = !phone && bars.length <= 7;
  /** "₹1,180" while it fits a seventh of a phone; "₹12K", "₹1.5L" past ₹9,999. Indian grouping either way. */
  const barAmount = (minor: number) =>
    minor < 1_000_000 ? money(minor) : `₹${new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(minor / 100)}`;
  const peakDay = bars.reduce((best, b, i) => (b.valueMinor > 0 && (best === -1 || b.valueMinor > bars[best]!.valueMinor) ? i : best), -1);
  /** A per-order average in whole rupees: "₹299 per order". The paise of an average are not anybody's money. */
  const wholeRupees = (minor: number) => Math.round(minor / 100) * 100;
  const addOnMinor = Math.max(1000, Math.round((takings.averageBillMinor ?? 0) / 10 / 1000) * 1000);

  /*
   * Owner, 14 Nov 2026 ("can we improve this") — the API sends only the hours that sold, and the chart drew them
   * side by side: 4 am sat next to 10 am as if they were an hour apart, and the rush looked like any two bars.
   * Every hour from the first sale to the last now gets a column, an empty one just its striped track, so the
   * spacing is the clock's. The busiest single hour carries its amount, as the best day does above.
   */
  const sold = new Map(busy.byHour.map((h) => [h.hour, Number(h.valueMinor)]));
  /* Owner, 14 Nov 2026 — "show only open hours": the opening hours when the branch has them, else first sale to last. */
  const [firstCol, lastCol] = openHours && !phone
    ? [openHours.fromHour, openHours.toHour - 1]
    : sold.size > 0
      ? [Math.min(...sold.keys()), Math.max(...sold.keys())]
      : [0, -1];
  // A phone keeps develop's columns: only the hours that sold, side by side.
  const hourCols = phone
    ? busy.byHour.map((h) => ({ hour: h.hour, value: Number(h.valueMinor) }))
    : Array.from({ length: Math.max(0, lastCol - firstCol + 1) }, (_, k) => ({
        hour: firstCol + k,
        value: sold.get(firstCol + k) ?? 0,
      }));
  /* Money taken while closed is not dropped silently: the card says how much, under the chart (laptop). */
  const outsideMinor = openHours && !phone ? busy.byHour.reduce((sum, h) => (h.hour < firstCol || h.hour > lastCol ? sum + Number(h.valueMinor) : sum), 0) : 0;
  const hourPeak = Math.max(...hourCols.map((h) => h.value), 1);
  const topHour = hourCols.reduce((best, h) => (h.value > (best?.value ?? 0) ? h : best), null as (typeof hourCols)[number] | null);
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
            : ` · ${t('took.average', { amount: money(wholeRupees(takings.averageBillMinor)) })}`}
        </p>
        <ul className="cr-bars cr-bars-day" ref={barsRef}>
          {bars.map((b, i) => (
            <li key={b.startISO} className="cr-bar-col">
              {/* Above the slot, so the amount sits on top of its bar. Owner, 14 Nov 2026 — "amount on top of each
                  bar": every day of a week carries its figure (short above ₹9,999, so seven fit across a phone); a
                  longer range still names only the best day. An empty day stays blank, which keeps every column the
                  same height. Read out below for everybody, so hidden from a screen reader here. */}
              <span className={`cr-bar-top${i === peakDay ? ' is-peak' : ''}`} aria-hidden="true">
                {phone ? (i === peakDay ? money(b.valueMinor) : '') : i === peakDay || (everyFigure && b.valueMinor > 0) ? barAmount(b.valueMinor) : ''}
              </span>
              <span className="cr-bar-slot">
                <span
                  className={`cr-bar${i === peakDay ? ' is-peak' : ''}`}
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
        {strategy && (strategy.byChannel.length > 0 || strategy.byPaymentMode.length > 0) ? (
          <div className="cr-mix-block">
            {strategy.byChannel.length > 0 ? (
              <div className="cr-mix-row">
                <span className="cr-mix-label">{t('mix.channelsLabel')}</span>
                <div className="cr-mix-pills">
                  {strategy.byChannel.map((c) => (
                    <span key={c.channel} className="cr-mix-pill">
                      <strong>{channelLabel(c.channel)}</strong> {money(c.valueMinor)} <em>({c.sharePct}%)</em>
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            {strategy.byPaymentMode.length > 0 ? (
              <div className="cr-mix-row">
                <span className="cr-mix-label">{t('mix.paymentsLabel')}</span>
                <div className="cr-mix-pills">
                  {strategy.byPaymentMode.map((p) => (
                    <span key={p.mode} className="cr-mix-pill">
                      <strong>{modeLabel(p.mode)}</strong> {money(p.valueMinor)} <em>({p.sharePct}%)</em>
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
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
        {strategy && earners.slowTotal > earners.slow.length && earners.slow.length > 0 ? (
          <p className="cr-sub cr-slow-examples">
            {t('mix.slowExamples', { names: earners.slow.map((s) => s.name).join(', ') })}
          </p>
        ) : null}
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
              {hourCols.map((h, i, all) => {
                const inPeak = h.hour >= busy.peak!.fromHour && h.hour < busy.peak!.toHour;
                /*
                 * A kitchen trades fourteen hours and a phone is 344px wide: "11 am" under every column
                 * needs 34px and has 24. Turning them on their side put them through the top of the card,
                 * so only every third hour is named, with the ends always named so the axis has a range.
                 * The column itself is still there for every hour — it is the LABEL that thins out.
                 */
                // Owner, 14 Nov 2026 — with every hour drawn, a name every third hour plus both ends put "1 am" on top
                // of "3 am". Evenly spaced from the first column instead, about six names whatever the span.
                const named = phone ? i === 0 || i === all.length - 1 || h.hour % 3 === 0 : i % Math.max(3, Math.ceil(all.length / 6)) === 0;
                return (
                  <li key={h.hour} className="cr-bar-col">
                    {phone ? null : (
                      <span className={`cr-bar-top${inPeak ? ' is-peak' : ''}`} aria-hidden="true">
                        {topHour && h.hour === topHour.hour ? barAmount(h.value) : ''}
                      </span>
                    )}
                    <span className="cr-bar-slot">
                      <span
                        className={`cr-bar ${inPeak ? 'is-peak' : ''}`}
                        style={{ height: `${h.value === 0 && !phone ? 0 : Math.max(MIN_BAR_PCT, (h.value / hourPeak) * 100)}%` }}
                      />
                    </span>
                    <span className="cr-bar-tick">{named ? hourName(h.hour) : ''}</span>
                    <span className="sr-only">{hourName(h.hour)} {money(h.value)}</span>
                  </li>
                );
              })}
            </ul>
            <p className="cr-say">
              {t('busy.peak', { from: hourName(busy.peak.fromHour), to: hourName(busy.peak.toHour) })}
            </p>
            {outsideMinor > 0 ? <p className="cr-aside">{t('busy.outsideHours', { amount: money(outsideMinor) })}</p> : null}
          </>
        )}
        {busy.quietestDay ? (
          <p className="cr-aside">
            {t('busy.quietest', { day: dayName(busy.quietestDay.dow), amount: money(busy.quietestDay.valueMinor) })}
          </p>
        ) : null}
        {strategy?.bestDay ? (
          <p className="cr-sub cr-best-day">
            {t('mix.bestDay', { day: dayName(strategy.bestDay.dow), amount: money(strategy.bestDay.valueMinor) })}
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
              {money(wholeRupees(takings.previousAverageBillMinor))} → {money(wholeRupees(takings.averageBillMinor))}
            </span>
          </p>
        ) : null}
        {strategy && strategy.basket.totalUnits > 0 ? (
          <p className="cr-sub cr-basket-meta">
            {t('mix.basketMeta', {
              items: strategy.basket.avgItemsPerBill,
              singlePct: strategy.basket.singleItemSharePct,
            })}
          </p>
        ) : null}
      </section>

      {strategy ? (
        <section className="cr-card cr-playbook" aria-labelledby="cr-strat-h">
          <div className="cr-playbook-head">
            <h2 className="cr-title" id="cr-strat-h">
              {t('strategy.title')}
            </h2>
            <p className="cr-sub">{t('strategy.subtitle')}</p>
          </div>
          <div className="cr-strat-grid">
            {/* 1. Basket & Combo Strategy */}
            <article className="cr-strat-card">
              <span className="cr-strat-tag">{t('strategy.combo.tag')}</span>
              <h3 className="cr-strat-title">{t('strategy.combo.title')}</h3>
              <p className="cr-strat-data">
                <strong>{t('strategy.dataLabel')}: </strong>
                {strategy.basket.topPair
                  ? t('strategy.combo.dataPair', {
                      singlePct: strategy.basket.singleItemSharePct,
                      avgItems: strategy.basket.avgItemsPerBill,
                      itemA: strategy.basket.topPair.itemA,
                      itemB: strategy.basket.topPair.itemB,
                      pairBills: strategy.basket.topPair.bills,
                    })
                  : t('strategy.combo.dataSingle', {
                      singlePct: strategy.basket.singleItemSharePct,
                      avgItems: strategy.basket.avgItemsPerBill,
                      avgBill: money(wholeRupees(takings.averageBillMinor ?? 0)),
                    })}
              </p>
              <p className="cr-strat-action">
                <strong>{t('strategy.actionLabel')}: </strong>
                {(() => {
                  const leader =
                    strategy.basket.topPair?.itemA ??
                    earners.leader?.name ??
                    earners.rows[0]?.name ??
                    t('strategy.fallbackTop');
                  const partner =
                    strategy.basket.topPair?.itemB ??
                    earners.rows.find((r) => r.name !== leader)?.name ??
                    t('strategy.fallbackPartner');
                  return t('strategy.combo.action', { leader, partner });
                })()}
              </p>
              <p className="cr-strat-impact">
                {/*
                  The add-on is a tenth of this business's own order, to the ₹10 — it was a fixed ₹60, a side dish's
                  price, which said nothing to a shop whose order is ₹2,400 (sports-shop QA, 13 Nov 2026).
                */}
                {t('strategy.combo.impact', {
                  amount: money(Math.max(1, Math.round(takings.bills / 3)) * addOnMinor),
                  addOn: money(addOnMinor),
                })}
              </p>
            </article>

            {/* 2. Peak & Slow-Slot Strategy */}
            <article className="cr-strat-card">
              <span className="cr-strat-tag">{t('strategy.timing.tag')}</span>
              <h3 className="cr-strat-title">{t('strategy.timing.title')}</h3>
              <p className="cr-strat-data">
                <strong>{t('strategy.dataLabel')}: </strong>
                {strategy.bestDay && busy.quietestDay && busy.peak
                  ? t('strategy.timing.dataWithDays', {
                      bestDay: dayName(strategy.bestDay.dow),
                      bestAmount: money(strategy.bestDay.valueMinor),
                      weakDay: dayName(busy.quietestDay.dow),
                      weakAmount: money(busy.quietestDay.valueMinor),
                      from: hourName(busy.peak.fromHour),
                      to: hourName(busy.peak.toHour),
                    })
                  : busy.peak
                    ? t('strategy.timing.dataRushOnly', {
                        from: hourName(busy.peak.fromHour),
                        to: hourName(busy.peak.toHour),
                      })
                    : t('strategy.timing.dataNoPeak')}
              </p>
              <p className="cr-strat-action">
                <strong>{t('strategy.actionLabel')}: </strong>
                {busy.quietestDay && busy.peak
                  ? t('strategy.timing.action', {
                      weakDay: dayName(busy.quietestDay.dow),
                      from: hourName(busy.peak.fromHour),
                      to: hourName(busy.peak.toHour),
                    })
                  : t('strategy.timing.actionNoPeak')}
              </p>
              <p className="cr-strat-impact">
                {t('strategy.timing.impact', {
                  amount: money(
                    strategy.bestDay && busy.quietestDay
                      ? Math.max(50000, Math.round((Number(strategy.bestDay.valueMinor) - Number(busy.quietestDay.valueMinor)) / 200) * 100)
                      : Math.round(Number(takings.totalMinor) * 0.0015) * 100,
                  ),
                })}
              </p>
            </article>

            {/*
              3. Channel Margin & Retention Strategy — only for a business that sells on the apps. A shop whose every
              order is at its own counter was told to "save app commission" on 0% app sales (sports-shop QA, 13 Nov 2026).
            */}
            {strategy.byChannel.some((c) => c.channel !== 'counter' && c.sharePct > 0) ? (
            <article className="cr-strat-card">
              <span className="cr-strat-tag">{t('strategy.channels.tag')}</span>
              <h3 className="cr-strat-title">{t('strategy.channels.title')}</h3>
              <p className="cr-strat-data">
                <strong>{t('strategy.dataLabel')}: </strong>
                {(() => {
                  const counterSlice = strategy.byChannel.find((c) => c.channel === 'counter');
                  const counterPct = counterSlice ? counterSlice.sharePct : 100;
                  const onlinePct = Math.max(0, 100 - counterPct);
                  return t('strategy.channels.data', {
                    counterPct,
                    onlinePct,
                    capturePct: strategy.customers.customerCapturePct,
                    repeatPct: strategy.customers.repeatSharePct,
                  });
                })()}
              </p>
              <p className="cr-strat-action">
                <strong>{t('strategy.actionLabel')}: </strong>
                {t('strategy.channels.action')}
              </p>
              <p className="cr-strat-impact">{t('strategy.channels.impact')}</p>
            </article>
            ) : null}

            {/* 4. Menu Engineering Strategy */}
            <article className="cr-strat-card">
              <span className="cr-strat-tag">{t('strategy.menu.tag')}</span>
              <h3 className="cr-strat-title">{t('strategy.menu.title')}</h3>
              <p className="cr-strat-data">
                <strong>{t('strategy.dataLabel')}: </strong>
                {earners.slowTotal > 0 && earners.slow.length > 0
                  ? t('strategy.menu.dataWithSlow', {
                      star: changed.up[0]?.name ?? earners.leader?.name ?? earners.rows[0]?.name ?? t('strategy.fallbackTop'),
                      slowCount: earners.slowTotal,
                      menuTotal: earners.menuTotal,
                      slowNames: earners.slow.slice(0, 3).map((s) => s.name).join(', '),
                    })
                  : t('strategy.menu.dataClean', {
                      star: changed.up[0]?.name ?? earners.leader?.name ?? earners.rows[0]?.name ?? t('strategy.fallbackTop'),
                      menuTotal: earners.menuTotal,
                    })}
              </p>
              <p className="cr-strat-action">
                <strong>{t('strategy.actionLabel')}: </strong>
                {t('strategy.menu.action', {
                  star: changed.up[0]?.name ?? earners.leader?.name ?? earners.rows[0]?.name ?? t('strategy.fallbackTop'),
                  slowNames:
                    earners.slow.length > 0
                      ? earners.slow.slice(0, 3).map((s) => s.name).join(', ')
                      : earners.rows[earners.rows.length - 1]?.name ?? t('strategy.fallbackSlow'),
                })}
              </p>
              <p className="cr-strat-impact">
                {t('strategy.menu.impact', { slowCount: earners.slowTotal })}
              </p>
            </article>
          </div>
        </section>
      ) : null}
    </>
  );
}
