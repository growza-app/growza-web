import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { useLabel } from '../components/LabelsProvider';
import { nounInSentence, pickNoun } from './nouns';

/**
 * Jira GRW-363 — the Reports screen's words, in the owner's language.
 *
 * Returns the shape `copy.reports` has (so a tab reads `c.money.earned` or
 * `c.perVisit(amount)` exactly as before); the words come from the `reports`
 * messages. `copy.reports` itself stays as the English source that the CSV export
 * reads — a file is not translated per viewer — and a test keeps the two identical.
 */
export function useReportsCopy() {
  const t = useTranslations('reports');
  const nouns = useTranslations('nouns');
  const locale = useLocale();
  // Jira GRW-363 — what a count is of, in the vertical's words ("5 visits" for a clinic), or the
  // generic word in another language, as Home counts them.
  const booking = pickNoun(locale, nounInSentence(useLabel('appointment', 'Booking')), nouns('booking'));
  const bookings = pickNoun(locale, nounInSentence(useLabel('appointments', 'Bookings')), nouns('bookings'));
  return useMemo(
    () => ({
      title: t('title'),
      navLabel: t('navLabel'),
      tabs: {
        overview: t('tabs.overview'),
        customers: t('tabs.customers'),
        revenue: t('tabs.revenue'),
        bookings: t('tabs.bookings'),
        services: t('tabs.services'),
        staff: t('tabs.staff'),
      },
      subtitles: {
        overview: t('subtitles.overview'),
        customers: t('subtitles.customers'),
        revenue: t('subtitles.revenue'),
        bookings: t('subtitles.bookings'),
        services: t('subtitles.services'),
        staff: t('subtitles.staff'),
      },
      ranges: {
        today: t('ranges.today'),
        last_7_days: t('ranges.last_7_days'),
        this_month: t('ranges.this_month'),
        last_month: t('ranges.last_month'),
        last_3_months: t('ranges.last_3_months'),
        this_year: t('ranges.this_year'),
        custom: t('ranges.custom'),
      },
      compare: t('compare'),
      explain: {
        overviewRevenue: t('explain.overviewRevenue'),
        overviewBookings: t('explain.overviewBookings'),
        overviewNewClients: t('explain.overviewNewClients'),
        overviewRepeat: t('explain.overviewRepeat'),
        revenueCompleted: t('explain.revenueCompleted'),
        revenueAvgBooking: t('explain.revenueAvgBooking'),
        revenuePerClient: t('explain.revenuePerClient'),
        bookingsTotal: t('explain.bookingsTotal'),
        bookingsNoShow: t('explain.bookingsNoShow'),
        bookingsCancelled: t('explain.bookingsCancelled'),
        clientsTotal: t('explain.clientsTotal'),
        clientsNew: t('explain.clientsNew'),
        opportunities: t('explain.opportunities'),
        clientsOverdue: t('explain.clientsOverdue'),
      },
      filters: t('filters'),
      export: t('export'),
      notBuiltYet: t('notBuiltYet'),
      filtersNotHere: t('filtersNotHere'),
      filtersOnOtherTabs: (n: number) => t('filtersOnOtherTabs', { n }),
      exportNothing: t('exportNothing'),
      filterDrawer: {
        title: t('filterDrawer.title'),
        close: t('filterDrawer.close'),
        services: t('filterDrawer.services'),
        status: t('filterDrawer.status'),
        retired: t('filterDrawer.retired'),
        noProviders: t('filterDrawer.noProviders'),
        noServices: t('filterDrawer.noServices'),
        reset: t('filterDrawer.reset'),
        apply: t('filterDrawer.apply'),
        applyCount: (n: number) => t('filterDrawer.applyCount', { n }),
      },
      applied: t('applied'),
      clearFilters: t('clearFilters'),
      remove: (name: string) => t('remove', { name }),
      droppedFilters: (n: number) => t('droppedFilters', { n }),
      utilisationSuppressed: t('utilisationSuppressed'),
      kpi: {
        revenue: t('kpi.revenue'),
        bookings: t('kpi.bookings'),
        newCustomers: t('kpi.newCustomers'),
        repeatRate: t('kpi.repeatRate'),
      },
      segments: {
        active: t('segments.active'),
        due: t('segments.due'),
        at_risk: t('segments.at_risk'),
        inactive: t('segments.inactive'),
      },
      segmentsTitle: t('segmentsTitle'),
      segmentsHint: (total: number) => t('segmentsHint', { total }),
      segmentsTapHint: t('segmentsTapHint'),
      neverVisited: (n: number) => t('neverVisited', { n }),
      revenueTrend: t('revenueTrend'),
      bookingTrend: t('bookingTrend'),
      topServices: t('topServices'),
      peakOutside: (hours: string) => t('peakOutside', { hours }),
      opportunities: t('opportunities'),
      opportunitiesHint: t('opportunitiesHint'),
      perVisit: (amount: string) => t('perVisit', { amount }),
      overdueBy: (days: number) => t('overdueBy', { days }),
      dueNow: t('dueNow'),
      dueIn: (days: number) => t('dueIn', { days }),
      usuallyEvery: (days: number) => t('usuallyEvery', { days }),
      noPrior: t('noPrior'),
      noData: t('noData'),
      noDataHint: (range: string) => t('noDataHint', { range: range.toLowerCase() }),
      notEnoughVisits: t('notEnoughVisits'),
      /** Jira GRW-363 — "5 bookings" ("5 visits" for a clinic), the figure a bookings chart names when you point at it. */
      bookingsCount: (n: number) => t('bookingsCount', { n, one: booking, other: bookings }),
      /** Jira GRW-363 — "3h 20m" / "3 घंटे 20 मिनट": an owner reads hours, not 200 minutes. */
      duration: (minutes: number) => {
        const h = Math.floor(minutes / 60);
        const m = Math.round(minutes % 60);
        if (h === 0) return t('duration.m', { m });
        return m === 0 ? t('duration.h', { h }) : t('duration.hm', { h, m });
      },
      loadFailed: t('loadFailed'),
      retry: t('retry'),
      comingSoonTab: t('comingSoonTab'),
      money: {
        earned: t('money.earned'),
        perVisit: t('money.perVisit'),
        perClient: t('money.perClient'),
        trend: t('money.trend'),
        trendHint: t('money.trendHint'),
        bookedNote: (total: string) => t('money.bookedNote', { total }),
        byService: t('money.byService'),
        byStaff: t('money.byStaff'),
        bySegment: t('money.bySegment'),
        byPayment: t('money.byPayment'),
        notRecordedHint: t('money.notRecordedHint'),
      },
      bookingsTab: {
        total: t('bookingsTab.total'),
        totalHint: t('bookingsTab.totalHint'),
        trend: t('bookingsTab.trend'),
        trendHint: t('bookingsTab.trendHint'),
        trendVerdict: {
          up: t('bookingsTab.trendVerdict.up'),
          down: t('bookingsTab.trendVerdict.down'),
          flat: t('bookingsTab.trendVerdict.flat'),
        },
        trendDetail: (from: number, to: number, unit: string) => t('bookingsTab.trendDetail', { from, to, unit: t(`units.${unit}` as 'units.day') }),
        trendSteady: (about: number, unit: string) => t('bookingsTab.trendSteady', { about, unit: t(`units.${unit}` as 'units.day') }),
        trendTooShort: t('bookingsTab.trendTooShort'),
        status: t('bookingsTab.status'),
        statusHint: t('bookingsTab.statusHint'),
        source: t('bookingsTab.source'),
        sourceHint: t('bookingsTab.sourceHint'),
        peak: t('bookingsTab.peak'),
        peakHint: t('bookingsTab.peakHint'),
        peakQuiet: t('bookingsTab.peakQuiet'),
        peakBusy: t('bookingsTab.peakBusy'),
        peakCell: (day: string, hour: string, pct: number) => t('bookingsTab.peakCell', { day, hour, pct }),
      },
      servicesTab: {
        mostBooked: t('servicesTab.mostBooked'),
        topRevenue: t('servicesTab.topRevenue'),
        pairHint: t('servicesTab.pairHint'),
        table: t('servicesTab.table'),
        tableHint: t('servicesTab.tableHint'),
        colService: t('servicesTab.colService'),
        colBookings: t('servicesTab.colBookings'),
        colRevenue: t('servicesTab.colRevenue'),
        colAvg: t('servicesTab.colAvg'),
        colMinutes: t('servicesTab.colMinutes'),
        colRepeat: t('servicesTab.colRepeat'),
        colCancel: t('servicesTab.colCancel'),
        thinSample: t('servicesTab.thinSample'),
        retired: t('servicesTab.retired'),
      },
      staffTab: {
        byRevenue: t('staffTab.byRevenue'),
        utilisation: t('staffTab.utilisation'),
        utilisationHint: t('staffTab.utilisationHint'),
        table: t('staffTab.table'),
        colName: t('staffTab.colName'),
        colBookings: t('staffTab.colBookings'),
        colCompleted: t('staffTab.colCompleted'),
        colRevenue: t('staffTab.colRevenue'),
        colAvg: t('staffTab.colAvg'),
        colUtilisation: t('staffTab.colUtilisation'),
        colNoShow: t('staffTab.colNoShow'),
        noHours: t('staffTab.noHours'),
      },
      customersTab: {
        total: t('customersTab.total'),
        newClients: t('customersTab.newClients'),
        overdue: t('customersTab.overdue'),
        overdueHint: t('customersTab.overdueHint'),
        opportunities: t('customersTab.opportunities'),
        viewClients: t('customersTab.viewClients'),
        cards: {
          loyal: {
            title: t('customersTab.cards.loyal.title'),
            hint: t('customersTab.cards.loyal.hint'),
          },
          highValue: {
            title: t('customersTab.cards.highValue.title'),
            hint: t('customersTab.cards.highValue.hint'),
          },
          atRisk: {
            title: t('customersTab.cards.atRisk.title'),
            hint: t('customersTab.cards.atRisk.hint'),
          },
        },
        neverBand: t('customersTab.neverBand'),
        spend: t('customersTab.spend'),
        spendHint: t('customersTab.spendHint'),
        frequency: t('customersTab.frequency'),
        frequencyHint: t('customersTab.frequencyHint'),
        avgInterval: t('customersTab.avgInterval'),
        avgVisits: t('customersTab.avgVisits'),
        top: t('customersTab.top'),
        topHint: t('customersTab.topHint'),
        colClient: t('customersTab.colClient'),
        colVisits: t('customersTab.colVisits'),
        colSpend: t('customersTab.colSpend'),
        colAvg: t('customersTab.colAvg'),
        colLast: t('customersTab.colLast'),
        colFavourite: t('customersTab.colFavourite'),
        colInterval: t('customersTab.colInterval'),
        daysAgo: (n: number) => t('customersTab.daysAgo', { n }),
        neverIn: t('customersTab.neverIn'),
        comesEvery: (days: number) => t('customersTab.comesEvery', { days }),
        repeatRate: t('customersTab.repeatRate'),
      },
    }),
    [t, booking, bookings],
  );
}
