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
    bookingTime: t('bookingTime'),
    anyTime: t('anyTime'),
    timeNow: (time: string) => t('timeNow', { time }),
    /** Opens Record payment's Name and Phone number fields, which the search box above has usually already filled in. */
    addNameAndNumber: t('addNameAndNumber'),
    viewDetails: t('viewDetails'),
    viewDetailsOf: (title: string) => t('viewDetailsOf', { title }),
    packageSeparately: t('packageSeparately'),
    packagePrice: t('packagePrice'),
    addToBill: t('addToBill'),
    takeOffBill: t('takeOffBill'),
    packagesChip: t('packagesChip'),
    qtyOnBill: (name: string, count: number) => t('qtyOnBill', { name, count }),
    oneMore: (name: string) => t('oneMore', { name }),
    oneLess: (name: string) => t('oneLess', { name }),
    addPhoneNumber: t('addPhoneNumber'),
    tokenGone: t('tokenGone'),
    receiptTitle: t('receiptTitle'),
    receiptThanks: t('receiptThanks'),
    receiptServices: t('receiptServices'),
    receiptStylist: (noun: string, name: string) => t('receiptStylist', { noun, name }),
    receiptPackage: (title: string) => t('receiptPackage', { title }),
    receiptSeparately: (was: string, saved: string) => t('receiptSeparately', { was, saved }),
    receiptTotal: (amount: string) => t('receiptTotal', { amount }),
    receiptSaved: (amount: string) => t('receiptSaved', { amount }),
    receiptPaidBy: (mode: string) => t('receiptPaidBy', { mode }),
    receiptSeeYou: t('receiptSeeYou'),
    billPreview: t('billPreview'),
    sendingTo: t('sendingTo'),
    changeNumber: t('changeNumber'),
    useClientNumber: (number: string) => t('useClientNumber', { number }),
    clientWhatsapp: t('clientWhatsapp'),
    sendOnWhatsapp: t('sendOnWhatsapp'),
    sendHint: t('sendHint'),
    shareBill: t('shareBill'),
    printBill: t('printBill'),
    billFull: (max: number) => t('billFull', { max }),
    trayTotal: (count: number) => t('trayTotal', { count }),
    trayTotalA11y: (count: number, amount: string) => t('trayTotalA11y', { count, amount }),
    allServices: t('allServices'),
    serviceKinds: t('serviceKinds'),
    servicesMissing: t('servicesMissing'),
    /** Record payment's bill heading — what is being charged for, counted. */
    inThisBill: (count: number) => t('inThisBill', { count }),
    /** Beside it: how long the work takes, and that the money taken need not match the prices listed. */
    totalCanDiffer: (duration: string) => t('totalCanDiffer', { duration }),
    backToHome: t('backToHome'),
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
    /** The same chair, on a chip, where "with Nisha · till 4:00 PM" would not fit beside a name. */
    chipBusy: (until: string) => t('chipBusy', { until }),
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
    /**
     * The outcome chips on a page's footer (owner, 2026-10-07), where Record payment asks how they paid.
     *
     * They name the STATE the visit is about to be in — waiting, or starting — and the button under them names
     * the action. Both saying "Start now" read as the screen stuttering.
     */
    whatNow: t('whatNow'),
    outcomeWaiting: t('outcomeWaiting'),
    outcomeStart: t('outcomeStart'),
    /**
     * New booking's rows, and the one question each opens (owner, 2026-10-10).
     *
     * Services, When and the stylist are a line apiece saying their answer. "What now?" is gone: Waiting is the
     * first thing the When sheet offers, because a token is the one answer with no time in it, and two controls
     * that could disagree about when a visit starts were two controls too many.
     */
    rowAddService: t('rowAddService'),
    rowPicked: (n: number, total: string) => t('rowPicked', { n, total }),
    /** The three answers to "what happens now", as the boxes above the button say them. */
    whenWaiting: t('whenWaiting'),
    whenNow: t('whenNow'),
    whenPick: t('whenPick'),
    bookAt: (time: string) => t('bookAt', { time }),
    /** The address named a booking that cannot be settled — already paid, moved, cancelled. */
    visitGone: t('visitGone'),
    /**
     * What the free-slot grid did with the time that was asked for.
     *
     * The Booking time is a wish, and the grid is what is actually free. It used to move the wish to "the first
     * free one after it" and say nothing, so a desk promised 2:00 and the salon booked 2:30. Now it says so.
     */
    timeMoved: (asked: string, got: string) => t('timeMoved', { asked, got }),
    timeNoneAfter: (asked: string) => t('timeNoneAfter', { asked }),
    /**
     * The confirmation a client is sent after a booking or a queue token (owner, 2026-10-07) — the same
     * `wa.me` link as the bill, with facts a booking is read back from. It never says "paid".
     */
    confirmBooked: t('confirmBooked'),
    confirmQueued: t('confirmQueued'),
    confirmSeeThen: t('confirmSeeThen'),
    confirmSeeSoon: t('confirmSeeSoon'),
    confirmPreview: t('confirmPreview'),
    sendConfirm: t('sendConfirm'),
    shareConfirm: t('shareConfirm'),
    confirmHint: t('confirmHint'),
    queued: t('queued'),
    token: (n: number) => t('token', { n }),
    laterTitle: t('laterTitle'),
    /* The screen's own name, used while the Walk-in / For later toggle is still on screen. */
    pageTitle: t('pageTitle'),
    /** "At MG Road" — said, not asked, once the branch cannot change. */
    atBranch: (name: string) => t('atBranch', { name }),
    whichDay: t('whichDay'),
    today: t('today'),
    whichTime: t('whichTime'),
    loadingTimes: t('loadingTimes'),
    noTimes: t('noTimes'),
    phoneRequired: t('phoneRequired'),
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
    cancelAsk: t('cancelAsk'),
    cancelYes: t('cancelYes'),
    cancelKeep: t('cancelKeep'),
    noShowAsk: t('noShowAsk'),
    noShowYes: t('noShowYes'),
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
