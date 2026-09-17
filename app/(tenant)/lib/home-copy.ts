import type { Lang } from './lang';
import { copy } from './copy';

/**
 * Jira GRW-222 — every word on the three Homes, the header and the navigation,
 * in English and Hindi.
 *
 * English reuses `copy.ts` wherever the same idea is already worded there (the
 * client segment names, the nav labels) so one idea keeps one wording across
 * screens. The Hindi is the design's own wording, taken verbatim.
 *
 * Domain nouns stay with the vertical: in English the provider and booking
 * words come from `ctx.labels`, so a clinic reads "Doctor" and "Visits". The
 * vertical configs carry no Hindi labels yet, so Hindi uses the design's
 * generic words (स्टाफ, बुकिंग, ग्राहक) for every vertical — better a correct
 * general word than an English noun in the middle of a Hindi sentence.
 */

type Labels = Record<string, string>;

const segmentsHi = {
  active: { label: 'आ रहे हैं', range: '0–30 दिन' },
  due: { label: 'आने का समय', range: '31–45 दिन' },
  at_risk: { label: 'दूर हो रहे हैं', range: '46–90 दिन' },
  inactive: { label: 'आना बंद कर दिया', range: '90+ दिन' },
} as const;

export function homeCopy(lang: Lang, labels: Labels = {}) {
  const hi = lang === 'hi';
  const S = (en: string, h: string) => (hi ? h : en);
  const bookingsWord = hi ? 'बुकिंग' : (labels.appointments ?? copy.nav.appointments).toLowerCase();
  const clientsWord = hi ? 'ग्राहक' : (labels.customers ?? copy.nav.customers);
  /*
   * "1 booking", not "1 bookings". The vertical carries both forms
   * (`appointment` / `appointments`, `customer` / `customers`); Hindi uses one
   * word for both, as the design does.
   */
  const bookingWord = (n: number) => (hi ? 'बुकिंग' : (n === 1 ? (labels.appointment ?? 'booking') : bookingsWord).toLowerCase());
  const newClientWord = (n: number) =>
    hi ? 'नए ग्राहक' : `new ${(n === 1 ? (labels.customer ?? 'client') : clientsWord).toLowerCase()}`;

  return {
    lang,
    langToggle: hi ? 'हिं' : 'EN',
    langToggleLabel: S('Change language', 'भाषा बदलें'),

    greeting: (part: 'morning' | 'afternoon' | 'evening') =>
      hi ? 'नमस्ते!' : `Good ${part}`,
    ownerSub: (business: string, afterClose: boolean) =>
      afterClose ? S(`${business} is closed for today.`, 'आज दुकान बंद हो गई।') : S(`See how ${business} is doing today.`, 'देखें आज दुकान कैसी चल रही है।'),
    receptionSub: S("Take care of today's customers.", 'आज के ग्राहकों का ध्यान रखें।'),
    stylistSub: S('Your work for today.', 'आज आपका काम।'),
    /** Jira GRW-251 — "21:00" → "Your work for today. Open till 9 pm." */
    stylistSubUntil: (hhmm: string) => {
      const [raw = 0, m = 0] = hhmm.split(':').map(Number);
      const h = raw % 24; // "24:00" is midnight, not noon (GRW-253 QA)
      const clock = `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
      if (!hi) return `Your work for today. Open till ${h === 0 && m === 0 ? 'midnight' : `${clock} ${h < 12 ? 'am' : 'pm'}`}.`;
      // The same 12-hour clock as the English, said the Hindi way: सुबह / दोपहर / शाम / रात.
      const part = h < 4 ? 'रात' : h < 12 ? 'सुबह' : h < 16 ? 'दोपहर' : h < 20 ? 'शाम' : 'रात';
      return `आज आपका काम। शाखा ${part} ${clock} बजे तक खुली है।`;
    },
    stylistSubClosedToday: S('Your branch is closed today.', 'आज आपकी शाखा बंद है।'),
    /** Jira GRW-251 — a branch closed while they still work there. */
    branchClosed: (name: string) => (hi ? `${name} (बंद)` : `${name} (closed)`),

    today: S('Today', 'आज'),
    week: S('Week', 'हफ़्ता'),
    month: S('Month', 'महीना'),
    allBranches: S('All branches', 'सभी ब्रांच'),
    branch: S('Branch', 'ब्रांच'),

    moneyToday: S('Money today', 'आज का पैसा'),
    moneyWeek: S('Money this week', 'इस हफ़्ते का पैसा'),
    moneyMonth: S('Money this month', 'इस महीने का पैसा'),
    vsYesterday: S('vs yesterday', 'कल से'),
    vsLastWeek: S('vs last week', 'पिछले हफ़्ते से'),
    vsLastMonth: S('vs last month', 'पिछले महीने से'),
    bookingsWord,
    bookingWord,
    newClientWord,
    cameBack: S('came back', 'दोबारा आए'),
    howPaid: S('How they paid', 'कैसे पैसे दिए'),
    noMoneyYet: S('No money taken yet', 'अभी तक कोई पैसा नहीं'),
    thisWeek: S('This week', 'इस हफ़्ते'),
    thisMonth: S('This month', 'इस महीने'),
    payment: {
      upi: 'UPI',
      cash: S('Cash', 'नकद'),
      card: S('Card', 'कार्ड'),
      other: S('Other', 'अन्य'),
      not_recorded: S('Not known', 'पता नहीं'),
    } as Record<string, string>,

    needsYourAttention: S('Needs your attention', 'आपके ध्यान की ज़रूरत'),
    needsAttention: S('Needs attention', 'ध्यान देने वाली बातें'),
    notMarkedDone: S('Not marked done yet', 'अभी पूरे नहीं हुए'),
    fromToday: S('From today', 'आज के'),
    cancelledToday: S('Booking cancelled', 'बुकिंग रद्द हुई'),
    cancelledTodayShort: S('Cancelled today', 'आज रद्द हुए'),
    todayWord: S('Today', 'आज'),
    staffNotMarkedIn: S('Staff not marked in', 'स्टाफ की हाज़िरी बाकी'),
    attendanceWord: S('Attendance', 'हाज़िरी'),

    quickLinks: S('Quick links', 'शॉर्टकट'),
    yourBranches: S('Your branches', 'आपकी ब्रांच'),
    branchMeta: (bookings: number, money: string) => `${bookings} ${bookingWord(bookings)} · ${money}`,
    mainBranch: S('Main', 'मुख्य'),
    branchBusy: S('Busy', 'व्यस्त'),
    branchSlow: S('Slow', 'धीमा'),
    branchCount: (n: number) => S(`${n} branches`, `${n} ब्रांच`),

    clientsDoingTitle: hi ? 'आपके ग्राहक कैसे हैं' : copy.clients.segmentsTitle,
    clientsDoingHint: hi ? 'किसी एक पर टैप करें' : copy.clients.segmentsHint,
    neverVisited: (n: number, pct: number) =>
      hi ? `${n} (${pct}%) ग्राहक अभी तक नहीं आए, इसलिए वे किसी में नहीं हैं` : copy.clients.neverVisited(n, pct),
    segments: hi ? segmentsHi : copy.clients.segments,

    bookingsToday: S(`${labels.appointments ?? 'Bookings'} today`, 'आज की बुकिंग'),
    bookingsTomorrow: S(`Tomorrow's ${bookingsWord}`, 'कल की बुकिंग'),
    viewAll: S('View all', 'सभी देखें'),
    nothingToday: S('Nothing booked today yet.', 'आज अभी कोई बुकिंग नहीं।'),
    nothingTomorrow: S('Nothing booked for tomorrow yet.', 'कल के लिए अभी कोई बुकिंग नहीं।'),

    status: {
      completed: S('Done', 'पूरा हुआ'),
      inService: S('Getting service', 'सेवा चल रही है'),
      late: (min: number) => S(`${min} min late`, `${min} मिनट देर`),
      later: S('Coming later', 'बाद में आएँगे'),
      cancelled: S('Cancelled', 'रद्द'),
      noShow: S("Didn't come", 'नहीं आए'),
      needsAnswer: S('Not marked', 'दर्ज नहीं'),
    },

    dayClosed: (time: string) => S(`Day closed at ${time}`, `दुकान ${time} बजे बंद हुई`),
    dayClosedSub: S('Tap to see the full day summary', 'पूरा हिसाब देखने के लिए टैप करें'),
    closedToday: S('Closed today', 'आज बंद है'),
    daySummary: S('Day summary', 'दिन का हिसाब'),
    todaysSummary: S("Today's summary", 'आज का पूरा हिसाब'),
    moneyTaken: S('Money today', 'आज मिला पैसा'),
    done: S('done', 'पूरे हुए'),
    notDone: S('still to do', 'बाकी हैं'),
    staffToday: S('Staff today', 'आज का स्टाफ'),
    staffTodaySub: S('Work and money for each person', 'हर व्यक्ति का काम और पैसा'),
    staffBookings: (n: number) => `${n} ${bookingWord(n)}`,
    nobodyWorked: S('No work done yet today.', 'आज अभी कोई काम नहीं हुआ।'),
    close: S('Close', 'बंद करें'),
    // Day summary — clients (Jira GRW-222). Plain words on purpose: the owner's
    // rule is that the people reading this may not be confident readers, so
    // "First time" not "New", "Booked again" not "Booked next visit"
    // (12-conventions.md, rule 12). "Today's summary", "Served" and "Returned
    // clients" are the owner's own choice of words, kept on review.
    clientsToday: S(`${clientsWord} today`, 'आज के ग्राहक'),
    clientsTodaySub: S('Who came today', 'आज कौन आया'),
    served: S('Served', 'सेवा दी'),
    newToday: S('First time', 'पहली बार'),
    cameBackToday: S('Returned clients', 'दोबारा आए ग्राहक'),
    bookedNext: S('Booked again', 'फिर से बुक किया'),
    didntCome: S("Didn't come", 'नहीं आए'),
    walkedOut: S('Left without service', 'बिना सेवा चले गए'),
    newTodayList: S('First time today', 'आज पहली बार'),
    callThem: S("Didn't come — call them", 'नहीं आए — फ़ोन करें'),
    topClients: S('Paid the most today', 'आज सबसे ज़्यादा पैसा दिया'),
    nobodyNew: S('Nobody new today.', 'आज कोई नया नहीं।'),
    everyoneCame: S('Everyone came.', 'सभी आए।'),
    noSpendYet: S('Nobody has paid yet.', 'अभी तक किसी ने पैसा नहीं दिया।'),
    viaWhatsApp: (n: number) => S(`${n} booked on WhatsApp`, `${n} WhatsApp से बुक`),
    atCounter: (n: number) => S(`${n} booked at the shop`, `${n} दुकान पर बुक`),
    tomorrowCount: (n: number) => S(`${n} coming tomorrow`, `कल ${n} आएँगे`),
    unnamed: S('No name', 'बिना नाम'),

    // Front desk
    walkInNow: S('Walk-in — customer here now', 'ग्राहक आया है — अभी'),
    walkInShort: S('Walk-in', 'ग्राहक आया'),
    newAppointment: S('New appointment', 'नई बुकिंग'),
    newAppointmentSub: S('Book for a later time', 'बाद के समय के लिए'),
    hereNow: S('Here now', 'अभी यहाँ'),
    beingServed: (n: number) => S(`${n} being served`, `${n} की सेवा चल रही है`),
    nobodyHere: S('Nobody is in right now.', 'अभी कोई नहीं है।'),
    laterToday: S('Later today', 'आज बाद में'),
    nothingLater: S('Nothing else booked today.', 'आज और कोई बुकिंग नहीं।'),
    started: (time: string) => S(`Started ${time}`, `${time} पर शुरू`),
    booked: (time: string) => S(`Booked ${time}`, `${time} की बुकिंग`),
    comingAt: (time: string) => S(`Coming at ${time}`, `${time} पर आएँगे`),
    nextHour: (n: number) => S(`Next hour (${n})`, `अगला घंटा (${n})`),
    laterTodayTab: (n: number) => S(`Later today (${n})`, `आज बाद में (${n})`),
    notMarkedTab: (n: number) => S(`Not marked (${n})`, `दर्ज नहीं (${n})`),
    upcomingTitle: S('Coming up', 'आने वाले'),
    inMinShort: (min: number) => S(`in ${min} min`, `${min} मिनट में`),
    atTime: (time: string) => S(`at ${time}`, `${time} पर`),
    endedAt: (time: string) => S(`ended ${time}`, `${time} पर खत्म`),
    open: S('Open', 'खोलें'),
    nothingNextHour: S('Nobody is due in the next hour.', 'अगले घंटे में कोई नहीं आ रहा।'),
    nothingNotMarked: S('Every visit so far has been marked.', 'अब तक के सभी दर्ज हो गए।'),
    // Jira GRW-222 — the walk-in queue and the salon floor (the design's wording).
    waitingTab: (n: number) => S(`Waiting (${n})`, `इंतज़ार (${n})`),
    doneTodayTab: (n: number) => S(`Done today (${n})`, `आज पूरे (${n})`),
    waitingQueue: S('Waiting queue', 'इंतज़ार की लाइन'),
    waitingMin: (min: number) => S(`Waiting ${min} min`, `${min} मिनट इंतज़ार`),
    waitingOver10: S('Waiting over 10 min', '10 मिनट से ज़्यादा इंतज़ार'),
    giveToStaff: S('Give to staff', 'स्टाफ को दें'),
    giveTitle: (name: string) => S(`Give ${name} to…`, `${name} को किसे दें…`),
    free: S('Free', 'खाली'),
    busyWith: (client: string, min: number) => S(`Busy · ${client} · ${min} min`, `व्यस्त · ${client} · ${min} मिनट`),
    theyLeft: S('They left', 'चले गए'),
    // Jira GRW-284 — a token issued by name alone.
    whatHaving: S('What are they having?', 'क्या करवा रहे हैं?'),
    pickServiceFirst: S('Pick what they are having first.', 'पहले सेवा चुनें।'),
    stillBusy: (stylist: string) => S(`${stylist} still busy`, `${stylist} अभी व्यस्त`),
    longerThanBooked: S('Longer than booked', 'समय से ज़्यादा'),
    nobodyWaiting: S('Nobody is waiting.', 'कोई इंतज़ार में नहीं।'),
    nothingDone: S('Nothing finished yet today.', 'आज अभी कुछ पूरा नहीं हुआ।'),
    couldNotGive: S('That did not save. Try again.', 'सेव नहीं हुआ। फिर से कोशिश करें।'),
    addCustomer: S('Add customer', 'ग्राहक जोड़ें'),
    recordPayment: S('Record payment', 'पेमेंट दर्ज करें'),
    findCustomer: S('Find customer', 'ग्राहक खोजें'),

    // Stylist
    currentCustomer: S('Current customer', 'अभी का ग्राहक'),
    nextCustomer: S('Next customer', 'अगला ग्राहक'),
    todaysWork: S("Today's work", 'आज का काम'),
    startedFor: (time: string, min: number) => S(`Started ${time} · ${min} min so far`, `${time} पर शुरू · ${min} मिनट से`),
    inMin: (time: string, min: number) => S(`${time} (in ${min} min)`, `${time} (${min} मिनट में)`),
    nobodyInChair: S('Nobody with you right now.', 'अभी आपके पास कोई नहीं।'),
    noNextCustomer: S('No one else booked today.', 'आज और कोई बुकिंग नहीं।'),
    breakTime: S('Break', 'ब्रेक'),
    viewDetails: S('View details', 'पूरा देखें'),
    view: S('View', 'देखें'),
    myAttendance: S('My attendance', 'मेरी हाज़िरी'),
    thisMonthWord: S('This month', 'इस महीने'),
    present: S('Present', 'आए'),
    leave: S('Leave', 'छुट्टी'),
    off: S('Off', 'बंद'),
    absent: S('Absent', 'नहीं आए'),
    // Vertical-neutral on purpose (no 'salon' literal): the design said 'Your salon marks this'.
    attendanceNote: S('Filled in for you, not by you', 'यह आपके लिए भरा जाता है'),
    myMoneyToday: S('My money today', 'आज मेरा पैसा'),

    retry: S('Try again', 'फिर से कोशिश करें'),
    couldNotLoad: S('Could not load this. Check your connection and try again.', 'यह लोड नहीं हुआ। इंटरनेट देखें और फिर से कोशिश करें।'),

    nav: {
      home: S('Home', 'होम'),
      bookings: hi ? 'बुकिंग' : (labels.appointments ?? copy.nav.appointments),
      schedule: S('My schedule', 'मेरा काम'),
      clients: hi ? 'ग्राहक' : (labels.customers ?? copy.nav.customers),
      staff: hi ? 'स्टाफ' : (labels.providers ?? copy.nav.staff),
      services: hi ? 'सेवाएँ' : (labels.services ?? copy.nav.services),
      offers: S(copy.nav.offers, 'ऑफर'),
      attendance: S('Attendance', 'हाज़िरी'),
      notifications: S('Notifications', 'सूचनाएं'),
      reports: S(copy.reports.navLabel, 'रिपोर्ट'),
      freeTimes: S(copy.nav.availability, 'खाली समय'),
      whatsapp: 'WhatsApp',
      settings: S(copy.nav.settings, 'सेटिंग'),
      more: S(copy.nav.more, 'और'),
      newBooking: S('New booking', 'नई बुकिंग'),
      signOut: S(copy.nav.signOut, 'लॉग आउट'),
      demo: S(copy.whatsapp.previewPill, 'डेमो'),
    },

    role: {
      owner: S('Owner', 'मालिक'),
      manager: S('Manager', 'मैनेजर'),
      receptionist: S('Front desk', 'रिसेप्शन'),
      staff: hi ? 'स्टाफ' : (labels.provider ?? 'Stylist'),
    } as Record<string, string>,
  };
}

export type HomeCopy = ReturnType<typeof homeCopy>;
