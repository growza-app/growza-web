import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { pickNoun } from './nouns';

/**
  * Jira GRW-362 — the New booking flow's words, in the owner's language.
  *
  * Each hook returns the same shape `copy.newVisit`, `copy.move`, `copy.booking` and
  * `copy.clientCard` had, so a screen reads `nv.title` / `nv.visits(3)` exactly as before;
  * the words come from the message files. Vertical nouns passed in (`client`, `provider`) are
  * swapped for a generic word in other languages until vertical labels are translated (Story 5).
  */

export function useNewVisitCopy() {
  const t = useTranslations('newVisit');
  const tn = useTranslations('nouns');
  const locale = useLocale();
  return useMemo(() => ({
    title: t('title'),
    bookAgain: t('bookAgain'),
    bookAgainLastVisit: (day: string) => t('bookAgainLastVisit', { day }),
    bookAgainWithStaff: (name: string) => t('bookAgainWithStaff', { name }),
    bookAgainAnyone: t('bookAgainAnyone'),
    bookAgainUse: t('bookAgainUse'),
    bookAgainTimes: t('bookAgainTimes'),
    bookAgainFinding: t('bookAgainFinding'),
    bookAgainNoTimes: t('bookAgainNoTimes'),
    bookAgainOtherTime: t('bookAgainOtherTime'),
    bookAgainTomorrow: t('bookAgainTomorrow'),
    paymentTitle: t('paymentTitle'),
    markDone: t('markDone'),
    howPaid: t('howPaid'),
    amountFor: (service: string) => t('amountFor', { service }),
    paid: (amount: string, mode: string) => t('paid', { amount, mode }),
    paymentNotSaved: t('paymentNotSaved'),
    amountNotSaved: t('amountNotSaved'),
    combo: t('combo'),
    comboSaves: (amount: string) => t('comboSaves', { amount }),
    close: t('close'),
    clear: t('clear'),
    whoIsThis: (client: string) => t('whoIsThis', { client: pickNoun(locale, client, tn('customer')) }),
    searchPlaceholder: t('searchPlaceholder'),
    noName: t('noName'),
    noMatch: t('noMatch'),
    visits: (n: number) => t('visits', { n }),
    bookingDate: t('bookingDate'),
    // Jira GRW-454 — a client of another branch, found by searching. A record here is made from their name and
    // number; their visits stay with the branch they made them at.
    atOtherBranches: t('atOtherBranches'),
    bringToBranch: (branch: string) => t('bringToBranch', { branch }),
    nameRequired: t('nameRequired'),
    namePlaceholder: t('namePlaceholder'),
    nameMissing: t('nameMissing'),
    phoneOptional: t('phoneOptional'),
    phonePlaceholder: t('phonePlaceholder'),
    phoneWhy: t('phoneWhy'),
    useThisPerson: t('useThisPerson'),
    whichService: t('whichService'),
    searchServices: (n: number) => t('searchServices', { n }),
    loadingServices: t('loadingServices'),
    noServicesYet: t('noServicesYet'),
    // Jira GRW-384 — a branch opened with no menu. GRW-399: the vertical's word for what it sells, not "services".
    noServicesAtBranch: (branch: string, services: string) =>
      t('noServicesAtBranch', { branch, services: pickNoun(locale, services, tn('services')) }),
    addOrCopyServices: (services: string) => t('addOrCopyServices', { services: pickNoun(locale, services, tn('services')) }),
    // Jira GRW-456 — a branch with nobody on it, said where the stylist is chosen.
    noStaffAtBranch: (branch: string, provider: string) => t('noStaffAtBranch', { branch, provider: pickNoun(locale, provider, tn('staff')) }),
    noStaffYet: (provider: string) => t('noStaffYet', { provider: pickNoun(locale, provider, tn('staff')) }),
    stillTakePayment: (nobody: string) => t('stillTakePayment', { nobody }),
    addStaff: (provider: string) => t('addStaff', { provider: pickNoun(locale, provider, tn('staff')) }),
    // Jira GRW-461 — the branch has people and none of them do this one.
    noOneDoes: (service: string, provider: string) => t('noOneDoes', { service, provider: pickNoun(locale, provider, tn('staff')) }),
    whoDoesWhat: (provider: string) => t('whoDoesWhat', { provider: pickNoun(locale, provider, tn('staff')) }),
    noServiceMatch: t('noServiceMatch'),
    alsoTry: t('alsoTry'),
    combos: t('combos'),
    comboServices: (n: number) => t('comboServices', { n }),
    picked: t('picked'),
    removeService: t('removeService'),
    addMore: t('addMore'),
    total: t('total'),
    comboPrice: t('comboPrice'),
    withWhom: (provider: string) => t('withWhom', { provider: pickNoun(locale, provider, tn('staff')) }),
    whichBranch: t('whichBranch'),
    whoeverIsFree: t('whoeverIsFree'),
    freeCount: (n: number) => t('freeCount', { n }),
    chairFree: t('chairFree'),
    chairBusy: (name: string, until: string) => t('chairBusy', { name, until }),
    someone: t('someone'),
    reclaimOffer: (name: string, minAgo: number) => t('reclaimOffer', { name, minAgo }),
    reclaimOn: (name: string) => t('reclaimOn', { name }),
    startsNow: (minutes: number) => t('startsNow', { minutes }),
    back: t('back'),
    start: t('start'),
    // Jira GRW-458 — what the primary reads once the queue has taken its place, because no chair is free.
    startAnyway: t('startAnyway'),
    saving: t('saving'),
    saveFailed: t('saveFailed'),
    saveUnknown: t('saveUnknown'),
    recorded: t('recorded'),
    overlap: (provider: string) => t('overlap', { provider }),
    takePayment: t('takePayment'),
    addToQueue: t('addToQueue'),
    queued: t('queued'),
    token: (n: number) => t('token', { n }),
    laterTitle: t('laterTitle'),
    /* The screen's own name, used while the Walk-in / For later toggle is still on screen. */
    pageTitle: t('pageTitle'),
    /** "At MG Road" — said, not asked, once the branch cannot change. */
    atBranch: (name: string) => t('atBranch', { name }),
    modeLabel: t('modeLabel'),
    modeNow: t('modeNow'),
    modeLater: t('modeLater'),
    whichDay: t('whichDay'),
    today: t('today'),
    whichTime: t('whichTime'),
    loadingTimes: t('loadingTimes'),
    noTimes: t('noTimes'),
    phoneRequired: t('phoneRequired'),
    phoneWhyLater: t('phoneWhyLater'),
    phoneMissing: t('phoneMissing'),
    next: t('next'),
    bookIt: t('bookIt'),
    booking: t('booking'),
    booked: t('booked'),
    slotTaken: t('slotTaken'),
    openingTill: t('openingTill'),
    tillFailed: t('tillFailed'),
    notPaidYet: t('notPaidYet'),
    done: t('done'),
  }), [t, tn, locale]);
}

