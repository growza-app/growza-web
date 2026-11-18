import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import type { SettingsSummary } from '../lib/api';
import { areasOf, type Areas } from '../lib/areas';
import { SettingsNavList } from './SettingsNavList';

/**
 * Owner, 2026-11-18 — the Settings hub grouped by what the owner is doing, drawn for real.
 *
 * `settings-per-branch.test.ts` pins the source; this renders the list for the three businesses the change was
 * checked against — a one-branch restaurant, a three-branch restaurant and a salon — because two of them have no
 * local login to open a browser with, and "no Dining heading at a salon" is only true of the markup.
 */
const state: { areas: Areas; role: string; branch: string | null; branches: { id: string; name: string }[] } = {
  areas: areasOf(null),
  role: 'owner',
  branch: null,
  branches: [],
};

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(state.branch ? `branch=${state.branch}` : ''),
  usePathname: () => '/settings',
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));
vi.mock('../components/SessionProvider', () => ({
  useAreas: () => state.areas,
  useLive: () => true,
  useWhatsappLive: () => true,
  useSession: () => ({ role: state.role }),
}));
vi.mock('../components/BranchProvider', () => ({
  useBranch: () => ({ branches: state.branches, multi: state.branches.length > 1 }),
}));

const restaurant = areasOf({ capabilities: { bookings: false, services: false, stockCounted: false, marketplaces: false, tables: true }, surface: 'shop' });
const salon = areasOf({ capabilities: { bookings: true, services: true } });
const three = [
  { id: 'mg', name: 'MG Road' },
  { id: 'kr', name: 'Koramangala' },
  { id: 'ap', name: 'Airport' },
];

const hub = (branchCount: number, locale: 'en' | 'hi' = 'en') =>
  renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale,
      messages: locale === 'en' ? en : hi,
      timeZone: 'Asia/Kolkata',
      children: createElement(SettingsNavList, { settings: { branchCount } as unknown as SettingsSummary }),
    }),
  );
const headings = (html: string) => [...html.matchAll(/<h2 class="settings-group-title"[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1]);
/** The labels of the rows that carry the tag, in the order drawn. */
const tagged = (html: string) =>
  [...html.matchAll(/<div class="settings-row-title">([^<]*)<\/div>(?:(?!<\/a>)[\s\S])*?settings-row-tag/g)].map((m) => m[1]);

beforeEach(() => {
  state.role = 'owner';
  state.branch = null;
});

describe('the hub, grouped by task', () => {
  it('a one-branch restaurant owner: every group, in order, and no "This branch" tag', () => {
    state.areas = restaurant;
    state.branches = [three[0]!];
    const html = hub(1);
    expect(headings(html)).toEqual(['Your shop', 'Dining', 'Money', 'Team', 'Your Growza plan', 'Account']);
    expect(html).not.toContain('settings-row-tag');
    expect(html).not.toContain('This branch');
  });

  it('a three-branch restaurant owner: the rows that edit the header’s branch say so, and only those', () => {
    state.areas = restaurant;
    state.branches = three;
    state.branch = 'kr';
    const html = hub(3);
    expect(headings(html)).toEqual(['Your shop', 'Dining', 'Money', 'Team', 'Your Growza plan', 'Account']);
    // A restaurant has no diary, so Booking settings is not listed; WhatsApp is on here, so Notifications is.
    expect(tagged(html)).toEqual(['Branch profile', 'Working hours', 'Notifications', 'Location check-in']);
    // Tables, Kitchen stations, Coupons and offers, GST, Reward points: no tag.
    expect(html.match(/settings-row-tag/g)).toHaveLength(4);
    expect(html).toContain('This branch');
  });

  it('a salon owner: no Dining heading, because neither of its rows is a salon’s', () => {
    state.areas = salon;
    state.branches = three;
    const html = hub(3);
    expect(headings(html)).toEqual(['Your shop', 'Money', 'Team', 'Your Growza plan', 'Account']);
    expect(html).not.toContain('/settings/tables');
    expect(html).not.toContain('/settings/kitchen-stations');
    expect(tagged(html)).toEqual(['Branch profile', 'Working hours', 'Booking settings', 'Notifications', 'Location check-in']);
  });

  it('a group whose rows are all filtered out draws no heading — a restaurant waiter keeps only Account', () => {
    // A waiter's role grants the tables and nothing else (Jira GRW-723), so no Settings address passes `gridCanSee`.
    state.areas = { ...restaurant, pages: { tables: 'view' } };
    state.role = 'staff';
    state.branches = [three[0]!];
    const html = hub(1);
    expect(headings(html)).toEqual(['Account']);
    for (const section of html.split('<section').slice(1)) expect(section).toMatch(/<li>/);
  });

  it('reads in Hindi, groups and tag both', () => {
    state.areas = restaurant;
    state.branches = three;
    const html = hub(3, 'hi');
    expect(headings(html)).toEqual(['आपकी दुकान', 'टेबल और किचन', 'पैसा', 'टीम', 'आपका Growza प्लान', 'अकाउंट']);
    expect(html).toContain('यह ब्रांच');
  });
});
