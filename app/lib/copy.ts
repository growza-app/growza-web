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

  search: {
    title: 'Search',
    placeholder: 'Name, phone, or booking ID',
    customers: 'CUSTOMERS',
    bookings: 'BOOKINGS',
    nothing: 'Nothing found.',
    hint: 'Search by a customer name, any part of their phone number, or a booking ID.',
    visits: (n: number) => `${n} ${n === 1 ? 'visit' : 'visits'}`,
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

  freeTimes: {
    title: 'Free times',
    subtitle: 'Times customers can book right now. Already-booked times and breaks are removed automatically.',
    // Same screen, reframed: reached via the mobile "+" button, this is
    // someone's entry point to actually creating a booking, not a glance
    // at the schedule — the heading should say so.
    newBookingTitle: 'New booking',
    newBookingSubtitle: 'Pick a service and a time to book someone in.',
    pickService: 'Which service?',
    pickDay: 'Which day?',
    show: 'Show free times',
    countLabel: (n: number) => `${n} ${n === 1 ? 'time' : 'times'} free`,
    none: 'No free times left — the day is full, closed, or too soon to book.',
    morning: 'Morning',
    afternoon: 'Afternoon',
    evening: 'Evening',
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

  staff: {
    subtitle: (used: number, allowed: number) => `${used} of ${allowed} people on your plan.`,
    name: 'Name',
    role: 'Role',
  },

  bookings: {
    // The old table's column headers and its "Which day?" / "Show" filter
    // strings lived here. GRW-47 replaced that table with cards and a
    // combined filter bar whose every control applies on selection, so none
    // of them had a caller left — removed rather than kept as dead copy the
    // next reader has to check for.
    none: 'No bookings that day.',

    // Filter bar. Plain words over precise ones: an owner scanning this reads
    // "Oldest first" without stopping, where "Earliest first" made them think
    // about what it was earliest *of*. Same reason "Staff" beats "Provider"
    // and "Search name, phone or booking ID" beats naming every field.
    search: 'Search',
    searchHint: 'Search name, phone or booking ID',
    from: 'From',
    to: 'To',
    staff: 'Staff',
    // Not "Show": the submit button next to it already says that, and two
    // adjacent controls carrying the same word is worse than one slightly
    // less casual one. "Status" is a plain word and already the table's own
    // column header for this same field.
    statusLabel: 'Status',
    allStatuses: 'All bookings',
    sort: 'Order',
    oldestFirst: 'Oldest first',
    newestFirst: 'Newest first',

    // Schedule
    scheduleToday: "Today's schedule",
    bookingCount: (n: number) => `${n} ${n === 1 ? 'booking' : 'bookings'}`,
    sameTime: (n: number) => `${n} bookings at the same time`,
    viewTimeline: 'Timeline',
    viewList: 'List',

    // Empty state when a filter matches nothing
    noneFound: 'No bookings found',
    noneFoundHint: 'Try another name, staff member or date.',
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
    title: 'Reports',
    navLabel: 'Reports',

    tabs: {
      overview: 'Overview',
      customers: 'Clients',
      revenue: 'Money',
      bookings: 'Bookings',
      services: 'Services',
      staff: 'Staff',
      retention: 'Coming back',
      insights: 'What to do',
    },
    subtitles: {
      overview: 'How is your business doing?',
      customers: 'Who are your best clients?',
      revenue: 'Where is your money coming from?',
      bookings: 'How much work do you have?',
      services: 'Which services actually earn?',
      staff: 'Who is bringing in the most?',
      retention: 'Who is coming back?',
      insights: 'What should you do this week?',
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
    filters: 'Filters',
    export: 'Download',
    notBuiltYet: 'Coming soon',

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
    segmentsHint: (total: number) => `${total} clients, by how long since they were last in`,
    neverVisited: (n: number) => `${n} have not been in yet, so they are in none of these.`,

    revenueTrend: 'Money over time',
    bookingTrend: 'Bookings over time',
    topServices: 'Top services by money',
    peakHours: 'When you are busiest',
    peakHoursHint: 'Where your booked time lands across a normal week',
    peakOutside: (hours: string) => `${hours} booked outside your opening hours.`,

    opportunities: 'Worth a call this week',
    opportunitiesHint: 'Regulars who are due back, or already late',
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
      upcoming: 'Still to come',
      totalHint: 'Called-off visits and no-shows are left out of this count',
      trend: 'Bookings over time',
      status: 'How they ended',
      statusHint: 'Every booking, including the ones called off',
      source: 'Where they came from',
      sourceHint: 'Booked on WhatsApp, or added by you at the desk',
      peak: 'When the work lands',
      peakHint: 'Booked time across a normal week',
    },

    // ---- Services ----
    servicesTab: {
      mostBooked: 'Booked most often',
      topRevenue: 'Earns the most',
      pairHint: 'Your most popular service is often not your best earner',
      table: 'Every service',
      tableHint: 'Bookings, money, and how often people come back for it',
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
      opportunities: 'Who to contact',
      opportunitiesHint: 'Grouped by what to do about them',
      viewClients: 'See these clients',
      cards: {
        quiet30: { title: 'Gone quiet', body: (n: number) => `${n} clients have not been in for a month or more` },
        overdue: { title: 'Due back', body: (n: number) => `${n} are past the gap they normally leave` },
        loyal: { title: 'Regulars', body: (n: number) => `${n} have been in 5 times or more` },
        highValue: { title: 'Big spenders', body: (n: number) => `${n} have spent over ₹10,000 with you` },
        atRisk: { title: 'Regulars slipping', body: (n: number) => `${n} used to come often and have not been in for 2 months` },
      },
      spend: 'What people spend',
      spendHint: 'Clients grouped by what they have spent in total',
      frequency: 'How often they come',
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
    },

    // ---- Coming back ----
    retentionTab: {
      repeatRate: 'Came back',
      repeatRateHint: 'Share of clients who had been in before',
      returning: 'Regulars seen',
      avgInterval: 'Time between visits',
      mix: 'New clients and regulars',
      mixHint: 'Clients seen over time, split by whether they had been before',
      repeatShare: 'Regulars brought in',
      repeatShareHint: 'of the money you earned',
      firstToSecond: 'Booked a second time',
      lifetime: 'How long clients stay',
      months: (n: number) => `${n} months`,
      trend: 'How many come back, over time',
      thinSample: (n: number, floor: number) =>
        `Only ${n} clients have been in more than once — too few to work out an average until there are ${floor}.`,
    },

    // ---- What to do ----
    insightsTab: {
      bannerKicker: 'What to do',
      bannerBody: 'Worked out from your own bookings, not guessed.',
      showing: (n: number, total: number) =>
        `Showing ${n} of ${total}. The rest need more bookings before they can tell you anything useful.`,
      none: 'Nothing to flag right now.',
      noneHint: 'Come back after a few more weeks of bookings.',
      categories: {
        growth: 'Money',
        quietCustomers: 'Clients',
        repeatRevenue: 'Coming back',
        peakWindow: 'How busy you are',
        overdueRegulars: 'Worth a call',
        bestPerBooking: 'Services',
      },
      ctas: {
        growth: 'See the money',
        quietCustomers: 'See these clients',
        repeatRevenue: 'See who comes back',
        peakWindow: 'See bookings',
        overdueRegulars: 'See these clients',
        bestPerBooking: 'See services',
      },
    },
  },

  /**
   * The client card — one client's whole story, opened from a row.
   *
   * The same card serves the Clients page and the Reports Clients tab. Two
   * copies would drift, and an owner who taps a name in two places should not
   * get two different accounts of the same person.
   */
  clientCard: {
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

  errors: {
    apiDown: 'Cannot reach the server.',
    apiDownHelp: 'Ask your developer to start it, or run',
  },
} as const;
