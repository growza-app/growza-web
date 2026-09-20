/**
 * Every word the salon owner reads, in one place.
 *
 * RULE: plain language only. Our users run salons, not software — they should
 * never have to decode industry jargon. Before adding a string here, say it out
 * loud to someone who has never used a booking system.
 *
 *   no-show      -> didn't come
 *   utilisation  -> how busy
 *   buffer       -> cleanup time
 *   availability -> free times
 *   revenue      -> money earned
 *   provider     -> comes from ctx.labels (Stylist / Doctor / Trainer ...)
 *
 * Domain nouns (stylist/service/client) come from the vertical config
 * (ctx.labels) and are NOT duplicated here — see 01-domain-model.md §4.
 * This file is UI chrome only. Translations later swap this one file.
 */
export const copy = {
  /**
   * Jira GRW-158 · GRW-165 — what the dashboard says while WhatsApp is off.
   *
   * Written once, here, because the same fact is stated on four screens and
   * this repo has already paid for two renderings of one fact (commit 895e9ac,
   * "Make the download say what the screen says").
   *
   * Plain words on purpose: an owner is not told about flags, approvals or
   * Meta. They are told it is coming, and that what they set up now will work
   * when it arrives.
   */
  whatsapp: {
    /**
     * The nav marker beside a WhatsApp destination that is a demo, not the
     * real thing.
     *
     * "Demo", not "Preview": the plainer word of the two.
     */
    previewPill: 'Demo',
    /**
     * The nav label that goes WITH the pill.
     *
     * The sidebar row is 200px, which leaves about 145px for label plus
     * marker, and "Try WhatsApp" alone is already ~95px — with a pill beside
     * it the row wrapped to two lines while every other row stayed on one.
     * "WhatsApp · Demo" is both shorter and clearer than "Try WhatsApp · Demo",
     * where "Try" and "Demo" say the same thing twice.
     *
     * Used by the sidebar AND the More menu, so the two navs cannot end up
     * calling one destination different things.
     */
    navLabelDemo: 'WhatsApp',
    comingSoonPill: 'Coming soon',
    /** The Notifications screen. The one place an owner could otherwise set something up and believe it was working. */
    remindersNotLiveTitle: 'WhatsApp is coming soon',
    remindersNotLive:
      'Reminders are not going out yet — WhatsApp is still being set up for you. Choose your times now and they will start sending the day it goes live. Nothing to redo.',
    /** The Try WhatsApp page, so nobody mistakes the demo for a live channel. */
    tryIsADemo: 'This is a practice run, just for you. Your customers cannot book on WhatsApp yet.',
  },

  offers: {
    /** Jira GRW-158 · GRW-165 — the same page, said honestly in each state. */
    subtitleLive:
      "Create offers and combos that customers see on your dashboard and in WhatsApp's Offers menu. Customers can book combos directly from WhatsApp.",
    subtitleCrmOnly:
      'Create offers and combos to sell more of what you already do. Add them to a booking at the desk today — customers will be able to book them on WhatsApp too, once WhatsApp goes live for you.',
  },

  /** Jira GRW-340 — the phone's branch tabs, on the screens that are not translated yet (Attendance). */
  branchTabs: { all: 'All', label: 'Branch' },

  nav: {
    dashboard: 'Home',
    calendar: 'Calendar',
    appointments: 'Bookings',
    staff: 'Staff',
    services: 'Services',
    offers: 'Offers',
    customers: 'Customers',
    availability: 'Free times',
    tryWhatsApp: 'Try WhatsApp',
    settings: 'Settings',
    more: 'More',
    // "Log out", not "Sign out": it is the wording already on the Settings row
    // and the plainer of the two, and it has to read the same everywhere
    // (GRW-160 puts it on three surfaces at once).
    signOut: 'Log out',
  },

  home: {
    greeting: (part: string) => `Good ${part}`,
    scheduleTitle: 'Today',
    seeAll: 'See all',
    nowLabel: (time: string) => `now ${time}`,
    laterLabel: 'later today',
    nothingToday: 'Nothing booked today yet.',
    summaryStyle: 'Summary style',
    summaryStyleHint: 'Pick what you want to see at a glance',
    viewReport: 'View report',
    rangeToday: 'Today',
    rangeWeek: 'Week',
    rangeMonth: 'Month',
  },

  booking: {
    call: (name: string) => `Call ${name}`,
    message: 'Send a message',
    markFinished: 'Mark as done',
    markMissed: "Customer didn't come",
    reschedule: 'Move to another time',
    cancel: 'Cancel this booking',
    reference: 'Booking ID',
  },

  /**
   * Jira GRW-219 — moving a booking.
   *
   * `booking.reschedule` above has said "Move to another time" since the sheet
   * was written, with no call site anywhere. These are the words the screen it
   * finally opens needs.
   */
  move: {
    title: 'Move this booking',
    whichDay: 'Which day?',
    whichTime: 'What time?',
    loadingTimes: 'Finding free times…',
    noTimes: 'Nothing free that day.',
    anotherTime: 'Another time',
    anotherTimeHint: 'Any time you like — even one that is already taken.',
    withWhom: (noun: string) => `Same ${noun}?`,
    keepStylist: 'Keep as is',
    back: 'Back',
    confirm: 'Move it',
    confirmAnyway: 'Move anyway',
    saving: 'Moving…',
    /** Named BEFORE the save, which is the whole difference from the walk-in sheet. */
    clash: (who: string) => `${who} already has someone at that time.`,
    clashUnknown: 'That time is already taken.',
    moved: (when: string) => `Moved to ${when}`,
    movedOverlap: 'Recorded — two bookings now share that time.',
    failed: 'That did not save. Check the connection and try again.',
    done: 'Done',
  },

  kpi: {
    bookingsToday: 'Bookings today',
    missedThisWeek: 'No-shows this week',
    earnedToday: 'Money earned today',
    // "How busy today" comes from ctx.labels.utilisation_kpi (vertical-specific)
    hoursFree: (hours: number) => `${hours} ${hours === 1 ? 'hour' : 'hours'} still free`,
    moreThanYesterday: (n: number) => `${n} more than yesterday`,
    fewerThanYesterday: (n: number) => `${n} fewer than yesterday`,
    sameAsYesterday: 'Same as yesterday',
    fewerThanLastWeek: (n: number) => `${n} fewer than last week`,
    moreThanLastWeek: (n: number) => `${n} more than last week`,
    sameAsLastWeek: 'Same as last week',
    noComparison: 'Nothing to compare yet',
    upFromLastWeek: (pct: number) => `${pct}% more than last week`,
    downFromLastWeek: (pct: number) => `${pct}% less than last week`,
  },

  /**
   * The four booking statuses, one word each, used EVERYWHERE — KPI tiles, row
   * chips and filter chips all read from here.
   *
   * Previously a tile said "Coming up" while the chip beneath it said "Coming"
   * and the sidebar counted "No-shows" against a chip reading "Didn't come".
   * Three vocabularies for four states meant a tile labelled one thing filtered
   * to rows labelled another, which reads as a different concept rather than
   * the same one. These strings mirror `appointment.status` exactly.
   */
  status: {
    done: 'Completed',
    confirmed: 'Confirmed',
    reminded: 'Reminded',
    walkIn: 'Walk-in',
    // "No-show" is trade jargon. The owner marks these with a button that
    // already reads "Customer didn't come", so the status it produces should
    // say the same thing back — tapping one wording and being shown another
    // reads as two different states. Also what the key here has always been
    // called, and what the ?status= label map already used.
    didNotCome: "Didn't come",
    /** Plural, for counts: "3 didn't come". */
    didNotComeCount: "didn't come",
    cancelled: 'Cancelled',
  },

  today: {
    heading: (bookingsWord: string) => `Today's ${bookingsWord.toLowerCase()}`,
    viewAll: 'See all →',
    nothing: 'No bookings today yet.',
    chairToday: (providerName: string, resourceWord: string) =>
      `${providerName}'s ${resourceWord.toLowerCase()} today`,
    free: '— free —',
  },

  /**
   * Jira GRW-199 — the walk-in sheet.
   *
   * Plain words for a person who is standing at the desk with a customer in
   * front of them. "Start now" rather than "Confirm booking", because nothing
   * is being reserved — the visit is beginning.
   */
  newVisit: {
    title: 'Walk-in',
    // Jira GRW-341 — the "Book again" card: the client's last visit, offered back with the next free times.
    bookAgain: 'Book again',
    bookAgainLastVisit: (day: string) => `Last visit ${day}`,
    bookAgainWithStaff: (name: string) => `with ${name}`,
    bookAgainAnyone: 'anyone free',
    bookAgainUse: 'Use these',
    bookAgainTimes: 'Next free times',
    bookAgainFinding: 'Finding free times…',
    bookAgainNoTimes: 'No free times this week',
    bookAgainOtherTime: 'Choose another time',
    bookAgainTomorrow: 'Tomorrow',
    // Home's "Record payment": the walk-in steps, ending in the till instead of a started visit.
    paymentTitle: 'Record payment',
    // Jira GRW-290 — Record payment ends on the services screen, no separate till.
    markDone: 'Mark done',
    howPaid: 'How did they pay?',
    amountFor: (service: string) => `Amount for ${service}`,
    paid: (amount: string, mode: string) => `Paid ${amount} · ${mode}`,
    paymentNotSaved: 'The visit is saved, but the payment did not save. Tap Mark done to try again.',
    combo: 'Combo',
    // Jira GRW-291 — the combo's discount, said in one line: what it saves off the list price.
    // Matches CheckoutSheet's own "X list, saves Y" phrasing for the same discount.
    comboSaves: (amount: string) => `Saves ${amount}`,
    close: 'Close',
    clear: 'Clear',
    whoIsThis: (client: string) => `Search for the ${client}, or add them.`,
    searchPlaceholder: 'Name or phone number',
    noName: 'No name',
    noNumber: 'no number',
    noMatch: 'Nobody on file matches that.',
    visits: (n: number) => (n === 1 ? '1 visit' : `${n} visits`),
    // Jira GRW-297 — browsable before a search term is typed.
    recentCustomers: 'Previous customers',
    loadingCustomers: 'Loading…',
    noCustomersYet: 'No customers yet.',
    addNew: 'Add someone new',
    nameRequired: 'Name',
    namePlaceholder: 'First name is enough',
    nameMissing: 'A name is needed, even a first name.',
    phoneOptional: 'Phone (optional)',
    phonePlaceholder: '+91 98765 43210',
    phoneWhy: 'Leave it blank if they would rather not say.',
    useThisPerson: 'Continue',
    whichService: 'What are they having?',
    // Jira GRW-290 — "Loading…" only while loading. An empty catalogue said it forever.
    searchServices: (n: number) => (n ? `Search ${n} services or combos…` : 'Search services…'),
    loadingServices: 'Loading services…',
    noServicesYet: 'No services yet. Add them under Services first.',
    noServiceMatch: 'No service matches that.',
    combos: 'Combos & offers',
    comboServices: (n: number) => `${n} services`,
    picked: 'Chosen',
    removeService: 'Remove',
    addMore: 'Add another service',
    total: 'Total',
    comboPrice: 'Combo price',
    withWhom: (provider: string) => `Which ${provider}?`,
    // Jira GRW-235 — a multi-branch business's booking sheet.
    whichBranch: 'Which branch?',
    whoeverIsFree: 'Whoever is free',
    // Jira GRW-293 — Record payment only: a visit can be paid for without
    // choosing anyone. "No stylist" over "Unassigned" — the front desk is
    // choosing an option, not reading a report's label back at themselves.
    noStylist: 'No stylist',
    freeCount: (n: number) => (n === 0 ? 'nobody free' : n === 1 ? '1 free' : `${n} free`),
    chairFree: 'free now',
    chairBusy: (name: string, until: string) => `with ${name} · till ${until}`,
    someone: 'someone',
    // Plain, and it names the person — "Override" would not tell the
    // receptionist whose booking they are about to end.
    reclaimOffer: (name: string, minAgo: number) => `${name} hasn't turned up (${minAgo} min) — use this chair`,
    reclaimOn: (name: string) => `${name} will be marked as a no-show`,
    startsNow: (minutes: number) => `Starts now · ${minutes} min in total`,
    back: 'Back',
    start: 'Start now',
    saving: 'Recording…',
    saveFailed: 'That did not save. Check the connection and try again.',
    /*
     * When we genuinely do not know.
     *
     * A lost RESPONSE looks identical to a lost request from the browser, but
     * the visit may well be recorded. Telling the receptionist to try again
     * would duplicate the client and the visit, so this sends them to Bookings
     * to look instead.
     */
    saveUnknown: 'The connection dropped. Check Bookings before recording this again — it may already be there.',
    recorded: 'Recorded',
    overlap: (provider: string) => `${provider} is also with someone else right now.`,
    takePayment: 'Take payment now',
    // Jira GRW-222 — the walk-in queue. "Queue", the word the front desk uses.
    addToQueue: 'Add to waiting queue',
    queued: 'Added to the queue',
    // Jira GRW-284 — the number the desk says out loud.
    token: (n: number) => `Token ${n}`,
    // --- book-for-later only ---
    laterTitle: 'Book for later',
    modeLabel: 'When is this visit?',
    modeNow: 'Walk-in now',
    modeLater: 'For later',
    whichDay: 'Which day?',
    today: 'Today',
    whichTime: 'Which time?',
    loadingTimes: 'Finding free times…',
    noTimes: 'No free times that day. Try another day, or a different stylist.',
    phoneRequired: 'Phone number',
    phoneWhyLater: 'Needed so we can send them a reminder.',
    phoneMissing: 'A phone number is needed so they can be reminded.',
    next: 'Next',
    bookIt: 'Book it',
    booking: 'Booking…',
    booked: 'Booked',
    slotTaken: 'That time was just taken. Pick another.',
    openingTill: 'Opening…',
    tillFailed: 'Could not open the till here. The visit is saved — take the payment from Bookings.',
    // Jira GRW-289 — Record payment's till closed without saving.
    notPaidYet: 'The visit is saved, but it is not paid yet. Take the payment now, or later from Bookings.',
    done: 'Done',
  },

  services: {
    subtitle: 'What you offer, how long each takes, and what you charge.',
    name: 'Service',
    type: 'Type',
    /* "Takes" is the design's word. Our owners are not all confident readers, and
       "Minutes" names both the column and its unit without being decoded. */
    duration: 'Minutes',
    cleanupTime: 'Cleanup time after',
    price: 'Price',
    status: 'Status',
    noCleanup: 'None',
    minutes: (n: number) => `${n} min`,
  },

  /*
   * Jira GRW-216 — the owner's switch for one stylist's earnings visibility.
   *
   * Plain words, because this switch decides whether somebody can check their
   * own pay. "Show their own earnings" says what happens; "revenue visibility"
   * would make the owner guess.
   */
  staffEdit: {
    seesOwnRevenue: 'Show their own earnings',
    revenueOnHint:
      'They can see the money their own bookings brought in \u2014 today and this month. Never anybody else\u2019s, and never the salon\u2019s total.',
    revenueOffHint:
      'They see their schedule only, no money. Turn this on for anyone paid a share of what their chair takes.',
  },
  staff: {
    subtitle: (used: number, allowed: number) => `${used} of ${allowed} people on your plan.`,
    name: 'Name',
    role: 'Role',
  },

  /**
   * Reports (GRW-48). Every tab's subtitle is written as the question the tab
   * answers, which is the plainest statement of what it is for — an owner who
   * reads "Who is coming back?" knows whether this is the tab they want
   * without learning what "retention" means (see the plain-language rule at
   * the top of this file, and 12-conventions.md §12).
   */
  /**
   * Reports (GRW-48).
   *
   * Two rules beyond the plain-language one at the top of this file.
   *
   * **Every tab subtitle is the question that tab answers.** An owner who
   * reads "Who is coming back?" knows whether it is the tab they want without
   * first learning what "retention" means.
   *
   * **A figure appears as a tile on one tab only.** The first draft had 24
   * tiles across five tabs and showed money earned, bookings, new clients and
   * repeat rate on two or three of them each. Conventions §6 retired a KPI
   * row for exactly this: numbers that restate each other read as numbers
   * that contradict each other. Overview carries the four headline figures;
   * every other tab carries only what is its own.
   */
  reports: {
    // Jira GRW-238 — the Reports branch control.
    allBranches: 'All branches',
    branchClientsNote: (branch: string) => `Money and bookings are for ${branch}. Client groups count every branch.`,
    title: 'Reports',
    navLabel: 'Reports',

    tabs: {
      overview: 'Overview',
      customers: 'Clients',
      revenue: 'Money',
      bookings: 'Bookings',
      services: 'Services',
      staff: 'Staff',
    },
    subtitles: {
      overview: 'How is your business doing?',
      customers: 'Who are your clients, and do they come back?',
      revenue: 'Where is your money coming from?',
      bookings: 'How much work do you have?',
      services: 'Which services actually earn?',
      staff: 'Who is bringing in the most?',
    },

    ranges: {
      today: 'Today',
      last_7_days: 'Last 7 days',
      this_month: 'This month',
      last_month: 'Last month',
      last_3_months: 'Last 3 months',
      this_year: 'This year',
      custom: 'Pick dates',
    },
    compare: 'Compare with before',
    /**
     * What each figure actually counts (GRW-66).
     *
     * Written from the queries, not from the tile labels — the point of the
     * ⓘ is that the rule behind a number is not guessable from its name, so a
     * plausible-sounding sentence here would be worse than no button at all.
     * If a metric's definition changes, this text changes in the same commit.
     */
    explain: {
      // ---- Overview
      overviewRevenue:
        'Money from visits that were done in the dates you picked. If you wrote down what was paid, we use that. If not, we use the price on the booking.',
      overviewBookings:
        'Bookings in the dates you picked. We leave out ones you called off and ones nobody came to. If someone books three things in one visit, that counts as one booking.',
      overviewNewClients:
        'People who booked with you for the very first time in these dates. Someone who came years ago and came back is not new.',
      overviewRepeat: 'Out of the people who came in these dates, how many came more than once.',
      // ---- Money
      revenueCompleted:
        'Money from visits that were done in these dates. Bookings that have not happened yet are not counted.',
      revenueAvgBooking: 'Money from done visits, divided by how many visits were done.',
      revenuePerClient:
        'Money from done visits, divided by how many different people came. Someone who came three times counts as one person.',
      // ---- Bookings
      bookingsTotal:
        'Bookings in these dates. We leave out ones you called off and ones nobody came to. Three things booked in one visit count as one.',
      bookingsNoShow: 'Bookings where nobody turned up, and nothing on that booking was done.',
      bookingsCancelled:
        'Bookings that were called off. If part of the visit still went ahead, it is not counted here.',
      // ---- Clients
      clientsTotal:
        'Everyone on your list today, no matter how long ago they came. This one does not change with the dates you pick.',
      clientsNew: 'People who booked with you for the very first time in these dates.',
      opportunities:
        'Regulars who are due back or already late, sorted by what one visit from them is usually worth. Someone who often does not turn up counts for less. We leave out anyone already booked in, and anyone who asked us not to contact them. It takes three past visits to know someone\u2019s usual gap.',
      clientsOverdue:
        'People who have left it longer than they usually do between visits. We need three past visits to know someone\u2019s usual gap, so newer clients are not counted. This is about today, not the dates you pick.',
    },
    filters: 'Filters',
    export: 'Download',
    notBuiltYet: 'Coming soon',
    /**
     * Why the control is off on Overview, Clients and What to do.
     *
     * Plainly, and in the owner's terms: these tabs count people by how long
     * it has been since they came, not bookings in the period, so narrowing
     * them by service would change what the number means (GRW-60, BR-01).
     */
    filtersNotHere: 'Filters work on Money, Bookings, Services and Staff',
    filtersOnOtherTabs: (n: number) =>
      n === 1
        ? '1 filter is set, but it does not change this tab'
        : `${n} filters are set, but they do not change this tab`,
    exportNothing: 'Nothing to download for this range',
    filterDrawer: {
      title: 'Narrow this report',
      close: 'Close',
      services: 'Service',
      status: 'What happened',
      retired: 'no longer offered',
      noProviders: 'No staff to filter by yet',
      noServices: 'No services to filter by yet',
      reset: 'Clear all',
      apply: 'Show all',
      applyCount: (n: number) => `Show ${n === 1 ? '1 filter' : `${n} filters`}`,
    },
    /** The removable summary above a narrowed tab (FR-04). */
    applied: 'Showing only:',
    clearFilters: 'Clear filters',
    remove: (name: string) => `Remove ${name}`,
    droppedFilters: (n: number) =>
      n === 1
        ? 'One filter was dropped — it pointed at something that no longer exists'
        : `${n} filters were dropped — they pointed at things that no longer exist`,
    utilisationSuppressed:
      'Busy % is hidden while a service or outcome filter is on: the hours someone was available cannot be narrowed the same way, so the figure would read low',

    // ---- Overview: the four headline figures, and nowhere else ----
    kpi: {
      revenue: 'Money earned',
      bookings: 'Bookings',
      newCustomers: 'New clients',
      repeatRate: 'Came back',
    },

    segments: {
      active: 'Coming in',
      due: 'Due a visit',
      at_risk: 'Slipping away',
      inactive: 'Gone quiet',
    },
    segmentsTitle: 'How your clients are doing',
    /** Overview has no client-count tile, so its version carries the total. */
    segmentsHint: (total: number) => `${total} clients, by how long since they were last in`,
    /** The Clients tab shows the total in its own figure row, so it only needs the affordance. */
    segmentsTapHint: 'Tap one to see just those',
    neverVisited: (n: number) => `${n} have not been in yet, so they are in none of these.`,

    revenueTrend: 'Money over time',
    bookingTrend: 'Bookings over time',
    topServices: 'Top services by money',
    peakOutside: (hours: string) => `${hours} booked outside your opening hours.`,

    opportunities: 'Worth a call this week',
    opportunitiesHint: 'Due back, and worth the most first',
    /** The figure beside each name: what one visit from them is usually worth. */
    perVisit: (amount: string) => `${amount} a visit`,
    overdueBy: (days: number) => `${days} days late`,
    dueNow: 'Due now',
    dueIn: (days: number) => `Due in ${days} days`,
    usuallyEvery: (days: number) => `Usually every ${days} days`,

    // Shared states
    noPrior: 'no earlier data',
    noData: 'Nothing here yet',
    noDataHint: (range: string) => `No bookings in ${range.toLowerCase()}. Try a longer stretch of time.`,
    notEnoughVisits: 'Not enough visits yet to spot a pattern.',
    loadFailed: 'Could not load this.',
    retry: 'Try again',
    comingSoonTab: 'This part is not built yet.',

    // ---- Money ----
    money: {
      earned: 'Money earned',
      perVisit: 'Average visit',
      perClient: 'Average client',
      trend: 'Money over time',
      trendHint: 'Only visits that actually happened',
      bookedNote: (total: string) =>
        `${total} is booked in total, including visits still to happen.`,
      byService: 'Which services earn it',
      byStaff: 'Who earns it',
      bySegment: 'New faces or regulars',
      byPayment: 'How people paid',
      notRecordedHint: 'Marking a visit done in one tap records no amount, so those land in "Not recorded".',
    },

    // ---- Bookings ----
    bookingsTab: {
      // The four status words are NOT repeated here. They live in copy.status
      // and are read from there, so a slice of the chart and a chip on the
      // Bookings screen cannot say different things about the same state —
      // which is what GRW-020 shipped (conventions §3).
      total: 'Bookings',
      totalHint: 'Called-off visits and no-shows are left out of this count',
      trend: 'Is work going up or down?',
      trendHint: 'Bookings in each stretch of the period you picked',
      /**
       * The heading asks a direction question, so the card answers it in a
       * sentence instead of leaving an owner to read a direction out of a
       * zigzag. The dashed line on the chart is the same answer, drawn.
       */
      trendVerdict: {
        up: 'Work is picking up',
        down: 'Work is easing off',
        flat: 'Work is holding steady',
      },
      trendDetail: (from: number, to: number, unit: string) =>
        `from around ${from} a ${unit} to around ${to}`,
      trendSteady: (about: number, unit: string) => `around ${about} a ${unit} throughout`,
      /** Too few points to average anything out — say so rather than guess. */
      trendTooShort: 'Pick a longer period to see which way work is going',
      status: 'How they ended',
      statusHint: 'Every booking, including the ones called off',
      source: 'Where they came from',
      sourceHint: 'Booked on WhatsApp, or added by you at the desk',
      // Sits beside the trend above it, and the two were read as the same
      // chart twice. They are not: one is whether work is growing over the
      // period, this one is which hours of a week fill up. The titles now say
      // which is which instead of both saying "time".
      peak: 'Your busiest hours',
      peakHint: 'Which hours of the week fill up, averaged across the period',
      /** The two ends of the colour key. Plain words, not "low" and "high". */
      peakQuiet: 'Nobody in',
      peakBusy: 'Busiest',
    },

    // ---- Services ----
    servicesTab: {
      mostBooked: 'Booked most often',
      topRevenue: 'Earns the most',
      pairHint: 'Your most popular service is often not your best earner',
      table: 'Every service',
      // States which columns are period figures and which are not. "Came back"
      // cannot be a period figure — a seven-day range has nothing to say about
      // whether anyone returned — and a column silently on a different basis
      // from its neighbours is a number nobody can check.
      tableHint: 'Bookings and money for the period you picked. "Came back" is all time — a short period cannot show it.',
      colService: 'Service',
      colBookings: 'Bookings',
      colRevenue: 'Money',
      colAvg: 'Average',
      colMinutes: 'Minutes',
      colRepeat: 'Came back',
      colCancel: 'Called off',
      thinSample: 'too few clients to say',
      retired: 'no longer offered',
    },

    // ---- Staff ----
    staffTab: {
      byRevenue: 'Who brings in the most',
      utilisation: 'How full their days are',
      utilisationHint: 'Booked time against the hours they were free to work',
      table: 'Side by side',
      colName: 'Name',
      colBookings: 'Bookings',
      colCompleted: 'Finished',
      colRevenue: 'Money',
      colAvg: 'Average',
      colUtilisation: 'How full',
      colNoShow: "Didn't come",
      noHours: 'no hours set',
    },

    // ---- Clients ----
    customersTab: {
      total: 'Clients',
      newClients: 'New clients',
      overdue: 'Due back',
      overdueHint: 'Past the gap they normally leave between visits',
      opportunities: 'Worth knowing',
      viewClients: 'See these clients',
      /**
       * Three groups, not five.
       *
       * "Gone quiet" here counted everyone 30+ days away — which is the Due a
       * visit, Slipping away and Gone quiet bands added together, under a name
       * one of those bands already uses. Two numbers under two identical words
       * on one screen is the defect conventions §3 exists to stop, and it was
       * on screen: 1,081 here against 328 in the bands.
       *
       * "Due back" was worse: the same figure as the tile directly above it.
       *
       * What is left is what the recency bands cannot say — how often someone
       * comes and how much they spend.
       */
      cards: {
        loyal: { title: 'Regulars', hint: 'been in 5+ times' },
        highValue: { title: 'Big spenders', hint: 'spent over ₹10,000' },
        atRisk: { title: 'Regulars who stopped', hint: 'came often, gone 2 months' },
      },
      neverBand: 'Never been in',
      spend: 'What people spend',
      spendHint: 'Every client, by what they have spent with you in total — not just this period',
      frequency: 'How often they come',
      frequencyHint: 'Every client, counting all their visits — not just this period',
      avgInterval: 'Time between visits',
      avgVisits: 'Visits per client',
      top: 'Your best clients',
      topHint: 'Highest total spend first',
      colClient: 'Client',
      colVisits: 'Visits',
      colSpend: 'Total spent',
      colAvg: 'Average',
      colLast: 'Last in',
      colFavourite: 'Usual',
      colInterval: 'Comes every',
      daysAgo: (n: number) => `${n} days ago`,
      neverIn: 'never been in',

      /**
       * All that survives of the old "Coming back" tab. Its three charts —
       * new-vs-regulars over time, the repeat-revenue share and the repeat-rate
       * trend — came out again: three graphs answering, at length, what this
       * one tile answers in a number, on a tab an owner opens to find people
       * to call.
       */
      repeatRate: 'Came back',
    },

    // ---- What to do ----
  },

  /**
   * The client card — one client's whole story, opened from a row.
   *
   * The same card serves the Clients page and the Reports Clients tab. Two
   * copies would drift, and an owner who taps a name in two places should not
   * get two different accounts of the same person.
   */
  /** The Clients page's own words. Domain nouns still come from ctx.labels. */
  clients: {
    segmentsTitle: 'How your clients are doing',
    segmentsHint: 'Tap one to see just those',
    neverVisited: (n: number, pct: number) => `${n} (${pct}%) have not been in yet, so they are in none of these`,
    /**
     * The same fact for a phone. The full sentence wrapped to eleven lines at
     * 320px and pushed the bands card to 405px — most of a small screen spent
     * explaining a footnote. What has to survive is the number, because
     * without it the four bands look like they should add up to the total.
     */
    showingAll: 'Showing everyone',
    /*
     * Jira GRW-207 — one number, one noun.
     *
     * This value was rendered as "2 bookings" on the list and "2 visits" in the
     * walk-in picker, while also deciding "Returning clients" and "Repeat rate".
     * It counts times the client has been in, so "visits" is the true word and
     * the other three sites now use this.
     */
    visitsCsvHeader: 'Total visits',
    segments: {
      active: { label: 'Coming in', range: '0–30 days' },
      due: { label: 'Due a visit', range: '31–45 days' },
      at_risk: { label: 'Slipping away', range: '46–90 days' },
      inactive: { label: 'Gone quiet', range: '90+ days' },
    },
  },

  clientCard: {
    /*
     * Jira GRW-218 — the plainest words available. "Edit" and "Save", not
     * "Update record" or "Amend details": the person using this is at a counter
     * with somebody waiting.
     */
    edit: 'Edit',
    save: 'Save',
    saving: 'Saving…',
    cancel: 'Cancel',
    namePlaceholder: 'Name',
    phonePlaceholder: '10-digit mobile',
    saveFailed: 'Could not save. Try again.',
    kicker: 'Client',
    totalSpent: 'Total spent',
    totalVisits: 'Visits',
    insight: 'What we know',
    rows: {
      visits: 'Visits',
      spent: 'Total spent',
      avgSpend: 'Average spend',
      lastVisit: 'Last in',
      favourite: 'Usual service',
      topProvider: 'Usually sees',
      interval: 'Comes every',
      cancelRate: 'Calls off',
      since: 'Client since',
      nextVisit: 'Due back',
    },
    recent: 'Last few visits',
    // "0 days ago" is not something anyone says.
    daysAgo: (n: number) => (n === 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`),
    days: (n: number) => (n === 1 ? '1 day' : `${n} days`),
    dueIn: (n: number) => (n === 1 ? 'tomorrow' : `in about ${n} days`),
    dueNow: 'due now',
    overdue: (n: number) => (n === 1 ? '1 day late' : `${n} days late`),
    notEnough: 'not enough visits yet',
    neverIn: 'never been in',
    call: 'Call',
    viewBookings: 'See bookings',
    close: 'Close',
    loadFailed: 'Could not load this client.',
    noPhone: 'no number saved',
  },

} as const;
