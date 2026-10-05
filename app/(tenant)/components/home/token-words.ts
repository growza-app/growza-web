'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { pickNoun } from '../../lib/nouns';
import { useLabel } from '../LabelsProvider';

/**
 * Jira GRW-404 (epic GRW-283) — the token board's words, in the reader's language.
 *
 * Every word is in `web/messages` (`tokens`). The one vertical noun on the board — who a client is WITH — comes
 * from the business's labels ("stylist", "doctor", "mechanic"); another language uses the generic word until the
 * vertical labels are translated (`pickNoun`, Jira GRW-315 Story 5).
 */
export function useTokenWords() {
  const t = useTranslations('tokens');
  const tn = useTranslations('nouns');
  const locale = useLocale();
  const provider = pickNoun(locale, useLabel('provider', 'Staff member').toLowerCase(), tn('staff'));
  return useMemo(
    () => ({
      board: t('board'),
      waiting: t('waiting'),
      withProvider: t('withProvider', { provider }),
      paid: t('paid'),
      waitingTab: (count: number) => t('waitingTab', { count }),
      withTab: (count: number) => t('withTab', { provider, count }),
      paidTab: (count: number) => t('paidTab', { count }),
      nobodyWaiting: t('nobodyWaiting'),
      nobodyWith: t('nobodyWith', { provider }),
      nobodyPaid: t('nobodyPaid'),
      servicesAtPayment: t('servicesAtPayment'),
      noProvider: t('noProvider', { provider }),
      giveTo: t('giveTo', { provider }),
      recordPayment: t('recordPayment'),
      paidAmount: (amount: string, mode: string) => t('paidAmount', { amount, mode }),
      newToken: t('newToken'),
      newBooking: t('newBooking'),
      newTokenSub: t('newTokenSub'),
      atBranch: (branch: string) => t('atBranch', { branch }),
      giveToken: t('giveToken'),
      giving: t('giving'),
      tokenIssued: (n: number) => t('tokenIssued', { n }),
      tellThem: (name: string) => t('tellThem', { name }),
      anotherToken: t('anotherToken'),
      bookedToday: t('bookedToday'),
      bookedTodaySub: t('bookedTodaySub'),
      nothingBooked: t('nothingBooked'),
      // Jira GRW-405 — a booked client arriving.
      arrived: t('arrived'),
      arriving: t('arriving'),
      arrivedFor: (name: string) => t('arrivedFor', { name }),
      bookedAt: (time: string) => t('bookedAt', { time }),
      // Review of Jira GRW-404 — who a row is, for a screen reader, and a client with no name at all.
      noName: t('noName'),
      // Jira GRW-548 — the token number as a pill on a phone's card.
      tokenNoLabel: (n: number | null) => t('tokenNoLabel', { n: n ?? '' }),
      giveFor: (n: number | null, name: string) => t('giveFor', { n: n ?? '', name, provider }),
      payFor: (n: number | null, name: string) => t('payFor', { n: n ?? '', name }),
    }),
    [t, provider],
  );
}

export type TokenWords = ReturnType<typeof useTokenWords>;
