import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Appointment } from '../../lib/api-types';
import { groupBookings } from '../../lib/appointment-display';
import { homeCopy } from '../../lib/home-copy';
import type { QueueEntry } from '../../lib/home-types';
import { tintFor } from './parts';
import { rightNow } from '../../lib/right-now';
import { AllAlerts, RightNow } from './RightNow';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }), usePathname: () => '/', useSearchParams: () => new URLSearchParams() }));

/**
 * Jira GRW-348 · GRW-351 — the owner's laptop Home: no "Your branches" card, and "Right now" beside Bookings today.
 *
 * The logic is tested in `lib/right-now.test.ts`. This renders the card in both languages and pins what a
 * screenshot would not be taken to catch: the grid, the queue reaching the owner, and the contrast the axe pass
 * flagged.
 */
const here = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
const code = (p: string) => here(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

function appt(start: string, end: string, name: string, status: Appointment['status'] = 'confirmed'): Appointment {
  return {
    id: `${name}-${start}`,
    startAt: start,
    endAt: end,
    status,
    createdVia: 'dashboard',
    customerName: name,
    customerPhone: null,
    serviceId: 's1',
    serviceName: 'Haircut',
    priceMinor: '50000',
    paidAmountMinor: null,
    paymentMode: null,
    providerId: 'p1',
    providerName: 'Amit',
    reminderSent: false,
    customerIsNew: false,
    bookingGroupId: null,
    offerTitle: null,
    comboPriceMinor: null,
  };
}
const waiting = (name: string, added: string): QueueEntry => ({
  id: name,
  customerId: null,
  customerName: name,
  customerPhone: null,
  serviceIds: [],
  serviceNames: [],
  offerId: null,
  addedAt: added,
  tokenNo: 1,
});

const at = (hhmm: string) => new Date(`2026-09-26T${hhmm}:00+05:30`);
const iso = (hhmm: string) => at(hhmm).toISOString();

function draw(opts: {
  appointments: Appointment[] | null;
  tomorrow?: Appointment[] | null;
  queue: QueueEntry[] | null;
  now: Date;
  afterClose?: boolean;
  lang?: 'en' | 'hi';
  labels?: Record<string, string>;
}) {
  const t = homeCopy(opts.lang ?? 'en', opts.labels ?? { resource: 'Chair' });
  const tomorrow = opts.tomorrow === undefined ? [] : opts.tomorrow;
  return renderToStaticMarkup(
    createElement(RightNow, {
      t,
      today: opts.appointments === null ? null : groupBookings(opts.appointments),
      tomorrow: tomorrow === null ? null : groupBookings(tomorrow),
      queue: opts.queue,
      now: opts.now,
      afterClose: opts.afterClose ?? false,
      timezone: 'Asia/Kolkata',
    }),
  );
}
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');

describe('the Right now card, drawn', () => {
  it('AC-01 — one in the chair, and the next "in 25 min"', () => {
    const html = text(draw({ appointments: [appt(iso('10:00'), iso('10:45'), 'Priya'), appt(iso('10:50'), iso('11:20'), 'Neha')], queue: [], now: at('10:25') }));
    expect(html).toContain('Right now');
    expect(html).toMatch(/In the chair 1 Priya/);
    expect(html).toMatch(/Next up 10:50 am Neha in 25 min/);
    expect(html).toMatch(/Walk-ins waiting 0/);
    expect(html).toContain('Nothing needs you right now');
  });

  it('AC-02 — alerts name the client and the minutes, above the rows, with "+N more"', () => {
    const queue = ['09:40', '09:45', '09:50'].map((t, i) => waiting(`Walk-in ${i + 1}`, iso(t)));
    const html = text(draw({ appointments: [appt(iso('09:30'), iso('10:00'), 'Priya')], queue, now: at('10:12') }));
    expect(html).toMatch(/Walk-in 1 Waiting 32 min .*Walk-in 2 Waiting 27 min .*Walk-in 3 Waiting 22 min .*\+1 more .*In the chair/);
    // "+1 more" is a button that opens every alert.
    expect(draw({ appointments: [appt(iso('09:30'), iso('10:00'), 'Priya')], queue, now: at('10:12') })).toMatch(
      /<button type="button" class="hm-now-more" aria-haspopup="dialog">\+1 more<\/button>/,
    );
    expect(html).not.toContain('Nothing needs you right now');
    // The fourth alert is the visit, 12 minutes over: counted, not listed.
    expect(html).not.toContain('12 min longer than booked');
  });

  it('a visit over time says so', () => {
    const html = text(draw({ appointments: [appt(iso('09:30'), iso('10:00'), 'Priya')], queue: [], now: at('10:12') }));
    expect(html).toContain('Priya 12 min longer than booked');
  });

  it('AC-04 — no Walk-ins row when the queue could not be read, and never "Nothing needs you" (BR-12)', () => {
    const html = text(draw({ appointments: [], queue: null, now: at('10:00') }));
    expect(html).not.toContain('Walk-ins waiting');
    expect(html).toContain('Next up');
    expect(html).toContain('Could not check who is waiting.');
    expect(html).not.toContain('Nothing needs you right now');
  });

  it('the minutes never give way to a long name: the name has its own shrinking element, the whole line is the tooltip', () => {
    const long = 'Venkata Subrahmanya Lakshminarasimha Ramachandran';
    const html = draw({ appointments: [], queue: [waiting(long, iso('09:28'))], now: at('10:00') });
    expect(html).toContain(`<strong class="hm-now-alert-name">${long}</strong><span class="hm-now-alert-sub">Waiting 32 min</span>`);
    expect(html).toContain(`title="${long} · Waiting 32 min"`);
    const next = draw({ appointments: [appt(iso('10:10'), iso('10:40'), long)], queue: [], now: at('10:00') });
    expect(next).toContain(`<strong>10:10 am</strong><span class="hm-now-detail">${long}</span><span class="hm-now-tail">in 10 min</span>`);
  });

  it('visits that could not be read are an error, not "nobody in"', () => {
    const html = text(draw({ appointments: null, queue: [], now: at('10:00') }));
    expect(html).toContain('Could not load this');
    expect(html).not.toContain('In the chair');
  });

  it("after closing — tomorrow's first visit, and no In the chair row once nobody is in", () => {
    const html = text(draw({ appointments: [], tomorrow: [appt('2026-09-27T04:30:00.000Z', '2026-09-27T05:00:00.000Z', 'Neha')], queue: [], now: at('21:00'), afterClose: true }));
    expect(html).toMatch(/First tomorrow 10:00 am Neha/);
    expect(html).not.toContain('In the chair');
    expect(html).not.toMatch(/in \d+ min/);
    expect(text(draw({ appointments: [], queue: [], now: at('21:00'), afterClose: true }))).toContain('Nothing booked for tomorrow yet.');
    // Tomorrow's list could not be read: said so, not "nothing booked".
    expect(text(draw({ appointments: [], tomorrow: null, queue: [], now: at('21:00'), afterClose: true }))).toContain('Could not load this');
  });

  it('after closing, a visit still running over is still an alert', () => {
    const html = text(draw({ appointments: [appt(iso('20:00'), iso('20:40'), 'Priya')], queue: [], now: at('21:05'), afterClose: true }));
    expect(html).toContain('Priya 25 min longer than booked');
    expect(html).toMatch(/In the chair 1 Priya/);
  });

  it('"See all" is a dialog with every alert, worst first, in the same words (review decision on AC-02)', () => {
    const queue = ['09:40', '09:45', '09:50', '09:55'].map((t, i) => waiting(`Walk-in ${i + 1}`, iso(t)));
    const today = groupBookings([appt(iso('09:30'), iso('10:00'), 'Priya')]);
    const s = rightNow({ today, tomorrow: null, queue, now: at('10:12'), afterClose: false, room: 0 });
    const html = renderToStaticMarkup(createElement(AllAlerts, { t: homeCopy('en', {}), alerts: s.allAlerts, onClose: () => {} }));
    expect(html).toMatch(/role="dialog" aria-modal="true" aria-labelledby="hm-now-all-title"/);
    expect(html).toContain('<h2 id="hm-now-all-title">Needs you now</h2>');
    expect(html).toContain('5 things need you');
    expect(html).toContain('aria-label="Close"');
    expect(text(html)).toMatch(/Walk-in 1 Waiting 32 min .*Walk-in 2 Waiting 27 min .*Walk-in 3 Waiting 22 min .*Walk-in 4 Waiting 17 min .*Priya 12 min longer than booked/);
    expect(homeCopy('en').alertCount(1)).toBe('1 thing needs you');
    expect(homeCopy('hi').alertCount(3)).toBe('3 बातों पर ध्यान दें');
  });

  it("names the vertical's own place, never a hardcoded chair", () => {
    const html = text(draw({ appointments: [], queue: [], now: at('10:00'), labels: { resource: 'Room' } }));
    expect(html).toContain('In the room');
    expect(html).not.toContain('chair');
  });

  it('Hindi, in every row (Claude-drafted, not yet reviewed by a fluent reader)', () => {
    const html = text(
      draw({ appointments: [appt(iso('10:00'), iso('10:45'), 'Priya'), appt(iso('10:50'), iso('11:20'), 'Neha')], queue: [waiting('Ravi', iso('10:10'))], now: at('10:25'), lang: 'hi' }),
    );
    expect(html).toContain('अभी का हाल');
    expect(html).toContain('सेवा चल रही है');
    expect(html).toContain('अगली बुकिंग');
    expect(html).toContain('इंतज़ार में ग्राहक');
    expect(html).toContain('Ravi 15 मिनट इंतज़ार');
    expect(html).toContain('25 मिनट में');
    expect(html).not.toMatch(/Right now|In the chair|Next up|Walk-ins|longer than booked|more\b/);
  });
});

describe('the laptop grid (Jira GRW-348 · GRW-351)', () => {
  const owner = code('OwnerHome.tsx');
  const css = code('../../styles/83-role-home.css');

  it('has no "Your branches" card, on any width', () => {
    expect(owner).not.toMatch(/hm-area-branches|yourBranches|branchPace/);
    expect(css).not.toMatch(/hm-area-branches|\.hm-multi|hm-bookings-wide/);
  });

  it('is one layout with branches or without: money + attention, then bookings + Right now, then clients', () => {
    expect(owner).toMatch(/<div className=\{`hm-owner-grid \$\{hideUntilBranch \? 'is-settling' : ''\}`\}/);
    expect(css).toMatch(/grid-template-areas:\s*'hero attention'\s*'bookings now'\s*'clients clients';/);
    expect(css).toMatch(/\.hm-area-now\s*\{\s*grid-area:\s*now;/);
  });

  it('Right now is the laptop\'s alone: hidden up to 1100px', () => {
    expect(css).toMatch(/@media \(max-width: 1100px\)\s*\{\s*\.hm-area-now\s*\{\s*display:\s*none;/);
  });

  it('the bookings list is one column now, and counts rows only', () => {
    expect(owner).toMatch(/function useFitBookings\(\)/);
    expect(owner).toMatch(/prev\.count === rows \? prev : \{ fit: true, count: rows \}/);
  });

  it('Right now scrolls inside itself rather than clipping on a short laptop', () => {
    expect(css).toMatch(/\.hm-fit \.hm-now\s*\{\s*flex:\s*1 1 auto;\s*overflow-y:\s*auto;/);
  });

  it('the money card keeps its one-row branch line (Jira GRW-394), and "+N" opens the header picker', () => {
    const hero = code('MoneyHero.tsx');
    expect(hero).toMatch(/const shown = branches\.length > 2 \? ranked\.slice\(0, 2\) : ranked;/);
    expect(owner).toMatch(/onMoreBranches=\{\(\) => branchContext\.setPickerOpen\(true\)\}/);
    // A name picks through the same remembered choice as the header's picker.
    expect(owner).toMatch(/const pickBranch = \(next: string \| null\) => branchContext\.setBranch\(next\);/);
    expect(owner).toMatch(/onPickBranch=\{pickBranch\}/);
  });
});

describe('the owner gets the walk-in queue, for the branch Home shows', () => {
  it('the page loads it for the owner as well as the front desk', () => {
    const page = code('../../page.tsx');
    const owner = page.slice(page.indexOf("if (!canSeeRevenue(role))"));
    expect(owner).toMatch(/soft\(api\.walkInQueue\(\)\)/);
    expect(owner).toMatch(/queue=\{queue\}/);
  });

  it('Home narrows it to the picked branch, as it does the visits', () => {
    const owner = code('OwnerHome.tsx');
    expect(owner).toMatch(/p\.queue \? atBranch\(p\.queue, branch\) : null/);
    expect(owner).toMatch(/visibleGroups\(p\.appointments, branch\)/);
    expect(owner).toMatch(/groupBookings\(atBranch\(list, branch\)/);
  });
});

/** Jira GRW-351 review — the branch, the hours and the list agree with the header, even when the overview fails. */
describe('the branch Home shows', () => {
  const owner = code('OwnerHome.tsx');
  const page = code('../../page.tsx');

  it('is the header\'s choice as soon as the browser has it, not a copy checked against the overview', () => {
    expect(owner).toMatch(/const branch = branchContext\.ready && branchContext\.multi \? branchContext\.choice : null;/);
    expect(owner).not.toMatch(/p\.initial\?\.branches/);
  });

  it('hides the cards of a business with branches until the remembered branch applies — no flash of "all"', () => {
    expect(owner).toMatch(/const waitingForBranch = branchContext\.multi && \(!branchContext\.ready \|\| \(!dataIsForBranch && data !== null && !failed\)\);/);
    expect(code('../../styles/83-role-home.css')).toMatch(/\.hm-owner-grid\.is-settling\s*\{\s*visibility:\s*hidden;/);
  });

  it("closes by the picked branch's own hours, and the page always has tomorrow's list to hand", () => {
    expect(owner).toMatch(/const hours = \(dataIsForBranch \? data\.hoursToday : null\) \?\? p\.initial\?\.hoursToday \?\? null;/);
    expect(owner).toMatch(/const listIsTomorrow = afterClose;/);
    expect(page).toMatch(/soft\(api\.appointments\(today\.plus\(\{ days: 1 \}\)\.toISODate\(\)!\)\)/);
    expect(page).not.toMatch(/listIsTomorrow/);
  });

  it('a failed read of the picked branch is an error, never the last branch\'s figures', () => {
    expect(owner).toMatch(/\{data && \(dataIsForBranch \|\| !failed\) \? <MoneyHero/);
    expect(owner).toMatch(/failed && !dataIsForBranch \? <CardError t=\{t\} \/> : <AttentionList/);
  });
});

/** WCAG 1.4.3 — the axe pass on the Bookings list: blue pill 4.46, amber avatar 3.63, grey pill 4.19. */
describe('the Bookings list is readable', () => {
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const ratio = (a: string, b: string) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi! + 0.05) / (lo! + 0.05);
  };
  const css = code('../../styles/83-role-home.css');
  const muted = css.match(/--hm-muted:\s*(#[0-9a-f]{6})/i)![1]!;

  it('every status pill is 4.5:1 or better', () => {
    const pills = [...css.matchAll(/\.hm-pill-(\w+) \{ background: (#[0-9a-f]{6}); color: ([^;]+); \}/gi)];
    expect(pills.length).toBeGreaterThanOrEqual(5);
    for (const [, tone, bg, fgRaw] of pills) {
      const fg = fgRaw === 'var(--hm-muted)' ? muted : fgRaw === 'var(--accent-deep)' ? '#166534' : fgRaw!;
      expect(ratio(fg, bg!), `.hm-pill-${tone}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('every avatar initial is 4.5:1 or better on its tint', () => {
    const tints = new Map<string, { bg: string; fg: string }>();
    for (let i = 0; i < 200; i += 1) {
      const t = tintFor(`client-${i}`);
      tints.set(t.bg, t);
    }
    expect(tints.size).toBe(5);
    for (const t of tints.values()) expect(ratio(t.fg, t.bg), `${t.fg} on ${t.bg}`).toBeGreaterThanOrEqual(4.5);
  });
});
