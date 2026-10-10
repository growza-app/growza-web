import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import type { ActivityEvent } from '../lib/api';
import { byWhom, eventLine, timeAgo, TOPIC_META, type FeedT } from './NotificationBell';

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
