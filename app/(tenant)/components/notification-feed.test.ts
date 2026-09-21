import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import type { ActivityEvent } from '../lib/api';
import { eventLine, timeAgo, type FeedT } from './NotificationBell';

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
    expect(eventLine(anon, 'Asia/Kolkata', feed('en'), 'en').subtitle).toBe('Customer');
    expect(eventLine(anon, 'Asia/Kolkata', feed('hi'), 'hi').subtitle).toBe('ग्राहक');
  });
});
