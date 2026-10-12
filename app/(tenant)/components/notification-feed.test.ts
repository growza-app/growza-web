import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import type { ActivityEvent } from '../lib/api';
import { byWhom, eventLine, knownEvents, notifHref, timeAgo, TOPIC_META, type FeedT } from './NotificationBell';

/** Jira GRW-360 — a notification reads in the owner's language: the row's title, its time and its age. */
const feed = (locale: 'en' | 'hi') =>
  createTranslator({ locale, messages: locale === 'en' ? en : hi, namespace: 'notifications.feed' } as never) as unknown as FeedT;

const booking = {
  id: '1', topic: 'appointment.confirmed', serviceNames: ['Haircut', 'Spa'], customerName: 'Priya',
  startAt: '2026-09-21T05:30:00.000Z', createdAt: '2026-09-21T05:00:00.000Z',
} as unknown as ActivityEvent;

describe('the notification feed', () => {
  it('keeps the English sentence', () => {
    const line = eventLine(booking, 'Asia/Kolkata', feed('en'), 'en');
    expect(line.title).toBe('New booking — Haircut + Spa');
    expect(line.subtitle).toMatch(/^Priya · Mon, 11:00 AM$/);
  });

  it('reads in Hindi', () => {
    const line = eventLine(booking, 'Asia/Kolkata', feed('hi'), 'hi');
    expect(line.title).toBe('नई बुकिंग — Haircut + Spa');
    expect(line.subtitle).toContain('Priya');
    expect(line.subtitle).not.toMatch(/Mon|AM|PM/);
  });

  it('says how old it is', () => {
    const now = new Date('2026-09-21T05:00:00.000Z');
    const ago = (mins: number, l: 'en' | 'hi') => timeAgo(new Date(now.getTime() - mins * 60_000).toISOString(), now, feed(l));
    expect(ago(0, 'en')).toBe('just now');
    expect(ago(5, 'en')).toBe('5m ago');
    expect(ago(180, 'en')).toBe('3h ago');
    expect(ago(60 * 48, 'en')).toBe('2d ago');
    expect(ago(5, 'hi')).toBe('5 मि पहले');
    expect(ago(0, 'hi')).toBe('अभी अभी');
  });

  it('names a customer-less event in the language', () => {
    const anon = { ...booking, customerName: null, startAt: null } as unknown as ActivityEvent;
    expect(eventLine(anon, 'Asia/Kolkata', feed('en'), 'en').subtitle).toBe('Client'); // GRW-478 — the salon's word
    expect(eventLine(anon, 'Asia/Kolkata', feed('hi'), 'hi').subtitle).toBe('ग्राहक');
  });
});

