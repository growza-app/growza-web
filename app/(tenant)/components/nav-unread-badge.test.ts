import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { countUnread } from './NotificationBell';
import { homeCopy } from '../lib/home-copy';

const here = dirname(fileURLToPath(import.meta.url));
const code = (rel: string) => readFileSync(resolve(here, rel), 'utf8');
const ev = (...ids: number[]) => ids.map((id) => ({ id: String(id) }));

describe('the count on the phone\'s Notifications tab', () => {
  it('counts what is newer than the last "Mark all read"', () => {
    expect(countUnread(ev(9, 8, 7, 6), 7, 0)).toBe(2);
  });

  it('is zero once everything has been read, and never negative', () => {
    expect(countUnread(ev(9, 8), 9, 0)).toBe(0);
    expect(countUnread([], 0, 0)).toBe(0);
  });

  it('does not count what "Clear all" hid, even if the read cursor is behind it', () => {
    expect(countUnread(ev(9, 8, 7), 0, 8)).toBe(1);
  });

  it('counts every event for a device that has never opened the inbox', () => {
    expect(countUnread(ev(3, 2, 1), 0, 0)).toBe(3);
  });

  it('reads ids as numbers: 10 is newer than 9', () => {
    expect(countUnread(ev(10, 9), 9, 0)).toBe(1);
  });
});

describe('the tab, the bell and the page agree', () => {
  it('all three use the one counting rule', () => {
    expect(code('NotificationBell.tsx')).toMatch(/countUnread\(events, lastSeenId, clearedBeforeId\)/);
    expect(code('../notifications/NotificationsClient.tsx')).toMatch(/countUnread\(events \?\? \[\], lastSeenId, clearedBeforeId\)/);
    expect(code('useUnreadNotifications.ts')).toMatch(/countUnread\(events, cursors\.lastSeen, cursors\.cleared\)/);
  });

  it('moving the read cursor on this tab tells the bar at once — a storage event never reaches the same tab', () => {
    const bell = code('NotificationBell.tsx');
    expect(bell).toMatch(/export function writeLastSeenId[^}]*announceReadChange\(\)/s);
    expect(bell).toMatch(/export function writeClearedBeforeId[^}]*announceReadChange\(\)/s);
    expect(code('useUnreadNotifications.ts')).toMatch(/addEventListener\(NOTIF_READ_EVENT, readCursors\)/);
  });

  it('only the Notifications tab carries it, capped at "9+", and it is named for a screen reader in both languages', () => {
    const nav = code('BottomNav.tsx');
    expect(nav).toMatch(/item\.href === '\/notifications' \? unread : 0/);
    expect(nav).toMatch(/count > 9 \? '9\+' : count/);
    expect(homeCopy('en').unreadCount(3)).toBe('3 unread');
    expect(homeCopy('hi').unreadCount(3)).toBe('3 नई');
  });

  it('a laptop, where the bar is hidden and the bell does the job, makes no request of its own', () => {
    expect(code('useUnreadNotifications.ts')).toMatch(/getComputedStyle\(host\)\.display === 'none'\) return;/);
  });
});
