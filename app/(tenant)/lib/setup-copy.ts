import type { Lang } from './lang';

/**
 * The setup banner — everything a business that has not gone live yet is waiting on, in English and Hindi.
 *
 * Plain words, and the next step named: an owner reading this has not been told what "provisioning" is and
 * should not have to learn it. The Hindi is a draft and unreviewed, like the rest of the i18n epic's first pass.
 */
export function setupCopy(lang: Lang) {
  const hi = lang === 'hi';
  const S = (en: string, h: string) => (hi ? h : en);
  return {
    title: S('Finish setting up your business', 'अपना बिज़नेस सेटअप पूरा करें'),
    /** "1 of 4 done" — the progress the owner can see at a glance. */
    progress: (done: number, total: number) => S(`${done} of ${total} done`, `${total} में से ${done} पूरे`),
    intro: S(
      'It cannot take bookings yet. Finish these, and the Growza team will switch it on.',
      'अभी इसमें बुकिंग नहीं ले सकते। ये पूरे करें, फिर Growza टीम इसे चालू कर देगी।',
    ),
    /** The folded banner's second line: the first thing still to do. */
    next: (what: string) => S(`Next: ${what}`, `अगला: ${what}`),
    allDone: S(
      'Everything is added. The Growza team will switch your business on shortly.',
      'सब कुछ जुड़ गया है। Growza टीम जल्द ही आपका बिज़नेस चालू कर देगी।',
    ),
    done: S('Done', 'पूरा'),
    todo: S('To do', 'बाकी'),
    services: S('Add at least one service', 'कम से कम एक सेवा जोड़ें'),
    providers: S('Add a member of staff', 'एक स्टाफ सदस्य जोड़ें'),
    salonHours: S("Set your salon's opening hours", 'अपने सैलून के खुलने का समय तय करें'),
    workingHours: S("Set a staff member's working hours", 'किसी स्टाफ सदस्य के काम के घंटे तय करें'),
    /**
     * Under the staff working-hours line only: the salon's opening hours (the line above it) are a separate item,
     * because bookings are made against a person's own days and times. Owners set the salon's hours and wonder why
     * this one stays open.
     */
    workingHoursHint: S(
      'Open a staff member and save their days and times. Salon hours alone are not enough.',
      'किसी स्टाफ सदस्य को खोलकर उनके दिन और समय सेव करें। सिर्फ़ सैलून के घंटे काफ़ी नहीं हैं।',
    ),
    staffHomeTitle: S('Still being set up', 'अभी सेटअप हो रहा है'),
    /** Home for a receptionist or stylist at a business that is not live yet — theirs to wait on, not to set up. */
    staffHome: S(
      'The owner is still setting this business up. Bookings, clients and your day open here as soon as it is live.',
      'मालिक अभी बिज़नेस का सेटअप पूरा कर रहे हैं। चालू होते ही बुकिंग, क्लाइंट और आपका दिन यहाँ खुल जाएगा।',
    ),
    /** The page a closed screen's address lands on, until the business is live. */
    closed: {
      title: S('Not open yet', 'अभी बंद है'),
      body: S(
        'Bookings, clients, offers, reports and attendance open as soon as your business is live. Until then, finish setting it up — that is all that is left.',
        'बुकिंग, क्लाइंट, ऑफ़र, रिपोर्ट और हाज़िरी बिज़नेस के चालू होते ही खुल जाएँगे। तब तक सेटअप पूरा करें — बस वही बाकी है।',
      ),
      back: S('Back to setup', 'सेटअप पर वापस जाएँ'),
    },
    branchStaff: (name: string) =>
      S(`${name}: add a member of staff with working hours`, `${name}: काम के घंटों वाला एक स्टाफ सदस्य जोड़ें`),
  };
}

/** Where an owner goes to do each thing — one screen per item, nothing else. */
export function setupHref(key: string): string | null {
  if (key === 'services') return '/services';
  if (key === 'salon_hours') return '/settings/working-hours';
  if (key === 'providers' || key === 'working_hours' || key.startsWith('branch:')) return '/providers';
  return null;
}