/** Jira GRW-562 — billing and other people's dashboard bookings in the owner's bell. */
describe('GRW-562 — the feed says who did it, and what the bill is doing', () => {
  const ev = (over: Partial<ActivityEvent>): ActivityEvent => ({ ...booking, actorName: null, actorRole: null, billing: null, branchName: null, ...over });

  it('names the person at the salon who made the booking, in both languages', () => {
    expect(eventLine(ev({ actorRole: 'receptionist' }), 'Asia/Kolkata', feed('en'), 'en').subtitle).toBe('Priya · Mon, 11:00 AM · by Front desk');
    expect(eventLine(ev({ actorName: 'Asha', actorRole: 'staff' }), 'Asia/Kolkata', feed('en'), 'en').subtitle).toBe('Priya · Mon, 11:00 AM · by Asha');
    expect(eventLine(ev({ actorRole: 'owner' }), 'Asia/Kolkata', feed('hi'), 'hi').subtitle).toContain('मालिक द्वारा');
    // A customer's WhatsApp booking names nobody.
    expect(byWhom({ actorName: null, actorRole: null }, feed('en'))).toBeNull();
  });

  it('a walk-in, a completion and a no-show have their own words', () => {
    expect(eventLine(ev({ topic: 'appointment.walk_in' }), 'Asia/Kolkata', feed('en'), 'en').title).toBe('Walk-in — Haircut + Spa');
    expect(eventLine(ev({ topic: 'appointment.completed' }), 'Asia/Kolkata', feed('en'), 'en').title).toBe('Done — Haircut + Spa');
    expect(eventLine(ev({ topic: 'appointment.no_show' }), 'Asia/Kolkata', feed('hi'), 'hi').title).toBe('नहीं आए — Haircut + Spa');
  });

  it('the bill: not paid yet, issued, paid, discounted, AutoPay stopped', () => {
    const en = feed('en');
    const line = (topic: ActivityEvent['topic'], billing: ActivityEvent['billing']) => eventLine(ev({ topic, billing, customerName: null, serviceNames: null, startAt: null }), 'Asia/Kolkata', en, 'en');
    expect(line('billing.status', { status: 'PAYMENT_FAILED' })).toEqual({ title: 'This month is not paid yet', subtitle: 'Tap to see your bill' });
    expect(line('billing.status', { status: 'ACTIVE' }).title).toBe('Payment received — all good');
    expect(line('billing.status', { status: 'SOMETHING_NEW' }).title).toBe('Billing update');
    expect(line('billing.invoice', { invoiceNumber: 'GRW-1', totalMinor: 109800, currency: 'INR', periodStart: '2026-10-10', periodEnd: '2026-11-09' }).title).toBe('Your October bill is ready: ₹1,098');
    expect(line('billing.payment', { amountMinor: 50000, currency: 'INR' }).title).toBe('₹500 received — thank you');
    expect(line('billing.discount', { discountAmountMinor: 29900, currency: 'INR' }).title).toBe('Discount applied: ₹299 off each month');
    expect(line('billing.discount', { discountAmountMinor: 0, currency: 'INR' }).title).toBe('Discount removed');
    expect(line('billing.autopay_halted', { mandateStatus: 'failed' }).title).toMatch(/AutoPay has stopped/);
    // …and in Hindi.
    expect(eventLine(ev({ topic: 'billing.status', billing: { status: 'PAYMENT_FAILED' } }), 'Asia/Kolkata', feed('hi'), 'hi').title).toBe('इस महीने का भुगतान अभी नहीं हुआ');
  });

  it('every topic has an icon, a class and words in both languages', () => {
    for (const [topic, meta] of Object.entries(TOPIC_META)) {
      expect(meta.icon, topic).toBeTypeOf('function');
      expect(feed('en')(`topics.${meta.key}` as never)).not.toMatch(/topics\./);
      expect(feed('hi')(`topics.${meta.key}` as never)).not.toMatch(/topics\./);
    }
  });
});

/**
 * Jira GRW-562 — a notification that reads like news has to go somewhere. Every
 * booking row used to be a bare <div>, on the bell and on the phone page both.
 */
