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
  reports: {
    title: 'Reports',
    navLabel: 'Reports',

    tabs: {
      overview: 'Overview',
      customers: 'Customers',
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
    // Shown on the two controls the design draws but does not define. They are
    // disabled rather than silently doing nothing, so the screen never has a
    // button that looks alive and is not (GRW-60).
    notBuiltYet: 'Coming soon',

    kpi: {
      revenue: 'Money earned',
      bookings: 'Bookings',
      completed: 'Finished',
      avgBookingValue: 'Average booking',
      newCustomers: 'New clients',
      repeatRate: 'Came back',
    },

    segments: {
      active: 'Active',
      due: 'Due',
      at_risk: 'Slipping',
      inactive: 'Gone quiet',
    },
    segmentsTitle: 'How your clients are doing',
    segmentsHint: (total: number) => `${total} clients, by how long since their last visit`,
    neverVisited: (n: number) => `${n} have not been in yet, so they are in none of these.`,

    revenueTrend: 'Money over time',
    bookingTrend: 'Bookings over time',
    topServices: 'Top services by money',
    peakHours: 'When you are busiest',
    peakHoursHint: 'Where your booked time lands across the week',
    peakOutside: (hours: string) => `${hours} booked outside your opening hours.`,

    opportunities: 'Worth a call this week',
    opportunitiesHint: 'Regulars who are due back, or already late',
    overdueBy: (days: number) => `${days} days late`,
    dueNow: 'Due now',
    dueIn: (days: number) => `Due in ${days} days`,
    usuallyEvery: (days: number) => `Usually every ${days} days`,

    // States
    noPrior: 'no earlier data',
    noData: 'Nothing here yet',
    noDataHint: (range: string) => `No bookings in ${range.toLowerCase()}. Try a longer stretch.`,
    notEnoughVisits: 'Not enough visits yet to spot a pattern.',
    loadFailed: 'Could not load this.',
    retry: 'Try again',
    comingSoonTab: 'This part is not built yet.',
  },

  errors: {
    apiDown: 'Cannot reach the server.',
    apiDownHelp: 'Ask your developer to start it, or run',
  },
} as const;