export function useMoveCopy() {
  const t = useTranslations('moveBooking');
  const tn = useTranslations('nouns');
  const locale = useLocale();
  return useMemo(() => ({
    title: t('title'),
    whichDay: t('whichDay'),
    whichTime: t('whichTime'),
    loadingTimes: t('loadingTimes'),
    noTimes: t('noTimes'),
    anotherTime: t('anotherTime'),
    anotherTimeHint: t('anotherTimeHint'),
    withWhom: (noun: string) => t('withWhom', { noun: pickNoun(locale, noun, tn('staff')) }),
    keepStylist: t('keepStylist'),
    back: t('back'),
    confirm: t('confirm'),
    confirmAnyway: t('confirmAnyway'),
    saving: t('saving'),
    clash: (who: string) => t('clash', { who }),
    clashUnknown: t('clashUnknown'),
    moved: (when: string) => t('moved', { when }),
    movedOverlap: t('movedOverlap'),
    failed: t('failed'),
    done: t('done'),
  }), [t, tn, locale]);
}

export function useBookingCopy() {
  const t = useTranslations('bookingSheet');
  const tn = useTranslations('nouns');
  const locale = useLocale();
  return useMemo(() => ({
    call: (name: string) => t('call', { name }),
    message: t('message'),
    markFinished: t('markFinished'),
    markMissed: t('markMissed'),
    reschedule: t('reschedule'),
    cancel: t('cancel'),
    reference: t('reference'),
  }), [t, tn, locale]);
}

export function useClientCardCopy() {
  const t = useTranslations('clientCard');
  const tn = useTranslations('nouns');
  const locale = useLocale();
  return useMemo(() => ({
    edit: t('edit'),
    save: t('save'),
    saving: t('saving'),
    cancel: t('cancel'),
    namePlaceholder: t('namePlaceholder'),
    phonePlaceholder: t('phonePlaceholder'),
    saveFailed: t('saveFailed'),
    kicker: t('kicker'),
    totalSpent: t('totalSpent'),
    totalVisits: t('totalVisits'),
    insight: t('insight'),
    rows: {visits: t('rows.visits'), spent: t('rows.spent'), avgSpend: t('rows.avgSpend'), lastVisit: t('rows.lastVisit'), favourite: t('rows.favourite'), topProvider: t('rows.topProvider'), interval: t('rows.interval'), cancelRate: t('rows.cancelRate'), since: t('rows.since'), nextVisit: t('rows.nextVisit') },
    recent: t('recent'),
    daysAgo: (n: number) => t('daysAgo', { n }),
    days: (n: number) => t('days', { n }),
    dueIn: (n: number) => t('dueIn', { n }),
    dueNow: t('dueNow'),
    overdue: (n: number) => t('overdue', { n }),
    notEnough: t('notEnough'),
    neverIn: t('neverIn'),
    call: t('call'),
    viewBookings: t('viewBookings'),
    close: t('close'),
    loadFailed: t('loadFailed'),
    noPhone: t('noPhone'),
    delete: t('delete'),
    deleteTitle: t('deleteTitle'),
    deleteBody: (days: number) => t('deleteBody', { days }),
    deleteConfirm: t('deleteConfirm'),
    deleting: t('deleting'),
    deleted: (days: number) => t('deleted', { days }),
    undo: t('undo'),
    undoing: t('undoing'),
    actionFailed: t('actionFailed'),
  }), [t, tn, locale]);
}
