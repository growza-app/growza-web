'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import type { MoneyReportQuery } from '../../lib/api';
import { formatMoney, intlLocale } from '../../lib/format';
import { useBranch } from '../../components/BranchProvider';
import { useSession } from '../../components/SessionProvider';
import { ReportDates } from '../ReportDates';
import { type ChangedEnd, clampReportRange, defaultReportRange, todayInZone } from '../../lib/report-dates';

/**
 * Owner, 2026-11-14 — what Profit, Discounts & free and Payments share: the counter report's period (the last seven
 * days to start, the same two date fields), the branch from the header, one read per change, and the loading and
 * failed states. Each screen is then only what it shows.
 */
export function useMoneyReport<T>(read: (q: MoneyReportQuery) => Promise<T>, opts: { maxDays?: number } = {}) {
  const session = useSession();
  const branches = session?.branches ?? [];
  const branchContext = useBranch();
  const branch = branchContext.ready && branchContext.multi ? (branchContext.choice ?? '') : '';
  const ready = branchContext.ready || branches.length <= 1;
  const todayISO = useMemo(() => todayInZone(session?.timezone), [session?.timezone]);
  // QA of GRW-741 — a saved link's days (`?from=…&to=…`, which /reports/food-cost passes on) open those days, held to what the report answers.
  const params = useSearchParams();
  const [dates, setDates] = useState(() => {
    const from = params?.get('from');
    const to = params?.get('to');
    return from && to ? clampReportRange(from, to, todayISO, 'to', opts.maxDays) : defaultReportRange(todayISO);
  });
  const [data, setData] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!ready) return;
    const mine = ++seq.current;
    setFailed(false);
    setData(null);
    try {
      const res = await read({ from: dates.fromISO, to: dates.toISO, location: branch || undefined });
      // A reply for a period the owner has already moved on from must not overwrite the one they are reading.
      if (mine === seq.current) setData(res);
    } catch {
      if (mine === seq.current) setFailed(true);
    }
  }, [ready, read, dates.fromISO, dates.toISO, branch]);
  useEffect(() => {
    void load();
  }, [load]);

  const onDates = (fromISO: string, toISO: string, changed: ChangedEnd) => setDates(clampReportRange(fromISO, toISO, todayISO, changed, opts.maxDays));
  return { data, failed, load, dates, onDates, todayISO, timezone: session?.timezone ?? 'Asia/Kolkata' };
}

/** The money and number formatters every one of the three uses. */
export function useMoneyFormat() {
  const locale = useLocale();
  return {
    money: (minor: number) => formatMoney(minor, 'INR', locale),
    count: (n: number) => new Intl.NumberFormat(intlLocale(locale)).format(n),
    /** A calendar day (`yyyy-MM-dd`) as "Mon, 10 Nov". Fixed to UTC: it is a date, not an instant. */
    day: (iso: string) =>
      new Intl.DateTimeFormat(intlLocale(locale), { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`)),
    /** An instant as the business's day and time: "Mon, 10 Nov, 8:40 pm". */
    when: (iso: string, timezone: string) =>
      new Intl.DateTimeFormat(intlLocale(locale), { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: timezone }).format(new Date(iso)),
  };
}

/** The period fields, then the screen — or its loading cards, or the sentence that says it failed and a way to try again. */
export function MoneyShell<T>({ report, children }: { report: ReturnType<typeof useMoneyReport<T>>; children: (data: T) => ReactNode }) {
  const t = useTranslations('moneyReports');
  return (
    <div className="srp mr">
      <div className="srp-toolbar">
        <ReportDates
          from={report.dates.fromISO}
          to={report.dates.toISO}
          today={report.todayISO}
          labels={{ group: t('rangeLabel'), from: t('from'), to: t('to') }}
          onChange={report.onDates}
        />
      </div>
      {report.failed ? (
        <div className="ord-state" role="alert">
          <p>{t('loadError')}</p>
          <button type="button" className="btn" onClick={() => void report.load()}>
            {t('retry')}
          </button>
        </div>
      ) : report.data === null ? (
        <ul className="srp-list" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className="srp-card srp-skeleton" />
          ))}
        </ul>
      ) : (
        children(report.data)
      )}
    </div>
  );
}

/** A line that says there is nothing to show, in the same card the rows would have been in. */
export function MoneyEmpty({ text }: { text: string }) {
  return (
    <div className="ord-state">
      <p>{text}</p>
    </div>
  );
}
