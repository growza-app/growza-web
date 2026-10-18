import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Performance audit — what a page asks the database for without being asked.
 *
 * Pinned at the source because each of these is a request that goes back the moment someone "tidies" the code: the
 * browser asking for something the server had already read, a screen reading what is not on it, a second read to find out
 * what the first would have said.
 */
const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');

describe('the browser does not ask for what the server already read', () => {
  const layout = read('layout.tsx');
  const provider = read('components/SessionProvider.tsx');
  const bell = read('components/NotificationBell.tsx');
  const feed = read('notifications/NotificationsClient.tsx');

  it('the layout hands the business timezone down with the session', () => {
    expect(provider).toMatch(/timezone\?: string;/);
    expect(layout).toMatch(/selfCheckIn,\s*timezone,\s*\}\}/);
  });

  it.each([
    ['the bell', bell],
    ['the Notifications screen', feed],
  ])('%s takes it from the session instead of calling /me again on every page', (_who, src) => {
    expect(src).toContain('useSession()?.timezone');
    expect(src).not.toMatch(/api\.me\(\)/);
    expect(src).not.toContain('setTimezone');
  });
});

describe('Home reads only the branch slides that are on screen', () => {
  const carousel = read('components/home/BranchCarousel.tsx');

  it('asks for the slide in view and the one beside it, not every branch', () => {
    expect(carousel).toMatch(/branchIds\.filter\(\(_, i\) => Math\.abs\(i \+ 1 - at\) <= 1\)/);
    expect(carousel).toMatch(/for \(const id of wantedKey\.split\(','\)\.filter\(Boolean\)\)/);
    // The old loop over every branch.
    expect(carousel).not.toMatch(/for \(const id of ids\.split/);
  });

  it('does not read a slide twice because the window moved, only when a refresh says the figures are stale', () => {
    expect(carousel).toMatch(/if \(!refreshed && read\.current\.has\(id\)\) continue;/);
  });

  it('lets a failed read try again the next time the slide is looked at', () => {
    expect(carousel).toMatch(/read\.current\.delete\(id\)/);
  });
});

describe('a settings screen asks once for the branch it shows', () => {
  const scope = read('settings/scope.ts');

  it('uses the main branch /me already named, instead of reading the business view to find it', () => {
    expect(scope).toMatch(/const direct = await api\.settings\(mainId\)/);
    const direct = scope.indexOf('api.settings(mainId)');
    const business = scope.indexOf('const business = await api.settings()');
    expect(direct).toBeGreaterThan(-1);
    expect(direct, 'the direct read comes before the business-view fallback').toBeLessThan(business);
  });
});
