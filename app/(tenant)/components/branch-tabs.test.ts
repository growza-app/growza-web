import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readBranchChoice, writeBranchChoice } from '../lib/branch-choice';

/**
 * Jira GRW-340 — one tab per branch on a phone: Home, Bookings and Attendance.
 *
 * Checked in a browser with a two-branch owner at 320, 360 and 393px (and eight branches at 320), English and
 * Hindi. These pin the rules a screenshot would not catch: what "remembered" means, and that all three screens are
 * wired to the same choice.
 */
const src = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');

const OPEN = [{ id: 'aaa' }, { id: 'bbb' }];

let store: Map<string, string>;
beforeEach(() => {
  store = new Map();
  (globalThis as { window?: unknown }).window = {
    sessionStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  };
});
afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe('the branch an owner is looking at', () => {
  it('is remembered, and read back while that branch is still open', () => {
    writeBranchChoice('bbb');
    expect(readBranchChoice(OPEN)).toBe('bbb');
  });

  it('reads as "All" (null) when nothing has been chosen', () => {
    expect(readBranchChoice(OPEN)).toBeNull();
  });

  it('reads as "All" when the remembered branch has since closed — never an empty branch', () => {
    writeBranchChoice('ccc');
    expect(readBranchChoice(OPEN)).toBeNull();
  });

  it('choosing "All" forgets the branch', () => {
    writeBranchChoice('aaa');
    writeBranchChoice(null);
    expect(readBranchChoice(OPEN)).toBeNull();
  });

  it('does not throw where storage is blocked — the choice just does not carry over', () => {
    (globalThis as { window?: unknown }).window = {
      get sessionStorage(): never {
        throw new Error('blocked');
      },
    };
    expect(readBranchChoice(OPEN)).toBeNull();
    expect(() => writeBranchChoice('aaa')).not.toThrow();
  });

  it('is a session choice, not a preference: a new visit starts on "All"', () => {
    expect(src('../lib/branch-choice.ts')).toContain('sessionStorage');
    expect(src('../lib/branch-choice.ts')).not.toMatch(/localStorage\./);
  });
});

describe('the three screens share it', () => {
  it('Home, Bookings and Attendance draw the tabs and write the choice', () => {
    for (const f of ['home/OwnerHome.tsx', '../appointments/BookingsList.tsx', '../attendance/AttendanceRegister.tsx']) {
      const code = src(f);
      expect(code, f).toMatch(/<BranchTabs/);
      expect(code, f).toMatch(/writeBranchChoice\(/);
      expect(code, f).toMatch(/readBranchChoice\(/);
    }
  });

  it('only a business with two or more branches gets tabs, and never a receptionist', () => {
    expect(src('BranchTabs.tsx')).toMatch(/if \(branches\.length < 2\) return null;/);
    expect(src('../appointments/page.tsx')).toMatch(/\(me\.member\?\.role \?\? 'owner'\) === 'owner' && \(me\.branches\?\.length \?\? 0\) > 1/);
  });

  it('Bookings: an address that names a branch wins over the remembered one', () => {
    const list = src('../appointments/BookingsList.tsx');
    expect(list).toMatch(/if \(initialBranch\) \{\s*writeBranchChoice\(initialBranch\.id\);\s*return;/);
  });

  it('the phone shows tabs and hides the dropdown/chip; the laptop is the other way round', () => {
    const css = src('../styles/88-branch-tabs.css');
    expect(css).toMatch(/\.branch-tabs\s*\{\s*display:\s*none;/);
    expect(css).toMatch(/@media \(max-width: 860px\)\s*\{\s*\.branch-tabs\s*\{\s*display:\s*flex;/);
    expect(css).toMatch(/\.hm-toolbar \.hm-branch,\s*\.bk-branch-chip,\s*\.att-branch-menu\s*\{\s*display:\s*none;/);
  });

  it('a tab is a 44px target with a label of at least 12px', () => {
    const css = src('../styles/88-branch-tabs.css');
    expect(css).toMatch(/min-height:\s*44px/);
    expect(css).toMatch(/font-size:\s*13\.5px/);
  });

  it('is announced as a tab list, with the selected tab marked', () => {
    const tabs = src('BranchTabs.tsx');
    expect(tabs).toMatch(/role="tablist"/);
    expect(tabs).toMatch(/role="tab"/);
    expect(tabs).toMatch(/aria-selected=\{on\}/);
  });
});