describe('where a notification row goes', () => {
  const at = (startAt: string | null, topic: ActivityEvent['topic'] = 'appointment.confirmed') =>
    notifHref({ ...booking, topic, startAt } as ActivityEvent, 'Asia/Kolkata');

  it('a booking opens that booking, on its own day', () => {
    const id = '9f1c4e2a-0000-4000-8000-000000000001';
    const href = (startAt: string | null) => notifHref({ ...booking, appointmentId: id, startAt } as ActivityEvent, 'Asia/Kolkata');
    // Both, like Search (SearchClient's bookingHref): the sheet is found among the day's loaded
    // bookings, so `open` without `date` opens nothing for anything that is not today.
    expect(href('2026-09-21T05:30:00.000Z')).toBe(`/appointments?date=2026-09-21&open=${id}`);
    // And the day is still the salon's, not UTC's.
    expect(href('2026-09-21T20:30:00.000Z')).toBe(`/appointments?date=2026-09-22&open=${id}`);
    // An id with no time to place it: open it anyway rather than refuse.
    expect(href(null)).toBe(`/appointments?open=${id}`);
  });

  // An API older than the `appointmentId` field — the two repos deploy separately.
  it('falls back to the booking\'s day, read in the salon\'s zone', () => {
    // 05:30Z is 11:00 on the 21st in Kolkata — same day either way.
    expect(at('2026-09-21T05:30:00.000Z')).toBe('/appointments?date=2026-09-21');
    // 20:30Z is 02:00 on the 22nd in Kolkata: the UTC date would open the wrong, empty day.
    expect(at('2026-09-21T20:30:00.000Z')).toBe('/appointments?date=2026-09-22');
  });

  it('every booking topic is tappable, not just new ones', () => {
    for (const topic of Object.keys(TOPIC_META) as Array<ActivityEvent['topic']>) {
      if (!topic.startsWith('appointment.')) continue;
      expect(at('2026-09-21T05:30:00.000Z', topic), topic).toBe('/appointments?date=2026-09-21');
    }
  });

  it('a bill opens the bill — what its own subtitle promises', () => {
    for (const topic of Object.keys(TOPIC_META) as Array<ActivityEvent['topic']>) {
      if (!topic.startsWith('billing.')) continue;
      expect(at(null, topic), topic).toBe('/settings/billing');
    }
  });

  it('goes nowhere rather than somewhere wrong', () => {
    // A booking row with no time to anchor it, and a handoff, which has no screen yet.
    expect(at(null)).toBeNull();
    expect(at('not-a-date')).toBeNull();
    expect(at('2026-09-21T05:30:00.000Z', 'conversation.handoff')).toBeNull();
  });
});

describe('a stylist marking in', () => {
  const mark = (topic: 'attendance.in' | 'attendance.pending', startAt: string | null = '2026-09-21T20:10:00.000Z') =>
    ({ id: '2', topic, actorName: 'Priya', actorRole: 'staff', branchName: 'MG Road', startAt, customerName: null, serviceNames: null, appointmentId: null }) as unknown as ActivityEvent;

  it('says who is in, and when, in the salon’s clock', () => {
    const line = eventLine(mark('attendance.in'), 'Asia/Kolkata', feed('en'), 'en', true);
    expect(line.title).toBe('Priya is in');
    // 20:10 UTC is 1:40 AM the next day in India — the subtitle must be the salon's time.
    expect(line.subtitle).toBe('1:40 AM · MG Road');
  });

  it('says when a mark is waiting for a yes or no', () => {
    expect(eventLine(mark('attendance.pending'), 'Asia/Kolkata', feed('en'), 'en').title).toBe('Priya marked in — needs a yes or no');
    expect(eventLine(mark('attendance.pending'), 'Asia/Kolkata', feed('hi'), 'hi').title).toContain('हाँ या नहीं');
  });

  it('opens the register on the salon’s day', () => {
    expect(notifHref(mark('attendance.in'), 'Asia/Kolkata')).toBe('/attendance?date=2026-09-22');
    expect(notifHref(mark('attendance.pending', null), 'Asia/Kolkata')).toBe('/attendance');
  });

  it('has an icon and words for both topics', () => {
    for (const topic of ['attendance.in', 'attendance.pending'] as const) {
      expect(TOPIC_META[topic].icon).toBeTruthy();
      expect((en.notifications.feed.topics as Record<string, string>)[TOPIC_META[topic].key]).toBeTruthy();
      expect((hi.notifications.feed.topics as Record<string, string>)[TOPIC_META[topic].key]).toBeTruthy();
    }
  });
});

describe('a topic this dashboard does not know', () => {
  it('is dropped rather than looked up, so a newer API cannot blank the bell', () => {
    const future = { ...booking, id: '9', topic: 'something.new' } as unknown as ActivityEvent;
    expect(knownEvents([booking, future]).map((e) => e.id)).toEqual(['1']);
    // Inherited keys are not topics either.
    expect(knownEvents([{ ...booking, topic: 'constructor' } as unknown as ActivityEvent])).toEqual([]);
  });
});
